import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  issueTestToken,
  TEST_SESSION_COOKIE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import { createCatalogRoutes } from '@/features/catalog/presentation/api-routes';
import { createPartyDocumentResolver } from '@/features/identity/application/party-resolver';
import { postgresPartyStore } from '@/features/identity/infrastructure/postgres-parties';
import {
  punctuatedCpf,
  partyHarness,
  testProtector,
  validCpf,
} from '../../../support/party-fixtures';
import { withRoute, type Database } from '@/features/platform';
import { CONTENT, HOME_EDITION_CONTENT, testImage } from '../../../support/catalog-fixtures';
import { captureLogger } from '../../../support/capture-logger';
import { memoryMediaStorage } from '../../../support/media-storage';
import { responseValidator, schemaValidator } from '../../../support/openapi';
import { appDatabase } from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

const ORIGIN = 'http://127.0.0.1:3100';
// Relógio real: os papéis de staff são atribuídos com o `now()` do banco e só valem a partir dele.
const clock = { now: () => new Date() };
const STAFF = '00000000-0000-4000-8000-0000000000f1';
const SUPER_ONLY = '00000000-0000-4000-8000-0000000000f2';
const source = { AUTH_MODE: 'test', COMMAND_MAX_ATTEMPTS: '3', COMMAND_LOCK_TIMEOUT_MS: '5000' };
// Anéis de teste (W7): a party do Investor é resolvida pelo HMAC do CPF (D-W3-1).
const protector = testProtector();
const INVESTOR_CPF = validCpf('987654321');
const validError = schemaValidator('Error');
const media = memoryMediaStorage();

type Routes = ReturnType<typeof createCatalogRoutes>;
type RouteName = keyof Routes;

const cookie = (userId: string, assurance: 'aal1' | 'aal2') =>
  `${TEST_SESSION_COOKIE}=${issueTestToken(userId, assurance, clock)}`;

