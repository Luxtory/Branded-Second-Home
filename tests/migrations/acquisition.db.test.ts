import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/test-database';
import { ownerDelegation, ownerParty } from '../support/party-fixtures';
import { catalogHarness, controlledClock } from '../support/catalog-fixtures';
import { appDatabase } from '../support/platform-fixtures';
import type { Database } from '@/features/platform';

describe('W8 — estrutura patrimonial canônica no PostgreSQL', () => {
  let database: TestDatabase;
  let app: pg.Client;
  let db: Database;
  let institution: string;

  async function asUser<T>(userId: string, query: string): Promise<T[]> {
    await app.query('BEGIN READ ONLY');
    try {
      await app.query(`SELECT set_config('request.jwt.claims',$1,true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      await app.query('SET LOCAL ROLE authenticated');
      return (await app.query(query)).rows as T[];
    } finally {
      await app.query('ROLLBACK');
    }
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
    db = appDatabase(database.appUrl);
    institution = await ownerParty(database.pool, undefined, { type: 'cnpj' });
    await database.pool.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
      institution,
      'Ata institucional sintética',
    ]);
  });

  afterAll(async () => {
    await app.end();
    await db.destroy();
    await database.drop();
  });

  async function root() {
    const catalog = catalogHarness(db, controlledClock(new Date('2026-10-01T12:00:00Z')));
    const { homeEdition } = await catalog.build.finalizedHomeEdition();
    return (await catalog.build.secondHome(homeEdition.id)).id;
  }

  async function sqlOperation<T>(
    home: string,
    command: string,
    write: (client: pg.PoolClient, operation: string) => Promise<T>,
  ) {
    const client = await database.pool.connect();
    const operation = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO app.operation
        (id,command,actor_user_id,acting_party_id,role,second_home_id,idempotency_key,correlation_id,authorization_ref,state,created_at,updated_at)
        VALUES ($1,$2,$3,NULL,'admin',$4,$5,$5,'test:authority','committed','2027-01-01T15:00:00Z','2027-01-01T15:00:00Z')`,
        [operation, command, randomUUID(), home, `w8:${operation}`],
      );
      const result = await write(client, operation);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function allocation(
    home: string,
    grants: readonly { position: number; alta: number; media: number }[],
  ) {
    return sqlOperation(
      home,
      'register_second_home_initial_allocation',
      async (client, operation) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO app.second_home_initial_allocation
        (id,second_home_id,version,configuration_id,operation_start_date,luxtory_alta,luxtory_media,basis_ref,validated_at,operation_id)
        VALUES ($1,$2,1,2,'2027-07-01',1,3,'Estruturação sintética','2027-01-01T15:00:00Z',$3)`,
          [id, home, operation],
        );
        for (const grant of grants)
          await client.query(
            `INSERT INTO app.initial_allocation_grant
        (initial_allocation_id,position,alta,media,operation_id) VALUES ($1,$2,$3,$4,$5)`,
            [id, grant.position, grant.alta, grant.media, operation],
          );
        return id;
      },
    );
  }

  async function coverage(
    home: string,
    from: string,
    until: string | null,
    replaces: string | null = null,
  ) {
    const provider = await ownerParty(database.pool);
    return sqlOperation(home, 'register_second_home_administration', async (client, operation) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.second_home_administration
        (id,second_home_id,provider_party_id,professional,scope,valid_from,valid_until,replaces_id,basis_ref,operation_id,created_at)
        VALUES ($1,$2,$3,true,'professional_administration',$4,$5,$6,'Contrato sintético',$7,'2027-01-01T15:00:00Z')`,
        [id, home, provider, from, until, replaces, operation],
      );
      return id;
    });
  }

  async function start(home: string, effectiveDate = '2027-01-01') {
    return sqlOperation(home, 'register_second_home_operation_start', async (client, operation) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.second_home_operation_start
        (id,second_home_id,acquisition_id,effective_start_date,operation_start_registered_at,basis_ref,operation_id)
        SELECT $1,$2,id,$3,'2027-01-01T15:00:00Z','Declaração sintética',$4 FROM app.acquisition WHERE second_home_id=$2`,
        [id, home, effectiveDate, operation],
      );
      return id;
    });
  }

  async function facts(
    home: string,
    parties: readonly string[],
    configuration: number | null,
    options: {
      readonly participationDelta?: number;
      readonly grantDelta?: number;
      readonly spePartyId?: string;
    } = {},
  ) {
    const client = await database.pool.connect();
    const acquisition = randomUUID();
    const operation = randomUUID();
    const spe = randomUUID();
    const company =
      configuration === null
        ? null
        : (options.spePartyId ?? (await ownerParty(database.pool, undefined, { type: 'cnpj' })));
    const config =
      configuration === null
        ? null
        : (
            await app.query<{
              participation_bps: number;
              alta: number;
              media: number;
            }>(
              `SELECT participation_bps, alta, media FROM app.second_home_configuration WHERE id=$1`,
              [configuration],
            )
          ).rows[0];
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO app.operation
        (id,command,actor_user_id,acting_party_id,role,second_home_id,idempotency_key,correlation_id,authorization_ref,state,created_at,updated_at)
        VALUES ($1,'formalize_acquisition',$2,NULL,'admin',$3,$4,$4,'test:authority','committed',now(),now())`,
        [operation, randomUUID(), home, `w8:${operation}`],
      );
      await client.query(
        `INSERT INTO app.acquisition
        (id,second_home_id,modality,location,configuration_id,operation_start_date,basis_ref,formalized_at,operation_id)
        VALUES ($1,$2,$3,'Localização sintética',$4,'2027-01-01','Ata sintética',now(),$5)`,
        [
          acquisition,
          home,
          configuration === null ? 'owner' : 'co_owner',
          configuration,
          operation,
        ],
      );
      if (config !== null && config !== undefined)
        await client.query(
          `INSERT INTO app.spe
        (id,second_home_id,acquisition_id,party_id,legal_form,operation_id) VALUES ($1,$2,$3,$4,'sa_fechada',$5)`,
          [spe, home, acquisition, company, operation],
        );
      for (const [index, party] of parties.entries()) {
        const stake = config ? randomUUID() : null;
        const bps = config
          ? config.participation_bps +
            (index === parties.length - 1 ? (options.participationDelta ?? 0) : 0)
          : 10_000;
        if (stake !== null)
          await client.query(
            `INSERT INTO app.stake
          (id,second_home_id,acquisition_id,spe_id,allocation_position,participation_bps,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [stake, home, acquisition, spe, index + 1, bps, operation],
          );
        await client.query(
          `INSERT INTO app.holding
          (id,second_home_id,acquisition_id,party_id,role,stake_id,participation_bps,valid_from,operation_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8)`,
          [
            randomUUID(),
            home,
            acquisition,
            party,
            config ? 'co_owner' : 'owner',
            stake,
            bps,
            operation,
          ],
        );
        if (config)
          for (const bucket of ['alta', 'media'] as const)
            await client.query(
              `INSERT INTO app.use_right_ledger
          (id,second_home_id,acquisition_id,stake_id,exercise_year,bucket,movement,source,quantity,operation_id,created_at)
          VALUES ($1,$2,$3,$4,2027,$5,'grant','configuration',$6,$7,now())`,
              [
                randomUUID(),
                home,
                acquisition,
                stake,
                bucket,
                config[bucket] + (options.grantDelta ?? 0),
                operation,
              ],
            );
      }
      await client.query('COMMIT');
      return acquisition;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  it('[REQ-026] existem somente as quatro configurações canônicas, com igualdade por categoria e participação', async () => {
    const relation = await database.pool.query<{ table_name: string | null }>(
      `SELECT to_regclass('app.second_home_configuration')::text AS table_name`,
    );
    expect(relation.rows[0]?.table_name).toBe('app.second_home_configuration');
    const { rows } = await app.query(
      `SELECT id, participation_bps, annual_days, alta, media, luxtory_alta, luxtory_media
         FROM app.second_home_configuration ORDER BY id DESC`,
    );
    expect(rows).toEqual([
      {
        id: 10,
        participation_bps: 1000,
        annual_days: 35,
        alta: 10,
        media: 25,
        luxtory_alta: 3,
        luxtory_media: 12,
      },
      {
        id: 8,
        participation_bps: 1250,
        annual_days: 44,
        alta: 12,
        media: 32,
        luxtory_alta: 7,
        luxtory_media: 6,
      },
      {
        id: 4,
        participation_bps: 2500,
        annual_days: 88,
        alta: 24,
        media: 64,
        luxtory_alta: 7,
        luxtory_media: 6,
      },
      {
        id: 2,
        participation_bps: 5000,
        annual_days: 176,
        alta: 48,
        media: 128,
        luxtory_alta: 7,
        luxtory_media: 6,
      },
    ]);
    for (const row of rows) {
      expect(row.id * row.participation_bps).toBe(10_000);
      expect(row.id * row.alta + row.luxtory_alta).toBe(103);
      expect(row.id * row.media + row.luxtory_media).toBe(262);
      expect(row.alta + row.media).toBe(row.annual_days);
    }
  });

  it('[REQ-026] configuração é imutável inclusive para o dono, sem CRUD ou quinta configuração', async () => {
    expect(
      (await database.pool.query(`SELECT to_regclass('app.second_home_configuration') AS name`))
        .rows[0]?.name,
    ).toBe('app.second_home_configuration');
    for (const query of [
      `UPDATE app.second_home_configuration SET alta = 11 WHERE id = 10`,
      `DELETE FROM app.second_home_configuration WHERE id = 10`,
      `TRUNCATE app.second_home_configuration CASCADE`,
      `INSERT INTO app.second_home_configuration VALUES (5, 2000, 70, 20, 50, 3, 12)`,
    ]) {
      await expect(database.pool.query(query), query).rejects.toThrow(/not allowed/);
    }
    await expect(
      app.query(`UPDATE app.second_home_configuration SET alta = 11 WHERE id = 10`),
    ).rejects.toThrow(/permission denied/);
    const privileges = await database.pool.query(
      `SELECT has_table_privilege('anon','app.second_home_configuration','SELECT') AS anon_read,
              has_table_privilege('authenticated','app.second_home_configuration','INSERT') AS user_insert`,
    );
    expect(privileges.rows).toEqual([{ anon_read: false, user_insert: false }]);
  });

  it('[REQ-026] identidade institucional nasce vazia e CPF é recusado estruturalmente sem descriptografar documento', async () => {
    const empty = await createTestDatabase();
    try {
      const relation = await empty.pool.query(
        `SELECT to_regclass('app.luxtory_legal_identity')::text AS name`,
      );
      expect(relation.rows[0]?.name).toBe('app.luxtory_legal_identity');
      expect(
        (await empty.pool.query(`SELECT count(*)::int AS n FROM app.luxtory_legal_identity`)).rows,
      ).toEqual([{ n: 0 }]);
      const cpf = await ownerParty(empty.pool);
      await expect(
        empty.pool.query(`SELECT app.register_luxtory_legal_identity($1, $2)`, [
          cpf,
          'Ata institucional de teste',
        ]),
      ).rejects.toMatchObject({ code: '23503' });
      expect(
        (await empty.pool.query(`SELECT count(*)::int AS n FROM app.luxtory_legal_identity`)).rows,
      ).toEqual([{ n: 0 }]);
    } finally {
      await empty.drop();
    }
  });

  it('[TECH-052] referência institucional CNPJ só é provisionada pelo operador, imutável e auditada, sem grant de API', async () => {
    expect(
      (await database.pool.query(`SELECT to_regclass('app.luxtory_legal_identity')::text AS name`))
        .rows[0]?.name,
    ).toBe('app.luxtory_legal_identity');
    const company = institution;
    const { rows } = await database.pool.query(`
      SELECT l.party_id, o.command, o.state, a.object_type FROM app.luxtory_legal_identity l
      JOIN app.operation o ON o.id=l.operation_id JOIN app.audit_log a ON a.operation_id=o.id
    `);
    expect(rows).toEqual([
      {
        party_id: company,
        command: 'register_luxtory_legal_identity',
        state: 'committed',
        object_type: 'luxtory_legal_identity',
      },
    ]);
    for (const query of [
      `UPDATE app.luxtory_legal_identity SET basis_ref = 'outra referência'`,
      `DELETE FROM app.luxtory_legal_identity`,
      `TRUNCATE app.luxtory_legal_identity`,
    ])
      await expect(database.pool.query(query)).rejects.toThrow(/not allowed/);
    await expect(
      app.query(`SELECT app.register_luxtory_legal_identity($1, $2)`, [company, 'Outra ata']),
    ).rejects.toThrow(/permission denied/);
    for (const role of ['anon', 'authenticated']) {
      expect(
        (
          await database.pool.query(
            `
        SELECT has_table_privilege($1, 'app.luxtory_legal_identity', 'SELECT') AS can_read,
               has_function_privilege($1, 'app.register_luxtory_legal_identity(uuid,text)', 'EXECUTE') AS can_write
      `,
            [role],
          )
        ).rows,
      ).toEqual([{ can_read: false, can_write: false }]);
    }
  });

  it('[REQ-025] estruturação não cria aquisição, Ação, holding ou grant; cada conceito tem sua própria relação', async () => {
    const tables = [
      'second_home_initial_allocation',
      'initial_allocation_grant',
      'second_home_administration',
      'acquisition',
      'spe',
      'stake',
      'holding',
      'use_right_ledger',
      'second_home_operation_start',
    ];
    for (const name of tables) {
      const result = await database.pool.query<{ relation: string | null }>(
        `SELECT to_regclass($1)::text AS relation`,
        [`app.${name}`],
      );
      expect(result.rows[0]?.relation, name).toBe(`app.${name}`);
    }
    for (const name of ['acquisition', 'spe', 'stake', 'holding', 'use_right_ledger']) {
      // The table name is a closed test-owned list, never request data.
      expect(
        (await database.pool.query(`SELECT count(*)::int AS n FROM app.${name}`)).rows,
      ).toEqual([{ n: 0 }]);
    }
  });

  it('[REQ-024] Owner único cria holding 100%; dois Owners falham no commit e não deixam fatos parciais', async () => {
    const party = await ownerParty(database.pool);
    const home = await root();
    await facts(home, [party], null);
    expect(
      (
        await app.query(
          `SELECT role,participation_bps,stake_id FROM app.holding WHERE second_home_id=$1`,
          [home],
        )
      ).rows,
    ).toEqual([{ role: 'owner', participation_bps: 10000, stake_id: null }]);
    const invalid = await root();
    await expect(
      facts(invalid, [party, await ownerParty(database.pool)], null),
    ).rejects.toMatchObject({ code: '23514', constraint: 'conflict_acquisition_cardinality' });
    expect(
      (
        await app.query(`SELECT count(*)::int AS n FROM app.acquisition WHERE second_home_id=$1`, [
          invalid,
        ])
      ).rows,
    ).toEqual([{ n: 0 }]);
  });

  it('[REQ-026] configuração N exige N Ações, N holdings e N parties distintas com grants equivalentes', async () => {
    for (const n of [2, 4, 8, 10]) {
      const home = await root();
      const parties = await Promise.all(Array.from({ length: n }, () => ownerParty(database.pool)));
      await facts(home, parties, n);
      const counts = await app.query(
        `SELECT
        (SELECT count(*)::int FROM app.stake WHERE second_home_id=$1) AS stakes,
        (SELECT count(*)::int FROM app.holding WHERE second_home_id=$1) AS holdings,
        (SELECT count(DISTINCT party_id)::int FROM app.holding WHERE second_home_id=$1) AS parties,
        (SELECT count(*)::int FROM app.use_right_ledger WHERE second_home_id=$1) AS grants`,
        [home],
      );
      expect(counts.rows).toEqual([{ stakes: n, holdings: n, parties: n, grants: 2 * n }]);
    }
    const home = await root();
    const parties = await Promise.all(Array.from({ length: 3 }, () => ownerParty(database.pool)));
    await expect(facts(home, parties, 4)).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_acquisition_cardinality',
    });
  });

  it('[REQ-026] mesma party não detém duas Ações; Ações e grants não admitem desigualdade ou quantidade inventada', async () => {
    const parties = await Promise.all(Array.from({ length: 4 }, () => ownerParty(database.pool)));
    await expect(
      facts(await root(), [parties[0]!, parties[0]!, parties[2]!, parties[3]!], 4),
    ).rejects.toMatchObject({ code: '23P01', constraint: 'conflict_holding_party_period' });
    await expect(facts(await root(), parties, 4, { participationDelta: 1 })).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_acquisition_equivalence',
    });
    await expect(facts(await root(), parties, 4, { grantDelta: 1 })).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_use_right_grant_source',
    });
  });

  it('[REQ-026] Luxtory não pode aparecer como acionista da SPE', async () => {
    const institutional = (
      await app.query<{ party_id: string }>(`SELECT party_id FROM app.luxtory_legal_identity`)
    ).rows[0]!.party_id;
    await expect(
      facts(await root(), [institutional, await ownerParty(database.pool)], 2),
    ).rejects.toMatchObject({ code: '23514', constraint: 'conflict_luxtory_shareholder' });
  });

  it('[REQ-010] a mesma party é Owner de A e Co-Owner de B, sem papel global', async () => {
    const party = await ownerParty(database.pool);
    const ownerHome = await root();
    const sharedHome = await root();
    await facts(ownerHome, [party], null);
    await facts(sharedHome, [party, await ownerParty(database.pool)], 2);
    expect(
      (
        await app.query(
          `SELECT second_home_id,role FROM app.holding WHERE party_id=$1 ORDER BY role`,
          [party],
        )
      ).rows,
    ).toEqual([
      { second_home_id: sharedHome, role: 'co_owner' },
      { second_home_id: ownerHome, role: 'owner' },
    ]);
  });

  it('[REQ-022] modalidade, configuração e base civil formalizadas são imutáveis até para o dono', async () => {
    const home = await root();
    await facts(home, [await ownerParty(database.pool)], null);
    for (const change of [
      "modality='co_owner'",
      'configuration_id=2',
      "operation_start_date='2027-02-01'",
    ])
      await expect(
        database.pool.query(`UPDATE app.acquisition SET ${change} WHERE second_home_id=$1`, [home]),
      ).rejects.toThrow(/not allowed/);
  });

  it('[REQ-025] alocação explícita não cria Ações, holdings ou grants; só define quantidades da estruturação', async () => {
    const home = await root();
    await allocation(home, [
      { position: 1, alta: 5, media: 20 },
      { position: 2, alta: 5, media: 20 },
    ]);
    for (const table of ['acquisition', 'stake', 'holding', 'use_right_ledger'])
      expect(
        (
          await app.query(`SELECT count(*)::int AS n FROM app.${table} WHERE second_home_id=$1`, [
            home,
          ])
        ).rows,
      ).toEqual([{ n: 0 }]);
  });

  it('[TECH-020] alocação precisa de todas as N posições técnicas', async () => {
    await expect(
      allocation(await root(), [{ position: 1, alta: 5, media: 20 }]),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_initial_allocation_cardinality',
    });
  });

  it('[TECH-110] alocação com distribuição sazonal desigual é recusada sem compensar buckets', async () => {
    await expect(
      allocation(await root(), [
        { position: 1, alta: 5, media: 20 },
        { position: 2, alta: 6, media: 19 },
      ]),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_initial_allocation_equivalence',
    });
  });

  it('[TECH-110] Co-Owner não entra em operação sem administração profissional', async () => {
    const home = await root();
    await facts(home, [await ownerParty(database.pool), await ownerParty(database.pool)], 2);
    await expect(start(home)).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_administration_coverage',
    });
  });

  it('[TECH-020] uma cobertura finita não sustenta período operacional aberto', async () => {
    const home = await root();
    await facts(home, [await ownerParty(database.pool), await ownerParty(database.pool)], 2);
    await coverage(home, '2027-01-01', '2030-01-01');
    await expect(start(home)).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_administration_coverage',
    });
  });

  it('[TECH-020] cadeia contínua com extremo aberto habilita operação e substituição que abre lacuna falha', async () => {
    const home = await root();
    await facts(home, [await ownerParty(database.pool), await ownerParty(database.pool)], 2);
    await coverage(home, '2027-01-01', '2027-01-10');
    const open = await coverage(home, '2027-01-10', null);
    await start(home);
    await expect(coverage(home, '2027-01-10', '2027-01-20', open)).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_administration_coverage',
    });
  });

  it('[TECH-020] um dia de lacuna na cadeia impede o início; Owner não exige administração Luxtory', async () => {
    const home = await root();
    await facts(home, [await ownerParty(database.pool), await ownerParty(database.pool)], 2);
    await coverage(home, '2027-01-01', '2027-01-10');
    await coverage(home, '2027-01-11', null);
    await expect(start(home)).rejects.toMatchObject({
      code: '23514',
      constraint: 'conflict_administration_coverage',
    });
    const ownerHome = await root();
    await facts(ownerHome, [await ownerParty(database.pool)], null);
    await expect(start(ownerHome)).resolves.toBeTypeOf('string');
  });

  it('[TECH-052] RLS exige delegação vigente e holding aplicável, isolando inclusive outros Co-Owners da mesma Second Home', async () => {
    const user = randomUUID();
    const represented = await ownerParty(database.pool);
    const other = await ownerParty(database.pool);
    const home = await root();
    await facts(home, [represented, other], 2);
    await ownerDelegation(database.pool, { partyId: represented, userId: user });
    const holdings = await asUser<{ party_id: string; stake_id: string }>(
      user,
      'SELECT party_id,stake_id FROM app.holding',
    );
    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.party_id).toBe(represented);
    expect(await asUser<{ id: string }>(user, 'SELECT id FROM app.stake')).toEqual([
      { id: holdings[0]?.stake_id },
    ]);
    expect(await asUser(user, 'SELECT quantity FROM app.use_right_ledger')).toHaveLength(2);
    expect(await asUser(user, 'SELECT id FROM app.acquisition')).toHaveLength(1);
    expect(await asUser(user, 'SELECT id FROM app.second_home')).toEqual([{ id: home }]);
    expect(await asUser(randomUUID(), 'SELECT id FROM app.holding')).toEqual([]);
    expect(await asUser(randomUUID(), 'SELECT id FROM app.acquisition')).toEqual([]);
  });

  it('[TECH-052] delegação pendente, revogada, expirada ou ainda futura não autoriza leitura patrimonial', async () => {
    const party = await ownerParty(database.pool);
    await facts(await root(), [party], null);
    for (const options of [
      { state: 'pending' as const },
      { state: 'revoked' as const },
      { validFrom: "now()-interval '2 days'", validUntil: "now()-interval '1 day'" },
      { validFrom: "now()+interval '1 day'" },
    ]) {
      const userId = randomUUID();
      await ownerDelegation(database.pool, { partyId: party, userId, ...options });
      expect(await asUser(userId, 'SELECT id FROM app.holding')).toEqual([]);
      expect(await asUser(userId, 'SELECT id FROM app.acquisition')).toEqual([]);
    }
  });

  it('[TECH-052] grants de coluna não expõem bases/operações/SPE/outros metadados, independentemente da RLS', async () => {
    const user = randomUUID();
    for (const query of [
      'SELECT operation_id FROM app.holding',
      'SELECT acquisition_id FROM app.holding',
      'SELECT basis_ref FROM app.acquisition',
      'SELECT operation_id FROM app.acquisition',
      'SELECT spe_id FROM app.stake',
      'SELECT allocation_position FROM app.stake',
      'SELECT operation_id FROM app.use_right_ledger',
      'SELECT initial_allocation_id FROM app.use_right_ledger',
      'SELECT basis_ref FROM app.second_home_operation_start',
      'SELECT id FROM app.spe',
      'SELECT party_id FROM app.luxtory_legal_identity',
      'SELECT basis_ref FROM app.second_home_initial_allocation',
      'SELECT provider_party_id FROM app.second_home_administration',
    ])
      await expect(asUser(user, query)).rejects.toMatchObject({ code: '42501' });
    await expect(app.query('UPDATE app.acquisition SET modality=modality')).rejects.toMatchObject({
      code: '42501',
    });
    await app.query('BEGIN');
    try {
      await app.query('SET LOCAL ROLE anon');
      await expect(app.query('SELECT id FROM app.holding')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await app.query('ROLLBACK');
    }
  });

  it('[REQ-026] SPE exige party CNPJ por FK composta, sem descriptografar nem copiar documento', async () => {
    await expect(
      facts(await root(), [await ownerParty(database.pool), await ownerParty(database.pool)], 2, {
        spePartyId: await ownerParty(database.pool),
      }),
    ).rejects.toMatchObject({ code: '23503', constraint: 'spe_company_fk' });
  });

  it('[TECH-020] início divergente da base formalizada falha estruturalmente e não ajusta os grants', async () => {
    const home = await root();
    await facts(home, [await ownerParty(database.pool)], null);
    await expect(start(home, '2027-01-02')).rejects.toMatchObject({
      code: '23503',
      constraint: 'conflict_operation_start_base',
    });
    expect(
      (
        await app.query('SELECT id FROM app.second_home_operation_start WHERE second_home_id=$1', [
          home,
        ])
      ).rows,
    ).toEqual([]);
  });

  it('[TECH-110] rollback não descarta fatos institucionais ou patrimoniais já registrados', async () => {
    await facts(await root(), [await ownerParty(database.pool)], null);
    for (const migration of [
      '20261025041637_ownership_legal_identity',
      '20261025054013_ownership_acquisition_structure',
      '20261025055044_ownership_acquisition_invariants',
    ]) {
      const sql = (await readFile(`migrations/${migration}.sql`, 'utf8')).split(
        '-- migrate:down',
      )[1];
      const client = await database.pool.connect();
      try {
        await client.query('BEGIN');
        await expect(client.query(sql!)).rejects.toThrow(/rollback/i);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }
    expect(
      (await app.query('SELECT count(*)::int AS n FROM app.acquisition')).rows[0]?.n,
    ).toBeGreaterThan(0);
  });

  it('[TECH-052] down das projeções remove privilégios de coluna, sem apagar fatos', async () => {
    const sql = (
      await readFile('migrations/20261025160200_ownership_holder_projections.sql', 'utf8')
    ).split('-- migrate:down')[1];
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql!);
      for (const [table, column] of [
        ['holding', 'party_id'],
        ['stake', 'id'],
        ['acquisition', 'modality'],
        ['use_right_ledger', 'quantity'],
        ['second_home_operation_start', 'effective_start_date'],
        ['second_home', 'timezone'],
      ])
        expect(
          (
            await client.query('SELECT has_column_privilege($1,$2,$3,$4) AS allowed', [
              'authenticated',
              `app.${table}`,
              column,
              'SELECT',
            ])
          ).rows,
        ).toEqual([{ allowed: false }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
