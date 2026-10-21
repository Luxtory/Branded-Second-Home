import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postgresPublicCollectionReader as reader } from '@/features/catalog/infrastructure/postgres-public-collection-reader';
import { createCoverRoute } from '@/features/catalog/presentation/discovery/cover-route';
import { withPublicRead, withRoute, type Database } from '@/features/platform';
import { catalogHarness, CONTENT, controlledClock } from '../../support/catalog-fixtures';
import { captureLogger } from '../../support/capture-logger';
import { schemaValidator } from '../../support/openapi';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Leitura pública da Coleção (docs/specs/catalog.md §13.12 item 7, ADR-0014, ADR-0015): como `anon` sob RLS em
// PostgreSQL real. A RLS dos valores usa o `now()` do banco: o relógio dos commands começa uma hora antes do real.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PERMISSION_DENIED = '42501';
const REAIS = 100;
const validError = schemaValidator('Error');

describe('Coleção — leitura pública como anon', () => {
  let database: TestDatabase;
  let db: Database;
  let harness: ReturnType<typeof catalogHarness>;
  let clock: ReturnType<typeof controlledClock>;
  let start: Date;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    start = new Date(Date.now() - HOUR);
    clock = controlledClock(start);
    harness = catalogHarness(db, clock);
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const read = <T>(fn: Parameters<typeof withPublicRead<T>>[1]) => withPublicRead(db, fn);
  const entries = () => read((tx) => reader.entries(tx));

  async function expectDenied(query: string) {
    await expect(read((tx) => sql.raw(query).execute(tx))).rejects.toMatchObject({
      code: PERMISSION_DENIED,
    });
  }

  /** Brand Partner com exposição autorizada → Home Concept aprovado, com classificação e resumo. */
  async function publicHomeConcept(extra: Record<string, unknown> = {}) {
    const { build, ok, handlers } = harness;
    const partner = await build.brandPartner('Maison Atlântica');
    await ok(handlers.authorizeBrandExposure, {
      brand_partner_id: partner.id,
      exposure_authorization_ref: 'Plano estratégico de uso da marca — anexo II',
    });
    const version = await ok(handlers.createHomeConceptVersion, {
      brand_partner_id: partner.id,
      title: 'Casa do Mar',
      ...CONTENT,
      ...extra,
    });
    await build.approve(version.id);
    return { partner, homeConceptId: version.home_concept_id };
  }

  /** Home Edition finalizada e publicada (só ela é pública, BR-036). */
  async function publishedHomeEdition(
    homeConceptId: string,
    content: Record<string, unknown> = {},
  ) {
    const { build } = harness;
    const created = await build.homeEdition(homeConceptId, content);
    await build.finalize(created.id);
    return build.publish(created.id);
  }

  it('[REQ-020] [REQ-022] [BR-015] monta o Home Concept público com termos ativos, resumo vigente, capa aprovada, curadoria e as Home Editions publicadas', async () => {
    const { build, ok, handlers } = harness;
    const natureza = await build.term('lifestyle', 'Natureza');
    const neve = await build.term('lifestyle', 'Neve');
    const pedra = await build.term('architectural_style', 'Pedra e madeira');
    await build.term('lifestyle', 'Sem uso');
    const { homeConceptId } = await publicHomeConcept({
      summary: 'Versão 1',
      lifestyle_ids: [neve.id, natureza.id],
      architectural_style_ids: [pedra.id],
    });
    // Versão 2 aprovada: o resumo vigente é o dela.
    const v2 = await ok(handlers.createHomeConceptVersion, {
      home_concept_id: homeConceptId,
      ...CONTENT,
      summary: 'Pátio, mar e pedra local.',
      lifestyle_ids: [neve.id, natureza.id],
      architectural_style_ids: [pedra.id],
    });
    await build.approve(v2.id);
    await ok(handlers.updateCatalogTerm, {
      catalog_term_id: neve.id,
      label: 'Neve',
      active: false,
    });

    const cover = await build.approveCover((await build.cover(homeConceptId)).id);
    await build.cover(homeConceptId); // pendente: não aparece
    await ok(handlers.setHomeConceptCuration, {
      home_concept_id: homeConceptId,
      rank: 3,
      featured: true,
    });

    const varanda = await publishedHomeEdition(homeConceptId, { name: 'Edição Varanda' });
    await build.projectedInvestment(varanda.id, 48_000_000 * REAIS);
    const image = await build.homeEditionMedia(varanda.id, 'image');
    await build.approveHomeEditionMedia(image.id);
    const plan = await build.homeEditionMedia(varanda.id, 'floor_plan');
    await build.approveHomeEditionMedia(plan.id);
    // Home Editions na ordem de registro: a segunda é registrada um minuto depois; média só futura.
    clock.advance(60_000);
    const serra = await publishedHomeEdition(homeConceptId, { name: 'Edição Serra', suites: 3 });
    await build.projectedInvestment(serra.id, 1 * REAIS, new Date(Date.now() + 10 * DAY));
    // Em preparação: nunca pública.
    await build.homeEdition(homeConceptId, { name: 'Edição em preparação' });

    // Home Concept sem exposição autorizada: nada dele é público.
    const hidden = await build.finalizedHomeEdition();
    await build.publish(hidden.homeEdition.id);
    await build.approveCover((await build.cover(hidden.homeConceptId)).id);

    const facts = {
      typology: 'Casa térrea com pátio central',
      guestsMax: 10,
      projectedAreaM2: 420,
    };
    expect(await entries()).toEqual([
      {
        id: homeConceptId,
        title: 'Casa do Mar',
        brandPartnerId: expect.any(String),
        brandName: 'Maison Atlântica',
        createdAt: start,
        summary: 'Pátio, mar e pedra local.',
        lifestyles: [{ slug: 'natureza', label: 'Natureza' }],
        styles: [{ slug: 'pedra-e-madeira', label: 'Pedra e madeira' }],
        cover: {
          mediaId: cover.id,
          alt: 'Fachada em pedra ao entardecer',
          credit: null,
          cropX: 50,
          cropY: 35,
          widths: [
            { width: 480, height: 360 },
            { width: 800, height: 600 },
            { width: 1200, height: 900 },
            { width: 1600, height: 1200 },
          ],
        },
        rank: 3,
        featured: true,
        homeEditions: [
          {
            id: varanda.id,
            name: 'Edição Varanda',
            ...facts,
            suites: 4,
            projectedInvestment: {
              id: expect.any(String),
              amountMinor: 4_800_000_000n,
              currency: 'BRL',
            },
            // A imagem principal é a imagem aprovada, nunca a planta.
            cover: expect.objectContaining({ mediaId: image.id }),
            createdAt: start,
          },
          {
            id: serra.id,
            name: 'Edição Serra',
            ...facts,
            suites: 3,
            projectedInvestment: null,
            cover: null,
            createdAt: new Date(start.getTime() + 60_000),
          },
        ],
      },
    ]);
  });

  it('[REQ-100] média encerrada deixa a leitura pública na próxima requisição; o histórico continua no banco', async () => {
    const { build } = harness;
    const { homeConceptId } = await publicHomeConcept();
    const homeEdition = await publishedHomeEdition(homeConceptId);
    const value = await build.projectedInvestment(homeEdition.id, 4_800_000 * REAIS);
    const current = async () => (await entries())[0]?.homeEditions[0]?.projectedInvestment;
    expect(await current()).toEqual({ id: value.id, amountMinor: 480_000_000n, currency: 'BRL' });
    harness = catalogHarness(db, controlledClock(new Date(start.getTime() + HOUR / 2)));
    await harness.ok(harness.handlers.endHomeEditionProjectedInvestment, {
      home_edition_projected_investment_id: value.id,
    });
    expect(await current()).toBeNull();
    const { rows } = await database.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.home_edition_projected_investment',
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('[ADR-0014] menor privilégio: dados de aprovação, retirada, autoria e operação não são legíveis por anon', async () => {
    await publicHomeConcept();
    await expectDenied('SELECT approved_by_user_id FROM app.home_concept_media');
    await expectDenied('SELECT withdrawal_basis FROM app.home_concept_media');
    await expectDenied('SELECT source_sha256 FROM app.home_concept_media');
    await expectDenied('SELECT registered_by_user_id FROM app.home_edition_projected_investment');
    await expectDenied('SELECT approved_by_user_id FROM app.home_edition_media');
    await expectDenied('SELECT withdrawal_basis FROM app.home_edition_media');
    await expectDenied('SELECT operation_id FROM app.catalog_term');
    await expectDenied('SELECT active FROM app.catalog_term');
    await expectDenied('SELECT operation_id FROM app.home_concept_curation');
  });

  it('[ADR-0015] versões: só as larguras de exibição da capa aprovada de Home Concept público; o master nunca', async () => {
    const { build, ok, handlers } = harness;
    const { homeConceptId } = await publicHomeConcept();
    const pending = await build.cover(homeConceptId);
    const approved = await build.approveCover((await build.cover(homeConceptId)).id);
    const rendition = (id: string, width: number) =>
      read((tx) => reader.coverRendition(tx, id, width));
    expect(await rendition(pending.id, 1600)).toBeNull();
    const largest = await rendition(approved.id, 1600);
    expect(largest).toMatchObject({ contentType: 'image/webp' });
    expect(harness.media.objects.has(largest?.storageKey ?? '')).toBe(true);
    // O master (1600 px aqui, mesma largura) só existe com papel `master`, invisível para anon.
    const roles = await read((tx) =>
      sql<{ role: string }>`SELECT DISTINCT role FROM app.home_concept_media_file`.execute(tx),
    );
    expect(roles.rows).toEqual([{ role: 'display' }]);
    await ok(handlers.withdrawHomeConceptMedia, {
      home_concept_media_id: approved.id,
      withdrawal_basis: 'Direito de imagem encerrado',
    });
    expect(await rendition(approved.id, 1600)).toBeNull();
  });

  it('[REQ-022] capa é opcional: Home Concept sem capa é público, com o quadro tipográfico, e nunca destaque', async () => {
    const { handlers, run } = harness;
    const { homeConceptId } = await publicHomeConcept();
    expect(await entries()).toMatchObject([{ id: homeConceptId, cover: null, featured: false }]);
    expect(
      await run(handlers.setHomeConceptCuration, {
        home_concept_id: homeConceptId,
        rank: 1,
        featured: true,
      }),
    ).toMatchObject({ status: 'rejected', code: 'ERR_STATE_TRANSITION' });
  });

  describe('GET /media/home-concept-covers/{id}/{width}', () => {
    async function get(
      id: string,
      width: string,
      options: { open?: boolean; ifNoneMatch?: string } = {},
    ) {
      const route = createCoverRoute({
        database: () => db,
        storage: harness.media,
        isOpen: () => options.open ?? true,
      });
      const { logger } = captureLogger();
      const request = new Request(
        `http://127.0.0.1:3100/media/home-concept-covers/${id}/${width}`,
        {
          headers:
            options.ifNoneMatch === undefined ? {} : { 'if-none-match': options.ifNoneMatch },
        },
      );
      return withRoute(route, logger)(request, { params: Promise.resolve({ id, width }) });
    }

    it('entrega WebP com ETag forte e no-cache; If-None-Match → 304; retirada → 404 na próxima requisição', async () => {
      const { build, ok, handlers } = harness;
      const { homeConceptId } = await publicHomeConcept();
      const media = await build.approveCover((await build.cover(homeConceptId)).id);

      const response = await get(media.id, '800');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
      expect(response.headers.get('cache-control')).toBe('public, no-cache');
      const etag = response.headers.get('etag');
      expect(etag).toBe(`"${media.id}-800"`);
      const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      expect([meta.format, meta.width, meta.exif]).toEqual(['webp', 800, undefined]);

      const revalidated = await get(media.id, '800', { ifNoneMatch: `W/${etag ?? ''}` });
      expect(revalidated.status).toBe(304);
      expect(await revalidated.text()).toBe('');

      await ok(handlers.withdrawHomeConceptMedia, {
        home_concept_media_id: media.id,
        withdrawal_basis: 'Direito de imagem encerrado',
      });
      const gone = await get(media.id, '800', { ifNoneMatch: etag ?? '' });
      expect(gone.status).toBe(404);
      expect(validError(await gone.json())).toBe(true);
    });

    it('404 sem motivo: pendente, id ou largura inválidos, Home Concept não público e portão fechado', async () => {
      const { build } = harness;
      const { homeConceptId } = await publicHomeConcept();
      const pending = await build.cover(homeConceptId);
      const approved = await build.approveCover((await build.cover(homeConceptId)).id);
      const hidden = await build.finalizedHomeEdition();
      const hiddenCover = await build.approveCover((await build.cover(hidden.homeConceptId)).id);
      for (const [id, width, open] of [
        [pending.id, '800', true],
        ['nao-e-uuid', '800', true],
        [approved.id, '801', true],
        [approved.id, 'grande', true],
        [approved.id, '99999', true],
        [randomUUID(), '800', true],
        [hiddenCover.id, '800', true],
        [approved.id, '800', false],
      ] as const) {
        const response = await get(id, width, { open });
        expect(response.status, `${id} ${width} ${open}`).toBe(404);
        expect(validError(await response.json())).toBe(true);
      }
    });
  });

  describe('GET /media/home-edition-media/{id}/{width}', () => {
    async function get(id: string, width: string) {
      const route = createCoverRoute({
        owner: 'homeEdition',
        database: () => db,
        storage: harness.media,
        isOpen: () => true,
      });
      const { logger } = captureLogger();
      const request = new Request(`http://127.0.0.1:3100/media/home-edition-media/${id}/${width}`);
      return withRoute(route, logger)(request, { params: Promise.resolve({ id, width }) });
    }

    it('[BR-036] só mídia aprovada de Home Edition publicada; retirar a Home Edition do público → 404 na próxima requisição', async () => {
      const { build, ok, handlers } = harness;
      const { homeConceptId } = await publicHomeConcept();
      const homeEdition = await publishedHomeEdition(homeConceptId);
      const approved = await build.homeEditionMedia(homeEdition.id);
      await build.approveHomeEditionMedia(approved.id);
      const pending = await build.homeEditionMedia(homeEdition.id, 'render');
      const draft = await build.homeEdition(homeConceptId, { name: 'Em preparação' });
      const draftMedia = await build.homeEditionMedia(draft.id);
      await build.approveHomeEditionMedia(draftMedia.id);

      const response = await get(approved.id, '800');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
      // A capa do Home Concept não é servida por esta rota, nem a mídia da Home Edition pela rota da capa.
      for (const id of [pending.id, draftMedia.id]) {
        expect((await get(id, '800')).status).toBe(404);
      }
      await ok(handlers.withdrawHomeEdition, {
        home_edition_id: homeEdition.id,
        withdrawal_basis: 'Revisão',
      });
      const gone = await get(approved.id, '800');
      expect(gone.status).toBe(404);
      expect(validError(await gone.json())).toBe(true);
    });
  });
});
