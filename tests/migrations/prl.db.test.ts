import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVILEGE_REFUSALS, rejectionForConstraint } from '@/features/platform/domain/errors';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  NEXT_YEAR,
  SEALING_YEAR,
  sealingHarness,
  type SealingHarness,
} from '../features/calendar/sealing-support';
import {
  backdateAuthority,
  formalizeCoOwnerAt,
  LEAP_AHEAD,
  sealByFixture,
} from '../features/calendar/use-right-support';

/**
 * W16 E2 — PRL por Second Home e data no PostgreSQL (REQ-013, REQ-052; TECH-030, TECH-033, TECH-051–053; ADR-0032).
 * Os valores são de teste e deliberadamente arbitrários: nenhum valor canônico ou padrão aparece aqui.
 */
type StaffRole = 'admin' | 'super_admin';
type Kind = 'initial' | 'change';
type Night = readonly [stayDate: string, amountMinor: string];

interface Staff {
  readonly userId: string;
  readonly roleId: string;
  readonly role: StaffRole;
}

interface OperationOptions {
  readonly role?: string;
  readonly authorizationRef?: string;
}

interface PublicationOptions {
  readonly from?: string | null;
  readonly authority?: string;
  readonly author?: string;
  readonly kind?: Kind;
}

interface Version {
  readonly id: string;
  readonly amount_minor: string;
  readonly effective_from: Date;
  readonly effective_to: Date | null;
  readonly kind: Kind;
  readonly authority: StaffRole;
}

const COMMAND: Record<Kind, string> = {
  initial: 'publish_initial_prl',
  change: 'change_published_prl',
};
const HOUR_MS = 3_600_000;
const BASIS = 'Ata Luxtory W16';
const constraint = (name: string) => expect.objectContaining({ constraint: name });
const iso = (ms: number) => new Date(ms).toISOString();
const next = (monthDay: string) => `${NEXT_YEAR}-${monthDay}`;

