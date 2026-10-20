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

  describe('[BR-013] classificações e resumo da versão', () => {
    it('grava lifestyle (1–3) e estilo (1–2) em ordem e o resumo com a versão; atributos físicos não são do Home Concept', async () => {
      const { build, ok, handlers } = harness;
      const partner = await build.brandPartner();
      const [natureza, bemEstar, contemporaneo] = [
        await build.term('lifestyle', 'Natureza'),
        await build.term('lifestyle', 'Bem-estar'),
        await build.term('architectural_style', 'Contemporâneo'),
      ];
      const version = await ok(handlers.createHomeConceptVersion, {
        brand_partner_id: partner.id,
        title: 'Casa do Mar',
        ...CONTENT,
        summary: 'Pátio, mar e pedra local para longas temporadas em família.',
        lifestyle_ids: [bemEstar.id, natureza.id],
        architectural_style_ids: [contemporaneo.id],
      });
      expect(version).toMatchObject({
        summary: 'Pátio, mar e pedra local para longas temporadas em família.',
        lifestyle_ids: [bemEstar.id, natureza.id],
        architectural_style_ids: [contemporaneo.id],
      });
      // Relida do banco pela aprovação: mesma ordem.
      await expect(build.approve(version.id)).resolves.toMatchObject({
        lifestyle_ids: [bemEstar.id, natureza.id],
        architectural_style_ids: [contemporaneo.id],
      });
      expect(version).not.toHaveProperty('guests_max');
      expectRejected(
        await harness.run(handlers.createHomeConceptVersion, {
          home_concept_id: version.home_concept_id,
          ...CONTENT,
          guests_max: 10,
        }),
        'ERR_VALIDATION',
      );
      // Versão sem nada disso continua válida (versões antigas e Home Concepts sem vocabulário).
      await expect(build.version(version.home_concept_id)).resolves.toMatchObject({
        summary: null,
        lifestyle_ids: [],
        architectural_style_ids: [],
      });
    });

    it('termo inexistente ou de outro vocabulário → ERR_NOT_FOUND; desativado → ERR_STATE_TRANSITION; limites → ERR_VALIDATION', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const homeConcept = await build.homeConcept(partner.id);
      const lifestyle = await build.term('lifestyle', 'Natureza');
      const style = await build.term('architectural_style', 'Brutalista');
      const inactive = await build.term('lifestyle', 'Neve');
      await ok(handlers.updateCatalogTerm, {
        catalog_term_id: inactive.id,
        label: 'Neve',
        active: false,
      });
      const version = (extra: Record<string, unknown>) =>
        run(handlers.createHomeConceptVersion, {
          home_concept_id: homeConcept.home_concept_id,
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
      expectRejected(await version({ summary: 'x'.repeat(161) }), 'ERR_VALIDATION');
      expect(await count(database.pool, 'home_concept_version')).toBe(1);
    });

    it('versão aprovada é imutável: nem classificação nova nem resumo mudam (gatilhos)', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const version = await build.homeConcept(partner.id);
      await build.approve(version.id);
      const term = await build.term('lifestyle', 'Natureza');
      await expect(
        database.pool.query(
          `INSERT INTO app.home_concept_version_term (home_concept_version_id, term_id, kind, position)
           VALUES ($1, $2, 'lifestyle', 1)`,
          [version.id, term.id],
        ),
      ).rejects.toThrow(/only an active term can classify a not approved version/);
      await expect(
        database.pool.query(`UPDATE app.home_concept_version SET summary = 'Outro' WHERE id = $1`, [
          version.id,
        ]),
      ).rejects.toThrow(/only the approval of a not approved version/);
      const pending = await build.version(version.home_concept_id);
      await expect(
        database.pool.query(
          `INSERT INTO app.home_concept_version_term (home_concept_version_id, term_id, kind, position)
           VALUES ($1, $2, 'lifestyle', 4)`,
          [pending.id, term.id],
        ),
      ).rejects.toThrow(/home_concept_version_term_position_check/);
    });
  });

  describe('capa do Home Concept (ADR-0015)', () => {
    /** Objetos gravados no Storage (em memória) para as versões da mídia, pela referência guardada no banco. */
    async function storedVersions(mediaId: string) {
      const { rows } = await database.pool.query<{
        role: string;
        width: number;
        height: number;
        storage_key: string;
        byte_size: number;
      }>(
        `SELECT role, width, height, storage_key, byte_size FROM app.home_concept_media_file
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
      const homeConcept = await build.homeConcept(partner.id);
      const media = await build.cover(homeConcept.home_concept_id, await testImage({ exif: true }));
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
        expect(row.storage_key).toMatch(/^home-concept-media\/[0-9a-f]{64}\.webp$/);
        expect([meta.format, meta.width, meta.height]).toEqual(['webp', row.width, row.height]);
        expect(meta.exif).toBeUndefined();
      }
      const columns = await database.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'app' AND table_name = 'home_concept_media_file' AND data_type = 'bytea'`,
      );
      expect(columns.rows).toEqual([]);
    });

    it('orientação corrigida antes de retirar o EXIF; retrato, PNG, WebP e o mínimo exato aceitos, nada ampliado', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const homeConcept = await build.homeConcept(partner.id);
      // 1600×1200 nos pixels com orientação 6: em pé (1200×1600) para quem lê o EXIF.
      const rotated = await build.cover(
        homeConcept.home_concept_id,
        await testImage({ orientation: 6, exif: true }),
      );
      expect(rotated.renditions[0]).toEqual({ role: 'master', width: 1200, height: 1600 });
      for (const { meta } of await storedVersions(rotated.id)) {
        expect(meta.orientation).toBeUndefined();
        expect(meta.exif).toBeUndefined();
      }
      const portrait = await build.cover(
        homeConcept.home_concept_id,
        await testImage({ width: 1200, height: 1600, format: 'png' }),
      );
      expect(portrait.renditions.map((r) => r.width)).toEqual([1200, 480, 800, 1200]);
      const minimum = await build.cover(
        homeConcept.home_concept_id,
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
      const homeConcept = await build.homeConcept(partner.id);
      const upload = (image: string) =>
        run(handlers.uploadHomeConceptCover, {
          home_concept_id: homeConcept.home_concept_id,
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
      expect(await count(database.pool, 'home_concept_media')).toBe(0);
      expect(await count(database.pool, 'home_concept_media_file')).toBe(0);
      expect(harness.media.objects.size).toBe(0);
    });

    it('aprovar uma capa nova retira a anterior na mesma operação (uma capa vigente)', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const homeConcept = await build.homeConcept(partner.id);
      const first = await build.approveCover((await build.cover(homeConcept.home_concept_id)).id);
      expect(first).toMatchObject({ state: 'approved', approved_role: 'admin' });
      const second = await build.cover(homeConcept.home_concept_id);
      await build.approveCover(second.id);
      const { rows } = await database.pool.query<{
        id: string;
        state: string;
        withdrawal_basis: string;
      }>('SELECT id, state, withdrawal_basis FROM app.home_concept_media ORDER BY created_at, id');
      expect(rows.find((row) => row.id === first.id)).toMatchObject({
        state: 'withdrawn',
        withdrawal_basis: SUPERSEDED_COVER_BASIS,
      });
      expect(rows.find((row) => row.id === second.id)).toMatchObject({ state: 'approved' });
      expectRejected(
        await run(handlers.approveHomeConceptMedia, { home_concept_media_id: second.id }),
        'ERR_STATE_TRANSITION',
      );
      await ok(handlers.withdrawHomeConceptMedia, {
        home_concept_media_id: second.id,
        withdrawal_basis: 'Direito de imagem encerrado',
      });
      expectRejected(
        await run(handlers.withdrawHomeConceptMedia, {
          home_concept_media_id: second.id,
          withdrawal_basis: 'De novo',
        }),
        'ERR_STATE_TRANSITION',
      );
    });

    it('[BR-021] marca encerrada: não recebe nem aprova capa, mas a retirada continua possível', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const homeConcept = await build.homeConcept(partner.id);
      const approved = await build.approveCover(
        (await build.cover(homeConcept.home_concept_id)).id,
      );
      const pending = await build.cover(homeConcept.home_concept_id);
      await ok(handlers.terminateBrandPartner, {
        brand_partner_id: partner.id,
        terminated_effective_at: new Date(START.getTime() + HOUR).toISOString(),
        termination_basis: 'Aditivo de encerramento',
      });
      clock.advance(2 * HOUR);
      expectRejected(
        await run(handlers.uploadHomeConceptCover, {
          home_concept_id: homeConcept.home_concept_id,
          image: await testImage(),
          alt: 'Casa',
          crop_x: 50,
          crop_y: 50,
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.approveHomeConceptMedia, { home_concept_media_id: pending.id }),
        'ERR_STATE_TRANSITION',
      );
      await expect(
        ok(handlers.withdrawHomeConceptMedia, {
          home_concept_media_id: approved.id,
          withdrawal_basis: 'Encerramento da marca',
        }),
      ).resolves.toMatchObject({ state: 'withdrawn' });
    });

    it('versões só entram com a mídia pendente e nunca mudam; o ciclo não volta atrás (gatilhos)', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const homeConcept = await build.homeConcept(partner.id);
      const media = await build.approveCover((await build.cover(homeConcept.home_concept_id)).id);
      await expect(
        database.pool.query(
          `INSERT INTO app.home_concept_media_file (media_id, role, width, height, content_type, byte_size, sha256,
             storage_key)
           VALUES ($1, 'display', 10, 10, 'image/webp', 1, repeat('a', 64), 'home-concept-media/' || repeat('a', 64) || '.webp')`,
          [media.id],
        ),
      ).rejects.toThrow(/only to a pending media|duplicate key/);
      await expect(
        database.pool.query(
          `UPDATE app.home_concept_media_file SET byte_size = 2 WHERE media_id = $1`,
          [media.id],
        ),
      ).rejects.toThrow();
      await expect(
        database.pool.query(
          `UPDATE app.home_concept_media SET state = 'pending', approved_at = NULL,
           approved_by_user_id = NULL, approved_role = NULL, approval_operation_id = NULL WHERE id = $1`,
          [media.id],
        ),
      ).rejects.toThrow(/only a single approval and a single withdrawal/);
      await expect(
        database.pool.query(`UPDATE app.home_concept_media SET alt = 'Outro' WHERE id = $1`, [
          media.id,
        ]),
      ).rejects.toThrow(/only a single approval and a single withdrawal/);
    });
  });

  describe('curadoria', () => {
    it('destaque exige capa aprovada; no máximo um — marcar outro tira o anterior; retirar a capa tira o destaque', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const a = await build.homeConcept(partner.id);
      const b = await build.homeConcept(partner.id);
      const curation = (homeConceptId: string, rank: number | null, featured: boolean) =>
        run(handlers.setHomeConceptCuration, { home_concept_id: homeConceptId, rank, featured });

      expectRejected(await curation(a.home_concept_id, 1, true), 'ERR_STATE_TRANSITION');
      const coverA = await build.approveCover((await build.cover(a.home_concept_id)).id);
      await build.approveCover((await build.cover(b.home_concept_id)).id);
      await expect(
        ok(handlers.setHomeConceptCuration, {
          home_concept_id: a.home_concept_id,
          rank: 1,
          featured: true,
        }),
      ).resolves.toMatchObject({ rank: 1, featured: true });
      await ok(handlers.setHomeConceptCuration, {
        home_concept_id: b.home_concept_id,
        rank: null,
        featured: true,
      });
      const featured = async () =>
        (
          await database.pool.query<{ home_concept_id: string; rank: number | null }>(
            'SELECT home_concept_id, rank FROM app.home_concept_curation WHERE featured',
          )
        ).rows;
      expect(await featured()).toEqual([{ home_concept_id: b.home_concept_id, rank: null }]);

      await ok(handlers.setHomeConceptCuration, {
        home_concept_id: a.home_concept_id,
        rank: 2,
        featured: true,
      });
      await ok(handlers.withdrawHomeConceptMedia, {
        home_concept_media_id: coverA.id,
        withdrawal_basis: 'Nova sessão de fotos',
      });
      expect(await featured()).toEqual([]);
      const { rows } = await database.pool.query<{ rank: number; featured: boolean }>(
        'SELECT rank, featured FROM app.home_concept_curation WHERE home_concept_id = $1',
        [a.home_concept_id],
      );
      expect(rows).toEqual([{ rank: 2, featured: false }]);
      // A (1) · B tira A (2) · A tira B (2) · retirada tira A (1).
      expect(await auditCount('home_concept_curation')).toBe(6);
    });

    it('destaque só com capa que sustente o quadro em DPR 2; capa nova menor tira o destaque, sem ampliar nada', async () => {
      const { build, handlers, run, ok } = harness;
      const partner = await build.brandPartner();
      const homeConcept = await build.homeConcept(partner.id);
      const small = await testImage({ width: 1000, height: 750 });
      await build.approveCover((await build.cover(homeConcept.home_concept_id, small)).id);
      expectRejected(
        await run(handlers.setHomeConceptCuration, {
          home_concept_id: homeConcept.home_concept_id,
          rank: 1,
          featured: true,
        }),
        'ERR_STATE_TRANSITION',
      );
      // A mesma capa continua válida para o card (ordem de curadoria sem destaque).
      await ok(handlers.setHomeConceptCuration, {
        home_concept_id: homeConcept.home_concept_id,
        rank: 1,
        featured: false,
      });
      await build.approveCover((await build.cover(homeConcept.home_concept_id)).id);
      await ok(handlers.setHomeConceptCuration, {
        home_concept_id: homeConcept.home_concept_id,
        rank: 1,
        featured: true,
      });
      await build.approveCover((await build.cover(homeConcept.home_concept_id, small)).id);
      const { rows } = await database.pool.query<{ featured: boolean }>(
        'SELECT featured FROM app.home_concept_curation WHERE home_concept_id = $1',
        [homeConcept.home_concept_id],
      );
      expect(rows).toEqual([{ featured: false }]);
    });

    it('o banco barra destaque sem capa, dois destaques e exclusão, em qualquer caminho', async () => {
      const { build, handlers, ok } = harness;
      const partner = await build.brandPartner();
      const a = await build.homeConcept(partner.id);
      const b = await build.homeConcept(partner.id);
      const insert = async (homeConceptId: string) =>
        database.pool.query(
          `INSERT INTO app.home_concept_curation (home_concept_id, rank, featured, operation_id, updated_at)
           VALUES ($1, NULL, true, $2, now())`,
          [homeConceptId, await ownerOperation(database.pool, 'set_home_concept_curation')],
        );
      await expect(insert(b.home_concept_id)).rejects.toThrow(
        /featured Home Concept needs an approved cover/,
      );
      await build.approveCover((await build.cover(a.home_concept_id)).id);
      await build.approveCover((await build.cover(b.home_concept_id)).id);
      await ok(handlers.setHomeConceptCuration, {
        home_concept_id: a.home_concept_id,
        rank: null,
        featured: true,
      });
      await expect(insert(b.home_concept_id)).rejects.toThrow(/home_concept_curation_featured_idx/);
      await expect(
        database.pool.query('DELETE FROM app.home_concept_curation WHERE home_concept_id = $1', [
          a.home_concept_id,
        ]),
      ).rejects.toThrow();
    });
  });

  describe('[BR-034] [TECH-033] média projetada de investimento da Home Edition', () => {
    it('[REQ-100] [BR-034] uma média por vez, sem modalidade nem base; valor exato em unidades menores, em qualquer estado material', async () => {
      const { build, handlers, run } = harness;
      const { homeEdition } = await build.approvedHomeEdition();
      expectRejected(
        await run(handlers.registerHomeEditionProjectedInvestment, {
          home_edition_id: homeEdition.id,
          basis: 'owner',
          amount_minor: 1_000 * REAIS,
          currency: 'BRL',
        }),
        'ERR_VALIDATION',
      );
      const exact = 999_999_999_999_999;
      // Em preparação também: a média não é material (BR-036).
      await expect(build.projectedInvestment(homeEdition.id, exact)).resolves.toMatchObject({
        home_edition_id: homeEdition.id,
        amount_minor: exact,
        currency: 'BRL',
        valid_from: START.toISOString(),
        valid_until: null,
      });
      const { rows } = await database.pool.query<{ amount: string }>(
        `SELECT amount_minor::text AS amount FROM app.home_edition_projected_investment`,
      );
      expect(rows).toEqual([{ amount: String(exact) }]);
      const columns = await database.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'app' AND table_name = 'home_edition_projected_investment'
           AND column_name IN ('basis', 'modality', 'acao')`,
      );
      expect(columns.rows).toEqual([]);
    });

    it('nova média encerra a vigente em aberto no início da nova; sobreposição com outra → ERR_STATE_TRANSITION', async () => {
      const { build, handlers, run } = harness;
      const { homeEdition } = await build.finalizedHomeEdition();
      const first = await build.projectedInvestment(homeEdition.id, 4_800_000 * REAIS);
      const later = new Date(START.getTime() + 10 * DAY);
      const second = await build.projectedInvestment(homeEdition.id, 5_200_000 * REAIS, later);
      const { rows } = await database.pool.query<{ id: string; valid_until: Date | null }>(
        'SELECT id, valid_until FROM app.home_edition_projected_investment ORDER BY valid_from',
      );
      expect(rows).toEqual([
        { id: first.id, valid_until: later },
        { id: second.id, valid_until: null },
      ]);
      // Entre as duas: a primeira já tem fim, então não é "em aberto" — sobreposição.
      expectRejected(
        await run(handlers.registerHomeEditionProjectedInvestment, {
          home_edition_id: homeEdition.id,
          amount_minor: 5_000_000 * REAIS,
          currency: 'BRL',
          valid_from: new Date(START.getTime() + 5 * DAY).toISOString(),
        }),
        'ERR_STATE_TRANSITION',
      );
      // No passado: reescreveria o que já foi exibido.
      expectRejected(
        await run(handlers.registerHomeEditionProjectedInvestment, {
          home_edition_id: homeEdition.id,
          amount_minor: 5_000_000 * REAIS,
          currency: 'BRL',
          valid_from: new Date(START.getTime() - HOUR).toISOString(),
        }),
        'ERR_VALIDATION',
      );
      expect(await auditCount('home_edition_projected_investment')).toBe(3);
    });

    it('encerrar: só média que já começou e está em aberto, uma vez; vale com a marca encerrada', async () => {
      const { build, handlers, run, ok } = harness;
      const { homeEdition, partner } = await build.finalizedHomeEdition();
      const current = await build.projectedInvestment(homeEdition.id, 4_800_000 * REAIS);
      const future = await build.projectedInvestment(
        homeEdition.id,
        5_000_000 * REAIS,
        new Date(START.getTime() + 30 * DAY),
      );
      expectRejected(
        await run(handlers.endHomeEditionProjectedInvestment, {
          home_edition_projected_investment_id: future.id,
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.endHomeEditionProjectedInvestment, {
          home_edition_projected_investment_id: current.id,
        }),
        'ERR_STATE_TRANSITION',
      );
      await ok(handlers.terminateBrandPartner, {
        brand_partner_id: partner.id,
        terminated_effective_at: new Date(START.getTime() + 31 * DAY).toISOString(),
        termination_basis: 'Aditivo de encerramento',
      });
      clock.advance(40 * DAY);
      await expect(
        ok(handlers.endHomeEditionProjectedInvestment, {
          home_edition_projected_investment_id: future.id,
        }),
      ).resolves.toMatchObject({ valid_until: new Date(START.getTime() + 40 * DAY).toISOString() });
      expectRejected(
        await run(handlers.endHomeEditionProjectedInvestment, {
          home_edition_projected_investment_id: future.id,
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.registerHomeEditionProjectedInvestment, {
          home_edition_id: homeEdition.id,
          amount_minor: 1 * REAIS,
          currency: 'BRL',
        }),
        'ERR_STATE_TRANSITION',
      );
    });

    it('o banco barra sobreposição (em qualquer moeda), segundo encerramento e exclusão, em qualquer caminho', async () => {
      const { build } = harness;
      const { homeEdition } = await build.finalizedHomeEdition();
      const value = await build.projectedInvestment(homeEdition.id, 4_800_000 * REAIS);
      const op = await ownerOperation(database.pool, 'register_home_edition_projected_investment');
      await expect(
        database.pool.query(
          `INSERT INTO app.home_edition_projected_investment (id, home_edition_id, amount_minor, currency, valid_from,
             registered_by_user_id, registered_role, operation_id, created_at)
           VALUES ($1, $2, 100, 'BRL', $3, $4, 'admin', $5, now())`,
          [randomUUID(), homeEdition.id, new Date(START.getTime() + DAY), randomUUID(), op],
        ),
      ).rejects.toThrow(/validity overlaps another value/);
      await database.pool.query(
        'UPDATE app.home_edition_projected_investment SET valid_until = $2 WHERE id = $1',
        [value.id, new Date(START.getTime() + DAY)],
      );
      await expect(
        database.pool.query(
          'UPDATE app.home_edition_projected_investment SET valid_until = $2 WHERE id = $1',
          [value.id, new Date(START.getTime() + 2 * DAY)],
        ),
      ).rejects.toThrow(/only a single end of validity/);
      await expect(
        database.pool.query('DELETE FROM app.home_edition_projected_investment WHERE id = $1', [
          value.id,
        ]),
      ).rejects.toThrow();
    });
  });

  describe('[BR-031] [BR-036] mídia da Home Edition (ADR-0015)', () => {
    it('imagens, renders e plantas: várias aprovadas ao mesmo tempo, em qualquer estado material; Storage com o prefixo da Home Edition', async () => {
      const { build, handlers, ok } = harness;
      const { homeEdition } = await build.approvedHomeEdition();
      const image = await build.homeEditionMedia(homeEdition.id, 'image');
      const plan = await build.homeEditionMedia(homeEdition.id, 'floor_plan');
      expect(image).toMatchObject({
        home_edition_id: homeEdition.id,
        kind: 'image',
        state: 'pending',
      });

      await build.approveHomeEditionMedia(image.id);
      await expect(build.approveHomeEditionMedia(plan.id)).resolves.toMatchObject({
        state: 'approved',
      });
      const { rows } = await database.pool.query<{ state: string; keys: string[] }>(
        `SELECT media.state, array_agg(file.storage_key ORDER BY file.width) AS keys
         FROM app.home_edition_media AS media JOIN app.home_edition_media_file AS file ON file.media_id = media.id
         GROUP BY media.id, media.state`,
      );
      expect(rows.map((row) => row.state)).toEqual(['approved', 'approved']);
      for (const key of rows.flatMap((row) => row.keys)) {
        expect(key).toMatch(/^home-edition-media\/[0-9a-f]{64}\.webp$/);
      }
      await expect(
        ok(handlers.withdrawHomeEditionMedia, {
          home_edition_media_id: image.id,
          withdrawal_basis: 'Render desatualizado',
        }),
      ).resolves.toMatchObject({ state: 'withdrawn', withdrawal_basis: 'Render desatualizado' });
      expect(await auditCount('home_edition_media')).toBe(5);
    });

    it('[BR-021] marca encerrada: não recebe nem aprova mídia, mas a retirada continua possível', async () => {
      const { build, handlers, ok, run } = harness;
      const { homeEdition, partner } = await build.finalizedHomeEdition();
      const pending = await build.homeEditionMedia(homeEdition.id);
      const approved = await build.homeEditionMedia(homeEdition.id, 'render');
      await build.approveHomeEditionMedia(approved.id);
      await ok(handlers.terminateBrandPartner, {
        brand_partner_id: partner.id,
        terminated_effective_at: new Date(START.getTime() - HOUR).toISOString(),
        termination_basis: 'Aditivo de encerramento',
      });

      expectRejected(
        await run(handlers.approveHomeEditionMedia, { home_edition_media_id: pending.id }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.uploadHomeEditionMedia, {
          home_edition_id: homeEdition.id,
          kind: 'image',
          image: await testImage(),
          alt: 'Pátio',
          crop_x: 50,
          crop_y: 50,
        }),
        'ERR_STATE_TRANSITION',
      );
      await expect(
        ok(handlers.withdrawHomeEditionMedia, {
          home_edition_media_id: approved.id,
          withdrawal_basis: 'Encerramento da marca',
        }),
      ).resolves.toMatchObject({ state: 'withdrawn' });
    });
  });
});
