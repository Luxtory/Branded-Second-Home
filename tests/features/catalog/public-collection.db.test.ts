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

  /** Brand Partner com exposição autorizada → Concept aprovado, com classificação e atributos. */
  async function publicConcept(extra: Record<string, unknown> = {}) {
    const { build, ok, handlers } = harness;
    const partner = await build.brandPartner('Maison Atlântica');
    await ok(handlers.authorizeBrandExposure, {
      brand_partner_id: partner.id,
      exposure_authorization_ref: 'Plano estratégico de uso da marca — anexo II',
    });
    const version = await ok(handlers.createConceptVersion, {
      brand_partner_id: partner.id,
      title: 'Casa do Mar',
      ...CONTENT,
      ...extra,
    });
    await build.approve(version.id);
    return { partner, conceptId: version.concept_id };
  }

  it('[REQ-020] [REQ-022] [BR-015] monta o Concept público com termos ativos, atributos vigentes, capa aprovada, curadoria e valores vigentes', async () => {
    const { build, ok, handlers } = harness;
    const natureza = await build.term('lifestyle', 'Natureza');
    const neve = await build.term('lifestyle', 'Neve');
    const pedra = await build.term('architectural_style', 'Pedra e madeira');
    await build.term('lifestyle', 'Sem uso');
    const { conceptId } = await publicConcept({
      summary: 'Versão 1',
      lifestyle_ids: [neve.id, natureza.id],
      architectural_style_ids: [pedra.id],
      guests_max: 6,
    });
    // Versão 2 aprovada: os atributos vigentes são os dela.
    const v2 = await ok(handlers.createConceptVersion, {
      concept_id: conceptId,
      ...CONTENT,
      summary: 'Pátio, mar e pedra local.',
      guests_max: 10,
      suites: 5,
      built_area_m2: 500,
      lifestyle_ids: [neve.id, natureza.id],
      architectural_style_ids: [pedra.id],
    });
    await build.approve(v2.id);
    await ok(handlers.updateCatalogTerm, {
      catalog_term_id: neve.id,
      label: 'Neve',
      active: false,
    });

    const cover = await build.approveCover((await build.cover(conceptId)).id);
    await build.cover(conceptId); // pendente: não aparece
    await ok(handlers.setConceptCuration, { concept_id: conceptId, rank: 3, featured: true });

    const owner = await build.edition(conceptId, 'owner_and_co_owner');
    await build.referenceValue(owner.id, 'acao', 6_000_000 * REAIS);
    await build.referenceValue(owner.id, 'owner', 48_000_000 * REAIS);
    // Editions na ordem de registro: a segunda é registrada um minuto depois.
    clock.advance(60_000);
    const future = await build.edition(conceptId, 'owner');
    await build.referenceValue(future.id, 'owner', 1 * REAIS, new Date(Date.now() + 10 * DAY));

    // Concept sem exposição autorizada: nada dele é público.
    const hidden = await build.approvedEdition();
    await build.approveCover((await build.cover(hidden.conceptId)).id);

    expect(await entries()).toEqual([
      {
        id: conceptId,
        title: 'Casa do Mar',
        brandPartnerId: expect.any(String),
        brandName: 'Maison Atlântica',
        createdAt: start,
        summary: 'Pátio, mar e pedra local.',
        guestsMax: 10,
        suites: 5,
        builtAreaM2: 500,
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
        editions: [
          {
            id: owner.id,
            region: 'Litoral norte de São Paulo',
            modality: 'owner_and_co_owner',
            values: [
              { basis: 'owner', amountMinor: 4_800_000_000n, currency: 'BRL' },
              { basis: 'acao', amountMinor: 600_000_000n, currency: 'BRL' },
            ],
          },
          { id: future.id, region: 'Litoral norte de São Paulo', modality: 'owner', values: [] },
        ],
      },
    ]);
  });

  it('[REQ-100] valor encerrado deixa a leitura pública na próxima requisição; o histórico continua no banco', async () => {
    const { build } = harness;
    const { conceptId } = await publicConcept();
    const edition = await build.edition(conceptId, 'owner');
    const value = await build.referenceValue(edition.id, 'owner', 4_800_000 * REAIS);
    const values = async () => (await entries())[0]?.editions[0]?.values ?? [];
    expect(await values()).toHaveLength(1);
    harness = catalogHarness(db, controlledClock(new Date(start.getTime() + HOUR / 2)));
    await harness.ok(harness.handlers.endEditionReferenceValue, {
      edition_reference_value_id: value.id,
    });
    expect(await values()).toEqual([]);
    const { rows } = await database.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.edition_reference_value',
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('[ADR-0014] menor privilégio: dados de aprovação, retirada, autoria e operação não são legíveis por anon', async () => {
    await publicConcept();
    await expectDenied('SELECT approved_by_user_id FROM app.concept_media');
    await expectDenied('SELECT withdrawal_basis FROM app.concept_media');
    await expectDenied('SELECT source_sha256 FROM app.concept_media');
    await expectDenied('SELECT registered_by_user_id FROM app.edition_reference_value');
    await expectDenied('SELECT operation_id FROM app.catalog_term');
    await expectDenied('SELECT active FROM app.catalog_term');
    await expectDenied('SELECT operation_id FROM app.concept_curation');
  });

  it('[ADR-0015] versões: só as larguras de exibição da capa aprovada de Concept público; o master nunca', async () => {
    const { build, ok, handlers } = harness;
    const { conceptId } = await publicConcept();
    const pending = await build.cover(conceptId);
    const approved = await build.approveCover((await build.cover(conceptId)).id);
    const rendition = (id: string, width: number) =>
      read((tx) => reader.coverRendition(tx, id, width));
    expect(await rendition(pending.id, 1600)).toBeNull();
    const largest = await rendition(approved.id, 1600);
    expect(largest).toMatchObject({ contentType: 'image/webp' });
    expect(harness.media.objects.has(largest?.storageKey ?? '')).toBe(true);
    // O master (1600 px aqui, mesma largura) só existe com papel `master`, invisível para anon.
    const roles = await read((tx) =>
      sql<{ role: string }>`SELECT DISTINCT role FROM app.concept_media_file`.execute(tx),
    );
    expect(roles.rows).toEqual([{ role: 'display' }]);
    await ok(handlers.withdrawConceptMedia, {
      concept_media_id: approved.id,
      withdrawal_basis: 'Direito de imagem encerrado',
    });
    expect(await rendition(approved.id, 1600)).toBeNull();
  });

  it('[REQ-022] capa é opcional: Concept sem capa é público, com o quadro tipográfico, e nunca destaque', async () => {
    const { handlers, run } = harness;
    const { conceptId } = await publicConcept();
    expect(await entries()).toMatchObject([{ id: conceptId, cover: null, featured: false }]);
    expect(
      await run(handlers.setConceptCuration, { concept_id: conceptId, rank: 1, featured: true }),
    ).toMatchObject({ status: 'rejected', code: 'ERR_STATE_TRANSITION' });
  });

  describe('GET /media/concept-covers/{id}/{width}', () => {
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
      const request = new Request(`http://127.0.0.1:3100/media/concept-covers/${id}/${width}`, {
        headers: options.ifNoneMatch === undefined ? {} : { 'if-none-match': options.ifNoneMatch },
      });
      return withRoute(route, logger)(request, { params: Promise.resolve({ id, width }) });
    }

    it('entrega WebP com ETag forte e no-cache; If-None-Match → 304; retirada → 404 na próxima requisição', async () => {
      const { build, ok, handlers } = harness;
      const { conceptId } = await publicConcept();
      const media = await build.approveCover((await build.cover(conceptId)).id);

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

      await ok(handlers.withdrawConceptMedia, {
        concept_media_id: media.id,
        withdrawal_basis: 'Direito de imagem encerrado',
      });
      const gone = await get(media.id, '800', { ifNoneMatch: etag ?? '' });
      expect(gone.status).toBe(404);
      expect(validError(await gone.json())).toBe(true);
    });

    it('404 sem motivo: pendente, id ou largura inválidos, Concept não público e portão fechado', async () => {
      const { build } = harness;
      const { conceptId } = await publicConcept();
      const pending = await build.cover(conceptId);
      const approved = await build.approveCover((await build.cover(conceptId)).id);
      const hidden = await build.approvedEdition();
      const hiddenCover = await build.approveCover((await build.cover(hidden.conceptId)).id);
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
});
