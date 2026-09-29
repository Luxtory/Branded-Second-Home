import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as seed, type Page } from '@playwright/test';
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
  const concept = async (brandPartnerId: string, title: string, approve = true) => {
    const version = await post('/v1/admin/concept-versions', {
      brand_partner_id: brandPartnerId,
      title,
      ...CONCEPT_CONTENT,
      specification: SPECIFICATION,
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

  const solenne = await partner('Atelier Solenne', true);
  const withEdition = await concept(solenne, 'Casa do Pátio');
  await edition(withEdition.id, 'Litoral Sul da Bahia', 'owner_and_co_owner');
  const withoutEdition = await concept(solenne, 'Casa Mirante');
  const unapproved = await concept(solenne, 'Casa em Revisão', false);

  const neree = await partner('Maison Nérée', true);
  const coOwnerOnly = await concept(neree, 'Casa Varanda');
  await edition(coOwnerOnly.id, 'Litoral Norte de São Paulo', 'co_owner');

  const noExposure = await concept(await partner('Marca sem Exposição', false), 'Casa Reservada');

  const closing = await partner('Marca Encerrada', true);
  const terminated = await concept(closing, 'Casa Encerrada');
  await post(`/v1/admin/brand-partners/${closing}/terminate`, {
    terminated_effective_at: new Date(Date.now() - 60_000).toISOString(),
    termination_basis: 'Encerramento de teste',
  });

  const result: CatalogSeed = {
    withEdition: { ...withEdition, brandName: 'Atelier Solenne', region: 'Litoral Sul da Bahia' },
    withoutEdition,
    coOwnerOnly,
    hidden: [noExposure, terminated, unapproved],
  };
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(result, null, 2));
});

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
