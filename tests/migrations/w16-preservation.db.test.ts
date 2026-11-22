import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseBefore,
  differences,
  migrationDown,
  migrationsFromNewest,
  snapshot,
  type Snapshot,
} from '../support/catalog-snapshot';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

/**
 * W16 E2 — prova de preservação (ADR-0032 §6): as migrations da W16 só acrescentam os objetos do PRL e as constraints
 * das chaves econômicas, e mudam exatamente cinco definições da W14 — a trava e a busca seguras para NULL do
 * `parameter_insert`, o `parameter_at`, a lista fechada de chaves, a unicidade `NULLS NOT DISTINCT` e a `currency` ao fim
 * da view. Nada da W15 (Membership), da indicação de convidados ou do uso próprio muda.
 */
/** Migrations da W16, na ordem de aplicação (uma por linha). */
const M1 = '20261120055433_admin_parameter_economic_keys';
const M2 = '20261120055435_pricing_prl';
const FIRST_W16 = M1;

const CHANGED = [
  'constraint app.parameter.conflict_parameter_scope_start',
  'constraint app.parameter.parameter_key_check',
  'function app.parameter_at(text,uuid,timestamp with time zone)',
  'function app.parameter_insert()',
  'view app.parameter_version',
];

const W16_OBJECTS = [
  /^(acl|constraint|trigger|view|function|function-acl) app\.(prl|lock_prl)/,
  /^acl app\.conflict_prl_scope_start$/,
  /^policy prl(_publication)?\./,
  /^constraint app\.parameter\.parameter_(scope_check|currency_check|integer_value|money_value|decimal_value|rate_value)$/,
];

const LOCK_BEFORE =
  "PERFORM pg_advisory_xact_lock(hashtextextended('app.parameter:' || NEW.key || ':' || NEW.second_home_id::text, 0));";
const LOCK_AFTER =
  "PERFORM pg_advisory_xact_lock(hashtextextended('app.parameter:' || NEW.key || ':' || coalesce(NEW.second_home_id::text, 'global'), 0));";

/** Linha inserida com os gatilhos desligados (dono do schema): histórico qualquer, só para exercitar o rollback. */
async function seed(database: TestDatabase, sql: string, params: unknown[]): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(sql, params);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const insertParameter = (database: TestDatabase, key: string, homeId: string | null, value: string, currency: string | null) =>
  seed(
    database,
    `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, authority, authorization_ref,
       created_at, created_by, operation_id)
     VALUES ($1, $2, $3, $4, $5, now(), 'admin', 'Ata Luxtory W16', now(), $6, $7)`,
    [randomUUID(), key, homeId, value, currency, randomUUID(), randomUUID()],
  );

