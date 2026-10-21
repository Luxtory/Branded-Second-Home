import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPublicHomeEdition, lockPublicHomeEdition } from '@/features/catalog';
import type { InterestTargets } from '@/features/ownership/application/ports';
import {
  readHomeEditionInterests,
  readInterestContact,
  readInterestRecord,
} from '@/features/ownership/presentation/interest-admin-read';
import { readInterestOverview } from '@/features/ownership/presentation/interest-overview-read';
import { createInterestRoute } from '@/features/ownership/presentation/interest-route';
import { createMemoryRateLimiter, withRoute, type Database } from '@/features/platform';
import { captureLogger } from '../../support/capture-logger';
import { catalogHarness, CONTENT, controlledClock, count } from '../../support/catalog-fixtures';
import {
  coOwnerBody,
  INTEREST_SECRETS,
  ownerBody,
  SENTINEL_CONTACT,
} from '../../support/interest-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Solicitação de conversa em PostgreSQL real com o papel de aplicação (spec ownership §5, §13, §14; ADR-0017, ADR-0018):
// alvo — a Home Edition publicada — pela leitura pública do catálogo como `anon` e revalidado com trava dentro da
// transação, idempotência pública com hash chaveado, contato e pré-qualificação atômicos, e invariantes de "nenhum
// direito" provadas no banco.
const START = new Date('2026-09-15T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HOST = 'luxtory.test';
const PARALLEL = 6;
const REQUEST_TABLES = [
  'app.interest',
  'app.interest_contact',
  'app.interest_qualification',
  'app.public_idempotency_key',
];

const ENV = {
  INTEREST_LIMITER_MODE: 'fake',
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: 'h'.repeat(32),
  ...INTEREST_SECRETS,
  INTEREST_NETWORK_LIMIT: '1000',
  INTEREST_NETWORK_WINDOW_SECONDS: '60',
  INTEREST_GLOBAL_LIMIT: '1000',
  INTEREST_GLOBAL_WINDOW_SECONDS: '60',
} as const;

const SESSION = {
  userId: randomUUID(),
  roles: ['admin'] as const,
  role: 'admin' as const,
  authorizationRef: 'staff_role:teste',
};

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

describe('solicitação de conversa — registro em PostgreSQL real (W5, W6)', () => {
  let database: TestDatabase;
  let db: Database;
  let harness: ReturnType<typeof catalogHarness>;
  let logs: () => string;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    harness = catalogHarness(db, controlledClock(START));
    logs = () => '';
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  /**
   * Brand Partner com exposição autorizada → Home Concept com versão aprovada → Home Edition publicada (finalizada e no
   * site): o alvo de uma solicitação de conversa (BR-030).
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

  function route(targets?: InterestTargets) {
    const { logger, entries } = captureLogger();
    const previous = logs;
    logs = () => previous() + JSON.stringify(entries());
    const limiter = createMemoryRateLimiter({
      network: { limit: 1000, windowSeconds: 60 },
      global: { limit: 1000, windowSeconds: 60 },
    });
    return withRoute(
      createInterestRoute({
        env: ENV,
        database: db,
        limiter,
        ...(targets === undefined ? {} : { targets }),
      }),
      logger,
    );
  }

  function post(body: unknown, key = randomUUID(), targets?: InterestTargets) {
    return route(targets)(
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

  async function expectNothingWritten() {
    for (const table of [
      'interest',
      'interest_contact',
      'interest_qualification',
      'public_idempotency_key',
    ]) {
      expect(await count(database.pool, table), table).toBe(0);
    }
  }

  it('[REQ-022] [REQ-023] grava interesse, contato e pré-qualificação 1:1; origem sem prerrogativa; nada além muda', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const before = await tableCounts(database.pool);

    const response = await post(
      coOwnerBody(homeEditionId, {
        origin: 'Instagram da marca',
        partner_ref: 'Parceiro local XPTO',
      }),
    );

    expect(response.status).toBe(201);
    const after = await tableCounts(database.pool);
    expect(changed(before, after).sort()).toEqual(REQUEST_TABLES);
    const { rows } = await database.pool.query(
      `SELECT i.origin, i.partner_ref, i.desired_location, i.approx_days, i.home_edition_id,
              c.name, c.phone, c.email, q.investment_question, q.investment_answer,
              q.presented_projected_investment_id, q.decision_unit, q.decision_horizon,
              (c.created_at = i.created_at AND q.created_at = i.created_at) AS same_instant
         FROM app.interest i
         JOIN app.interest_contact c ON c.interest_id = i.id
         JOIN app.interest_qualification q ON q.interest_id = i.id`,
    );
    expect(rows).toEqual([
      {
        origin: 'Instagram da marca',
        partner_ref: 'Parceiro local XPTO',
        desired_location: 'Litoral norte de SP',
        approx_days: 21,
        home_edition_id: homeEditionId,
        name: SENTINEL_CONTACT.name,
        phone: '11987654321',
        email: SENTINEL_CONTACT.email,
        investment_question: 'investment_definition',
        investment_answer: 'idea_without_range',
        presented_projected_investment_id: null,
        decision_unit: 'with_partner_or_family',
        decision_horizon: 'from_6_to_12_months',
        same_instant: true,
      },
    ]);
    const key = await database.pool.query(
      'SELECT hash_scheme, hash_key_id FROM app.public_idempotency_key',
    );
    expect(key.rows).toEqual([{ hash_scheme: 'hmac_sha256', hash_key_id: 'v1' }]);
  });

  it('[REQ-025] [REQ-024] approx_days e a solicitação nunca viram Ação, Direito de Uso ou aquisição: só as tabelas do interesse referenciam interest', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const before = await tableCounts(database.pool);

    expect((await post(coOwnerBody(homeEditionId, { approx_days: 365 }))).status).toBe(201);
    expect((await post(ownerBody(homeEditionId, null))).status).toBe(201);

    // Nenhuma tabela de aquisição, Ação, Direito de Uso, holding, party, conta, calendário, booking, Créditos ou economia
    // muda; nem operation, audit_log ou idempotency_record (ADR-0017).
    expect(changed(before, await tableCounts(database.pool)).sort()).toEqual(REQUEST_TABLES);
    const { rows } = await database.pool.query<{ conrelid: string }>(
      `SELECT conrelid::regclass::text AS conrelid FROM pg_constraint
        WHERE confrelid = 'app.interest'::regclass ORDER BY 1`,
    );
    expect(rows.map((row) => row.conrelid)).toEqual([
      'app.interest_contact',
      'app.interest_qualification',
    ]);
  });

  it('[REQ-022] [BR-034] Owner com média apresentada → reference_fit vinculado à média do contexto', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const reference = await harness.build.projectedInvestment(homeEditionId, 480_000_000);

    expect((await post(ownerBody(homeEditionId, reference.id))).status).toBe(201);

    const { rows } = await database.pool.query(
      'SELECT investment_question, investment_answer, presented_projected_investment_id FROM app.interest_qualification',
    );
    expect(rows).toEqual([
      {
        investment_question: 'reference_fit',
        investment_answer: 'within',
        presented_projected_investment_id: reference.id,
      },
    ]);
  });

  it('[REQ-022] [EC-14] média alterada entre a página e o envio → a pré-qualificação guarda a apresentada, sem recalcular', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const presented = await harness.build.projectedInvestment(homeEditionId, 480_000_000);
    const body = ownerBody(homeEditionId, presented.id, { investment_answer: 'above' });
    // Depois da página: a Luxtory registra uma nova média; a apresentada deixa de ser a vigente.
    harness = catalogHarness(db, controlledClock(new Date(START.getTime() + HOUR)));
    const current = await harness.build.projectedInvestment(homeEditionId, 520_000_000);

    expect((await post(body)).status).toBe(201);

    const { rows } = await database.pool.query(
      `SELECT q.presented_projected_investment_id AS presented, q.investment_answer, p.amount_minor, p.valid_until IS NOT NULL AS ended
         FROM app.interest_qualification q
         JOIN app.home_edition_projected_investment p ON p.id = q.presented_projected_investment_id`,
    );
    expect(rows).toEqual([
      {
        presented: presented.id,
        investment_answer: 'above',
        amount_minor: '480000000',
        ended: true,
      },
    ]);
    expect(rows[0]?.presented).not.toBe(current.id);
  });

  it('[REQ-022] [EC-14] sem média apresentada, uma média registrada depois não entra — o contexto continua "sem referência"', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const withoutReference = ownerBody(homeEditionId, null);
    await harness.build.projectedInvestment(homeEditionId, 480_000_000);

    expect((await post(withoutReference)).status).toBe(201);
    // Responder à comparação sem referência apresentada é recusado, mesmo com média vigente agora.
    const compared = await post(
      ownerBody(homeEditionId, null, {
        investment_question: 'reference_fit',
        investment_answer: 'within',
      }),
    );
    expect(compared.status).toBe(400);
    expect(await compared.json()).toMatchObject({
      fields: [{ field: 'investment_question', code: 'not_allowed' }],
    });

    const { rows } = await database.pool.query(
      'SELECT investment_question, presented_projected_investment_id FROM app.interest_qualification',
    );
    expect(rows).toEqual([
      { investment_question: 'investment_definition', presented_projected_investment_id: null },
    ]);
  });

  it('[REQ-022] [BR-030] Home Edition obrigatória: sem ela a solicitação é recusada', async () => {
    const { homeEditionId, homeConceptId } = await publicHomeEdition();
    const body = coOwnerBody(homeEditionId);
    delete body.home_edition_id;

    const missing = await post(body);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      fields: [{ field: 'home_edition_id', code: 'required' }],
    });
    expect((await post({ ...body, home_concept_id: homeConceptId })).status).toBe(400);
    await expectNothingWritten();
    // O banco também exige a Home Edition (NOT NULL) e não tem mais o Home Concept do interesse.
    const { rows } = await database.pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'interest'
          AND column_name IN ('home_edition_id', 'home_concept_id', 'concept_id', 'region')`,
    );
    expect(rows).toEqual([{ column_name: 'home_edition_id', is_nullable: 'NO' }]);
  });

  it('[REQ-022] [EC-15] Home Edition em preparação, fora do público, retirada, de marca encerrada ou inexistente → 404, nada gravado', async () => {
    const { build, ok, handlers } = harness;
    const published = await publicHomeEdition();
    const draft = await build.homeEdition(published.homeConceptId, { name: 'Em preparação' });
    const finalized = await build.homeEdition(published.homeConceptId, { name: 'Finalizada' });
    await build.finalize(finalized.id);
    const withdrawn = await publicHomeEdition();
    // A página foi exibida com a Home Edition pública; ela sai do público antes do envio.
    const renderedBody = coOwnerBody(withdrawn.homeEditionId);
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

    expect((await post(renderedBody)).status).toBe(404);
    for (const id of [
      draft.id,
      finalized.id,
      hidden.homeEdition.id,
      terminated.homeEditionId,
      randomUUID(),
    ]) {
      expect((await post(coOwnerBody(id))).status, id).toBe(404);
    }
    await expectNothingWritten();
  });

  it('[REQ-022] [EC-15] dentro da transação: retirada depois da leitura pública → a revalidação com trava recusa e desfaz a chave', async () => {
    const { homeEditionId, homeConceptId } = await publicHomeEdition();
    const body = coOwnerBody(homeEditionId);
    // A leitura pública "viu" a Home Edition antes da retirada: o alvo injetado responde como público.
    const staleTargets: InterestTargets = {
      find: () => Promise.resolve({ homeEditionId, homeConceptId }),
    };
    await harness.ok(harness.handlers.withdrawHomeEdition, {
      home_edition_id: homeEditionId,
      withdrawal_basis: 'Revisão',
    });

    const response = await post(body, randomUUID(), staleTargets);

    expect(response.status).toBe(404);
    await expectNothingWritten();
  });

  it('[REQ-022] a revalidação com trava concorda com a leitura anon em todos os estados de visibilidade', async () => {
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
    const unexposed = await build.finalizedHomeEdition();
    await build.publish(unexposed.homeEdition.id);
    const terminated = await publicHomeEdition();
    await ok(handlers.terminateBrandPartner, {
      brand_partner_id: terminated.partner.id,
      terminated_effective_at: new Date(START.getTime() + DAY).toISOString(),
      termination_basis: 'Aditivo de encerramento',
    });

    for (const id of [
      published.homeEditionId,
      draft.id,
      finalized.id,
      withdrawn.homeEditionId,
      unexposed.homeEdition.id,
      terminated.homeEditionId,
      randomUUID(),
    ]) {
      const anon = await findPublicHomeEdition(id, db);
      const { locked, role } = await db.transaction().execute(async (tx) => {
        const target = await lockPublicHomeEdition(tx, id);
        // Depois da leitura pública, a transação volta exatamente ao papel do chamador.
        const { rows } = await sql<{ role: string }>`SELECT current_user AS role`.execute(tx);
        return { locked: target, role: rows[0]?.role };
      });
      expect(locked, id).toEqual(anon);
      expect(role, id).toBe('luxtory_app');
    }
    expect(await findPublicHomeEdition(published.homeEditionId, db)).not.toBeNull();
  });

  it('[TECH-056] mesma chave e conteúdo → repetição sem nova linha; mudança em contato ou pré-qualificação → 409', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();

    const first = await post(coOwnerBody(homeEditionId), key);
    const replay = await post(
      coOwnerBody(homeEditionId, {
        desired_location: '  Litoral   norte de SP ',
        email: 'sentinela.teste@EXAMPLE.COM',
        phone: '11 98765 4321',
      }),
      key,
    );
    const conflicts = await Promise.all(
      [
        { approx_days: 30 },
        { name: 'Outra Pessoa' },
        { email: 'outra@example.com' },
        { phone: '(11) 91234-5678' },
        { investment_answer: 'range_defined' },
        { decision_unit: 'self' },
        { decision_horizon: 'exploring' },
      ].map((extra) => post(coOwnerBody(homeEditionId, extra), key)),
    );

    expect(first.status).toBe(201);
    expect(first.headers.get('idempotency-replayed')).toBeNull();
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(conflicts.map((response) => response.status)).toEqual(Array(7).fill(409));
    for (const table of [
      'interest',
      'interest_contact',
      'interest_qualification',
      'public_idempotency_key',
    ]) {
      expect(await count(database.pool, table), table).toBe(1);
    }
  });

  it('[TECH-056] [CONC-12] tentativas paralelas com a mesma chave → exatamente um interesse, um contato e uma pré-qualificação', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => post(coOwnerBody(homeEditionId), key)),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(PARALLEL).fill(201));
    const fresh = responses.filter((response) => !response.headers.has('idempotency-replayed'));
    expect(fresh).toHaveLength(1);
    for (const table of ['interest', 'interest_contact', 'interest_qualification']) {
      expect(await count(database.pool, table), table).toBe(1);
    }
  });

  it('[TECH-056] [CONC-12] mesma chave em paralelo com conteúdos diferentes → uma solicitação, os outros 409', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, (_, index) =>
        post(coOwnerBody(homeEditionId, { approx_days: index + 1 }), key),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, ...Array(PARALLEL - 1).fill(409)]);
    expect(await count(database.pool, 'interest')).toBe(1);
    expect(await count(database.pool, 'interest_contact')).toBe(1);
  });

  it('[TECH-056] atomicidade: falha ao gravar o contato ou a pré-qualificação → nenhum interesse, contato, pré-qualificação ou chave', async () => {
    const { homeEditionId } = await publicHomeEdition();
    await database.pool.query(
      `CREATE FUNCTION app.test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'falha de teste com dado sigiloso'; END $$`,
    );

    for (const table of ['interest_contact', 'interest_qualification']) {
      await database.pool.query(
        `CREATE TRIGGER test_fail_insert BEFORE INSERT ON app.${table}
           FOR EACH ROW EXECUTE FUNCTION app.test_fail_insert()`,
      );
      const response = await post(coOwnerBody(homeEditionId));
      expect(response.status, table).toBe(500);
      await expectNothingWritten();
      await database.pool.query(`DROP TRIGGER test_fail_insert ON app.${table}`);
    }
    expect(logs()).not.toContain('sigiloso');
    expect((await post(coOwnerBody(homeEditionId))).status).toBe(201);
  });

  it('[REQ-022] eliminar contato e pré-qualificação não altera o interesse; o replay depois disso não recria PII', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const key = randomUUID();
    const body = coOwnerBody(homeEditionId);
    expect((await post(body, key)).status).toBe(201);
    const before = await database.pool.query('SELECT * FROM app.interest');

    // Procedimento operacional futuro (D-W6-2 = A): só o dono do schema apaga; a aplicação não tem DELETE.
    await database.pool.query('DELETE FROM app.interest_contact');
    await database.pool.query('DELETE FROM app.interest_qualification');
    const replay = await post(body, key);

    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect((await database.pool.query('SELECT * FROM app.interest')).rows).toEqual(before.rows);
    expect(await count(database.pool, 'interest_contact')).toBe(0);
    expect(await count(database.pool, 'interest_qualification')).toBe(0);
    const [interest] = before.rows as { id: string }[];
    const view = await readInterestContact(SESSION, interest?.id ?? '', db);
    expect(view).toMatchObject({ contact: null, qualification: null, presented: null });
  });

  it('[TECH-100] nenhum dado de contato, pré-qualificação ou contexto nos logs da rota', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const body = coOwnerBody(homeEditionId);

    await post(body);
    await post({ ...body, email: 'invalido' });

    for (const secret of [
      SENTINEL_CONTACT.name,
      SENTINEL_CONTACT.email,
      '98765',
      'Litoral norte',
      'idea_without_range',
      String(body.presentation_context).slice(0, 24),
      'invalido',
    ]) {
      expect(logs(), secret).not.toContain(secret);
    }
  });

  it('[TECH-092] [REQ-025] visão agregada do Admin: Home Edition → localização pretendida → modalidade com dias exatos', async () => {
    const { homeEditionId } = await publicHomeEdition();
    await post(coOwnerBody(homeEditionId, { approx_days: 14 }));
    await post(coOwnerBody(homeEditionId, { approx_days: 14 }));
    await post(coOwnerBody(homeEditionId, { approx_days: 30 }));
    await post(ownerBody(homeEditionId, null, { desired_location: 'Litoral norte de SP' }));
    await post(ownerBody(homeEditionId, null, { desired_location: 'Serra' }));

    const groups = await readInterestOverview(SESSION, db);

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
        actor_user_id: SESSION.userId,
        role: 'admin',
        object_type: 'interest',
        object_id: '*',
        authorization_ref: 'staff_role:teste',
      },
    ]);
  });

  it('[TECH-092] [REQ-022] drill-down: Home Edition → interesse → contato e pré-qualificação, com admin_read por leitura e sem PII no audit', async () => {
    const { homeEditionId } = await publicHomeEdition();
    const reference = await harness.build.projectedInvestment(homeEditionId, 480_000_000);
    await post(ownerBody(homeEditionId, reference.id, { desired_location: 'Serra' }));
    await post(coOwnerBody(homeEditionId, { approx_days: 14 }, reference.id));

    const group = await readHomeEditionInterests(SESSION, homeEditionId, db);
    expect(group.locations.map((location) => location.desiredLocation)).toEqual([
      'Litoral norte de SP',
      'Serra',
    ]);
    expect(JSON.stringify(group)).not.toContain(SENTINEL_CONTACT.email);
    const owner = group.locations[1]?.modalities[0]?.interests[0];
    expect(owner).toMatchObject({ modality: 'owner', desiredLocation: 'Serra', approxDays: null });

    const record = await readInterestRecord(SESSION, owner?.id ?? '', db);
    expect(JSON.stringify(record)).not.toContain(SENTINEL_CONTACT.name);
    const contact = await readInterestContact(SESSION, owner?.id ?? '', db);
    expect(contact).toMatchObject({
      contact: { name: SENTINEL_CONTACT.name, phone: '11987654321', email: SENTINEL_CONTACT.email },
      qualification: {
        investmentQuestion: 'reference_fit',
        investmentAnswer: 'within',
        presentedProjectedInvestmentId: reference.id,
        decisionUnit: 'self',
        decisionHorizon: 'within_3_months',
      },
      presented: { id: reference.id, amountMinor: 480_000_000n, currency: 'BRL' },
    });
    expect(await readInterestRecord(SESSION, randomUUID(), db)).toBeNull();

    const { rows } = await database.pool.query(
      `SELECT object_type, object_id FROM app.audit_log WHERE event_type = 'admin_read' ORDER BY id`,
    );
    expect(rows.map((row: { object_type: string }) => row.object_type)).toEqual([
      'interest_group',
      'interest',
      'interest_contact',
      'interest_qualification',
      'interest',
    ]);
    expect(rows[0]).toMatchObject({ object_id: homeEditionId });
    expect(rows[2]).toMatchObject({ object_id: owner?.id });
    const audit = JSON.stringify((await database.pool.query('SELECT * FROM app.audit_log')).rows);
    for (const secret of [SENTINEL_CONTACT.name, SENTINEL_CONTACT.email, '98765', 'Serra']) {
      expect(audit, secret).not.toContain(secret);
    }
  });
});
