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

describe('W4.2: Second Home, média projetada e interesse no banco', () => {
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

  async function insertSecondHome(homeEditionId: string) {
    const { rows } = await query(
      'SELECT id FROM app.home_concept_version WHERE home_concept_id = $1 AND state = $2',
      [homeConceptId, 'approved'],
    );
    return query(
      `INSERT INTO app.second_home (id, home_edition_id, home_concept_id, home_concept_version_id,
         commercially_approved_at, label, timezone, investor_authorization_id, operation_id)
       VALUES ($1, $2, $3, $4, now(), 'SH-1', 'America/Sao_Paulo', NULL, $5)`,
      [randomUUID(), homeEditionId, homeConceptId, rows[0]?.id, await operation(query)],
    );
  }

  async function insertInvestment(homeEditionId: string, from: string, until: string | null) {
    return query(
      `INSERT INTO app.home_edition_projected_investment (id, home_edition_id, amount_minor, currency, valid_from,
         valid_until, registered_by_user_id, registered_role, operation_id, created_at)
       VALUES ($1, $2, 480000000, 'BRL', $3, $4, $5, 'admin', $6, now())`,
      [randomUUID(), homeEditionId, from, until, randomUUID(), await operation(query)],
    );
  }

  it('[REQ-022] [BR-025] Second Home exige Home Edition finalizada; a visibilidade pública não é condição', async () => {
    const draft = await draftHomeEdition(query, homeConceptId);
    await expect(insertSecondHome(draft)).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'second_home_home_edition_finalized',
    });

    const hidden = await draftHomeEdition(query, homeConceptId);
    await finalize(query, hidden);
    await expect(insertSecondHome(hidden)).resolves.toBeDefined();
  });

  it('[BR-034] uma média projetada vigente por Home Edition; sobreposição recusada em qualquer caminho', async () => {
    const id = await draftHomeEdition(query, homeConceptId);
    await insertInvestment(id, '2026-01-01T00:00:00Z', null);

    await expect(insertInvestment(id, '2027-01-01T00:00:00Z', null)).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'home_edition_projected_investment_overlap',
    });
  });

  it('[TECH-052] anon lê só a média vigente de Home Edition pública', async () => {
    const hidden = await draftHomeEdition(query, homeConceptId);
    await finalize(query, hidden);
    const visible = await draftHomeEdition(query, homeConceptId);
    await finalize(query, visible);
    await query(`UPDATE app.home_edition SET visibility = 'public' WHERE id = $1`, [visible]);
    await insertInvestment(hidden, '2026-01-01T00:00:00Z', null);
    await insertInvestment(visible, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
    await insertInvestment(visible, '2026-02-01T00:00:00Z', null);

    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      const { rows } = await client.query<{ home_edition_id: string; valid_from: Date }>(
        'SELECT home_edition_id, valid_from FROM app.home_edition_projected_investment WHERE home_edition_id = ANY($1)',
        [[hidden, visible]],
      );
      expect(rows.map((row) => [row.home_edition_id, row.valid_from.toISOString()])).toEqual([
        [visible, '2026-02-01T00:00:00.000Z'],
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('[REQ-022] o interesse exige Home Edition e não tem concept_id nem region', async () => {
    await expect(
      query(
        `INSERT INTO app.interest (id, home_edition_id, modality, desired_location, approx_days, created_at)
         VALUES ($1, NULL, 'owner', 'Serra', NULL, now())`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23502' });
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'interest'`,
    );
    const columns = rows.map((row: { column_name: string }) => row.column_name);
    expect(columns).toContain('desired_location');
    expect(columns).not.toContain('concept_id');
    expect(columns).not.toContain('region');
  });
});

describe('W4.2: precondições fail-closed das migrations de renomeação', () => {
  let databases: TestDatabase[] = [];

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.drop()));
    databases = [];
  });

  /** Banco migrado e devolvido ao schema anterior à W4.2 (as migrations da W4.2 desfeitas). */
  async function preW42(): Promise<{ database: TestDatabase; query: Query }> {
    const database = await createTestDatabase();
    databases.push(database);
    const latest = async () =>
      (
        await database.pool.query<{ version: string }>(
          'SELECT max(version) AS version FROM dbmate.schema_migrations',
        )
      ).rows[0]?.version ?? '';
    while ((await latest()) >= FIRST_W42_VERSION) await dbmate(['rollback'], { url: database.url });
    return { database, query: (sql, values) => database.pool.query(sql, values) };
  }

  async function exists(database: TestDatabase, relation: string): Promise<boolean> {
    const { rows } = await database.pool.query<{ found: string | null }>('SELECT to_regclass($1) AS found', [
      relation,
    ]);
    return rows[0]?.found !== null;
  }

  async function legacyConcept(query: Query): Promise<string> {
    const partnerId = randomUUID();
    await query(
      `INSERT INTO app.brand_partner (id, brand_name, operation_id, created_at) VALUES ($1, 'Marca', $2, now())`,
      [partnerId, await legacyOperation(query)],
    );
    const conceptId = randomUUID();
    await query(
      `INSERT INTO app.concept (id, brand_partner_id, title, operation_id, created_at)
       VALUES ($1, $2, 'Concept', $3, now())`,
      [conceptId, partnerId, await legacyOperation(query)],
    );
    return conceptId;
  }

  it('aborta a migration do Home Concept se uma versão tiver atributo físico (seria descartado)', async () => {
    const { database, query } = await preW42();
    const conceptId = await legacyConcept(query);
    await query(
      `INSERT INTO app.concept_version (id, concept_id, version, essential_elements, preservation_premises,
         specification, state, guests_max, operation_id, created_at)
       VALUES ($1, $2, 1, '{e}', '{p}', 's', 'not_approved', 8, $3, now())`,
      [randomUUID(), conceptId, await legacyOperation(query)],
    );

    await expect(dbmate(['up', '--strict'], { url: database.url })).rejects.toThrow(/physical attributes/);
    expect(await exists(database, 'app.concept_version')).toBe(true);
    expect(await exists(database, 'app.home_concept_version')).toBe(false);
  });

  it('aborta a migration da Home Edition se houver Edition (região e modalidade seriam perdidas)', async () => {
    const { database, query } = await preW42();
    const conceptId = await legacyConcept(query);
    await query(
      `INSERT INTO app.edition (id, concept_id, region, modality, commercial_conditions, operation_id, created_at)
       VALUES ($1, $2, 'Serra', 'owner', 'Condições', $3, now())`,
      [randomUUID(), conceptId, await legacyOperation(query)],
    );

    await expect(dbmate(['up', '--strict'], { url: database.url })).rejects.toThrow(/edition has rows/);
    // A migration que falhou não deixou nada: a Edition continua com o nome e as colunas antigas.
    expect(await exists(database, 'app.edition')).toBe(true);
    expect(await exists(database, 'app.home_edition')).toBe(false);
  });

  it('aborta a migration do interesse se houver interesse sem Home Edition', async () => {
    const { database, query } = await preW42();
    const conceptId = await legacyConcept(query);
    await query(
      `INSERT INTO app.interest (id, concept_id, edition_id, modality, region, approx_days, created_at)
       VALUES ($1, $2, NULL, 'owner', 'Serra', NULL, now())`,
      [randomUUID(), conceptId],
    );

    await expect(dbmate(['up', '--strict'], { url: database.url })).rejects.toThrow(
      /interest rows without a Home Edition/,
    );
    const { rows } = await database.pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'app' AND table_name = 'interest' AND column_name = 'concept_id'`,
    );
    expect(rows).toHaveLength(1);
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
