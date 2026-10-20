import { expect, test } from '@playwright/test';
import { readSeed } from './support/discovery';

// Capa pública da Coleção (ADR-0015, OpenAPI `getHomeConceptCover`): só a aprovada de Home Concept público, WebP, revalidada a
// cada uso; o resto é 404 sem motivo.
test('[REQ-020] capa aprovada é entregue pelo próprio domínio; pendente e id inválido → 404', async ({
  request,
}) => {
  const { collection } = readSeed();
  const approved = await request.get(
    `/media/home-concept-covers/${collection.approvedCoverId}/480`,
  );
  expect(approved.status()).toBe(200);
  expect(approved.headers()['content-type']).toBe('image/webp');
  expect(approved.headers()['cache-control']).toBe('public, no-cache');
  const etag = approved.headers()['etag'] ?? '';
  expect(etag).toBe(`"${collection.approvedCoverId}-480"`);
  const revalidated = await request.get(
    `/media/home-concept-covers/${collection.approvedCoverId}/480`,
    {
      headers: { 'if-none-match': etag },
    },
  );
  expect(revalidated.status()).toBe(304);
  for (const path of [
    `/media/home-concept-covers/${collection.pendingCoverId}/800`,
    `/media/home-concept-covers/${collection.approvedCoverId}/481`,
    '/media/home-concept-covers/nao-e-uuid/480',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
