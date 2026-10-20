/** Rotas das telas do catálogo no Admin (`docs/specs/catalog.md` §5). */
export const STATUS_KEYS = [
  'registered',
  'terminated',
  'exposure',
  'approved',
  'revoked',
  'saved',
  'cover_approved',
  'withdrawn',
  'ended',
  'finalized',
  'published',
  'unpublished',
  'corrected',
  'media_approved',
] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

const withStatus = (path: string, status?: StatusKey) =>
  status === undefined ? path : `${path}?status=${status}`;

const ROOT = '/admin/catalogo';
const HOME_CONCEPTS = `${ROOT}/home-concepts`;
const HOME_EDITIONS = `${ROOT}/home-editions`;

export const paths = {
  catalog: ROOT,
  newBrandPartner: `${ROOT}/brand-partners/nova`,
  brandPartner: (id: string, status?: StatusKey) =>
    withStatus(`${ROOT}/brand-partners/${id}`, status),
  exposure: (id: string) => `${ROOT}/brand-partners/${id}/exposicao`,
  termination: (id: string) => `${ROOT}/brand-partners/${id}/encerramento`,
  newHomeConcept: (brandPartnerId: string) =>
    `${ROOT}/brand-partners/${brandPartnerId}/home-concepts/novo`,
  homeConcept: (id: string, status?: StatusKey) => withStatus(`${HOME_CONCEPTS}/${id}`, status),
  newVersion: (homeConceptId: string) => `${HOME_CONCEPTS}/${homeConceptId}/versoes/nova`,
  approval: (homeConceptId: string, versionId: string) =>
    `${HOME_CONCEPTS}/${homeConceptId}/versoes/${versionId}/aprovacao`,
  newHomeEdition: (homeConceptId: string) => `${HOME_CONCEPTS}/${homeConceptId}/home-editions/nova`,
  newAuthorization: (homeConceptId: string) =>
    `${HOME_CONCEPTS}/${homeConceptId}/autorizacoes-investor/nova`,
  revocation: (homeConceptId: string, authorizationId: string) =>
    `${HOME_CONCEPTS}/${homeConceptId}/autorizacoes-investor/${authorizationId}/revogacao`,
  // Home Edition (spec catalog §17.6).
  homeEdition: (id: string, status?: StatusKey) => withStatus(`${HOME_EDITIONS}/${id}`, status),
  editHomeEdition: (id: string) => `${HOME_EDITIONS}/${id}/edicao`,
  finalizeHomeEdition: (id: string) => `${HOME_EDITIONS}/${id}/finalizacao`,
  publishHomeEdition: (id: string) => `${HOME_EDITIONS}/${id}/publicacao`,
  withdrawHomeEdition: (id: string) => `${HOME_EDITIONS}/${id}/retirada`,
  correctHomeEdition: (id: string) => `${HOME_EDITIONS}/${id}/correcao-editorial`,
  newHomeEditionMedia: (homeEditionId: string) => `${HOME_EDITIONS}/${homeEditionId}/midia/nova`,
  homeEditionMedia: (homeEditionId: string, mediaId: string, status?: StatusKey) =>
    withStatus(`${HOME_EDITIONS}/${homeEditionId}/midia/${mediaId}`, status),
  newProjectedInvestment: (homeEditionId: string) =>
    `${HOME_EDITIONS}/${homeEditionId}/media-projetada/nova`,
  projectedInvestmentEnd: (homeEditionId: string, investmentId: string) =>
    `${HOME_EDITIONS}/${homeEditionId}/media-projetada/${investmentId}/encerramento`,
  newSecondHome: (homeEditionId: string) => `${HOME_EDITIONS}/${homeEditionId}/second-homes/nova`,
  secondHome: (id: string, status?: StatusKey) => withStatus(`${ROOT}/second-homes/${id}`, status),
  // Coleção (spec catalog §13.12).
  vocabulary: (status?: StatusKey) => withStatus(`${ROOT}/vocabularios`, status),
  term: (id: string) => `${ROOT}/vocabularios/${id}`,
  newCover: (homeConceptId: string) => `${HOME_CONCEPTS}/${homeConceptId}/capas/nova`,
  media: (homeConceptId: string, mediaId: string, status?: StatusKey) =>
    withStatus(`${HOME_CONCEPTS}/${homeConceptId}/capas/${mediaId}`, status),
  curation: (homeConceptId: string) => `${HOME_CONCEPTS}/${homeConceptId}/curadoria`,
} as const;

export function statusKey(value: string | string[] | undefined): StatusKey | null {
  return STATUS_KEYS.find((key) => key === value) ?? null;
}
