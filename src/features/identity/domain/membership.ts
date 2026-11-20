/**
 * Membership da party (W15; `02` PD-001, REQ-050; `03` TECH-050, TECH-055; ADR-0031): um por CPF/CNPJ, condição da party
 * e nunca papel. Sem plano, preço, benefício, prazo ou cobrança.
 */
export const MEMBERSHIP_STATES = ['active', 'suspended', 'ended'] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/** Evento da mudança de estado (AsyncAPI `identity.membership_state_changed`; REQ-097). */
export const MEMBERSHIP_STATE_CHANGED = 'identity.membership_state_changed';

/** Mudança sobre um Membership existente; a criação (∅ → active) é a ativação. */
export type MembershipChange = 'suspend' | 'reactivate' | 'end';

/** TECH-055: `active ↔ suspended`, `active|suspended → ended`, `ended → active`. */
const TRANSITIONS: Readonly<
  Record<
    MembershipChange,
    { readonly from: readonly MembershipState[]; readonly to: MembershipState }
  >
> = {
  suspend: { from: ['active'], to: 'suspended' },
  reactivate: { from: ['suspended', 'ended'], to: 'active' },
  end: { from: ['active', 'suspended'], to: 'ended' },
};

/** Estado de destino da mudança a partir do estado atual, ou `null` quando a TECH-055 não admite a transição. */
export function membershipTransition(
  from: MembershipState,
  change: MembershipChange,
): MembershipState | null {
  const rule = TRANSITIONS[change];
  return rule.from.includes(from) ? rule.to : null;
}

/**
 * Elegível = `active` (TECH-050). Restrições aplicáveis ao mecanismo (inadimplência, conformidade) entram nas suas waves;
 * sem Membership, não elegível.
 */
export function isMembershipEligible(state: MembershipState | null): boolean {
  return state === 'active';
}
