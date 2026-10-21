import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postgresPublicCatalogReader as reader } from '@/features/catalog/infrastructure/postgres-public-catalog-reader';
import { postgresPublicCollectionReader } from '@/features/catalog/infrastructure/postgres-public-collection-reader';
import { withPublicRead, type Database } from '@/features/platform';
import {
  catalogHarness,
  CONTENT,
  controlledClock,
  HOME_EDITION_CONTENT,
} from '../../support/catalog-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Discovery público (docs/specs/catalog.md §13.2, §17.7, ADR-0014): leitura como `anon` sob RLS em PostgreSQL real, com o papel
// de aplicação real. Os commands usam o relógio controlado; a RLS usa o `now()` do banco (encerramento).
const START = new Date('2026-09-15T12:00:00.000Z');
const DAY = 86_400_000;
const PERMISSION_DENIED = '42501';

describe('catálogo — leitura pública como anon', () => {
  let database: TestDatabase;
  let db: Database;
  let harness: ReturnType<typeof catalogHarness>;
  let clock: ReturnType<typeof controlledClock>;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    clock = controlledClock(START);
    harness = catalogHarness(db, clock);
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const read = <T>(fn: Parameters<typeof withPublicRead<T>>[1]) => withPublicRead(db, fn);
  const collection = () => read((tx) => postgresPublicCollectionReader.entries(tx));
  const homeConcept = (id: string) => read((tx) => reader.homeConcept(tx, id));
  const homeEdition = (homeConceptId: string, id: string) =>
    read((tx) => reader.homeEdition(tx, homeConceptId, id));

  async function authorizeExposure(brandPartnerId: string) {
    await harness.ok(harness.handlers.authorizeBrandExposure, {
      brand_partner_id: brandPartnerId,
      exposure_authorization_ref: 'Plano estratégico de uso da marca — anexo II',
    });
  }

  async function terminate(brandPartnerId: string, effectiveAt: Date) {
    await harness.ok(harness.handlers.terminateBrandPartner, {
      brand_partner_id: brandPartnerId,
      terminated_effective_at: effectiveAt.toISOString(),
      termination_basis: 'Aditivo de encerramento',
    });
  }

  /** Brand Partner com exposição autorizada → Home Concept com a versão 1 aprovada (sem Home Edition). */
  async function publicHomeConcept(title = 'Casa do Pátio') {
    const { build, ok, handlers } = harness;
    const partner = await build.brandPartner();
    await authorizeExposure(partner.id);
    const version = await ok(handlers.createHomeConceptVersion, {
      brand_partner_id: partner.id,
      title,
      ...CONTENT,
    });
    await build.approve(version.id);
    return { partner, homeConceptId: version.home_concept_id };
  }

  /** Home Edition finalizada e publicada no Home Concept informado. */
  async function publishedHomeEdition(
    homeConceptId: string,
    content: Record<string, unknown> = {},
  ) {
    const { build } = harness;
    const created = await build.homeEdition(homeConceptId, content);
    await build.finalize(created.id);
    return build.publish(created.id);
  }

  async function expectDenied(query: string) {
    await expect(read((tx) => sql.raw(query).execute(tx))).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
  }

  it('[BR-015] [REQ-096] só é público o Home Concept com versão aprovada e exposição da marca autorizada', async () => {
    const { build } = harness;
    const visible = await publicHomeConcept('Casa Visível');
    const published = await publishedHomeEdition(visible.homeConceptId);

    // Versão aprovada, mas a marca sem autorização de exposição — mesmo com Home Edition publicada.
    const withoutExposure = await build.finalizedHomeEdition();
    await build.publish(withoutExposure.homeEdition.id);
    // Exposição autorizada, mas nenhuma versão aprovada.
    const unapprovedPartner = await build.brandPartner();
    await authorizeExposure(unapprovedPartner.id);
    const unapproved = await build.homeConcept(unapprovedPartner.id);

    expect((await collection()).map((entry) => entry.id)).toEqual([visible.homeConceptId]);
    expect(await homeConcept(visible.homeConceptId)).toMatchObject({
      title: 'Casa Visível',
      brandName: visible.partner.brand_name,
      homeEditions: [{ id: published.id, name: HOME_EDITION_CONTENT.name }],
    });
    expect(await homeConcept(withoutExposure.homeConceptId)).toBeNull();
    expect(
      await homeEdition(withoutExposure.homeConceptId, withoutExposure.homeEdition.id),
    ).toBeNull();
    expect(await homeConcept(unapproved.home_concept_id)).toBeNull();
  });

  it('[REQ-096] a especificação pública é a da versão vigente (maior aprovada); versão não aprovada não aparece', async () => {
    const { ok, handlers, build } = harness;
    const { homeConceptId } = await publicHomeConcept();
    const v2 = await ok(handlers.createHomeConceptVersion, {
      home_concept_id: homeConceptId,
      ...CONTENT,
      specification: 'Especificação da versão 2.',
    });
    await build.approve(v2.id);
    await ok(handlers.createHomeConceptVersion, {
      home_concept_id: homeConceptId,
      ...CONTENT,
      specification: 'Rascunho da versão 3, ainda não aprovado.',
    });

    expect(await homeConcept(homeConceptId)).toMatchObject({
      specification: 'Especificação da versão 2.',
    });
    const versions = await read((tx) =>
      tx
        .selectFrom('app.home_concept_version')
        .select(['version', 'state'])
        .orderBy('version')
        .execute(),
    );
    expect(versions).toEqual([
      { version: 1, state: 'approved' },
      { version: 2, state: 'approved' },
    ]);
  });

  it('[BR-021] antes da eficácia do encerramento o Home Concept aparece; depois dela some com as suas Home Editions, sem apagar o registro', async () => {
    const future = await publicHomeConcept('Casa com encerramento futuro');
    await terminate(future.partner.id, new Date(Date.now() + 30 * DAY));
    const past = await publicHomeConcept('Casa com encerramento eficaz');
    const pastEdition = await publishedHomeEdition(past.homeConceptId);
    await terminate(past.partner.id, new Date(START.getTime() + DAY));

    expect((await collection()).map((entry) => entry.title)).toEqual([
      'Casa com encerramento futuro',
    ]);
    expect(await homeConcept(future.homeConceptId)).not.toBeNull();
    expect(await homeConcept(past.homeConceptId)).toBeNull();
    expect(await homeEdition(past.homeConceptId, pastEdition.id)).toBeNull();
    // Limitação temporária fechada para falhas (spec catalog §13.1): o registro continua no catálogo.
    const { rows } = await database.pool.query(
      'SELECT count(*)::int AS n FROM app.home_concept WHERE id = $1',
      [past.homeConceptId],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('[BR-036] só é pública a Home Edition publicada (logo finalizada); em preparação, finalizada fora do site ou retirada, nunca', async () => {
    const { build, handlers, ok } = harness;
    const { homeConceptId } = await publicHomeConcept();
    const draft = await build.homeEdition(homeConceptId, { name: 'Edição em preparação' });
    clock.advance(DAY);
    const hidden = await build.homeEdition(homeConceptId, { name: 'Edição finalizada' });
    await build.finalize(hidden.id);
    clock.advance(DAY);
    const published = await publishedHomeEdition(homeConceptId, { name: 'Edição publicada' });
    clock.advance(DAY);
    const withdrawn = await publishedHomeEdition(homeConceptId, { name: 'Edição retirada' });
    await ok(handlers.withdrawHomeEdition, {
      home_edition_id: withdrawn.id,
      withdrawal_basis: 'Revisão',
    });

    expect((await homeConcept(homeConceptId))?.homeEditions.map((item) => item.name)).toEqual([
      'Edição publicada',
    ]);
    for (const id of [draft.id, hidden.id, withdrawn.id]) {
      expect(await homeEdition(homeConceptId, id)).toBeNull();
    }
    expect(await homeEdition(homeConceptId, published.id)).toMatchObject({
      id: published.id,
      homeConceptId,
      name: 'Edição publicada',
      typology: HOME_EDITION_CONTENT.typology,
      projectedAreaM2: HOME_EDITION_CONTENT.projected_area_m2,
      rooms: [...HOME_EDITION_CONTENT.rooms],
      media: [],
      projectedInvestment: null,
    });
    // De outro Home Concept: 404 (sem redirecionar).
    const other = await publicHomeConcept('Outro Home Concept');
    expect(await homeEdition(other.homeConceptId, published.id)).toBeNull();
  });

  it('[REQ-022] [BR-031] a leitura pública da Home Edition não tem localização, modalidade nem condições; média projetada só a vigente', async () => {
    const { build } = harness;
    const { homeConceptId } = await publicHomeConcept();
    const published = await publishedHomeEdition(homeConceptId);
    const current = await build.projectedInvestment(published.id, 480_000_000);
    // A RLS usa o `now()` do banco: a média futura começa depois do instante real.
    await build.projectedInvestment(published.id, 520_000_000, new Date(Date.now() + 10 * DAY));

    const read = await homeEdition(homeConceptId, published.id);
    // O id é o do registro vigente: o contexto de apresentação da W6 assina exatamente esta referência.
    expect(read?.projectedInvestment).toEqual({
      id: current.id,
      amountMinor: 480_000_000n,
      currency: 'BRL',
    });
    for (const key of [
      'region',
      'modality',
      'commercialConditions',
      'materialState',
      'visibility',
    ]) {
      expect(read).not.toHaveProperty(key);
    }
    const entry = (await collection()).find((item) => item.id === homeConceptId);
    expect(entry?.homeEditions[0]?.projectedInvestment).toEqual({
      id: current.id,
      amountMinor: 480_000_000n,
      currency: 'BRL',
    });
  });

  it('[REQ-022] disponibilidade: nenhum Home Concept, só Home Concepts sem Home Edition publicada e com Home Edition publicada', async () => {
    const availability = () => read((tx) => reader.availability(tx));
    // Home Concept não público (sem exposição) não conta, nem com Home Edition publicada.
    const hidden = await harness.build.finalizedHomeEdition();
    await harness.build.publish(hidden.homeEdition.id);
    expect(await availability()).toEqual({ homeConcepts: false, homeEditions: false });

    const { homeConceptId } = await publicHomeConcept('Casa sem Home Edition ainda');
    expect(await availability()).toEqual({ homeConcepts: true, homeEditions: false });

    // Em preparação ou finalizada fora do site não conta.
    const draft = await harness.build.homeEdition(homeConceptId);
    await harness.build.finalize(draft.id);
    expect(await availability()).toEqual({ homeConcepts: true, homeEditions: false });

    await harness.build.publish(draft.id);
    expect(await availability()).toEqual({ homeConcepts: true, homeEditions: true });
  });

  it('[TECH-052] anon só lê as colunas publicáveis; o resto do catálogo e de app é recusado pelo banco', async () => {
    const { homeConceptId } = await publicHomeConcept();
    await publishedHomeEdition(homeConceptId);

    for (const query of [
      'SELECT essential_elements FROM app.home_concept_version',
      'SELECT preservation_premises FROM app.home_concept_version',
      'SELECT approval_refs, approved_by_user_id FROM app.home_concept_version',
      'SELECT exposure_authorization_ref FROM app.brand_partner',
      'SELECT terminated_effective_at FROM app.brand_partner',
      'SELECT operation_id FROM app.home_concept',
      'SELECT operation_id FROM app.home_edition',
      'SELECT material_state FROM app.home_edition',
      'SELECT visibility FROM app.home_edition',
      'SELECT finalized_by_user_id FROM app.home_edition',
      'SELECT withdrawal_basis FROM app.home_edition',
      'SELECT registered_by_user_id FROM app.home_edition_projected_investment',
      'SELECT source_sha256 FROM app.home_edition_media',
      'SELECT id FROM app.second_home',
      'SELECT id FROM app.investor_authorization',
      'SELECT id FROM app.interest',
      'SELECT id FROM app.operation',
      'SELECT id FROM app.audit_log',
      'SELECT id FROM app.staff_role',
    ]) {
      await expectDenied(query);
    }
    // Só leitura: a transação é READ ONLY e anon não tem INSERT.
    await expect(
      read((tx) =>
        sql`INSERT INTO app.home_concept (id, brand_partner_id, title, operation_id, created_at)
            VALUES (${randomUUID()}, ${randomUUID()}, 'x', ${randomUUID()}, now())`.execute(tx),
      ),
    ).rejects.toThrow();
  });

  it('[TECH-052] anon só executa os predicados públicos (além de validação pura e funções de gatilho)', async () => {
    const { rows } = await database.pool.query<{ proname: string }>(
      `SELECT p.proname
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app'
          AND p.prorettype <> 'trigger'::regtype
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ORDER BY 1`,
    );
    expect(rows.map((row) => row.proname)).toEqual([
      'brand_partner_is_public',
      // Coleção (spec catalog §13.12): termo público = ativo e em uso por Home Concept público.
      'catalog_term_is_public',
      'home_concept_is_public',
      'is_text_list',
    ]);
    // Predicado com id desconhecido: só `false`, nenhum dado.
    const result = await read((tx) =>
      sql<{
        visible: boolean;
      }>`SELECT app.home_concept_is_public(${randomUUID()}) AS visible`.execute(tx),
    );
    expect(result.rows).toEqual([{ visible: false }]);
  });
});
