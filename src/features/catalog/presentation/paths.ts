/** Rotas das telas do catálogo no Admin (`docs/specs/catalog.md` §5). */
export const STATUS_KEYS = ['registered', 'terminated', 'exposure', 'approved', 'revoked'] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

const withStatus = (path: string, status?: StatusKey) =>
  status === undefined ? path : `${path}?status=${status}`;

const ROOT = '/admin/catalogo';

export const paths = {
  catalog: ROOT,
  newBrandPartner: `${ROOT}/brand-partners/nova`,
  brandPartner: (id: string, status?: StatusKey) =>
    withStatus(`${ROOT}/brand-partners/${id}`, status),
  exposure: (id: string) => `${ROOT}/brand-partners/${id}/exposicao`,
  termination: (id: string) => `${ROOT}/brand-partners/${id}/encerramento`,
  newConcept: (brandPartnerId: string) => `${ROOT}/brand-partners/${brandPartnerId}/concepts/novo`,
  concept: (id: string, status?: StatusKey) => withStatus(`${ROOT}/concepts/${id}`, status),
  newVersion: (conceptId: string) => `${ROOT}/concepts/${conceptId}/versoes/nova`,
  approval: (conceptId: string, versionId: string) =>
    `${ROOT}/concepts/${conceptId}/versoes/${versionId}/aprovacao`,
  newEdition: (conceptId: string) => `${ROOT}/concepts/${conceptId}/editions/nova`,
  newAuthorization: (conceptId: string) =>
    `${ROOT}/concepts/${conceptId}/autorizacoes-investor/nova`,
  revocation: (conceptId: string, authorizationId: string) =>
    `${ROOT}/concepts/${conceptId}/autorizacoes-investor/${authorizationId}/revogacao`,
  edition: (id: string, status?: StatusKey) => withStatus(`${ROOT}/editions/${id}`, status),
  newResidence: (editionId: string) => `${ROOT}/editions/${editionId}/residences/nova`,
  residence: (id: string, status?: StatusKey) => withStatus(`${ROOT}/residences/${id}`, status),
} as const;

export function statusKey(value: string | string[] | undefined): StatusKey | null {
  return STATUS_KEYS.find((key) => key === value) ?? null;
}
