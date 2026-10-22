/** Caminhos das telas de partes (Admin) e da Área do Titular. Ids sempre de registros já lidos. */
export type PartyStatus = 'registered' | 'invited' | 'revoked';

const withStatus = (path: string, status?: PartyStatus) =>
  status === undefined ? path : `${path}?status=${status}`;

export const partyPaths = {
  list: '/admin/pessoas-e-empresas',
  newParty: '/admin/pessoas-e-empresas/nova',
  party: (id: string, status?: PartyStatus) =>
    withStatus(`/admin/pessoas-e-empresas/${id}`, status),
  document: (id: string) => `/admin/pessoas-e-empresas/${id}/documento`,
  invite: (id: string) => `/admin/pessoas-e-empresas/${id}/representantes/novo`,
  revoke: (id: string, delegationId: string) =>
    `/admin/pessoas-e-empresas/${id}/representantes/${delegationId}/revogacao`,
};

export const titularPaths = {
  area: '/titular',
  activated: '/titular?status=activated',
  login: '/titular/entrar',
  activate: '/titular/ativar',
  representation: (partyId: string) => `/titular/representacoes/${partyId}`,
};

const STATUSES: readonly PartyStatus[] = ['registered', 'invited', 'revoked'];

/** `?status=` da confirmação (PRG); qualquer outro valor é ignorado. */
export function partyStatusOf(value: string | string[] | undefined): PartyStatus | null {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
    ? (value as PartyStatus)
    : null;
}
