/** Caminhos das telas de pessoas e empresas (Admin) e da Área do Titular. Ids sempre de registros já lidos. */
export type PartyStatus =
  | 'registered'
  | 'invited'
  | 'revoked'
  | 'membership_activate'
  | 'membership_suspend'
  | 'membership_reactivate'
  | 'membership_end';

/** Mudanças do Membership (W15) e o trecho do caminho da confirmação de cada uma. */
export type MembershipAction = 'activate' | 'suspend' | 'reactivate' | 'end';
const MEMBERSHIP_SLUGS: Readonly<Record<MembershipAction, string>> = {
  activate: 'ativar',
  suspend: 'suspender',
  reactivate: 'reativar',
  end: 'encerrar',
};

/** Trecho do caminho → mudança; qualquer outro valor → `null` (404). */
export function membershipActionOf(slug: string): MembershipAction | null {
  const found = (Object.entries(MEMBERSHIP_SLUGS) as [MembershipAction, string][]).find(
    ([, value]) => value === slug,
  );
  return found?.[0] ?? null;
}

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
  membership: (id: string, action: MembershipAction) =>
    `/admin/pessoas-e-empresas/${id}/membership/${MEMBERSHIP_SLUGS[action]}`,
};

export const titularPaths = {
  area: '/titular',
  activated: '/titular?status=activated',
  login: '/titular/entrar',
  activate: '/titular/ativar',
  representation: (partyId: string) => `/titular/representacoes/${partyId}`,
};

const STATUSES: readonly PartyStatus[] = [
  'registered',
  'invited',
  'revoked',
  'membership_activate',
  'membership_suspend',
  'membership_reactivate',
  'membership_end',
];

/** `?status=` da confirmação (PRG); qualquer outro valor é ignorado. */
export function partyStatusOf(value: string | string[] | undefined): PartyStatus | null {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
    ? (value as PartyStatus)
    : null;
}
