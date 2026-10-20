import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readInterestOverview } from '@/features/ownership/presentation/interest-overview-read';
import { createInterestRoute } from '@/features/ownership/presentation/interest-route';
import { createMemoryRateLimiter, withRoute, type Database } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { catalogHarness, CONTENT, controlledClock, count } from '../../support/catalog-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Registro de interesse em PostgreSQL real com o papel de aplicação (spec ownership §5, §13, ADR-0017): alvo — a Home
// Edition publicada — pela leitura pública do catálogo como `anon`, idempotência pública e invariantes de "nenhum direito" provadas no banco.
const START = new Date('2026-09-15T12:00:00.000Z');
const DAY = 86_400_000;
const HOST = 'luxtory.test';
const PARALLEL = 6;

const ENV = {
  INTEREST_LIMITER_MODE: 'fake',
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  INTEREST_NETWORK_LIMIT: '1000',
  INTEREST_NETWORK_WINDOW_SECONDS: '60',
  INTEREST_GLOBAL_LIMIT: '1000',
  INTEREST_GLOBAL_WINDOW_SECONDS: '60',
} as const;

/** Linhas de cada tabela de todos os esquemas da aplicação e do Auth — a prova de "o que mudou" no banco. */
async function tableCounts(admin: pg.Pool): Promise<Record<string, number>> {
  const { rows } = await admin.query<{ schema: string; name: string }>(
    `SELECT table_schema AS schema, table_name AS name FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY 1, 2`,
  );
  const counts: Record<string, number> = {};
  for (const { schema, name } of rows) {
    const result = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${schema}"."${name}"`,
    );
    counts[`${schema}.${name}`] = result.rows[0]?.n ?? 0;
  }
  return counts;
}

function changed(before: Record<string, number>, after: Record<string, number>): string[] {
  return Object.keys(after).filter((table) => after[table] !== before[table]);
}

