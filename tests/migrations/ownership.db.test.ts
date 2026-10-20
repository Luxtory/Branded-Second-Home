import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/features/platform';
import { catalogHarness, controlledClock } from '../support/catalog-fixtures';
import { appDatabase } from '../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// Migrations da W5 e da W4.2 (spec ownership §5, §13, ADR-0017): `app.interest` (a partir da Home Edition) e
// `app.public_idempotency_key` — constraints, gatilhos, RLS só para o papel de aplicação e linhas só de inserção.
const TABLES = ['interest', 'public_idempotency_key'] as const;
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

describe('W5: interest e public_idempotency_key no banco', () => {
  let database: TestDatabase;
  let app: pg.Client;
  let db: Database;
  let homeEditionId: string;
  let draftHomeEditionId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
    db = appDatabase(database.appUrl);
    const { build } = catalogHarness(db, controlledClock(new Date('2026-09-15T12:00:00.000Z')));
    homeEditionId = (await build.finalizedHomeEdition()).homeEdition.id;
    draftHomeEditionId = (await build.approvedHomeEdition({ name: 'Em preparação' })).homeEdition.id;
  });

  afterAll(async () => {
    await app.end();
    await db.destroy();
    await database.drop();
  });

  /** Insere como o papel de aplicação, com os campos válidos sobrescritos por `fields`. */
  function insertInterest(fields: Record<string, unknown> = {}) {
    const row: Record<string, unknown> = {
      id: randomUUID(),
      home_edition_id: homeEditionId,
      modality: 'co_owner',
      desired_location: 'Serra',
      approx_days: 14,
      origin: null,
      partner_ref: null,
      created_at: new Date(),
      ...fields,
    };
    const columns = Object.keys(row);
    return app.query(
      `INSERT INTO app.interest (${columns.join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  }

  it('[TECH-052] RLS ligada; anon e authenticated não leem nem gravam', async () => {
    for (const table of TABLES) {
      for (const role of ['anon', 'authenticated']) {
        const client = await database.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SET LOCAL ROLE ${role}`);
          await expect(client.query(`SELECT * FROM app.${table}`), `${role} ${table}`).rejects.toThrow(
            /permission denied/,
          );
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
    }
    const { rows } = await database.pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relnamespace = 'app'::regnamespace AND relname = ANY($1)`,
      [TABLES],
    );
    expect(rows.map((row) => row.relrowsecurity)).toEqual([true, true]);
  });

  it('[TECH-052] só inserção: o papel de aplicação não altera nem apaga; o dono é barrado pelo gatilho', async () => {
    // Uma linha em cada tabela: gatilhos por linha só disparam quando há linha atingida.
    await insertInterest();
    await app.query(
      `INSERT INTO app.public_idempotency_key (surface, idempotency_key, request_hash, created_at)
       VALUES ('interest', $1, $2, now())`,
      [randomUUID(), 'b'.repeat(64)],
    );
    for (const table of TABLES) {
      await expect(app.query(`UPDATE app.${table} SET created_at = now()`), table).rejects.toThrow(
        /permission denied/,
      );
      await expect(app.query(`DELETE FROM app.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(app.query(`TRUNCATE app.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(database.pool.query(`UPDATE app.${table} SET created_at = now()`)).rejects.toThrow(
        /is not allowed/,
      );
      await expect(database.pool.query(`DELETE FROM app.${table}`)).rejects.toThrow(/is not allowed/);
      await expect(database.pool.query(`TRUNCATE app.${table}`)).rejects.toThrow(/is not allowed/);
    }
  });

  it('[REQ-025] approx_days: obrigatório e positivo para Co-Owner, nulo para Owner (BR-060)', async () => {
    await expect(insertInterest({ approx_days: null })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    await expect(insertInterest({ approx_days: 0 })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    await expect(insertInterest({ modality: 'owner', approx_days: 14 })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    await expect(insertInterest({ modality: 'owner', approx_days: null })).resolves.toBeDefined();
    await expect(insertInterest({ approx_days: 2_147_483_647 })).resolves.toBeDefined();
  });

  it('modalidade fechada; textos normalizados e limitados; origem e partner_ref nulos ou 1–200', async () => {
    for (const fields of [
      { modality: 'owner_and_co_owner' },
      { desired_location: '' },
      { desired_location: ' Serra' },
      { desired_location: 'x'.repeat(201) },
      { origin: '' },
      { partner_ref: 'p'.repeat(201) },
    ]) {
      await expect(insertInterest(fields), JSON.stringify(fields).slice(0, 60)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    }
    await expect(
      insertInterest({
        origin: 'Instagram',
        partner_ref: 'Parceiro',
        desired_location: '😀'.repeat(200),
      }),
    ).resolves.toBeDefined();
  });

  it('[REQ-022] [BR-030] [BR-032] Home Edition obrigatória e existente; qualquer modalidade; sem Home Concept nem F2a', async () => {
    await expect(insertInterest({ home_edition_id: null })).rejects.toMatchObject({
      code: '23502',
    });
    await expect(insertInterest({ home_edition_id: randomUUID() })).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
    });
    await expect(
      insertInterest({ modality: 'owner', approx_days: null }),
    ).resolves.toBeDefined();
    await expect(insertInterest()).resolves.toBeDefined();
    // A visibilidade é decidida pela leitura pública do use case, não pelo banco: o banco só garante o vínculo.
    await expect(insertInterest({ home_edition_id: draftHomeEditionId })).resolves.toBeDefined();
    await expect(insertInterest({ home_concept_id: randomUUID() })).rejects.toMatchObject({
      code: '42703',
    });
    const { rows } = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'interest_modality_offered'`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('[TECH-056] chave pública: UUID em minúsculas, hash SHA-256 e superfície por extenso; única por superfície', async () => {
    const insert = (fields: Record<string, unknown>) => {
      const row = {
        surface: 'interest',
        idempotency_key: randomUUID(),
        request_hash: 'a'.repeat(64),
        created_at: new Date(),
        ...fields,
      };
      return app.query(
        `INSERT INTO app.public_idempotency_key (surface, idempotency_key, request_hash, created_at)
         VALUES ($1, $2, $3, $4)`,
        [row.surface, row.idempotency_key, row.request_hash, row.created_at],
      );
    };
    const key = randomUUID();

    await expect(insert({ idempotency_key: key })).resolves.toBeDefined();
    await expect(insert({ idempotency_key: key })).rejects.toMatchObject({ code: '23505' });
    await expect(insert({ idempotency_key: key, surface: 'other' })).resolves.toBeDefined();
    for (const fields of [
      { idempotency_key: randomUUID().toUpperCase() },
      { idempotency_key: '1' },
      { request_hash: 'xyz' },
      { surface: 'Interest' },
    ]) {
      await expect(insert(fields)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    }
  });
});