describe('POST /v1/admin/* do catálogo (TECH-050, TECH-100, contrato OpenAPI)', () => {
  let database: TestDatabase;
  let db: Database;
  const afterCommit = vi.fn();

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(`
      INSERT INTO auth.users (id) VALUES ('${STAFF}'), ('${SUPER_ONLY}');
      SELECT app.assign_staff_role('${STAFF}', 'admin', 'Ata');
      SELECT app.assign_staff_role('${SUPER_ONLY}', 'super_admin', 'Ata');`);
    db = appDatabase(database.appUrl);
  });

  afterAll(async () => {
    await db.destroy();
    await database.drop();
  });

  /** Chama a rota como o Next chamaria: request + (id do caminho, se houver). */
  async function call(
    name: RouteName,
    body: unknown,
    options: { id?: string; headers?: Record<string, string>; key?: string } = {},
  ) {
    const routes = createCatalogRoutes({
      source,
      clock,
      database: () => db,
      afterCommit,
      media,
      parties: createPartyDocumentResolver(protector, postgresPartyStore),
    });
    const { logger } = captureLogger();
    const request = new Request(`${ORIGIN}/v1/admin/x`, {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3100',
        'content-type': 'application/json',
        origin: ORIGIN,
        cookie: cookie(STAFF, 'aal2'),
        'idempotency-key': options.key ?? randomUUID(),
        ...options.headers,
      },
      body: JSON.stringify(body),
    });
    const segment =
      options.id === undefined ? undefined : { params: Promise.resolve({ id: options.id }) };
    return withRoute(routes[name], logger)(request, segment);
  }

  async function created(name: RouteName, path: string, body: unknown, id?: string, status = 201) {
    const response = await call(name, body, id === undefined ? {} : { id });
    expect(response.status, `${name}`).toBe(status);
    const json = await response.json();
    expect(responseValidator(path, 'post', status)(json), `${name} contrato`).toBe(true);
    return json;
  }

  it('[TECH-100] origem de outro host ou ausente → 403, sem nenhuma operação', async () => {
    const before = await database.pool.query('SELECT count(*)::int AS n FROM app.operation');
    for (const origin of ['https://atacante.test', '']) {
      const response = await call(
        'registerBrandPartner',
        { brand_name: 'Maison' },
        { headers: { origin } },
      );
      expect(response.status).toBe(403);
      expect(validError(await response.json())).toBe(true);
    }
    const after = await database.pool.query('SELECT count(*)::int AS n FROM app.operation');
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it('[TECH-050] sem sessão → 401; Admin sem MFA → 403; só Super Admin → 403 (sem hierarquia, ADR-0008)', async () => {
    const body = { brand_name: 'Maison' };
    const anonymous = await call('registerBrandPartner', body, { headers: { cookie: '' } });
    expect(anonymous.status).toBe(401);
    for (const [user, assurance] of [
      [STAFF, 'aal1'],
      [SUPER_ONLY, 'aal2'],
    ] as const) {
      const denied = await call('registerBrandPartner', body, {
        headers: { cookie: cookie(user, assurance) },
      });
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({ code: 'ERR_PERMISSION' });
    }
  });

  it('[REQ-020] [REQ-027] [BR-025] [BR-036] as operações do catálogo pela API respondem conforme o OpenAPI, com o papel Admin auditado', async () => {
    const partner = await created('registerBrandPartner', '/admin/brand-partners', {
      brand_name: 'Maison Contrato',
    });
    // O id do caminho vale sobre o corpo.
    const exposed = await created(
      'authorizeBrandExposure',
      '/admin/brand-partners/{id}/exposure-authorization',
      { brand_partner_id: randomUUID(), exposure_authorization_ref: 'Plano estratégico' },
      partner.id,
      200,
    );
    expect(exposed).toMatchObject({
      id: partner.id,
      exposure_authorization_ref: 'Plano estratégico',
    });
    const version = await created('createHomeConceptVersion', '/admin/home-concept-versions', {
      brand_partner_id: partner.id,
      title: 'Casa Contrato',
      ...CONTENT,
    });
    const approved = await created(
      'approveHomeConceptVersion',
      '/admin/home-concept-versions/{id}/approve',
      { approval_refs: ['Ata'] },
      version.id,
      200,
    );
    expect(approved).toMatchObject({ state: 'approved', approved_role: 'admin' });
    const homeEdition = await created('createHomeEdition', '/admin/home-editions', {
      home_concept_id: version.home_concept_id,
      ...HOME_EDITION_CONTENT,
    });
    expect(homeEdition).toMatchObject({ material_state: 'draft', visibility: 'hidden' });
    const edited = await created(
      'updateHomeEditionDraft',
      '/admin/home-editions/{id}',
      { ...HOME_EDITION_CONTENT, suites: 5 },
      homeEdition.id,
      200,
    );
    expect(edited).toMatchObject({ suites: 5, material_state: 'draft' });
    const finalized = await created(
      'finalizeHomeEdition',
      '/admin/home-editions/{id}/finalize',
      {},
      homeEdition.id,
      200,
    );
    expect(finalized).toMatchObject({ material_state: 'finalized', finalized_role: 'admin' });
    await created(
      'publishHomeEdition',
      '/admin/home-editions/{id}/publish',
      {},
      homeEdition.id,
      200,
    );
    const corrected = await created(
      'correctHomeEditionEditorial',
      '/admin/home-editions/{id}/editorial-correction',
      { description: 'Descrição revista.', correction_basis: 'Revisão de texto' },
      homeEdition.id,
      200,
    );
    expect(corrected).toMatchObject({ description: 'Descrição revista.', visibility: 'public' });
    const withdrawn = await created(
      'withdrawHomeEdition',
      '/admin/home-editions/{id}/withdraw',
      { withdrawal_basis: 'Revisão das imagens' },
      homeEdition.id,
      200,
    );
    expect(withdrawn).toMatchObject({
      visibility: 'hidden',
      withdrawal_basis: 'Revisão das imagens',
    });
    const parties = partyHarness(db, clock, { protector });
    const investor = await parties.ok(parties.handlers.registerParty, { document: INVESTOR_CPF });
    const authorization = await created(
      'registerInvestorAuthorization',
      '/admin/investor-authorizations',
      {
        home_concept_id: version.home_concept_id,
        // Com máscara: a normalização resolve para a mesma party (sem criar outra).
        investor_document: punctuatedCpf(INVESTOR_CPF),
        instrument_ref: 'Contrato INV-9',
        valid_from: new Date(Date.now() - 3_600_000).toISOString(),
      },
    );
    expect(authorization).toMatchObject({ party_id: investor.id });
    const secondHome = await created('registerSecondHome', '/admin/second-homes', {
      home_edition_id: homeEdition.id,
      label: 'Unidade 9',
      timezone: 'America/Sao_Paulo',
      investor_authorization_id: authorization.id,
    });
    expect(secondHome).toMatchObject({
      home_concept_version_id: version.id,
      home_concept_version: 1,
    });
    await created(
      'revokeInvestorAuthorization',
      '/admin/investor-authorizations/{id}/revoke',
      { revocation_basis: 'Distrato' },
      authorization.id,
      200,
    );
    const terminated = await created(
      'terminateBrandPartner',
      '/admin/brand-partners/{id}/terminate',
      { terminated_effective_at: new Date().toISOString(), termination_basis: 'Aditivo' },
      partner.id,
      200,
    );
    expect(terminated.exposure_authorization_ref).toBe('Plano estratégico');

    const { rows } = await database.pool.query<{ role: string; ref: string }>(
      `SELECT DISTINCT role, left(authorization_ref, 11) AS ref FROM app.operation
       WHERE command IN ('register_brand_partner', 'register_second_home', 'terminate_brand_partner')`,
    );
    expect(rows).toEqual([{ role: 'admin', ref: 'staff_role:' }]);
    expect(afterCommit).toHaveBeenCalled();
  });

  it('[REQ-020] [REQ-103] as operações da Coleção pela API respondem conforme o OpenAPI (spec catalog §13.12)', async () => {
    const term = await created('createCatalogTerm', '/admin/catalog-terms', {
      kind: 'lifestyle',
      label: 'Natureza',
    });
    expect(term).toMatchObject({ slug: 'natureza', active: true });
    const style = await created('createCatalogTerm', '/admin/catalog-terms', {
      kind: 'architectural_style',
      label: 'Contemporâneo',
    });
    await created(
      'updateCatalogTerm',
      '/admin/catalog-terms/{id}',
      { label: 'Contemporâneo brasileiro', active: true },
      style.id,
      200,
    );
    const partner = await created('registerBrandPartner', '/admin/brand-partners', {
      brand_name: 'Maison Coleção',
    });
    const version = await created('createHomeConceptVersion', '/admin/home-concept-versions', {
      brand_partner_id: partner.id,
      title: 'Casa Coleção',
      ...CONTENT,
      summary: 'Uma casa para longas temporadas.',
      lifestyle_ids: [term.id],
      architectural_style_ids: [style.id],
    });
    expect(version).toMatchObject({
      lifestyle_ids: [term.id],
      summary: 'Uma casa para longas temporadas.',
    });
    await created(
      'approveHomeConceptVersion',
      '/admin/home-concept-versions/{id}/approve',
      { approval_refs: ['Ata'] },
      version.id,
      200,
    );
    const media = await created(
      'uploadHomeConceptCover',
      '/admin/home-concepts/{id}/cover',
      { image: await testImage(), alt: 'Fachada', credit: 'Estúdio Luz', crop_x: 65, crop_y: 50 },
      version.home_concept_id,
    );
    expect(media).toMatchObject({ state: 'pending', credit: 'Estúdio Luz' });
    await created(
      'approveHomeConceptMedia',
      '/admin/home-concept-media/{id}/approve',
      {},
      media.id,
      200,
    );
    const curation = await created(
      'setHomeConceptCuration',
      '/admin/home-concepts/{id}/curation',
      { rank: 1, featured: true },
      version.home_concept_id,
      200,
    );
    expect(curation).toMatchObject({ rank: 1, featured: true });
    const homeEdition = await created('createHomeEdition', '/admin/home-editions', {
      home_concept_id: version.home_concept_id,
      ...HOME_EDITION_CONTENT,
    });
    const value = await created(
      'registerHomeEditionProjectedInvestment',
      '/admin/home-editions/{id}/projected-investments',
      { amount_minor: 600_000_000, currency: 'BRL' },
      homeEdition.id,
    );
    expect(value).toMatchObject({ amount_minor: 600_000_000, valid_until: null });
    expect(value).not.toHaveProperty('basis');
    const plan = await created(
      'uploadHomeEditionMedia',
      '/admin/home-editions/{id}/media',
      {
        kind: 'floor_plan',
        image: await testImage(),
        alt: 'Planta térrea',
        crop_x: 50,
        crop_y: 50,
      },
      homeEdition.id,
    );
    expect(plan).toMatchObject({ kind: 'floor_plan', state: 'pending' });
    await created(
      'approveHomeEditionMedia',
      '/admin/home-edition-media/{id}/approve',
      {},
      plan.id,
      200,
    );
    await created(
      'withdrawHomeEditionMedia',
      '/admin/home-edition-media/{id}/withdraw',
      { withdrawal_basis: 'Planta revista' },
      plan.id,
      200,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await created(
      'endHomeEditionProjectedInvestment',
      '/admin/home-edition-projected-investments/{id}/end',
      {},
      value.id,
      200,
    );
    await created(
      'withdrawHomeConceptMedia',
      '/admin/home-concept-media/{id}/withdraw',
      { withdrawal_basis: 'Nova sessão de fotos' },
      media.id,
      200,
    );
    const invalidImage = await call(
      'uploadHomeConceptCover',
      { image: Buffer.from('texto').toString('base64'), alt: 'x', crop_x: 50, crop_y: 50 },
      { id: version.home_concept_id },
    );
    expect(invalidImage.status).toBe(400);
    await expect(invalidImage.json()).resolves.toMatchObject({ code: 'ERR_VALIDATION' });
  });

  it('[TECH-056] erros no schema Error: id malformado → 400, inexistente → 404, estado → 409; replay marcado', async () => {
    const malformed = await call(
      'terminateBrandPartner',
      { terminated_effective_at: new Date().toISOString(), termination_basis: 'x' },
      { id: 'nao-e-uuid' },
    );
    expect(malformed.status).toBe(400);
    expect(validError(await malformed.json())).toBe(true);

    const missing = await call('createHomeEdition', {
      home_concept_id: randomUUID(),
      ...HOME_EDITION_CONTENT,
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: 'ERR_NOT_FOUND' });

    const key = randomUUID();
    const partner = await call('registerBrandPartner', { brand_name: 'Maison Replay' }, { key });
    const replay = await call('registerBrandPartner', { brand_name: 'Maison Replay' }, { key });
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    const { id } = await partner.json();
    const terminate = (k: string) =>
      call(
        'terminateBrandPartner',
        { terminated_effective_at: new Date().toISOString(), termination_basis: 'Aditivo' },
        { id, key: k },
      );
    expect((await terminate(randomUUID())).status).toBe(200);
    const again = await terminate(randomUUID());
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toMatchObject({ code: 'ERR_STATE_TRANSITION' });
  });
});
