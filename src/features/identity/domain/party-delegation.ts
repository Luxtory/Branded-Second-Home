/**
 * `party_delegation` (`03` §3.1: usuário → party, escopo e vigência; spec identity §13.3, ADR-0020 §7). Regra central
 * (fundador, 2026-10-21): existência de usuário ≠ representação e convite enviado ≠ delegação ativa — só uma delegação
 * **ativa e vigente** representa a party.
 */
export const DELEGATION_STATES = ['pending', 'active', 'revoked'] as const;
export type DelegationState = (typeof DELEGATION_STATES)[number];

export interface PartyDelegation {
  readonly id: string;
  readonly partyId: string;
  readonly userId: string;
  readonly state: DelegationState;
  readonly validFrom: Date;
  /** Fim exclusivo, só se a delegação tiver termo final. */
  readonly validUntil: Date | null;
  readonly createdAt: Date;
  readonly activatedAt: Date | null;
  readonly revokedAt: Date | null;
}

/** Situação exibida: a expiração é derivada da vigência, nunca gravada. */
export type DelegationStatus = DelegationState | 'expired';

function hasEnded(delegation: PartyDelegation, at: Date): boolean {
  return delegation.validUntil !== null && delegation.validUntil.getTime() <= at.getTime();
}

function hasStarted(delegation: PartyDelegation, at: Date): boolean {
  return delegation.validFrom.getTime() <= at.getTime();
}

export function delegationStatus(delegation: PartyDelegation, at: Date): DelegationStatus {
  if (delegation.state === 'revoked') return 'revoked';
  return hasEnded(delegation, at) ? 'expired' : delegation.state;
}

/** Vigente no instante `at`: ativa, já iniciada e antes do fim (TECH-050). Só ela representa a party. */
export function isDelegationCurrent(delegation: PartyDelegation, at: Date): boolean {
  return delegation.state === 'active' && hasStarted(delegation, at) && !hasEnded(delegation, at);
}
