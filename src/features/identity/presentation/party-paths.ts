/** Caminhos das telas de partes (Admin) e da Área do Titular. Ids sempre de registros já lidos. */
export type PartyStatus = 'registered' | 'invited' | 'revoked';

const withStatus = (path: string, status?: PartyStatus) =>
  status === undefined ? path : `${path}?status=${status}`;

export const partyPaths = {
  list: '/admin/partes',
  newParty: '/admin/partes/nova',
  party: (id: string, status?: PartyStatus) => withStatus(`/admin/partes/${id}`, status),
  document: (id: string) => `/admin/partes/${id}/documento`,
  invite: (id: string) => `/admin/partes/${id}/representantes/novo`,
  revoke: (id: string, delegationId: string) =>
    `/admin/partes/${id}/representantes/${delegationId}/revogacao`,
};

export const titularPaths = {
  area: '/titular',
  activated: '/titular?status=activated',
  login: '/titular/entrar',
  activate: '/titular/ativar',
  representation: (partyId: string) => `/titular/partes/${partyId}`,
};

const STATUSES: readonly PartyStatus[] = ['registered', 'invited', 'revoked'];

/** `?status=` da confirmação (PRG); qualquer outro valor é ignorado. */
export function partyStatusOf(value: string | string[] | undefined): PartyStatus | null {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
    ? (value as PartyStatus)
    : null;
}
