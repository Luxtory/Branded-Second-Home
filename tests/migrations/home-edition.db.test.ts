import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbmate } from '../../scripts/lib/dbmate.mjs';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// W4.2 (spec catalog §17.3, ADR-0019; `02` v4.3 REQ-022, BR-036): ciclo da Home Edition no banco — preparação editável,
// finalização material uma vez e sem volta, visibilidade pública separada — e as precondições fail-closed das migrations
// de renomeação (docs/plan/w4-2-ontologia.md §3). SQL direto: as regras valem em qualquer caminho de escrita.
const CHECK_VIOLATION = '23514';
const FIRST_W42_VERSION = '20261019210001';
const MATERIAL = {
  typology: 'Villa térrea',
  spatial_configuration: 'Estar integrado ao jardim; suítes voltadas ao nascente.',
  projected_area_m2: 420,
  suites: 4,
  guests_max: 10,
};

type Query = (sql: string, values?: unknown[]) => Promise<pg.QueryResult>;

async function operation(query: Query): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
                                correlation_id, authorization_ref, state, created_at, updated_at)
     VALUES ($1::uuid, 'test_fixture', NULL, NULL, 'system', NULL, $1::text, $1::text, 'test', 'committed', now(),
             now())`,
    [id],
  );
  return id;
}

/** Brand Partner exposta + Home Concept com versão aprovada (público). */
async function publicHomeConcept(query: Query): Promise<string> {
  const partnerId = randomUUID();
  await query(
    `INSERT INTO app.brand_partner (id, brand_name, exposure_authorization_ref, exposure_authorized_at, operation_id,
                                    created_at)
     VALUES ($1, 'Marca', 'ref', now(), $2, now())`,
    [partnerId, await operation(query)],
  );
  const homeConceptId = randomUUID();
  await query(
    `INSERT INTO app.home_concept (id, brand_partner_id, title, operation_id, created_at)
     VALUES ($1, $2, 'Home Concept', $3, now())`,
    [homeConceptId, partnerId, await operation(query)],
  );
  await query(
    `INSERT INTO app.home_concept_version (id, home_concept_id, version, essential_elements, preservation_premises,
       specification, state, approval_refs, approved_at, approved_by_user_id, approved_role, approval_operation_id,
       operation_id, created_at)
     VALUES ($1, $2, 1, '{essencial}', '{premissa}', 'especificação', 'approved', '{aprovação}', now(), $3, 'admin',
             $4, $5, now())`,
    [randomUUID(), homeConceptId, randomUUID(), await operation(query), await operation(query)],
  );
  return homeConceptId;
}

async function draftHomeEdition(query: Query, homeConceptId: string): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO app.home_edition (id, home_concept_id, operation_id, created_at, name, description, typology,
       spatial_configuration, projected_area_m2, suites, guests_max, material_state, visibility)
     VALUES ($1, $2, $3, now(), 'Home Edition', 'Descrição', $4, $5, $6, $7, $8, 'draft', 'hidden')`,
    [
      id,
      homeConceptId,
      await operation(query),
      MATERIAL.typology,
      MATERIAL.spatial_configuration,
      MATERIAL.projected_area_m2,
      MATERIAL.suites,
      MATERIAL.guests_max,
    ],
  );
  return id;
}

async function finalize(query: Query, id: string): Promise<void> {
  await query(
    `UPDATE app.home_edition SET material_state = 'finalized', finalized_at = now(), finalized_by_user_id = $2,
       finalized_role = 'admin', finalization_operation_id = $3 WHERE id = $1`,
    [id, randomUUID(), await operation(query)],
  );
}

