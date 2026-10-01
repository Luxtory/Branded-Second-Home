import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postgresPublicCatalogReader as reader } from '@/features/catalog/infrastructure/postgres-public-catalog-reader';
import { withPublicRead, type Database } from '@/features/platform';
import { catalogHarness, CONTENT, controlledClock } from '../../support/catalog-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Discovery público (docs/specs/catalog.md §13.2, ADR-0014): leitura como `anon` sob RLS em PostgreSQL real, com o papel
// de aplicação real. Os commands usam o relógio controlado; a RLS usa o `now()` do banco (encerramento).
const START = new Date('2026-09-15T12:00:00.000Z');
const DAY = 86_400_000;
const PERMISSION_DENIED = '42501';

describe('catálogo — leitura pública como anon', () => {
  let database: TestDatabase;
  let db: Database;
  let harness: ReturnType<typeof catalogHarness>;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    harness = catalogHarness(db, controlledClock(START));
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const read = <T>(fn: Parameters<typeof withPublicRead<T>>[1]) => withPublicRead(db, fn);
  const collection = () => read((tx) => reader.collection(tx));
  const concept = (id: string) => read((tx) => reader.concept(tx, id));

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

  /** Brand Partner com exposição autorizada → Concept com a versão 1 aprovada (sem Edition). */
  async function publicConcept(title = 'Casa do Pátio') {
    const { build, ok, handlers } = harness;
    const partner = await build.brandPartner();
    await authorizeExposure(partner.id);
    const version = await ok(handlers.createConceptVersion, {
      brand_partner_id: partner.id,
      title,
      ...CONTENT,
    });
    await build.approve(version.id);
    return { partner, conceptId: version.concept_id };
  }

  async function expectDenied(query: string) {
    await expect(read((tx) => sql.raw(query).execute(tx))).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
  }

  it('[BR-015] [REQ-096] só é público o Concept com versão aprovada e exposição da marca autorizada', async () => {
    const { build } = harness;
    const visible = await publicConcept('Casa Visível');
    await build.edition(visible.conceptId);

    // Versão aprovada, mas a marca sem autorização de exposição.
    const withoutExposure = await build.approvedEdition();
    // Exposição autorizada, mas nenhuma versão aprovada.
    const unapprovedPartner = await build.brandPartner();
    await authorizeExposure(unapprovedPartner.id);
    const unapproved = await build.concept(unapprovedPartner.id);

    expect(await collection()).toEqual([
      {
        id: visible.conceptId,
        title: 'Casa Visível',
        brandName: visible.partner.brand_name,
        editions: [
          {
            id: expect.any(String),
            region: 'Litoral norte de São Paulo',
            modality: 'owner_and_co_owner',
          },
        ],
      },
    ]);
    expect(await concept(withoutExposure.conceptId)).toBeNull();
    expect(await concept(unapproved.concept_id)).toBeNull();
  });

  it('[REQ-096] a especificação pública é a da versão vigente (maior aprovada); versão não aprovada não aparece', async () => {
    const { ok, handlers, build } = harness;
    const { conceptId } = await publicConcept();
    const v2 = await ok(handlers.createConceptVersion, {
      concept_id: conceptId,
      ...CONTENT,
      specification: 'Especificação da versão 2.',
    });
    await build.approve(v2.id);
    await ok(handlers.createConceptVersion, {
      concept_id: conceptId,
      ...CONTENT,
      specification: 'Rascunho da versão 3, ainda não aprovado.',
    });

    expect(await concept(conceptId)).toMatchObject({ specification: 'Especificação da versão 2.' });
    const versions = await read((tx) =>
      tx
        .selectFrom('app.concept_version')
        .select(['version', 'state'])
        .orderBy('version')
        .execute(),
    );
    expect(versions).toEqual([
      { version: 1, state: 'approved' },
      { version: 2, state: 'approved' },
    ]);
  });

  it('[BR-021] antes da eficácia do encerramento o Concept aparece; depois dela some, sem apagar o registro', async () => {
    const future = await publicConcept('Casa com encerramento futuro');
    await terminate(future.partner.id, new Date(Date.now() + 30 * DAY));
    const past = await publicConcept('Casa com encerramento eficaz');
    await terminate(past.partner.id, new Date(START.getTime() + DAY));

    expect((await collection()).map((card) => card.title)).toEqual([
      'Casa com encerramento futuro',
    ]);
    expect(await concept(future.conceptId)).not.toBeNull();
    expect(await concept(past.conceptId)).toBeNull();
    // Limitação temporária fechada para falhas (spec catalog §13.1): o registro continua no catálogo.
    const { rows } = await database.pool.query(
      'SELECT count(*)::int AS n FROM app.concept WHERE id = $1',
      [past.conceptId],
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('[REQ-022] Concept sem Edition é público sem oferta; com Editions, região, modalidade e condições como registradas', async () => {
    const { build } = harness;
    const withoutEdition = await publicConcept('Casa sem Edition');
    const withEditions = await publicConcept('Casa com Editions');
    await build.edition(withEditions.conceptId, 'owner');
    await build.edition(withEditions.conceptId, 'co_owner');

    expect(await concept(withoutEdition.conceptId)).toMatchObject({ editions: [] });
    expect((await collection()).find((card) => card.id === withoutEdition.conceptId)).toMatchObject(
      { editions: [] },
    );
    const full = await concept(withEditions.conceptId);
    expect(full?.editions.map((edition) => edition.modality)).toEqual(['owner', 'co_owner']);
    expect(full?.editions[0]).toMatchObject({
      region: 'Litoral norte de São Paulo',
      commercialConditions: 'Condições comerciais registradas pela Luxtory.',
    });
    // O card da Coleção traz as Editions sem as condições comerciais (só a página do Concept as mostra).
    const card = (await collection()).find((item) => item.id === withEditions.conceptId);
    expect(card?.editions.map((edition) => Object.keys(edition).sort())).toEqual([
      ['id', 'modality', 'region'],
      ['id', 'modality', 'region'],
    ]);
  });

  it('[REQ-022] disponibilidade: nenhum Concept, só Concepts sem Edition e Concept com Edition público', async () => {
    const availability = () => read((tx) => reader.availability(tx));
    // Concept não público (sem exposição) não conta.
    await harness.build.approvedEdition();
    expect(await availability()).toEqual({ concepts: false, editions: false });

    const { conceptId } = await publicConcept('Casa sem Edition ainda');
    expect(await availability()).toEqual({ concepts: true, editions: false });

    await harness.build.edition(conceptId);
    expect(await availability()).toEqual({ concepts: true, editions: true });
  });

  it('[TECH-052] anon só lê as colunas publicáveis; o resto do catálogo e de app é recusado pelo banco', async () => {
    const { conceptId } = await publicConcept();
    await harness.build.edition(conceptId);

    for (const query of [
      'SELECT essential_elements FROM app.concept_version',
      'SELECT preservation_premises FROM app.concept_version',
      'SELECT approval_refs, approved_by_user_id FROM app.concept_version',
      'SELECT exposure_authorization_ref FROM app.brand_partner',
      'SELECT terminated_effective_at FROM app.brand_partner',
      'SELECT operation_id FROM app.concept',
      'SELECT operation_id FROM app.edition',
      'SELECT id FROM app.residence',
      'SELECT id FROM app.investor_authorization',
      'SELECT id FROM app.operation',
      'SELECT id FROM app.audit_log',
      'SELECT id FROM app.staff_role',
    ]) {
      await expectDenied(query);
    }
    // Só leitura: a transação é READ ONLY e anon não tem INSERT.
    await expect(
      read((tx) =>
        sql`INSERT INTO app.concept (id, brand_partner_id, title, operation_id, created_at)
            VALUES (${randomUUID()}, ${randomUUID()}, 'x', ${randomUUID()}, now())`.execute(tx),
      ),
    ).rejects.toThrow();
  });

  it('[TECH-052] anon só executa os dois predicados públicos (além de validação pura e funções de gatilho)', async () => {
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
      'concept_is_public',
      'is_text_list',
    ]);
    // Predicado com id desconhecido: só `false`, nenhum dado.
    const result = await read((tx) =>
      sql<{ visible: boolean }>`SELECT app.concept_is_public(${randomUUID()}) AS visible`.execute(
        tx,
      ),
    );
    expect(result.rows).toEqual([{ visible: false }]);
  });
});
