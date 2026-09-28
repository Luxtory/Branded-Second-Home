/** Rotas das telas do catálogo no Admin (`docs/specs/catalog.md` §5). */
export type StatusKey = 'registered' | 'terminated';

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
} as const;

export function statusKey(value: string | string[] | undefined): StatusKey | null {
  return value === 'registered' || value === 'terminated' ? value : null;
}
