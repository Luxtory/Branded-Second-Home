import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditionModality } from '@/features/catalog';
import { createPostgresInterestStore } from '@/features/ownership/infrastructure/postgres-interest-store';
import { readInterestOverview } from '@/features/ownership/presentation/interest-overview-read';
import { createInterestRoute } from '@/features/ownership/presentation/interest-route';
import {
  createMemoryRateLimiter,
  publicAttempt,
  withRoute,
  type Database,
} from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { catalogHarness, CONTENT, controlledClock, count } from '../../support/catalog-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Registro de interesse em PostgreSQL real com o papel de aplicação (spec ownership §5, ADR-0017): alvo pela leitura
// pública do catálogo como `anon`, idempotência pública e invariantes de "nenhum direito" provadas no banco.
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

  /** Brand Partner com exposição autorizada → Concept com versão aprovada, e Editions opcionais. */
  async function publicConcept(...modalities: EditionModality[]) {
    const { build, ok, handlers } = harness;
    const partner = await build.brandPartner();
    await ok(handlers.authorizeBrandExposure, {
      brand_partner_id: partner.id,
      exposure_authorization_ref: 'Plano estratégico de uso da marca — anexo II',
    });
    const version = await ok(handlers.createConceptVersion, {
      brand_partner_id: partner.id,
      title: `Casa ${randomUUID().slice(0, 6)}`,
      ...CONTENT,
    });
    await build.approve(version.id);
    const editions = [];
    for (const modality of modalities)
      editions.push(await build.edition(version.concept_id, modality));
    return { partner, conceptId: version.concept_id, editions };
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

  const coOwner = (conceptId: string, extra: Record<string, unknown> = {}) => ({
    concept_id: conceptId,
    modality: 'co_owner',
    region: 'Litoral norte de SP',
    approx_days: 21,
    ...extra,
  });

  it('[REQ-023] origem e partner_ref registrados sem prerrogativa: só interest e a chave pública mudam', async () => {
    const { conceptId } = await publicConcept();
    const before = await tableCounts(database.pool);

    const response = await post(
      coOwner(conceptId, { origin: 'Instagram da marca', partner_ref: 'Parceiro local XPTO' }),
    );

    expect(response.status).toBe(201);
    const after = await tableCounts(database.pool);
    expect(changed(before, after).sort()).toEqual(['app.interest', 'app.public_idempotency_key']);
    expect(after['app.interest']).toBe((before['app.interest'] ?? 0) + 1);
    const { rows } = await database.pool.query(
      'SELECT origin, partner_ref, region, approx_days, edition_id FROM app.interest',
    );
    expect(rows).toEqual([
      {
        origin: 'Instagram da marca',
        partner_ref: 'Parceiro local XPTO',
        region: 'Litoral norte de SP',
        approx_days: 21,
        edition_id: null,
      },
    ]);
  });

  it('[REQ-025] approx_days nunca vira Ação nem Direito de Uso: nenhuma tabela referencia interest e nada além dele muda', async () => {
    const { conceptId } = await publicConcept('co_owner');
    const before = await tableCounts(database.pool);

    expect((await post(coOwner(conceptId, { approx_days: 365 }))).status).toBe(201);

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

  it('[REQ-024] interesse Owner não constitui aquisição: com Edition Owner, só interest e a chave pública mudam', async () => {
    const { conceptId, editions } = await publicConcept('owner');
    const before = await tableCounts(database.pool);

    const response = await post({
      concept_id: conceptId,
      edition_id: editions[0]?.id,
      modality: 'owner',
      region: 'Serra',
    });

    expect(response.status).toBe(201);
    expect(changed(before, await tableCounts(database.pool)).sort()).toEqual([
      'app.interest',
      'app.public_idempotency_key',
    ]);
  });

  it('[REQ-022] interesse sem Edition é aceito; com Edition, só a modalidade oferecida', async () => {
    const { conceptId, editions } = await publicConcept('owner', 'owner_and_co_owner');
    const [ownerOnly, both] = editions;

    expect((await post({ concept_id: conceptId, modality: 'owner', region: 'Serra' })).status).toBe(
      201,
    );
    expect((await post(coOwner(conceptId, { edition_id: both?.id }))).status).toBe(201);
    const refused = await post(coOwner(conceptId, { edition_id: ownerOnly?.id }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      fields: [{ field: 'modality', code: 'not_allowed' }],
    });
    expect(await count(database.pool, 'interest')).toBe(2);
  });

  it('[REQ-022] Edition de outro Concept, Concept sem exposição ou com marca encerrada → 404 sem gravar', async () => {
    const { conceptId } = await publicConcept();
    const other = await publicConcept('owner_and_co_owner');
    const hidden = await harness.build.approvedEdition();
    const terminated = await publicConcept();
    await harness.ok(harness.handlers.terminateBrandPartner, {
      brand_partner_id: terminated.partner.id,
      terminated_effective_at: new Date(START.getTime() + DAY).toISOString(),
      termination_basis: 'Aditivo de encerramento',
    });

    for (const body of [
      coOwner(conceptId, { edition_id: other.editions[0]?.id }),
      coOwner(hidden.conceptId),
      coOwner(terminated.conceptId),
      coOwner(randomUUID()),
    ]) {
      expect((await post(body)).status).toBe(404);
    }
    expect(await count(database.pool, 'interest')).toBe(0);
    expect(await count(database.pool, 'public_idempotency_key')).toBe(0);
  });

  it('[TECH-056] mesma chave e conteúdo → repetição sem nova linha; outro conteúdo → 409', async () => {
    const { conceptId } = await publicConcept();
    const key = randomUUID();

    const first = await post(coOwner(conceptId), key);
    const replay = await post(coOwner(conceptId, { region: '  Litoral   norte de SP ' }), key);
    const conflict = await post(coOwner(conceptId, { approx_days: 30 }), key);

    expect(first.status).toBe(201);
    expect(first.headers.get('idempotency-replayed')).toBeNull();
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(conflict.status).toBe(409);
    expect(await count(database.pool, 'interest')).toBe(1);
    expect(await count(database.pool, 'public_idempotency_key')).toBe(1);
  });

  it('[TECH-056] [CONC-12] tentativas paralelas com a mesma chave → exatamente um interesse', async () => {
    const { conceptId } = await publicConcept();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => post(coOwner(conceptId), key)),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(PARALLEL).fill(201));
    const fresh = responses.filter((response) => !response.headers.has('idempotency-replayed'));
    expect(fresh).toHaveLength(1);
    expect(await count(database.pool, 'interest')).toBe(1);
  });

  it('[TECH-056] [CONC-12] mesma chave em paralelo com conteúdos diferentes → uma linha, os outros 409', async () => {
    const { conceptId } = await publicConcept();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, (_, index) =>
        post(coOwner(conceptId, { approx_days: index + 1 }), key),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, ...Array(PARALLEL - 1).fill(409)]);
    expect(await count(database.pool, 'interest')).toBe(1);
  });

  it('[REQ-022] gatilho do banco recusa modalidade não oferecida mesmo fora do use case; a chave não é consumida', async () => {
    const { conceptId, editions } = await publicConcept('owner');
    const store = createPostgresInterestStore(db);
    const interest = {
      id: randomUUID(),
      createdAt: START,
      conceptId,
      editionId: editions[0]?.id ?? null,
      modality: 'co_owner' as const,
      region: 'Serra',
      approxDays: 14,
      origin: null,
      partnerRef: null,
    };

    const written = await store.register(
      interest,
      publicAttempt('interest', randomUUID(), interest),
    );

    expect(written).toBe('modality_not_offered');
    expect(await count(database.pool, 'interest')).toBe(0);
    expect(await count(database.pool, 'public_idempotency_key')).toBe(0);
  });

  it('[TECH-092] [REQ-025] visão do Admin: Concept → região → modalidade com dias exatos, e admin_read gravado', async () => {
    const { conceptId } = await publicConcept();
    await post(coOwner(conceptId, { approx_days: 14 }));
    await post(coOwner(conceptId, { approx_days: 14 }));
    await post(coOwner(conceptId, { approx_days: 30 }));
    await post({ concept_id: conceptId, modality: 'owner', region: 'Litoral norte de SP' });
    await post({ concept_id: conceptId, modality: 'owner', region: 'Serra' });
    const session = {
      userId: randomUUID(),
      roles: ['admin'] as const,
      role: 'admin' as const,
      authorizationRef: 'staff_role:teste',
    };

    const groups = await readInterestOverview(session, db);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label?.title).toMatch(/^Casa /);
    expect(groups[0]?.total).toBe(5);
    expect(groups[0]?.regions.map((region) => region.region)).toEqual([
      'Litoral norte de SP',
      'Serra',
    ]);
    expect(groups[0]?.regions[0]?.modalities).toEqual([
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
