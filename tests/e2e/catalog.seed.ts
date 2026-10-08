import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as seed, type Page } from '@playwright/test';
import sharp from 'sharp';
import { signIn, STAFF_EMAIL } from './support/auth';
import {
  CONCEPT_CONTENT,
  CONDITIONS,
  SEED_FILE,
  SPECIFICATION,
  type CatalogSeed,
} from './support/discovery';

// Catálogo do Discovery semeado pela API do Admin (contrato real: origem, sessão AAL2, Idempotency-Key). Roda depois
// do projeto `setup`, que já cadastrou o TOTP do staff: aqui o staff só confirma o código — nenhum cadastro de MFA
// concorrente (NOTES §4). Um teste só, serial.
// Títulos e marcas exclusivos deste seed: os outros specs criam Concepts no mesmo banco, em paralelo.
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
  const concept = async (
    brandPartnerId: string,
    title: string,
    approve = true,
    collection: Record<string, unknown> = {},
  ) => {
    const version = await post('/v1/admin/concept-versions', {
      brand_partner_id: brandPartnerId,
      title,
      ...CONCEPT_CONTENT,
      specification: SPECIFICATION,
      ...collection,
    });
    if (approve) {
      await post(`/v1/admin/concept-versions/${version.id}/approve`, {
        approval_refs: ['Aprovação de teste E2E'],
      });
    }
    return { id: version.concept_id as string, title };
  };
  const edition = (conceptId: string, region: string, modality: string) =>
    post('/v1/admin/editions', {
      concept_id: conceptId,
      region,
      modality,
      commercial_conditions: CONDITIONS,
    });

  // Coleção (spec catalog §13.12): vocabulário, classificação e atributos — termos de teste.
  const term = async (kind: string, label: string) =>
    (await post('/v1/admin/catalog-terms', { kind, label })).id as string;
  const natureza = await term('lifestyle', 'Natureza');
  const bemEstar = await term('lifestyle', 'Bem-estar');
  const contemporaneo = await term('architectural_style', 'Contemporâneo');

  const solenne = await partner('Atelier Solenne', true);
  const withEdition = await concept(solenne, 'Casa Alpendre', true, {
    summary: 'Varandas largas e um pátio de sombra para temporadas longas em família.',
    guests_max: 10,
    suites: 5,
    built_area_m2: 520,
    lifestyle_ids: [natureza, bemEstar],
    architectural_style_ids: [contemporaneo],
  });
  const alpendre = await edition(withEdition.id, 'Litoral Sul da Bahia', 'owner_and_co_owner');
  const withoutEdition = await concept(solenne, 'Casa Mirante', true, {
    lifestyle_ids: [natureza],
    guests_max: 8,
  });
  const unapproved = await concept(solenne, 'Casa em Revisão', false);

  const neree = await partner('Maison Nérée', true);
  const coOwnerOnly = await concept(neree, 'Casa Varanda', true, {
    lifestyle_ids: [bemEstar],
    guests_max: 6,
  });
  const varanda = await edition(coOwnerOnly.id, 'Litoral Norte de São Paulo', 'co_owner');

  // Valores de referência (BR-031, TECH-033) e capa aprovada + pendente (ADR-0015).
  const value = (editionId: string, basis: string, amountMinor: number) =>
    post(`/v1/admin/editions/${editionId}/reference-values`, {
      basis,
      amount_minor: amountMinor,
      currency: 'BRL',
    });
  await value(alpendre.id, 'owner', 480_000_000);
  await value(alpendre.id, 'acao', 62_000_000);
  await value(varanda.id, 'acao', 48_000_000);
  const coverImage = await testCover();
  const cover = () =>
    post(`/v1/admin/concepts/${withEdition.id}/cover`, {
      image: coverImage,
      alt: 'Imagem de teste do E2E — um campo de cor, nenhuma casa',
      crop_x: 50,
      crop_y: 50,
    });
  const approvedCover = await cover();
  await post(`/v1/admin/concept-media/${approvedCover.id}/approve`, {});
  const pendingCover = await cover();
  await post(`/v1/admin/concepts/${withEdition.id}/curation`, { rank: 1, featured: true });

  const noExposure = await concept(await partner('Marca sem Exposição', false), 'Casa Reservada');

  const closing = await partner('Marca Encerrada', true);
  const terminated = await concept(closing, 'Casa Encerrada');
  await post(`/v1/admin/brand-partners/${closing}/terminate`, {
    terminated_effective_at: new Date(Date.now() - 60_000).toISOString(),
    termination_basis: 'Encerramento de teste',
  });

  const result: CatalogSeed = {
    withEdition: {
      ...withEdition,
      brandName: 'Atelier Solenne',
      brandPartnerId: solenne,
      region: 'Litoral Sul da Bahia',
    },
    withoutEdition,
    coOwnerOnly,
    hidden: [noExposure, terminated, unapproved],
    collection: { approvedCoverId: approvedCover.id, pendingCoverId: pendingCover.id },
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
