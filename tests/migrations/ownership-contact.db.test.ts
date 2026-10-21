import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/features/platform';
import { dbmate } from '../../scripts/lib/dbmate.mjs';
import { catalogHarness, controlledClock } from '../support/catalog-fixtures';
import { appDatabase } from '../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// Migrations da W6 (spec ownership §14.7; ADR-0018): `interest_contact`, `interest_qualification` e o esquema do hash em
// `public_idempotency_key` — constraints, gatilhos, RLS só para o papel de aplicação, eliminação estrutural sem caminho
// na aplicação e rollback fail-closed.
const TABLES = ['interest_contact', 'interest_qualification'] as const;
// Última migration da W6: as posteriores (W7+) saem antes, para o rollback da W6 ficar no topo.
const LAST_W6_MIGRATION = '20261021030855';
const LATER_MIGRATIONS = readdirSync(new URL('../../migrations/', import.meta.url)).filter(
  (file) => file.slice(0, LAST_W6_MIGRATION.length) > LAST_W6_MIGRATION,
);
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';

describe('W6: interest_contact, interest_qualification e esquema do hash no banco', () => {
  let database: TestDatabase;
  let app: pg.Client;
  let db: Database;
  let homeEditionId: string;
  let referenceId: string;
  let otherReferenceId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
    db = appDatabase(database.appUrl);
    const { build } = catalogHarness(db, controlledClock(new Date('2026-09-15T12:00:00.000Z')));
    homeEditionId = (await build.finalizedHomeEdition()).homeEdition.id;
    referenceId = (await build.projectedInvestment(homeEditionId, 480_000_000)).id;
    const other = (await build.finalizedHomeEdition({ name: 'Outra' })).homeEdition.id;
    otherReferenceId = (await build.projectedInvestment(other, 900_000_000)).id;
  });

  afterAll(async () => {
    await app.end();
    await db.destroy();
    await database.drop();
  });

  async function insertInterest(modality: 'owner' | 'co_owner' = 'co_owner'): Promise<string> {
    const id = randomUUID();
    await app.query(
      `INSERT INTO app.interest (id, home_edition_id, modality, desired_location, approx_days, created_at)
       VALUES ($1, $2, $3, 'Serra', $4, now())`,
      [id, homeEditionId, modality, modality === 'co_owner' ? 14 : null],
    );
    return id;
  }

  function insertRow(table: string, row: Record<string, unknown>) {
    const columns = Object.keys(row);
    return app.query(
      `INSERT INTO app.${table} (${columns.join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  }

  const contact = (interestId: string, fields: Record<string, unknown> = {}) =>
    insertRow('interest_contact', {
      interest_id: interestId,
      name: 'Maria Teste',
      phone: '+5511987654321',
      email: 'maria@example.com',
      created_at: new Date(),
      ...fields,
    });

  const qualification = (interestId: string, fields: Record<string, unknown> = {}) =>
    insertRow('interest_qualification', {
      interest_id: interestId,
      qualification_version: 1,
      available_to_start_band: 'not_defined',
      reference_fit: null,
      presented_projected_investment_id: null,
      decision_unit: 'self',
      decision_horizon: 'exploring',
      created_at: new Date(),
      ...fields,
    });

  it('[TECH-052] RLS ligada; anon e authenticated não leem nem gravam contato nem pré-qualificação', async () => {
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

  it('[REQ-022] [TECH-052] eliminação estrutural: o papel de aplicação não altera nem apaga; o dono apaga sem tocar o interesse', async () => {
    const interestId = await insertInterest();
    await contact(interestId);
    await qualification(interestId);
    for (const table of TABLES) {
      await expect(app.query(`UPDATE app.${table} SET created_at = now()`), table).rejects.toThrow(
        /permission denied/,
      );
      await expect(app.query(`DELETE FROM app.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(app.query(`TRUNCATE app.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(database.pool.query(`UPDATE app.${table} SET created_at = now()`)).rejects.toThrow(
        /is not allowed/,
      );
      await expect(database.pool.query(`TRUNCATE app.${table}`)).rejects.toThrow(/is not allowed/);
    }
    const before = await database.pool.query('SELECT * FROM app.interest WHERE id = $1', [interestId]);

    await database.pool.query('DELETE FROM app.interest_contact WHERE interest_id = $1', [interestId]);
    await database.pool.query('DELETE FROM app.interest_qualification WHERE interest_id = $1', [
      interestId,
    ]);

    const after = await database.pool.query('SELECT * FROM app.interest WHERE id = $1', [interestId]);
    expect(after.rows).toEqual(before.rows);
    // Nenhuma tabela referencia contato ou pré-qualificação; nenhuma FK para party, holding ou Brand Partner.
    const { rows } = await database.pool.query<{ confrelid: string }>(
      `SELECT confrelid::regclass::text AS confrelid FROM pg_constraint
        WHERE contype = 'f' AND (conrelid = ANY($1::regclass[]) OR confrelid = ANY($1::regclass[]))`,
      [['app.interest_contact', 'app.interest_qualification']],
    );
    expect(rows.map((row) => row.confrelid).sort()).toEqual([
      'app.home_edition_projected_investment',
      'app.interest',
      'app.interest',
    ]);
  });

  it('[REQ-022] contato: nome, telefone e e-mail obrigatórios e normalizados; 1:1 com o interesse', async () => {
    const interestId = await insertInterest();
    for (const fields of [
      { phone: '(11) 98765-4321' },
      { phone: '1234567' },
      { phone: '+1234567890123456' },
      { name: ' Maria' },
      { name: '' },
      { name: 'Linha\nquebrada' },
      { email: 'sem-arroba' },
      { email: 'a@b' },
    ]) {
      await expect(contact(interestId, fields), JSON.stringify(fields)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    }
    for (const column of ['name', 'phone', 'email']) {
      await expect(contact(interestId, { [column]: null }), column).rejects.toMatchObject({
        code: NOT_NULL_VIOLATION,
      });
    }
    await expect(contact(randomUUID())).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    await expect(contact(interestId)).resolves.toBeDefined();
    await expect(contact(interestId)).rejects.toMatchObject({ code: '23505' });
  });

  it('[REQ-022] [BR-034] pré-qualificação: códigos fechados e versionados; reference_fit exige referência apresentada', async () => {
    const coOwner = await insertInterest();
    for (const fields of [
      { available_to_start_band: '300000' },
      { available_to_start_band: 'between_1_and_2m' },
      { qualification_version: 2 },
      { reference_fit: 'needs_understanding' },
      { reference_fit: 'within' },
      { decision_unit: 'family' },
      { decision_horizon: 'within_3_months' },
      { decision_horizon: 'hot' },
    ]) {
      await expect(qualification(coOwner, fields), JSON.stringify(fields)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    }
    for (const column of ['available_to_start_band', 'qualification_version', 'decision_unit', 'decision_horizon']) {
      await expect(qualification(coOwner, { [column]: null }), column).rejects.toMatchObject({
        code: NOT_NULL_VIOLATION,
      });
    }
    const owner = await insertInterest('owner');
    await expect(
      qualification(owner, {
        available_to_start_band: 'above_5m',
        reference_fit: 'could_consider',
        presented_projected_investment_id: referenceId,
        decision_horizon: 'immediate',
      }),
    ).resolves.toBeDefined();
    await expect(
      qualification(await insertInterest(), { decision_horizon: 'within_30_days' }),
    ).resolves.toBeDefined();
  });

  it('[REQ-022] [BR-034] guarda do banco: referência de outra Home Edition, comparação sem Owner com média, ou Owner com média sem comparação → recusada', async () => {
    const owner = await insertInterest('owner');
    await expect(
      qualification(owner, {
        reference_fit: 'within',
        presented_projected_investment_id: otherReferenceId,
      }),
    ).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'interest_qualification_reference_home_edition',
    });
    // Owner com média apresentada precisa da comparação.
    await expect(
      qualification(owner, { presented_projected_investment_id: referenceId }),
    ).rejects.toMatchObject({ constraint: 'interest_qualification_reference_fit_variant' });
    // Co-Owner nunca compara com a média total, mesmo com a referência apresentada (BR-063).
    const coOwner = await insertInterest();
    await expect(
      qualification(coOwner, {
        reference_fit: 'within',
        presented_projected_investment_id: referenceId,
      }),
    ).rejects.toMatchObject({ constraint: 'interest_qualification_reference_fit_variant' });
    await expect(
      qualification(coOwner, { presented_projected_investment_id: referenceId }),
    ).resolves.toBeDefined();
    await expect(
      qualification(await insertInterest(), { presented_projected_investment_id: randomUUID() }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('[REQ-022] [EC-14] a referência apresentada não some nem muda de valor — a média projetada é só inserção', async () => {
    await expect(
      database.pool.query('DELETE FROM app.home_edition_projected_investment WHERE id = $1', [referenceId]),
    ).rejects.toThrow(/is not allowed/);
    await expect(
      database.pool.query(
        'UPDATE app.home_edition_projected_investment SET amount_minor = 1 WHERE id = $1',
        [referenceId],
      ),
    ).rejects.toThrow(/single end of validity/);
  });

  it('[TECH-056] chave pública: esquema obrigatório; sha256 sem id de chave, hmac_sha256 com id', async () => {
    const insert = (fields: Record<string, unknown>) =>
      insertRow('public_idempotency_key', {
        surface: 'interest',
        idempotency_key: randomUUID(),
        request_hash: 'a'.repeat(64),
        created_at: new Date(),
        ...fields,
      });

    await expect(insert({})).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
    await expect(insert({ hash_scheme: 'sha256', hash_key_id: null })).resolves.toBeDefined();
    await expect(insert({ hash_scheme: 'hmac_sha256', hash_key_id: 'v1' })).resolves.toBeDefined();
    for (const fields of [
      { hash_scheme: 'sha256', hash_key_id: 'v1' },
      { hash_scheme: 'hmac_sha256', hash_key_id: null },
      { hash_scheme: 'md5', hash_key_id: null },
      { hash_scheme: 'hmac_sha256', hash_key_id: 'Chave Com Espaço' },
    ]) {
      await expect(insert(fields), JSON.stringify(fields)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
    }
  });

  it('rollback fail-closed: com contato, pré-qualificação ou hash chaveado gravados, o down recusa apagar', async () => {
    for (let undone = 0; undone < LATER_MIGRATIONS.length; undone += 1) {
      await dbmate(['rollback'], { url: database.url });
    }
    await expect(dbmate(['rollback'], { url: database.url })).rejects.toThrow(
      /interest_qualification has rows/,
    );
    await database.pool.query('DELETE FROM app.interest_qualification');
    await dbmate(['rollback'], { url: database.url });
    await expect(dbmate(['rollback'], { url: database.url })).rejects.toThrow(
      /interest_contact has rows/,
    );
    await database.pool.query('DELETE FROM app.interest_contact');
    await dbmate(['rollback'], { url: database.url });
    await expect(dbmate(['rollback'], { url: database.url })).rejects.toThrow(
      /keyed public idempotency records/,
    );
  });
});