describe('W16 — PRL por Second Home e data no banco (REQ-013, REQ-052)', () => {
  let h: SealingHarness;
  /** Owner com data-base em 01/01 do corrente: corrente e seguinte selados pelo job. */
  let home: string;
  /** Co-Owner no próximo ano bissexto, exercício selado por fixture (29/02 incluído). */
  let leapHome: string;
  let admin: Staff;
  let superAdmin: Staff;

  async function addStaff(role: StaffRole): Promise<Staff> {
    const userId = randomUUID();
    await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
    const { rows } = await h.database.pool.query<{ id: string }>(
      `SELECT app.assign_staff_role($1, $2, 'Test W16 authority') AS id`,
      [userId, role],
    );
    return { userId, roleId: rows[0]!.id, role };
  }

  async function connect(url: string = h.database.appUrl): Promise<pg.Client> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    return client;
  }

  async function openStaffOperation(
    client: pg.Client,
    command: string,
    staff: Staff,
    homeId: string,
    options: OperationOptions = {},
  ): Promise<string> {
    const op = randomUUID();
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
         correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 'pending', now(), now())`,
      [
        op,
        command,
        staff.userId,
        options.role ?? staff.role,
        homeId,
        `w16:${op}`,
        randomUUID(),
        options.authorizationRef ?? `staff_role:${staff.roleId}`,
      ],
    );
    return op;
  }

  /** Uma transação do `luxtory_app` com a operação `pending`, marcada `committed` no fim, como o executor faz. */
  async function inStaffOperation<T>(
    command: string,
    staff: Staff,
    homeId: string,
    work: (client: pg.Client, op: string) => Promise<T>,
    options: OperationOptions = {},
  ): Promise<T> {
    const client = await connect();
    try {
      await client.query('BEGIN');
      const op = await openStaffOperation(client, command, staff, homeId, options);
      const result = await work(client, op);
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  async function insertPublication(
    client: pg.Client,
    op: string,
    homeId: string,
    kind: Kind,
    staff: Staff,
    options: PublicationOptions = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO app.prl_publication (id, second_home_id, kind, effective_from, authority, authorization_ref,
         created_at, created_by, operation_id)
       VALUES ($1, $2, $3, $4, $5, $6, '2000-01-01T00:00:00Z', $7, $8)`,
      [
        id,
        homeId,
        kind,
        options.from ?? null,
        options.authority ?? staff.role,
        BASIS,
        options.author ?? staff.userId,
        op,
      ],
    );
    return id;
  }

  async function insertNights(
    client: pg.Client,
    publicationId: string,
    homeId: string,
    nights: readonly Night[],
    currency = 'BRL',
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const [stayDate, amountMinor] of nights) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.prl (id, publication_id, second_home_id, stay_date, amount_minor, currency, effective_from)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
        [id, publicationId, homeId, stayDate, amountMinor, currency],
      );
      ids.push(id);
    }
    return ids;
  }

  function publish(
    kind: Kind,
    staff: Staff,
    homeId: string,
    nights: readonly Night[],
    options: PublicationOptions = {},
  ): Promise<string> {
    return inStaffOperation(COMMAND[kind], staff, homeId, async (client, op) => {
      const id = await insertPublication(client, op, homeId, options.kind ?? kind, staff, options);
      await insertNights(client, id, homeId, nights);
      return id;
    });
  }

  async function versionsOf(homeId: string, stayDate: string): Promise<Version[]> {
    const { rows } = await h.database.pool.query<Version>(
      `SELECT id, amount_minor, effective_from, effective_to, kind, authority FROM app.prl_version
        WHERE second_home_id = $1 AND stay_date = $2 ORDER BY effective_from`,
      [homeId, stayDate],
    );
    return rows;
  }

  /** Versão vigente no instante (`app.prl_at`), deslocado em microssegundos no próprio banco. */
  async function inForce(
    homeId: string,
    stayDate: string,
    at: string | Date,
    micros = 0,
  ): Promise<string | null> {
    const { rows } = await h.database.pool.query<{ id: string }>(
      `SELECT id FROM app.prl_at($1, $2::date, $3::timestamptz + make_interval(secs => $4 * 0.000001))`,
      [homeId, stayDate, at, micros],
    );
    return rows[0]?.id ?? null;
  }

  beforeAll(async () => {
    h = await sealingHarness();
    await backdateAuthority(h);
    home = await h.formalizeOwner(`${SEALING_YEAR}-01-01`);
    const job = await h.runJob();
    if (job.failed !== 0) throw new Error('open_exercise fixture failed');
    const leap = await formalizeCoOwnerAt(h, 2, `${LEAP_AHEAD}-01-01`, new Date());
    await sealByFixture(h, leap.homeId, LEAP_AHEAD);
    leapHome = leap.homeId;
    admin = await addStaff('admin');
    superAdmin = await addStaff('super_admin');
  });

  afterAll(() => h.close());

  describe('publicação: atomicidade, procedência e autoridade (REQ-013, TECH-030, TECH-051)', () => {
    it('[TECH-030] publicação sem noites ou com mais de 366 noites é recusada no commit; 366 é aceito', async () => {
      await expect(
        inStaffOperation(COMMAND.initial, admin, home, (client, op) =>
          insertPublication(client, op, home, 'initial', admin),
        ),
      ).rejects.toEqual(constraint('prl_publication_nights'));

      const nights = async (count: number) => {
        const client = await connect();
        try {
          await client.query('BEGIN');
          const op = await openStaffOperation(client, COMMAND.initial, admin, home);
          const id = await insertPublication(client, op, home, 'initial', admin);
          await client.query(
            `INSERT INTO app.prl (id, publication_id, second_home_id, stay_date, amount_minor, currency, effective_from)
             SELECT gen_random_uuid(), $1, $2, d::date, 1000, 'BRL', NULL
               FROM generate_series($3::date, $3::date + ($4::int - 1), interval '1 day') AS d`,
            [id, home, `${SEALING_YEAR}-01-01`, count],
          );
          await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
          await client.end();
        }
      };
      await expect(nights(367)).rejects.toEqual(constraint('prl_publication_nights'));
      await expect(nights(366)).resolves.toBeUndefined();
      expect(await versionsOf(home, `${SEALING_YEAR}-01-01`)).toEqual([]);
    });

    it('[REQ-013][TECH-030] Admin publica o PRL inicial: noites atômicas, instante, autoridade, base e autor do banco e da operação', async () => {
      const id = await publish('initial', admin, home, [
        [next('02-01'), '10001'],
        [next('02-02'), '10002'],
        [next('02-03'), '10003'],
      ]);
      const { rows } = await h.database.pool.query(
        `SELECT p.kind, p.authority, p.authorization_ref, p.created_by, p.effective_from = p.created_at AS immediate,
                p.created_at > now() - interval '1 minute' AS stamped,
                (SELECT count(*)::int FROM app.prl l WHERE l.publication_id = p.id) AS nights,
                (SELECT bool_and(l.effective_from = p.effective_from AND l.currency = 'BRL') FROM app.prl l
                  WHERE l.publication_id = p.id) AS inherited
           FROM app.prl_publication p WHERE p.id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        kind: 'initial',
        authority: 'admin',
        authorization_ref: BASIS,
        created_by: admin.userId,
        immediate: true,
        stamped: true,
        nights: 3,
        inherited: true,
      });
      const [version] = await versionsOf(home, next('02-02'));
      expect(version).toMatchObject({ amount_minor: '10002', kind: 'initial', effective_to: null });
      expect(await inForce(home, next('02-02'), new Date())).toBe(version!.id);
    });

    it('[REQ-013] o Super Admin também publica o PRL inicial', async () => {
      await publish('initial', superAdmin, home, [[next('02-10'), '20010']]);
      expect(await versionsOf(home, next('02-10'))).toEqual([
        expect.objectContaining({ amount_minor: '20010', kind: 'initial', authority: 'super_admin' }),
      ]);
    });

    it('[REQ-013][BR-181] o PRL inicial nunca recai sobre noite publicada (Admin ou Super Admin) e a publicação inteira é recusada', async () => {
      for (const staff of [admin, superAdmin])
        await expect(
          publish('initial', staff, home, [
            [next('02-04'), '10004'],
            [next('02-01'), '99999'],
          ]),
        ).rejects.toEqual(constraint('conflict_prl_already_published'));
      expect(await versionsOf(home, next('02-04'))).toEqual([]);
      expect((await versionsOf(home, next('02-01'))).map((v) => v.amount_minor)).toEqual([
        '10001',
      ]);
      expect(rejectionForConstraint('conflict_prl_already_published')).toBe(
        'ERR_STATE_TRANSITION',
      );
    });

    it('[REQ-013][BR-181] Admin não altera PRL publicado — nem por papel, nem por autoridade, tipo ou atribuição forjados; o Super Admin altera', async () => {
      const night: Night = [next('02-02'), '15002'];
      await expect(publish('change', admin, home, [night])).rejects.toEqual(
        constraint('permission_staff_role'),
      );
      expect(PRIVILEGE_REFUSALS.get('permission_staff_role')).toBe('ERR_PERMISSION');
      await expect(
        publish('change', admin, home, [night], { authority: 'super_admin' }),
      ).rejects.toEqual(constraint('prl_publication_provenance'));
      await expect(
        inStaffOperation(COMMAND.initial, admin, home, async (client, op) => {
          const id = await insertPublication(client, op, home, 'change', admin, {
            authority: 'super_admin',
          });
          await insertNights(client, id, home, [night]);
        }),
      ).rejects.toEqual(constraint('prl_publication_provenance'));
      // Papel Super Admin declarado com a atribuição Admin do mesmo usuário: o banco confere o papel da atribuição.
      await expect(
        inStaffOperation(
          COMMAND.change,
          admin,
          home,
          async (client, op) => {
            const id = await insertPublication(client, op, home, 'change', admin, {
              authority: 'super_admin',
            });
            await insertNights(client, id, home, [night]);
          },
          { role: 'super_admin' },
        ),
      ).rejects.toEqual(constraint('permission_staff_role'));
      expect((await versionsOf(home, next('02-02'))).length).toBe(1);

      await publish('change', superAdmin, home, [night]);
      const versions = await versionsOf(home, next('02-02'));
      expect(versions.map((v) => [v.amount_minor, v.kind, v.authority])).toEqual([
        ['10002', 'initial', 'admin'],
        ['15002', 'change', 'super_admin'],
      ]);
      expect(versions[0]!.effective_to).toEqual(versions[1]!.effective_from);
      expect(versions[1]!.effective_to).toBeNull();
    });

    it('[REQ-013] alteração só sobre noite publicada; a publicação inteira é recusada', async () => {
      await expect(
        publish('change', superAdmin, home, [
          [next('02-03'), '15003'],
          [next('02-20'), '15020'],
        ]),
      ).rejects.toEqual(constraint('conflict_prl_not_published'));
      expect((await versionsOf(home, next('02-03'))).length).toBe(1);
    });

    it('[TECH-051][TECH-002] atribuição revogada, outro command, outra Second Home, operação encerrada ou noite alheia são recusadas', async () => {
      const revoked = await addStaff('admin');
      await h.database.pool.query(`SELECT app.revoke_staff_role($1, 'Fim do mandato (teste)')`, [
        revoked.roleId,
      ]);
      await expect(publish('initial', revoked, home, [[next('03-01'), '1']])).rejects.toEqual(
        constraint('permission_staff_role'),
      );
      await expect(
        inStaffOperation('set_parameter', admin, home, async (client, op) => {
          const id = await insertPublication(client, op, home, 'initial', admin);
          await insertNights(client, id, home, [[next('03-01'), '1']]);
        }),
      ).rejects.toEqual(constraint('prl_publication_provenance'));
      await expect(
        inStaffOperation(COMMAND.initial, admin, leapHome, async (client, op) => {
          const id = await insertPublication(client, op, home, 'initial', admin);
          await insertNights(client, id, home, [[next('03-01'), '1']]);
        }),
      ).rejects.toEqual(constraint('prl_publication_provenance'));
      await expect(
        publish('initial', admin, home, [[next('03-01'), '1']], { author: superAdmin.userId }),
      ).rejects.toEqual(constraint('prl_publication_provenance'));

      // Noite de outra Second Home numa publicação desta.
      await expect(
        inStaffOperation(COMMAND.initial, admin, home, async (client, op) => {
          const id = await insertPublication(client, op, home, 'initial', admin);
          await insertNights(client, id, leapHome, [[`${LEAP_AHEAD}-03-01`, '1']]);
        }),
      ).rejects.toEqual(constraint('prl_publication_provenance'));

      // Noite acrescentada depois, numa transação sem a operação da publicação em curso.
      const published = await publish('initial', admin, home, [[next('03-02'), '30002']]);
      const client = await connect();
      try {
        await expect(insertNights(client, published, home, [[next('03-03'), '30003']])).rejects.toEqual(
          constraint('inventory_operation_provenance'),
        );
      } finally {
        await client.end();
      }
      expect(await versionsOf(home, next('03-03'))).toEqual([]);
    });
  });

  describe('vigência prospectiva e resolução histórica (REQ-052, BR-182, TECH-030)', () => {
    it('[REQ-052][BR-182] início retroativo recusado; alteração só depois do último início, inclusive de versão agendada; resolução antes, durante e depois', async () => {
      const night = next('04-01');
      await publish('initial', admin, home, [[night, '40000']]);
      const change = (amount: string, from?: string) =>
        publish('change', superAdmin, home, [[night, amount]], { from: from ?? null });

      await expect(change('40001', iso(Date.now() - 60_000))).rejects.toEqual(
        constraint('conflict_prl_retroactive'),
      );
      const t2 = iso(Date.now() + 2 * HOUR_MS);
      await change('42000', t2);
      // Imediata, antes da agendada, ou no mesmo início: nunca antecipa nem sobrepõe a versão agendada.
      await expect(change('41000')).rejects.toEqual(constraint('conflict_prl_overlap'));
      await expect(change('41000', iso(Date.now() + HOUR_MS))).rejects.toEqual(
        constraint('conflict_prl_overlap'),
      );
      await expect(change('41000', t2)).rejects.toEqual(constraint('conflict_prl_overlap'));
      const t3 = iso(Date.now() + 3 * HOUR_MS);
      await change('43000', t3);

      const versions = await versionsOf(home, night);
      expect(versions.map((v) => v.amount_minor)).toEqual(['40000', '42000', '43000']);
      expect(versions[0]!.effective_to).toEqual(versions[1]!.effective_from);
      expect(versions[1]!.effective_to).toEqual(versions[2]!.effective_from);
      expect(versions[2]!.effective_to).toBeNull();

      const [v1, v2, v3] = versions.map((v) => v.id);
      expect(await inForce(home, night, versions[0]!.effective_from, -1)).toBeNull();
      expect(await inForce(home, night, new Date())).toBe(v1);
      expect(await inForce(home, night, t2, -1)).toBe(v1);
      expect(await inForce(home, night, t2)).toBe(v2);
      expect(await inForce(home, night, iso(Date.parse(t2) + HOUR_MS / 2))).toBe(v2);
      expect(await inForce(home, night, t3)).toBe(v3);
      // A leitura em vigor resolve no instante do banco: as versões agendadas ainda não valem.
      const { rows } = await h.database.pool.query<{ prl_id: string }>(
        `SELECT prl_id FROM app.prl_period_in_force($1, $2::date, $2::date + 1)`,
        [home, night],
      );
      expect(rows.map((row) => row.prl_id)).toEqual([v1]);
    });
  });

  describe('período, calendário selado e valores (REQ-052, TECH-033)', () => {
    it('[REQ-052] PRL do período: uma linha por noite, atravessando exercícios, com o mesmo instante e a noite sem PRL explícita', async () => {
      const dec = (day: string) => `${SEALING_YEAR}-12-${day}`;
      await publish('initial', admin, home, [
        [dec('30'), '10001'],
        [dec('31'), '20002'],
        [next('01-01'), '30003'],
        [next('01-02'), '40004'],
      ]);
      const app = await connect();
      try {
        const { rows } = await app.query<{
          stay_date: string;
          prl_id: string | null;
          amount_minor: string | null;
          currency: string | null;
          resolved_at: Date;
        }>(
          `SELECT stay_date::text, prl_id, amount_minor, currency, resolved_at
             FROM app.prl_period_in_force($1, $2::date, $3::date)`,
          [home, dec('29'), next('01-03')],
        );
        expect(rows.map((row) => [row.stay_date, row.amount_minor, row.currency])).toEqual([
          [dec('29'), null, null],
          [dec('30'), '10001', 'BRL'],
          [dec('31'), '20002', 'BRL'],
          [next('01-01'), '30003', 'BRL'],
          [next('01-02'), '40004', 'BRL'],
        ]);
        expect(rows[0]!.prl_id).toBeNull();
        expect(new Set(rows.map((row) => row.resolved_at.getTime())).size).toBe(1);
        const total = await app.query(
          `SELECT sum(amount_minor)::text AS total, count(*) FILTER (WHERE prl_id IS NULL)::int AS missing
             FROM app.prl_period_in_force($1, $2::date, $3::date)`,
          [home, dec('30'), next('01-03')],
        );
        expect(total.rows[0]).toEqual({ total: '100010', missing: 0 });
      } finally {
        await app.end();
      }
    });

    it('[REQ-052][TECH-027] 29/02 recebe PRL como qualquer noite selada e entra no período', async () => {
      const leap = (monthDay: string) => `${LEAP_AHEAD}-${monthDay}`;
      await publish('initial', admin, leapHome, [
        [leap('02-28'), '5000'],
        [leap('02-29'), '6000'],
        [leap('03-01'), '7000'],
      ]);
      const { rows } = await h.database.pool.query(
        `SELECT stay_date::text, amount_minor FROM app.prl_period_in_force($1, $2::date, $3::date)`,
        [leapHome, leap('02-28'), leap('03-02')],
      );
      expect(rows).toEqual([
        { stay_date: leap('02-28'), amount_minor: '5000' },
        { stay_date: leap('02-29'), amount_minor: '6000' },
        { stay_date: leap('03-01'), amount_minor: '7000' },
      ]);
    });

    it('[REQ-052] noite fora do calendário selado não recebe PRL; período vazio ou longo demais é recusado', async () => {
      await expect(
        publish('initial', admin, home, [[`${NEXT_YEAR + 1}-01-15`, '1000']]),
      ).rejects.toEqual(constraint('prl_second_home_date_fk'));
      for (const [from, to] of [
        [next('05-01'), next('05-01')],
        [next('05-02'), next('05-01')],
        [`${SEALING_YEAR}-01-01`, `${NEXT_YEAR}-01-03`],
      ])
        await expect(
          h.database.pool.query(`SELECT * FROM app.prl_period_in_force($1, $2::date, $3::date)`, [
            home,
            from,
            to,
          ]),
        ).rejects.toEqual(constraint('prl_period_invalid'));
    });

    it('[TECH-033] valor em unidade mínima inteira e positiva, com limite técnico, e só BRL', async () => {
      const attempt = async (amount: string, currency = 'BRL') => {
        const client = await connect();
        try {
          await client.query('BEGIN');
          const op = await openStaffOperation(client, COMMAND.initial, admin, home);
          const id = await insertPublication(client, op, home, 'initial', admin);
          await insertNights(client, id, home, [[next('07-01'), amount]], currency);
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
          await client.end();
        }
      };
      for (const amount of ['0', '-1', '1000000000000000'])
        await expect(attempt(amount)).rejects.toEqual(constraint('prl_amount_check'));
      await expect(attempt('1000', 'USD')).rejects.toEqual(constraint('prl_currency_check'));
      await expect(attempt('12.5')).rejects.toMatchObject({ code: '22P02' });
      await expect(attempt('999999999999999')).resolves.toBeUndefined();
      await expect(attempt('1')).resolves.toBeUndefined();
    });
  });

  describe('imutabilidade e privilégio mínimo (TECH-052, REQ-100)', () => {
    it('[TECH-052] nada muda nem some: o luxtory_app não tem UPDATE/DELETE e o dono do schema é barrado pelos gatilhos', async () => {
      const [version] = await versionsOf(home, next('02-01'));
      const app = await connect();
      try {
        for (const sql of [
          `UPDATE app.prl SET amount_minor = amount_minor + 1 WHERE id = $1`,
          `DELETE FROM app.prl WHERE id = $1`,
          `UPDATE app.prl_publication SET authorization_ref = authorization_ref WHERE id = $1`,
        ])
          await expect(app.query(sql, [version!.id])).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
      }
      for (const sql of [
        `UPDATE app.prl SET amount_minor = amount_minor + 1 WHERE id = '${version!.id}'`,
        `DELETE FROM app.prl WHERE id = '${version!.id}'`,
        `UPDATE app.prl_publication SET effective_from = effective_from`,
        `DELETE FROM app.prl_publication`,
        `TRUNCATE app.prl`,
      ])
        await expect(h.database.pool.query(sql)).rejects.toMatchObject({ code: '42501' });
      expect((await versionsOf(home, next('02-01'))).map((v) => v.amount_minor)).toEqual([
        '10001',
      ]);
    });

    it('[TECH-052][REQ-100] só o servidor lê e grava o PRL: nada para authenticated, anon ou PUBLIC', async () => {
      const { rows } = await h.database.pool.query<{ role: string; object: string; privilege: string; granted: boolean }>(
        `SELECT r.role, o.object, p.privilege, has_table_privilege(r.role, o.object, p.privilege) AS granted
           FROM unnest(ARRAY['authenticated', 'anon', 'luxtory_app']) AS r(role)
          CROSS JOIN unnest(ARRAY['app.prl', 'app.prl_publication', 'app.prl_version']) AS o(object)
          CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(privilege)`,
      );
      const granted = rows.filter((row) => row.granted).map((row) => `${row.role} ${row.privilege} ${row.object}`);
      expect(granted.sort()).toEqual(
        [
          'luxtory_app INSERT app.prl',
          'luxtory_app INSERT app.prl_publication',
          'luxtory_app SELECT app.prl',
          'luxtory_app SELECT app.prl_publication',
          'luxtory_app SELECT app.prl_version',
        ].sort(),
      );
      const functions = await h.database.pool.query<{ role: string; fn: string; granted: boolean }>(
        `SELECT r.role, f.fn, has_function_privilege(r.role, f.fn, 'EXECUTE') AS granted
           FROM unnest(ARRAY['authenticated', 'anon', 'luxtory_app']) AS r(role)
          CROSS JOIN unnest(ARRAY['app.prl_at(uuid, date, timestamptz)', 'app.prl_period_in_force(uuid, date, date)',
                                  'app.lock_prl_authority(app.operation)']) AS f(fn)`,
      );
      expect(functions.rows.filter((row) => row.granted).map((row) => `${row.role} ${row.fn}`).sort()).toEqual(
        [
          'luxtory_app app.lock_prl_authority(app.operation)',
          'luxtory_app app.prl_at(uuid, date, timestamptz)',
          'luxtory_app app.prl_period_in_force(uuid, date, date)',
        ].sort(),
      );
    });
  });

  describe('concorrência (TECH-053)', () => {
    it('[TECH-053] publicações iniciais concorrentes da mesma noite: a segunda espera e é recusada — exatamente uma vence', async () => {
      const night = next('05-01');
      const first = await connect();
      try {
        await first.query('BEGIN');
        const op = await openStaffOperation(first, COMMAND.initial, admin, home);
        const id = await insertPublication(first, op, home, 'initial', admin);
        await insertNights(first, id, home, [[night, '50001']]);
        const second = publish('initial', superAdmin, home, [[night, '50002']]);
        await waitForLockWaiter(h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await first.query('COMMIT');
        await expect(second).rejects.toEqual(constraint('conflict_prl_already_published'));
      } finally {
        await first.end();
      }
      expect((await versionsOf(home, night)).map((v) => v.amount_minor)).toEqual(['50001']);
    });

    it('[TECH-053][REQ-052] a leitura em vigor espera a alteração em curso e a vê; a alteração espera a leitura em curso e começa depois dela', async () => {
      const night = next('05-10');
      await publish('initial', admin, home, [[night, '51000']]);
      const read = (client: pg.Client) =>
        client.query<{ prl_id: string; resolved_at: Date }>(
          `SELECT prl_id, resolved_at FROM app.prl_period_in_force($1, $2::date, $2::date + 1)`,
          [home, night],
        );

      const writer = await connect();
      const reader = await connect();
      try {
        await writer.query('BEGIN');
        const op = await openStaffOperation(writer, COMMAND.change, superAdmin, home);
        const pub = await insertPublication(writer, op, home, 'change', superAdmin);
        const [changed] = await insertNights(writer, pub, home, [[night, '52000']]);
        await reader.query('BEGIN');
        const pending = read(reader);
        await waitForLockWaiter(h.database.pool);
        await writer.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await writer.query('COMMIT');
        expect((await pending).rows.map((row) => row.prl_id)).toEqual([changed]);
        await reader.query('COMMIT');

        await reader.query('BEGIN');
        const { rows } = await read(reader);
        const later = publish('change', superAdmin, home, [[night, '53000']]);
        await waitForLockWaiter(h.database.pool);
        await reader.query('COMMIT');
        await later;
        const versions = await versionsOf(home, night);
        expect(versions.map((v) => v.amount_minor)).toEqual(['51000', '52000', '53000']);
        expect(rows.map((row) => row.prl_id)).toEqual([changed]);
        expect(versions[2]!.effective_from.getTime()).toBeGreaterThanOrEqual(rows[0]!.resolved_at.getTime());
      } finally {
        await writer.end();
        await reader.end();
      }
    });

    it('[TECH-051][TECH-053] revogação em curso: a publicação espera e é recusada com a atribuição revogada', async () => {
      const staff = await addStaff('admin');
      const revoker = await connect(h.database.url);
      try {
        await revoker.query('BEGIN');
        await revoker.query(`SELECT app.revoke_staff_role($1, 'Fim do mandato (teste)')`, [staff.roleId]);
        const pending = publish('initial', staff, home, [[next('06-01'), '60001']]);
        await waitForLockWaiter(h.database.pool);
        await revoker.query('COMMIT');
        await expect(pending).rejects.toEqual(constraint('permission_staff_role'));
      } finally {
        await revoker.end();
      }
      expect(await versionsOf(home, next('06-01'))).toEqual([]);
    });
  });
});
