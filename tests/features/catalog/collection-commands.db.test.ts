import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SUPERSEDED_COVER_BASIS } from '@/features/catalog/domain/collection';
import type { Database } from '@/features/platform';
import {
  catalogHarness,
  CONTENT,
  controlledClock,
  count,
  expectRejected,
  ownerOperation,
  testImage,
} from '../../support/catalog-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Coleção com PostgreSQL real (docs/specs/catalog.md §13.12, ADR-0015): commands pelo executor de produção, papel de
// aplicação real, reencode real da capa e os gatilhos/índices do banco.
const START = new Date('2026-10-07T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const REAIS = 100;

describe('Coleção — commands e constraints', () => {
  let database: TestDatabase;
  let db: Database;
  let clock: ReturnType<typeof controlledClock>;
  let harness: ReturnType<typeof catalogHarness>;

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

  const auditCount = async (objectType: string) => {
    const { rows } = await database.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.audit_log WHERE object_type = $1',
      [objectType],
    );
    return rows[0]?.n ?? 0;
  };

  describe('vocabulários controlados', () => {
    it('registra termo ativo com slug do rótulo; rótulo ou slug repetidos no vocabulário são recusados', async () => {
      const { build, handlers, run } = harness;
      const term = await build.term('lifestyle', 'Bem-estar & Natureza');
      expect(term).toMatchObject({
        kind: 'lifestyle',
        slug: 'bem-estar-natureza',
        label: 'Bem-estar & Natureza',
        active: true,
      });
      const create = (kind: string, label: string) =>
        run(handlers.createCatalogTerm, { kind, label });
      expectRejected(await create('lifestyle', 'BEM-ESTAR & NATUREZA'), 'ERR_STATE_TRANSITION');
      expectRejected(await create('lifestyle', 'Bem estar natureza'), 'ERR_STATE_TRANSITION');
      expectRejected(await create('lifestyle', '!!!'), 'ERR_VALIDATION');
      expectRejected(await create('lifestyle', 'Cotas de praia'), 'ERR_VALIDATION');
      await expect(
        build.term('architectural_style', 'Bem-estar & Natureza'),
      ).resolves.toMatchObject({
        kind: 'architectural_style',
      });
      expect(await auditCount('catalog_term')).toBe(2);
    });

    it('slug estável: renomear não muda o slug, e o slug de um termo desativado nunca é reutilizado', async () => {
      const { build, handlers, run, ok } = harness;
      const neve = await build.term('lifestyle', 'Neve');
      await ok(handlers.updateCatalogTerm, {
        catalog_term_id: neve.id,
        label: 'Montanha e neve',
        active: false,
      });
      // "Neve" e "Névé" geram o slug `neve`, ainda do termo desativado: recusados.
      for (const label of ['Neve', 'Névé']) {
        expectRejected(
          await run(handlers.createCatalogTerm, { kind: 'lifestyle', label }),
          'ERR_STATE_TRANSITION',
        );
      }
      const { rows } = await database.pool.query<{ slug: string; label: string }>(
        'SELECT slug, label FROM app.catalog_term WHERE id = $1',
        [neve.id],
      );
      expect(rows).toEqual([{ slug: 'neve', label: 'Montanha e neve' }]);
    });

    it('renomeia e desativa sem mudar slug nem vocabulário; nunca apaga', async () => {
      const { build, handlers, run, ok } = harness;
      const natureza = await build.term('lifestyle', 'Natureza');
      const praia = await build.term('lifestyle', 'Praia');
      const updated = await ok(handlers.updateCatalogTerm, {
        catalog_term_id: natureza.id,
        label: 'Natureza e silêncio',
        active: false,
      });
      expect(updated).toMatchObject({
        slug: 'natureza',
        label: 'Natureza e silêncio',
        active: false,
      });
      expectRejected(
        await run(handlers.updateCatalogTerm, {
          catalog_term_id: praia.id,
          label: 'natureza e silêncio',
          active: true,
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.updateCatalogTerm, {
          catalog_term_id: randomUUID(),
          label: 'Outro',
          active: true,
        }),
        'ERR_NOT_FOUND',
      );
      await expect(
        db
          .updateTable('app.catalog_term')
          .set({ slug: 'outro' })
          .where('id', '=', praia.id)
          .execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        database.pool.query(`UPDATE app.catalog_term SET slug = 'outro' WHERE id = $1`, [praia.id]),
      ).rejects.toThrow(/only the label and the active flag/);
      await expect(
        database.pool.query('DELETE FROM app.catalog_term WHERE id = $1', [praia.id]),
      ).rejects.toThrow();
    });
  });

  describe('[BR-013] classificações e atributos da versão', () => {
    it('grava lifestyle (1–3) e estilo (1–2) em ordem e os atributos com a versão', async () => {
      const { build, ok, handlers } = harness;
      const partner = await build.brandPartner();
      const [natureza, bemEstar, contemporaneo] = [
        await build.term('lifestyle', 'Natureza'),
        await build.term('lifestyle', 'Bem-estar'),
        await build.term('architectural_style', 'Contemporâneo'),
      ];
      const version = await ok(handlers.createConceptVersion, {
        brand_partner_id: partner.id,
        title: 'Casa do Mar',
        ...CONTENT,
        summary: 'Pátio, mar e pedra local para longas temporadas em família.',
        guests_max: 10,
        suites: 5,
        built_area_m2: 500,
        lifestyle_ids: [bemEstar.id, natureza.id],
        architectural_style_ids: [contemporaneo.id],
      });
      expect(version).toMatchObject({
        summary: 'Pátio, mar e pedra local para longas temporadas em família.',
        guests_max: 10,
        suites: 5,
        built_area_m2: 500,
        lifestyle_ids: [bemEstar.id, natureza.id],
        architectural_style_ids: [contemporaneo.id],
      });
      // Relida do banco pela aprovação: mesma ordem.
      await expect(build.approve(version.id)).resolves.toMatchObject({
        lifestyle_ids: [bemEstar.id, natureza.id],
        architectural_style_ids: [contemporaneo.id],
      });
      // Versão sem nada disso continua válida (versões antigas e Concepts sem vocabulário).
      await expect(build.version(version.concept_id)).resolves.toMatchObject({
        summary: null,
        lifestyle_ids: [],
        architectural_style_ids: [],
      });
    });

    it('termo inexistente ou de outro vocabulário → ERR_NOT_FOUND; desativado → ERR_STATE_TRANSITION; limites → ERR_VALIDATION', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const lifestyle = await build.term('lifestyle', 'Natureza');
      const style = await build.term('architectural_style', 'Brutalista');
      const inactive = await build.term('lifestyle', 'Neve');
      await ok(handlers.updateCatalogTerm, {
        catalog_term_id: inactive.id,
        label: 'Neve',
        active: false,
      });
      const version = (extra: Record<string, unknown>) =>
        run(handlers.createConceptVersion, {
          concept_id: concept.concept_id,
          ...CONTENT,
          ...extra,
        });

      expectRejected(await version({ lifestyle_ids: [randomUUID()] }), 'ERR_NOT_FOUND');
      expectRejected(await version({ lifestyle_ids: [style.id] }), 'ERR_NOT_FOUND');
      expectRejected(await version({ lifestyle_ids: [inactive.id] }), 'ERR_STATE_TRANSITION');
      expectRejected(
        await version({ lifestyle_ids: [lifestyle.id, lifestyle.id] }),
        'ERR_VALIDATION',
      );
      expectRejected(
        await version({ architectural_style_ids: [style.id, randomUUID(), randomUUID()] }),
        'ERR_VALIDATION',
      );
      expectRejected(await version({ guests_max: 0 }), 'ERR_VALIDATION');
      expectRejected(await version({ summary: 'x'.repeat(161) }), 'ERR_VALIDATION');
      expect(await count(database.pool, 'concept_version')).toBe(1);
    });

    it('versão aprovada é imutável: nem classificação nova nem atributo mudam (gatilhos)', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const version = await build.concept(partner.id);
      await build.approve(version.id);
      const term = await build.term('lifestyle', 'Natureza');
      await expect(
        database.pool.query(
          `INSERT INTO app.concept_version_term (concept_version_id, term_id, kind, position)
           VALUES ($1, $2, 'lifestyle', 1)`,
          [version.id, term.id],
        ),
      ).rejects.toThrow(/only an active term can classify a not approved version/);
      await expect(
        database.pool.query(`UPDATE app.concept_version SET summary = 'Outro' WHERE id = $1`, [
          version.id,
        ]),
      ).rejects.toThrow(/only the approval of a not approved version/);
      const pending = await build.version(version.concept_id);
      await expect(
        database.pool.query(
          `INSERT INTO app.concept_version_term (concept_version_id, term_id, kind, position)
           VALUES ($1, $2, 'lifestyle', 4)`,
          [pending.id, term.id],
        ),
      ).rejects.toThrow(/concept_version_term_position_check/);
    });
  });

  describe('capa do Concept (ADR-0015)', () => {
    /** Objetos gravados no Storage (em memória) para as versões da mídia, pela referência guardada no banco. */
    async function storedVersions(mediaId: string) {
      const { rows } = await database.pool.query<{
        role: string;
        width: number;
        height: number;
        storage_key: string;
        byte_size: number;
      }>(
        `SELECT role, width, height, storage_key, byte_size FROM app.concept_media_file
         WHERE media_id = $1 ORDER BY role, width`,
        [mediaId],
      );
      return Promise.all(
        rows.map(async (row) => {
          const bytes = harness.media.objects.get(row.storage_key);
          expect(bytes, row.storage_key).toBeDefined();
          expect(bytes?.byteLength).toBe(row.byte_size);
          return { row, meta: await sharp(Buffer.from(bytes ?? new Uint8Array())).metadata() };
        }),
      );
    }

    it('[ADR-0015] binários no Storage, só referência e metadados no banco: master sanitizado + larguras, sem EXIF', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const media = await build.cover(concept.concept_id, await testImage({ exif: true }));
      expect(media).toMatchObject({
        state: 'pending',
        alt: 'Fachada em pedra ao entardecer',
        credit: null,
        crop_x: 50,
        crop_y: 35,
        renditions: [
          { role: 'master', width: 1600, height: 1200 },
          { role: 'display', width: 480, height: 360 },
          { role: 'display', width: 800, height: 600 },
          { role: 'display', width: 1200, height: 900 },
          { role: 'display', width: 1600, height: 1200 },
        ],
        approved_at: null,
      });
      expect(media.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      const versions = await storedVersions(media.id);
      expect(versions).toHaveLength(5);
      for (const { row, meta } of versions) {
        expect(row.storage_key).toMatch(/^concept-media\/[0-9a-f]{64}\.webp$/);
        expect([meta.format, meta.width, meta.height]).toEqual(['webp', row.width, row.height]);
        expect(meta.exif).toBeUndefined();
      }
      const columns = await database.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'app' AND table_name = 'concept_media_file' AND data_type = 'bytea'`,
      );
      expect(columns.rows).toEqual([]);
    });

    it('orientação corrigida antes de retirar o EXIF; retrato, PNG, WebP e o mínimo exato aceitos, nada ampliado', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      // 1600×1200 nos pixels com orientação 6: em pé (1200×1600) para quem lê o EXIF.
      const rotated = await build.cover(
        concept.concept_id,
        await testImage({ orientation: 6, exif: true }),
      );
      expect(rotated.renditions[0]).toEqual({ role: 'master', width: 1200, height: 1600 });
      for (const { meta } of await storedVersions(rotated.id)) {
        expect(meta.orientation).toBeUndefined();
        expect(meta.exif).toBeUndefined();
      }
      const portrait = await build.cover(
        concept.concept_id,
        await testImage({ width: 1200, height: 1600, format: 'png' }),
      );
      expect(portrait.renditions.map((r) => r.width)).toEqual([1200, 480, 800, 1200]);
      const minimum = await build.cover(
        concept.concept_id,
        await testImage({ width: 720, height: 520, format: 'webp' }),
      );
      expect(minimum.renditions).toEqual([
        { role: 'master', width: 720, height: 520 },
        { role: 'display', width: 480, height: 347 },
        { role: 'display', width: 720, height: 520 },
      ]);
    });

    it('conteúdo que não é JPEG/PNG/WebP, acima de 40 MP ou menor que o maior quadro → ERR_VALIDATION, nada gravado', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const upload = (image: string) =>
        run(handlers.uploadConceptCover, {
          concept_id: concept.concept_id,
          image,
          alt: 'Casa',
          crop_x: 50,
          crop_y: 50,
        });
      for (const image of [
        await testImage({ width: 719, height: 1200 }),
        await testImage({ width: 1600, height: 519 }),
        await testImage({ format: 'gif' }),
        await testImage({ width: 8000, height: 6000 }),
        Buffer.from('não é imagem').toString('base64'),
      ]) {
        expectRejected(await upload(image), 'ERR_VALIDATION');
      }
      expectRejected(await upload('***'), 'ERR_VALIDATION');
      expect(await count(database.pool, 'concept_media')).toBe(0);
      expect(await count(database.pool, 'concept_media_file')).toBe(0);
      expect(harness.media.objects.size).toBe(0);
    });

    it('aprovar uma capa nova retira a anterior na mesma operação (uma capa vigente)', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const first = await build.approveCover((await build.cover(concept.concept_id)).id);
      expect(first).toMatchObject({ state: 'approved', approved_role: 'admin' });
      const second = await build.cover(concept.concept_id);
      await build.approveCover(second.id);
      const { rows } = await database.pool.query<{
        id: string;
        state: string;
        withdrawal_basis: string;
      }>('SELECT id, state, withdrawal_basis FROM app.concept_media ORDER BY created_at, id');
      expect(rows.find((row) => row.id === first.id)).toMatchObject({
        state: 'withdrawn',
        withdrawal_basis: SUPERSEDED_COVER_BASIS,
      });
      expect(rows.find((row) => row.id === second.id)).toMatchObject({ state: 'approved' });
      expectRejected(
        await run(handlers.approveConceptMedia, { concept_media_id: second.id }),
        'ERR_STATE_TRANSITION',
      );
      await ok(handlers.withdrawConceptMedia, {
        concept_media_id: second.id,
        withdrawal_basis: 'Direito de imagem encerrado',
      });
      expectRejected(
        await run(handlers.withdrawConceptMedia, {
          concept_media_id: second.id,
          withdrawal_basis: 'De novo',
        }),
        'ERR_STATE_TRANSITION',
      );
    });

    it('[BR-021] marca encerrada: não recebe nem aprova capa, mas a retirada continua possível', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const approved = await build.approveCover((await build.cover(concept.concept_id)).id);
      const pending = await build.cover(concept.concept_id);
      await ok(handlers.terminateBrandPartner, {
        brand_partner_id: partner.id,
        terminated_effective_at: new Date(START.getTime() + HOUR).toISOString(),
        termination_basis: 'Aditivo de encerramento',
      });
      clock.advance(2 * HOUR);
      expectRejected(
        await run(handlers.uploadConceptCover, {
          concept_id: concept.concept_id,
          image: await testImage(),
          alt: 'Casa',
          crop_x: 50,
          crop_y: 50,
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.approveConceptMedia, { concept_media_id: pending.id }),
        'ERR_STATE_TRANSITION',
      );
      await expect(
        ok(handlers.withdrawConceptMedia, {
          concept_media_id: approved.id,
          withdrawal_basis: 'Encerramento da marca',
        }),
      ).resolves.toMatchObject({ state: 'withdrawn' });
    });

    it('versões só entram com a mídia pendente e nunca mudam; o ciclo não volta atrás (gatilhos)', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const media = await build.approveCover((await build.cover(concept.concept_id)).id);
      await expect(
        database.pool.query(
          `INSERT INTO app.concept_media_file (media_id, role, width, height, content_type, byte_size, sha256,
             storage_key)
           VALUES ($1, 'display', 10, 10, 'image/webp', 1, repeat('a', 64), 'concept-media/' || repeat('a', 64) || '.webp')`,
          [media.id],
        ),
      ).rejects.toThrow(/only to a pending media|duplicate key/);
      await expect(
        database.pool.query(`UPDATE app.concept_media_file SET byte_size = 2 WHERE media_id = $1`, [
          media.id,
        ]),
      ).rejects.toThrow();
      await expect(
        database.pool.query(
          `UPDATE app.concept_media SET state = 'pending', approved_at = NULL,
           approved_by_user_id = NULL, approved_role = NULL, approval_operation_id = NULL WHERE id = $1`,
          [media.id],
        ),
      ).rejects.toThrow(/only a single approval and a single withdrawal/);
      await expect(
        database.pool.query(`UPDATE app.concept_media SET alt = 'Outro' WHERE id = $1`, [media.id]),
      ).rejects.toThrow(/only a single approval and a single withdrawal/);
    });
  });

  describe('curadoria', () => {
    it('destaque exige capa aprovada; no máximo um — marcar outro tira o anterior; retirar a capa tira o destaque', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const a = await build.concept(partner.id);
      const b = await build.concept(partner.id);
      const curation = (conceptId: string, rank: number | null, featured: boolean) =>
        run(handlers.setConceptCuration, { concept_id: conceptId, rank, featured });

      expectRejected(await curation(a.concept_id, 1, true), 'ERR_STATE_TRANSITION');
      const coverA = await build.approveCover((await build.cover(a.concept_id)).id);
      await build.approveCover((await build.cover(b.concept_id)).id);
      await expect(
        ok(handlers.setConceptCuration, { concept_id: a.concept_id, rank: 1, featured: true }),
      ).resolves.toMatchObject({ rank: 1, featured: true });
      await ok(handlers.setConceptCuration, {
        concept_id: b.concept_id,
        rank: null,
        featured: true,
      });
      const featured = async () =>
        (
          await database.pool.query<{ concept_id: string; rank: number | null }>(
            'SELECT concept_id, rank FROM app.concept_curation WHERE featured',
          )
        ).rows;
      expect(await featured()).toEqual([{ concept_id: b.concept_id, rank: null }]);

      await ok(handlers.setConceptCuration, { concept_id: a.concept_id, rank: 2, featured: true });
      await ok(handlers.withdrawConceptMedia, {
        concept_media_id: coverA.id,
        withdrawal_basis: 'Nova sessão de fotos',
      });
      expect(await featured()).toEqual([]);
      const { rows } = await database.pool.query<{ rank: number; featured: boolean }>(
        'SELECT rank, featured FROM app.concept_curation WHERE concept_id = $1',
        [a.concept_id],
      );
      expect(rows).toEqual([{ rank: 2, featured: false }]);
      // A (1) · B tira A (2) · A tira B (2) · retirada tira A (1).
      expect(await auditCount('concept_curation')).toBe(6);
    });

    it('destaque só com capa que sustente o quadro em DPR 2; capa nova menor tira o destaque, sem ampliar nada', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const concept = await build.concept(partner.id);
      const small = await testImage({ width: 1000, height: 750 });
      await build.approveCover((await build.cover(concept.concept_id, small)).id);
      expectRejected(
        await run(handlers.setConceptCuration, {
          concept_id: concept.concept_id,
          rank: 1,
          featured: true,
        }),
        'ERR_STATE_TRANSITION',
      );
      // A mesma capa continua válida para o card (ordem de curadoria sem destaque).
      await ok(handlers.setConceptCuration, {
        concept_id: concept.concept_id,
        rank: 1,
        featured: false,
      });
      await build.approveCover((await build.cover(concept.concept_id)).id);
      await ok(handlers.setConceptCuration, {
        concept_id: concept.concept_id,
        rank: 1,
        featured: true,
      });
      await build.approveCover((await build.cover(concept.concept_id, small)).id);
      const { rows } = await database.pool.query<{ featured: boolean }>(
        'SELECT featured FROM app.concept_curation WHERE concept_id = $1',
        [concept.concept_id],
      );
      expect(rows).toEqual([{ featured: false }]);
    });

    it('o banco barra destaque sem capa, dois destaques e exclusão, em qualquer caminho', async () => {
      const { build, handlers, ok } = harness;
      const partner = await build.brandPartner();
      const a = await build.concept(partner.id);
      const b = await build.concept(partner.id);
      const insert = async (conceptId: string) =>
        database.pool.query(
          `INSERT INTO app.concept_curation (concept_id, rank, featured, operation_id, updated_at)
           VALUES ($1, NULL, true, $2, now())`,
          [conceptId, await ownerOperation(database.pool, 'set_concept_curation')],
        );
      await expect(insert(b.concept_id)).rejects.toThrow(
        /featured Concept needs an approved cover/,
      );
      await build.approveCover((await build.cover(a.concept_id)).id);
      await build.approveCover((await build.cover(b.concept_id)).id);
      await ok(handlers.setConceptCuration, {
        concept_id: a.concept_id,
        rank: null,
        featured: true,
      });
      await expect(insert(b.concept_id)).rejects.toThrow(/concept_curation_featured_idx/);
      await expect(
        database.pool.query('DELETE FROM app.concept_curation WHERE concept_id = $1', [
          a.concept_id,
        ]),
      ).rejects.toThrow();
    });
  });

  describe('[BR-031] [TECH-033] valor de referência da Edition', () => {
    it('[REQ-100] [REQ-103] base compatível com a modalidade; valor exato em unidades menores', async () => {
      const { build, handlers, run } = harness;
      const owner = await build.approvedEdition('owner');
      const both = await build.approvedEdition('owner_and_co_owner');
      expectRejected(
        await run(handlers.registerEditionReferenceValue, {
          edition_id: owner.edition.id,
          basis: 'acao',
          amount_minor: 1_000 * REAIS,
          currency: 'BRL',
        }),
        'ERR_STATE_TRANSITION',
      );
      const exact = 999_999_999_999_999;
      await expect(build.referenceValue(both.edition.id, 'owner', exact)).resolves.toMatchObject({
        amount_minor: exact,
        basis: 'owner',
        valid_until: null,
      });
      await expect(
        build.referenceValue(both.edition.id, 'acao', 6_000_000 * REAIS),
      ).resolves.toMatchObject({ basis: 'acao', valid_from: START.toISOString() });
      const { rows } = await database.pool.query<{ amount: string }>(
        `SELECT amount_minor::text AS amount FROM app.edition_reference_value WHERE basis = 'owner'`,
      );
      expect(rows).toEqual([{ amount: String(exact) }]);
    });

    it('novo valor encerra o vigente em aberto no início do novo; sobreposição com outro → ERR_STATE_TRANSITION', async () => {
      const { build, handlers, run } = harness;
      const { edition } = await build.approvedEdition('owner');
      const first = await build.referenceValue(edition.id, 'owner', 4_800_000 * REAIS);
      const later = new Date(START.getTime() + 10 * DAY);
      const second = await build.referenceValue(edition.id, 'owner', 5_200_000 * REAIS, later);
      const { rows } = await database.pool.query<{ id: string; valid_until: Date | null }>(
        'SELECT id, valid_until FROM app.edition_reference_value ORDER BY valid_from',
      );
      expect(rows).toEqual([
        { id: first.id, valid_until: later },
        { id: second.id, valid_until: null },
      ]);
      // Entre os dois: o primeiro já tem fim, então não é "em aberto" — sobreposição.
      expectRejected(
        await run(handlers.registerEditionReferenceValue, {
          edition_id: edition.id,
          basis: 'owner',
          amount_minor: 5_000_000 * REAIS,
          currency: 'BRL',
          valid_from: new Date(START.getTime() + 5 * DAY).toISOString(),
        }),
        'ERR_STATE_TRANSITION',
      );
      // No passado: reescreveria o que já foi exibido.
      expectRejected(
        await run(handlers.registerEditionReferenceValue, {
          edition_id: edition.id,
          basis: 'owner',
          amount_minor: 5_000_000 * REAIS,
          currency: 'BRL',
          valid_from: new Date(START.getTime() - HOUR).toISOString(),
        }),
        'ERR_VALIDATION',
      );
      expect(await auditCount('edition_reference_value')).toBe(3);
    });

    it('encerrar: só valor que já começou e está em aberto, uma vez; vale com a marca encerrada', async () => {
      const { build, handlers, run, ok } = harness;
      const { edition, partner } = await build.approvedEdition('owner');
      const current = await build.referenceValue(edition.id, 'owner', 4_800_000 * REAIS);
      const future = await build.referenceValue(
        edition.id,
        'owner',
        5_000_000 * REAIS,
        new Date(START.getTime() + 30 * DAY),
      );
      expectRejected(
        await run(handlers.endEditionReferenceValue, { edition_reference_value_id: future.id }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.endEditionReferenceValue, { edition_reference_value_id: current.id }),
        'ERR_STATE_TRANSITION',
      );
      await ok(handlers.terminateBrandPartner, {
        brand_partner_id: partner.id,
        terminated_effective_at: new Date(START.getTime() + 31 * DAY).toISOString(),
        termination_basis: 'Aditivo de encerramento',
      });
      clock.advance(40 * DAY);
      await expect(
        ok(handlers.endEditionReferenceValue, { edition_reference_value_id: future.id }),
      ).resolves.toMatchObject({ valid_until: new Date(START.getTime() + 40 * DAY).toISOString() });
      expectRejected(
        await run(handlers.endEditionReferenceValue, { edition_reference_value_id: future.id }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.registerEditionReferenceValue, {
          edition_id: edition.id,
          basis: 'owner',
          amount_minor: 1 * REAIS,
          currency: 'BRL',
        }),
        'ERR_STATE_TRANSITION',
      );
    });

    it('o banco barra sobreposição, segundo encerramento e exclusão, em qualquer caminho', async () => {
      const { build } = harness;
      const { edition } = await build.approvedEdition('owner');
      const value = await build.referenceValue(edition.id, 'owner', 4_800_000 * REAIS);
      const op = await ownerOperation(database.pool, 'register_edition_reference_value');
      await expect(
        database.pool.query(
          `INSERT INTO app.edition_reference_value (id, edition_id, basis, amount_minor, currency, valid_from,
             registered_by_user_id, registered_role, operation_id, created_at)
           VALUES ($1, $2, 'owner', 100, 'BRL', $3, $4, 'admin', $5, now())`,
          [randomUUID(), edition.id, new Date(START.getTime() + DAY), randomUUID(), op],
        ),
      ).rejects.toThrow(/validity overlaps another value/);
      await database.pool.query(
        'UPDATE app.edition_reference_value SET valid_until = $2 WHERE id = $1',
        [value.id, new Date(START.getTime() + DAY)],
      );
      await expect(
        database.pool.query(
          'UPDATE app.edition_reference_value SET valid_until = $2 WHERE id = $1',
          [value.id, new Date(START.getTime() + 2 * DAY)],
        ),
      ).rejects.toThrow(/only a single end of validity/);
      await expect(
        database.pool.query('DELETE FROM app.edition_reference_value WHERE id = $1', [value.id]),
      ).rejects.toThrow();
    });
  });
});
