import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/features/platform';
import { catalogHarness, controlledClock } from '../support/catalog-fixtures';
import { appDatabase } from '../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// Migrations da W5 (spec ownership §5, ADR-0017): `app.interest` e `app.public_idempotency_key` — constraints, gatilhos,
// RLS só para o papel de aplicação e linhas só de inserção.
const TABLES = ['interest', 'public_idempotency_key'] as const;
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

describe('W5: interest e public_idempotency_key no banco', () => {
  let database: TestDatabase;
  let app: pg.Client;
  let db: Database;
  let conceptId: string;
  let otherConceptId: string;
  let ownerEditionId: string;
  let bothEditionId: string;
  let otherEditionId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
    db = appDatabase(database.appUrl);
    const { build } = catalogHarness(db, controlledClock(new Date('2026-09-15T12:00:00.000Z')));
    const owner = await build.approvedEdition('owner');
    conceptId = owner.conceptId;
    ownerEditionId = owner.edition.id;
    bothEditionId = (await build.edition(conceptId, 'owner_and_co_owner')).id;
    const other = await build.approvedEdition('owner_and_co_owner');
    otherConceptId = other.conceptId;
    otherEditionId = other.edition.id;
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
      concept_id: conceptId,
      edition_id: null,
      modality: 'co_owner',
      region: 'Serra',
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
      { region: '' },
      { region: ' Serra' },
      { region: 'x'.repeat(201) },
      { origin: '' },
      { partner_ref: 'p'.repeat(201) },
    ]) {
      await expect(insertInterest(fields), JSON.stringify(fields).slice(0, 60)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    }
    await expect(
      insertInterest({ origin: 'Instagram', partner_ref: 'Parceiro', region: '😀'.repeat(200) }),
    ).resolves.toBeDefined();
  });

  it('[REQ-022] Edition opcional e sempre do mesmo Concept; modalidade oferecida pela Edition (F2a)', async () => {
    await expect(insertInterest({ edition_id: otherEditionId })).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
    });
    await expect(insertInterest({ edition_id: ownerEditionId })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'interest_modality_offered',
    });
    await expect(
      insertInterest({ edition_id: ownerEditionId, modality: 'owner', approx_days: null }),
    ).resolves.toBeDefined();
    await expect(insertInterest({ edition_id: bothEditionId })).resolves.toBeDefined();
    await expect(
      insertInterest({ concept_id: otherConceptId, edition_id: otherEditionId }),
    ).resolves.toBeDefined();
    await expect(insertInterest({ concept_id: randomUUID() })).rejects.toMatchObject({
      code: FOREIGN_KEY_VIOLATION,
    });
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
