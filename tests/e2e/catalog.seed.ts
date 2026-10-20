import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as seed, type Page } from '@playwright/test';
import sharp from 'sharp';
import { signIn, STAFF_EMAIL } from './support/auth';
import {
  HOME_CONCEPT_CONTENT,
  HOME_EDITION_CONTENT,
  SEED_FILE,
  SPECIFICATION,
  type CatalogSeed,
} from './support/discovery';

// Catálogo do Discovery semeado pela API do Admin (contrato real: origem, sessão AAL2, Idempotency-Key). Roda depois
// do projeto `setup`, que já cadastrou o TOTP do staff: aqui o staff só confirma o código — nenhum cadastro de MFA
// concorrente (NOTES §4). Um teste só, serial.
// Títulos e marcas exclusivos deste seed: os outros specs criam Home Concepts no mesmo banco, em paralelo.
seed('catálogo público semeado pela API do Admin', async ({ page, baseURL }) => {
  await signIn(page, STAFF_EMAIL);
  await expect(page).toHaveURL(/\/admin$/);
  const post = poster(page, baseURL ?? '');

  const partner = async (brandName: string, exposure: boolean) => {
    const { id } = await post('/v1/admin/brand-partners', { brand_name: brandName });
    if (exposure) {
      await post(`/v1/admin/brand-partners/${id}/exposure-authorization`, {
        exposure_authorization_ref: 'Plano de uso da marca — referência de teste',
      });
    }
    return id as string;
  };
  const homeConcept = async (
    brandPartnerId: string,
    title: string,
    approve = true,
    collection: Record<string, unknown> = {},
  ) => {
    const version = await post('/v1/admin/home-concept-versions', {
      brand_partner_id: brandPartnerId,
      title,
      ...HOME_CONCEPT_CONTENT,
      specification: SPECIFICATION,
      ...collection,
    });
    if (approve) {
      await post(`/v1/admin/home-concept-versions/${version.id}/approve`, {
        approval_refs: ['Aprovação de teste E2E'],
      });
    }
    return { id: version.home_concept_id as string, title };
  };
  /** Home Edition em preparação; `finalize` e `publish` a levam ao site (BR-036). */
  const homeEdition = async (
    homeConceptId: string,
    name: string,
    stage: 'draft' | 'finalized' | 'public',
    content: Record<string, unknown> = {},
  ) => {
    const created = await post('/v1/admin/home-editions', {
      home_concept_id: homeConceptId,
      ...HOME_EDITION_CONTENT,
      name,
      ...content,
    });
    if (stage !== 'draft') await post(`/v1/admin/home-editions/${created.id}/finalize`, {});
    if (stage === 'public') await post(`/v1/admin/home-editions/${created.id}/publish`, {});
    return { id: created.id as string, name };
  };

  // Coleção (spec catalog §13.12): vocabulário e classificação — termos de teste.
  const term = async (kind: string, label: string) =>
    (await post('/v1/admin/catalog-terms', { kind, label })).id as string;
  const natureza = await term('lifestyle', 'Natureza');
  const bemEstar = await term('lifestyle', 'Bem-estar');
  const contemporaneo = await term('architectural_style', 'Contemporâneo');

  const solenne = await partner('Atelier Solenne', true);
  const withHomeEdition = await homeConcept(solenne, 'Casa Alpendre', true, {
    summary: 'Varandas largas e um pátio de sombra para temporadas longas em família.',
    lifestyle_ids: [natureza, bemEstar],
    architectural_style_ids: [contemporaneo],
  });
  const alpendre = await homeEdition(withHomeEdition.id, 'Alpendre Pátio', 'public');
  const alpendreDraft = await homeEdition(withHomeEdition.id, 'Alpendre em Preparação', 'draft');
  // Segunda Home Edition publicada, com outra média: o filtro "Investimento projetado" só aparece com 2+ médias.
  const alpendreJardim = await homeEdition(withHomeEdition.id, 'Alpendre Jardim', 'public', {
    projected_area_m2: 400,
    suites: 4,
    guests_max: 8,
  });
  const withoutHomeEdition = await homeConcept(solenne, 'Casa Mirante', true, {
    lifestyle_ids: [natureza],
  });
  const mirante = await homeEdition(withoutHomeEdition.id, 'Mirante Reservada', 'finalized');
  const unapproved = await homeConcept(solenne, 'Casa em Revisão', false);

  const neree = await partner('Maison Nérée', true);
  const secondBrand = await homeConcept(neree, 'Casa Varanda', true, {
    lifestyle_ids: [bemEstar],
  });
  const varanda = await homeEdition(secondBrand.id, 'Varanda Compacta', 'public', {
    projected_area_m2: 280,
    suites: 3,
    guests_max: 6,
    rooms: undefined,
    amenities: undefined,
    characteristics: undefined,
  });

  // Média projetada (BR-034, TECH-033), mídia da Home Edition e capa aprovada + pendente (ADR-0015).
  await post(`/v1/admin/home-editions/${alpendre.id}/projected-investments`, {
    amount_minor: 480_000_000,
    currency: 'BRL',
  });
  await post(`/v1/admin/home-editions/${alpendreJardim.id}/projected-investments`, {
    amount_minor: 900_000_000,
    currency: 'BRL',
  });
  const coverImage = await testCover();
  const editionImage = await post(`/v1/admin/home-editions/${alpendre.id}/media`, {
    kind: 'image',
    image: coverImage,
    alt: 'Imagem de teste do E2E — um campo de cor, nenhuma casa',
    crop_x: 50,
    crop_y: 50,
  });
  await post(`/v1/admin/home-edition-media/${editionImage.id}/approve`, {});
  const editionPlan = await post(`/v1/admin/home-editions/${alpendre.id}/media`, {
    kind: 'floor_plan',
    image: coverImage,
    alt: 'Planta de teste do E2E — um campo de cor',
    crop_x: 50,
    crop_y: 50,
  });
  await post(`/v1/admin/home-edition-media/${editionPlan.id}/approve`, {});
  const cover = () =>
    post(`/v1/admin/home-concepts/${withHomeEdition.id}/cover`, {
      image: coverImage,
      alt: 'Imagem de teste do E2E — um campo de cor, nenhuma casa',
      crop_x: 50,
      crop_y: 50,
    });
  const approvedCover = await cover();
  await post(`/v1/admin/home-concept-media/${approvedCover.id}/approve`, {});
  const pendingCover = await cover();
  await post(`/v1/admin/home-concepts/${withHomeEdition.id}/curation`, { rank: 1, featured: true });

  const noExposure = await homeConcept(
    await partner('Marca sem Exposição', false),
    'Casa Reservada',
  );

  const closing = await partner('Marca Encerrada', true);
  const terminated = await homeConcept(closing, 'Casa Encerrada');
  await post(`/v1/admin/brand-partners/${closing}/terminate`, {
    terminated_effective_at: new Date(Date.now() - 60_000).toISOString(),
    termination_basis: 'Encerramento de teste',
  });

  const result: CatalogSeed = {
    withHomeEdition: {
      ...withHomeEdition,
      brandName: 'Atelier Solenne',
      brandPartnerId: solenne,
      homeEdition: alpendre,
      draftHomeEdition: alpendreDraft,
    },
    withoutHomeEdition: { ...withoutHomeEdition, hiddenHomeEdition: mirante },
    secondBrand: { ...secondBrand, homeEdition: varanda },
    hidden: [noExposure, terminated, unapproved],
    collection: {
      approvedCoverId: approvedCover.id,
      pendingCoverId: pendingCover.id,
      homeEditionMediaId: editionImage.id,
    },
  };
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(result, null, 2));
});

/** Imagem de teste gerada no seed (campo de cor; nenhuma fotografia nem casa), em base64. */
async function testCover(): Promise<string> {
  const image = sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 205, g: 173, b: 142 } },
  });
  return (await image.jpeg().toBuffer()).toString('base64');
}

function poster(page: Page, origin: string) {
  return async (path: string, data: unknown) => {
    const response = await page.request.post(path, {
      headers: { origin, 'idempotency-key': randomUUID() },
      data,
    });
    expect(response.status(), `${path}: ${await response.text()}`).toBeLessThan(300);
    return response.json();
  };
}