describe('W16 — preservação do catálogo da W14/W15 e rollback protegido (E2)', () => {
  let w15: Awaited<ReturnType<typeof databaseBefore>>;
  let w15Snapshot: Snapshot;

  beforeAll(async () => {
    w15 = await databaseBefore(FIRST_W16);
    w15Snapshot = await snapshot(w15.database);
  });

  afterAll(async () => {
    await w15?.dispose();
  });

  it('[TECH-110][ADR-0032] a W16 só acrescenta os objetos do PRL e muda exatamente as cinco definições da W14 previstas', async () => {
    // Banco só até a W16: as waves seguintes (W17+) têm a própria prova de preservação.
    const newer = (await migrationsFromNewest(FIRST_W16)).filter((name) => name > M2);
    const upToW16 = newer.length > 0 ? await databaseBefore(newer.at(-1)!) : null;
    const subject = upToW16?.database ?? (await createTestDatabase({ migrated: false }));
    try {
      if (upToW16 === null) await w15.migrateThenAll(subject.url);
      const after = await snapshot(subject);
      const changed = differences(w15Snapshot, after);
      expect(changed.filter((key) => w15Snapshot.has(key)).sort()).toEqual(CHANGED);
      const added = changed.filter((key) => !w15Snapshot.has(key));
      expect(added.length).toBeGreaterThan(0);
      expect(added.filter((key) => !W16_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);

      const before = (key: string) => w15Snapshot.get(key)!;
      const now = (key: string) => after.get(key)!;
      expect(
        now('function app.parameter_insert()')
          .replace(LOCK_AFTER, LOCK_BEFORE)
          .replace('second_home_id IS NOT DISTINCT FROM NEW.second_home_id', 'second_home_id = NEW.second_home_id'),
      ).toBe(before('function app.parameter_insert()'));
      expect(
        now('function app.parameter_at(text,uuid,timestamp with time zone)').replace(
          'p.second_home_id IS NOT DISTINCT FROM p_second_home_id',
          'p.second_home_id = p_second_home_id',
        ),
      ).toBe(before('function app.parameter_at(text,uuid,timestamp with time zone)'));
      expect(now('constraint app.parameter.conflict_parameter_scope_start')).toBe(
        before('constraint app.parameter.conflict_parameter_scope_start').replace('UNIQUE (', 'UNIQUE NULLS NOT DISTINCT ('),
      );
      for (const key of [
        'guest_rules',
        'credit_multiplier',
        'credit_validity_months',
        'luxchange_fee_rate',
        'luxchange_fee_minimum',
        'request_deadline_hours',
        'membership_base_annual_price',
      ])
        expect(now('constraint app.parameter.parameter_key_check')).toContain(`'${key}'`);
      expect(now('view app.parameter_version').replace(' AS effective_until,\n    currency\n', ' AS effective_until\n')).toBe(
        before('view app.parameter_version'),
      );
    } finally {
      await (upToW16 ? upToW16.dispose() : subject.drop());
    }
  });

  it('[TECH-110] desfazer a W16 restaura exatamente o catálogo da W15 (definições, não só nomes)', async () => {
    const subject = await createTestDatabase();
    try {
      for (const name of await migrationsFromNewest(FIRST_W16))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w15Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });

  it('[TECH-110][TECH-052] o rollback recusa com histórico de PRL ou de chave econômica', async () => {
    const subject = await createTestDatabase();
    try {
      await seed(
        subject,
        `INSERT INTO app.prl_publication (id, second_home_id, kind, effective_from, authority, authorization_ref,
           created_at, created_by, operation_id)
         VALUES ($1, $2, 'initial', now(), 'admin', 'Ata Luxtory W16', now(), $3, $4)`,
        [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
      );
      await expect(subject.pool.query(await migrationDown(M2))).rejects.toThrow(
        'W16 rollback would discard the PRL history',
      );
      await insertParameter(subject, 'credit_multiplier', null, '7.25', null);
      await expect(subject.pool.query(await migrationDown(M1))).rejects.toThrow(
        'W16 rollback would discard the economic parameter history',
      );
      const { rows } = await subject.pool.query(
        `SELECT (SELECT count(*)::int FROM app.prl_publication) AS publications,
                (SELECT count(*)::int FROM app.parameter) AS parameters`,
      );
      expect(rows[0]).toEqual({ publications: 1, parameters: 1 });
    } finally {
      await subject.drop();
    }
  });

  it('[TECH-110] com só regras de convidados, o rollback da W16 preserva o histórico e restaura a W14', async () => {
    const subject = await createTestDatabase();
    try {
      const homeId = randomUUID();
      await insertParameter(subject, 'guest_rules', homeId, 'Regras (teste)', null);
      for (const name of await migrationsFromNewest(FIRST_W16))
        await subject.pool.query(await migrationDown(name));
      const { rows } = await subject.pool.query(
        `SELECT key, second_home_id, value, effective_until FROM app.parameter_version`,
      );
      expect(rows).toEqual([
        { key: 'guest_rules', second_home_id: homeId, value: 'Regras (teste)', effective_until: null },
      ]);
      const column = await subject.pool.query(
        `SELECT attname, attnotnull FROM pg_attribute
          WHERE attrelid = 'app.parameter'::regclass AND attname IN ('second_home_id', 'currency') AND NOT attisdropped`,
      );
      expect(column.rows).toEqual([{ attname: 'second_home_id', attnotnull: true }]);
    } finally {
      await subject.drop();
    }
  });
});