describe('W4.2: ciclo da Home Edition no banco', () => {
  let database: TestDatabase;
  let query: Query;
  let homeConceptId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    query = (sql, values) => database.pool.query(sql, values);
    homeConceptId = await publicHomeConcept(query);
  });

  afterAll(async () => {
    await database.drop();
  });

  it('[BR-036] em preparação, a definição material e os textos podem ser completados e corrigidos', async () => {
    const id = await draftHomeEdition(query, homeConceptId);

    await query(
      `UPDATE app.home_edition SET typology = 'Casa de dois pavimentos', projected_area_m2 = 450, suites = 5,
         rooms = '{Estar,Varanda}', description = 'Descrição corrigida' WHERE id = $1`,
      [id],
    );

    const { rows } = await query('SELECT typology, suites, rooms FROM app.home_edition WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ typology: 'Casa de dois pavimentos', suites: 5, rooms: ['Estar', 'Varanda'] });
  });

  it.each([
    ['typology', "'Outra tipologia'"],
    ['spatial_configuration', "'Outra configuração'"],
    ['projected_area_m2', '999'],
    ['suites', '2'],
    ['guests_max', '3'],
    ['rooms', "'{Outro}'"],
    ['amenities', "'{Piscina}'"],
    ['characteristics', "'{Outra}'"],
    ['material_state', "'draft'"],
    ['finalized_at', 'now()'],
  ])('[BR-036] depois de finalizada, %s não muda em nenhum caminho', async (column, value) => {
    const id = await draftHomeEdition(query, homeConceptId);
    await finalize(query, id);

    await expect(
      query(`UPDATE app.home_edition SET ${column} = ${value} WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'home_edition_material_immutable' });
  });

  it('[BR-036] depois de finalizada, nome, descrição e visibilidade continuam mudando', async () => {
    const id = await draftHomeEdition(query, homeConceptId);
    await finalize(query, id);

    await query(
      `UPDATE app.home_edition SET name = 'Nome corrigido', description = 'Texto corrigido', visibility = 'public'
       WHERE id = $1`,
      [id],
    );
    await query(
      `UPDATE app.home_edition SET visibility = 'hidden', withdrawal_basis = 'Revisão de mídia' WHERE id = $1`,
      [id],
    );

    const { rows } = await query(
      'SELECT name, material_state, visibility, withdrawal_basis FROM app.home_edition WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({
      name: 'Nome corrigido',
      material_state: 'finalized',
      visibility: 'hidden',
      withdrawal_basis: 'Revisão de mídia',
    });
  });

  it('[BR-036] retirar do público não reabre a definição material', async () => {
    const id = await draftHomeEdition(query, homeConceptId);
    await finalize(query, id);
    await query(`UPDATE app.home_edition SET visibility = 'public' WHERE id = $1`, [id]);
    await query(`UPDATE app.home_edition SET visibility = 'hidden', withdrawal_basis = 'base' WHERE id = $1`, [id]);

    await expect(
      query(`UPDATE app.home_edition SET suites = 1 WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'home_edition_material_immutable' });
  });

  it('[REQ-022] só Home Edition finalizada é pública; a base de retirada só existe fora do público', async () => {
    const id = await draftHomeEdition(query, homeConceptId);

    await expect(
      query(`UPDATE app.home_edition SET visibility = 'public' WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'home_edition_visibility_check' });
    await finalize(query, id);
    await expect(
      query(`UPDATE app.home_edition SET visibility = 'public', withdrawal_basis = 'x' WHERE id = $1`, [id]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'home_edition_visibility_check' });
  });

  it('[REQ-020] [BR-031] o vínculo com o Home Concept nunca muda, nem em preparação', async () => {
    const id = await draftHomeEdition(query, homeConceptId);
    const other = await publicHomeConcept(query);

    await expect(
      query(`UPDATE app.home_edition SET home_concept_id = $2 WHERE id = $1`, [id, other]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'home_edition_identity' });
  });

  it('[TECH-052] anon lê só a Home Edition pública, de Home Concept público', async () => {
    const draft = await draftHomeEdition(query, homeConceptId);
    const finalizedHidden = await draftHomeEdition(query, homeConceptId);
    await finalize(query, finalizedHidden);
    const visible = await draftHomeEdition(query, homeConceptId);
    await finalize(query, visible);
    await query(`UPDATE app.home_edition SET visibility = 'public' WHERE id = $1`, [visible]);

    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM app.home_edition WHERE id = ANY($1)',
        [[draft, finalizedHidden, visible]],
      );
      expect(rows.map((row) => row.id)).toEqual([visible]);
      await expect(client.query('SELECT material_state FROM app.home_edition')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('W4.2: precondições fail-closed das migrations de renomeação', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  async function latestVersion(): Promise<string> {
    const { rows } = await database.pool.query<{ version: string }>(
      'SELECT max(version) AS version FROM dbmate.schema_migrations',
    );
    return rows[0]?.version ?? '';
  }

  /** Desfaz as migrations da W4.2, voltando ao schema de `origin/main` antes dela. */
  async function rollbackW42(): Promise<void> {
    while ((await latestVersion()) >= FIRST_W42_VERSION) {
      await dbmate(['rollback'], { url: database.url });
    }
  }

  async function exists(relation: string): Promise<boolean> {
    const { rows } = await database.pool.query<{ found: string | null }>('SELECT to_regclass($1) AS found', [
      relation,
    ]);
    return rows[0]?.found !== null;
  }

  it('aborta a migration da Home Edition se houver Edition (região e modalidade seriam perdidas)', async () => {
    await rollbackW42();
    const query: Query = (sql, values) => database.pool.query(sql, values);
    await query(
      `INSERT INTO app.brand_partner (id, brand_name, operation_id, created_at) VALUES ($1, 'Marca', $2, now())`,
      [randomUUID(), await legacyOperation(query)],
    );
    const { rows } = await query('SELECT id FROM app.brand_partner LIMIT 1');
    const conceptId = randomUUID();
    await query(`INSERT INTO app.concept (id, brand_partner_id, title, operation_id, created_at)
                 VALUES ($1, $2, 'Concept', $3, now())`, [conceptId, rows[0]?.id, await legacyOperation(query)]);
    await query(`INSERT INTO app.edition (id, concept_id, region, modality, commercial_conditions, operation_id, created_at)
                 VALUES ($1, $2, 'Serra', 'owner', 'Condições', $3, now())`,
      [randomUUID(), conceptId, await legacyOperation(query)]);

    await expect(dbmate(['up', '--strict'], { url: database.url })).rejects.toThrow(
      /edition has rows/,
    );
    // A migration que falhou não deixou nada: a Edition continua com o nome e as colunas antigas.
    expect(await exists('app.edition')).toBe(true);
    expect(await exists('app.home_edition')).toBe(false);
  });
});

/** `operation` no schema anterior à W4.2 (`residence_id`). */
async function legacyOperation(query: Query): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, residence_id, idempotency_key,
                                correlation_id, authorization_ref, state, created_at, updated_at)
     VALUES ($1::uuid, 'test_fixture', NULL, NULL, 'system', NULL, $1::text, $1::text, 'test', 'committed', now(),
             now())`,
    [id],
  );
  return id;
}