describe('interesse — registro em PostgreSQL real (W5)', () => {
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

  /**
   * Brand Partner com exposição autorizada → Home Concept com versão aprovada → Home Edition publicada (finalizada e no
   * site): o alvo de uma manifestação de interesse (BR-030).
   */
  async function publicHomeEdition() {
    const { build, ok, handlers } = harness;
    const partner = await build.brandPartner();
    await ok(handlers.authorizeBrandExposure, {
      brand_partner_id: partner.id,
      exposure_authorization_ref: 'Plano estratégico de uso da marca — anexo II',
    });
    const version = await ok(handlers.createHomeConceptVersion, {
      brand_partner_id: partner.id,
      title: `Casa ${randomUUID().slice(0, 6)}`,
      ...CONTENT,
    });
    await build.approve(version.id);
    const created = await build.homeEdition(version.home_concept_id, {
      name: `Edição ${randomUUID().slice(0, 6)}`,
    });
    await build.finalize(created.id);
    const homeEdition = await build.publish(created.id);
    return { partner, homeConceptId: version.home_concept_id, homeEditionId: homeEdition.id };
  }

  function route() {
    const { logger } = captureLogger();
    const limiter = createMemoryRateLimiter({
      network: { limit: 1000, windowSeconds: 60 },
      global: { limit: 1000, windowSeconds: 60 },
    });
    return withRoute(createInterestRoute({ env: ENV, database: db, limiter }), logger);
  }

  function post(body: unknown, key = randomUUID()) {
    return route()(
      new Request(`https://${HOST}/v1/interests`, {
        method: 'POST',
        headers: {
          host: HOST,
          origin: `https://${HOST}`,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  const coOwner = (homeEditionId: string, extra: Record<string, unknown> = {}) => ({
    home_edition_id: homeEditionId,
    modality: 'co_owner',
    desired_location: 'Litoral norte de SP',
    approx_days: 21,
    ...extra,
  });

  it('[REQ-023] origem e partner_ref registrados sem prerrogativa: só interest e a chave pública mudam', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const before = await tableCounts(database.pool);

    const response = await post(
      coOwner(homeEditionId, { origin: 'Instagram da marca', partner_ref: 'Parceiro local XPTO' }),
    );

    expect(response.status).toBe(201);
    const after = await tableCounts(database.pool);
    expect(changed(before, after).sort()).toEqual(['app.interest', 'app.public_idempotency_key']);
    expect(after['app.interest']).toBe((before['app.interest'] ?? 0) + 1);
    const { rows } = await database.pool.query(
      'SELECT origin, partner_ref, desired_location, approx_days, home_edition_id FROM app.interest',
    );
    expect(rows).toEqual([
      {
        origin: 'Instagram da marca',
        partner_ref: 'Parceiro local XPTO',
        desired_location: 'Litoral norte de SP',
        approx_days: 21,
        home_edition_id: homeEditionId,
      },
    ]);
  });

  it('[REQ-025] approx_days nunca vira Ação nem Direito de Uso: nenhuma tabela referencia interest e nada além dele muda', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const before = await tableCounts(database.pool);

    expect((await post(coOwner(homeEditionId, { approx_days: 365 }))).status).toBe(201);

    // Nenhuma tabela de aquisição, Ação, Direito de Uso, holding, party, calendário, inventário, booking, Créditos ou
    // economia — existente agora ou criada depois — muda; nem operation, audit_log ou idempotency_record (ADR-0017).
    expect(changed(before, await tableCounts(database.pool)).sort()).toEqual([
      'app.interest',
      'app.public_idempotency_key',
    ]);
    const { rows } = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE confrelid = 'app.interest'::regclass`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('[REQ-024] [BR-032] Owner e Co-Owner na mesma Home Edition: a Home Edition não restringe modalidade; nada é aquisição', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const before = await tableCounts(database.pool);

    const owner = await post({
      home_edition_id: homeEditionId,
      modality: 'owner',
      desired_location: 'Serra',
    });
    const co = await post(coOwner(homeEditionId));

    expect([owner.status, co.status]).toEqual([201, 201]);
    expect(changed(before, await tableCounts(database.pool)).sort()).toEqual([
      'app.interest',
      'app.public_idempotency_key',
    ]);
    // O gatilho F2a (modalidade oferecida pela Edition) não existe mais.
    const { rows } = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'app.interest'::regclass AND NOT tgisinternal
          AND tgname LIKE '%modality%'`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('[REQ-022] [BR-030] Home Edition obrigatória: sem ela, ou só com o Home Concept, a manifestação é recusada', async () => {
    const { homeConceptId } = await publicHomeEdition();

    const missing = await post({ modality: 'owner', desired_location: 'Serra' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      fields: [{ field: 'home_edition_id', code: 'required' }],
    });
    expect(
      (await post({ home_concept_id: homeConceptId, modality: 'owner', desired_location: 'Serra' }))
        .status,
    ).toBe(400);
    expect(await count(database.pool, 'interest')).toBe(0);
    // O banco também exige a Home Edition (NOT NULL) e não tem mais o Home Concept do interesse.
    const { rows } = await database.pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'interest'
          AND column_name IN ('home_edition_id', 'home_concept_id', 'concept_id', 'region')`,
    );
    expect(rows).toEqual([{ column_name: 'home_edition_id', is_nullable: 'NO' }]);
  });

  it('[REQ-022] Home Edition em preparação, fora do público, de Home Concept não público ou com marca encerrada → 404 sem gravar', async () => {
    const { build, ok, handlers } = harness;
    const published = await publicHomeEdition();
    const draft = await build.homeEdition(published.homeConceptId, { name: 'Em preparação' });
    const finalized = await build.homeEdition(published.homeConceptId, { name: 'Finalizada' });
    await build.finalize(finalized.id);
    const withdrawn = await publicHomeEdition();
    await ok(handlers.withdrawHomeEdition, {
      home_edition_id: withdrawn.homeEditionId,
      withdrawal_basis: 'Revisão',
    });
    const hidden = await build.finalizedHomeEdition();
    await build.publish(hidden.homeEdition.id);
    const terminated = await publicHomeEdition();
    await ok(handlers.terminateBrandPartner, {
      brand_partner_id: terminated.partner.id,
      terminated_effective_at: new Date(START.getTime() + DAY).toISOString(),
      termination_basis: 'Aditivo de encerramento',
    });

    for (const id of [
      draft.id,
      finalized.id,
      withdrawn.homeEditionId,
      hidden.homeEdition.id,
      terminated.homeEditionId,
      randomUUID(),
    ]) {
      expect((await post(coOwner(id))).status, id).toBe(404);
    }
    expect(await count(database.pool, 'interest')).toBe(0);
    expect(await count(database.pool, 'public_idempotency_key')).toBe(0);
  });

  it('[TECH-056] mesma chave e conteúdo → repetição sem nova linha; outro conteúdo → 409', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();

    const first = await post(coOwner(homeEditionId), key);
    const replay = await post(
      coOwner(homeEditionId, { desired_location: '  Litoral   norte de SP ' }),
      key,
    );
    const conflict = await post(coOwner(homeEditionId, { approx_days: 30 }), key);

    expect(first.status).toBe(201);
    expect(first.headers.get('idempotency-replayed')).toBeNull();
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(conflict.status).toBe(409);
    expect(await count(database.pool, 'interest')).toBe(1);
    expect(await count(database.pool, 'public_idempotency_key')).toBe(1);
  });

  it('[TECH-056] [CONC-12] tentativas paralelas com a mesma chave → exatamente um interesse', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => post(coOwner(homeEditionId), key)),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(PARALLEL).fill(201));
    const fresh = responses.filter((response) => !response.headers.has('idempotency-replayed'));
    expect(fresh).toHaveLength(1);
    expect(await count(database.pool, 'interest')).toBe(1);
  });

  it('[TECH-056] [CONC-12] mesma chave em paralelo com conteúdos diferentes → uma linha, os outros 409', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, (_, index) =>
        post(coOwner(homeEditionId, { approx_days: index + 1 }), key),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, ...Array(PARALLEL - 1).fill(409)]);
    expect(await count(database.pool, 'interest')).toBe(1);
  });

  it('[TECH-092] [REQ-025] visão do Admin: Home Edition → localização pretendida → modalidade com dias exatos, e admin_read gravado', async () => {
    const { homeEditionId } = await publicHomeEdition();
    await post(coOwner(homeEditionId, { approx_days: 14 }));
    await post(coOwner(homeEditionId, { approx_days: 14 }));
    await post(coOwner(homeEditionId, { approx_days: 30 }));
    await post({
      home_edition_id: homeEditionId,
      modality: 'owner',
      desired_location: 'Litoral norte de SP',
    });
    await post({ home_edition_id: homeEditionId, modality: 'owner', desired_location: 'Serra' });
    const session = {
      userId: randomUUID(),
      roles: ['admin'] as const,
      role: 'admin' as const,
      authorizationRef: 'staff_role:teste',
    };

    const groups = await readInterestOverview(session, db);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.homeEditionId).toBe(homeEditionId);
    expect(groups[0]?.label?.homeEditionName).toMatch(/^Edição /);
    expect(groups[0]?.label?.homeConceptTitle).toMatch(/^Casa /);
    expect(groups[0]?.total).toBe(5);
    expect(groups[0]?.locations.map((location) => location.desiredLocation)).toEqual([
      'Litoral norte de SP',
      'Serra',
    ]);
    expect(groups[0]?.locations[0]?.modalities).toEqual([
      { modality: 'owner', total: 1, approxDays: [] },
      {
        modality: 'co_owner',
        total: 3,
        approxDays: [
          { days: 14, count: 2 },
          { days: 30, count: 1 },
        ],
      },
    ]);
    const { rows } = await database.pool.query(
      `SELECT actor_user_id, role, object_type, object_id, authorization_ref FROM app.audit_log
        WHERE event_type = 'admin_read'`,
    );
    expect(rows).toEqual([
      {
        actor_user_id: session.userId,
        role: 'admin',
        object_type: 'interest',
        object_id: '*',
        authorization_ref: 'staff_role:teste',
      },
    ]);
  });
});
