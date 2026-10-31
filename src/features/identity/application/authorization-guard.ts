import type {
  Actor,
  AuthorizationDecision,
  Authority,
  Clock,
  CommandGuard,
  CommandScope,
  CommandSpec,
} from '@/features/platform';
import { grantCovers } from '../domain/grant';
import type { VerifiedSession } from '../domain/session';
import { isStaffRole, type StaffRole } from '../domain/staff';
import type { DelegationDirectory, HoldingDirectory } from './party-ports';
import type { GrantDirectory, StaffDirectory } from './ports';

export interface GuardDependencies {
  /** Sessão verificada deste request; `null` = anônimo. */
  readonly session: VerifiedSession | null;
  readonly staff: StaffDirectory;
  readonly grants: GrantDirectory;
  /** Delegações usuário → party (W7), lidas a cada decisão. */
  readonly delegations: DelegationDirectory;
  /** Holdings da party representada (W12); ausente = nenhum command do Titular é autorizado. */
  readonly holdings?: HoldingDirectory;
  readonly clock: Clock;
}

/** Papéis que cada autoridade de staff do TECH-051 aceita como papel exercido — sem hierarquia (ADR-0008). */
const STAFF_AUTHORITIES: Partial<Record<Authority, readonly StaffRole[]>> = {
  admin: ['admin'],
  admin_or_super_admin: ['admin', 'super_admin'],
  super_admin: ['super_admin'],
};

const DENY: AuthorizationDecision = { allowed: false };

/**
 * Guard do TECH-050/051, que nega por padrão: staff com sessão AAL2 e papel ativo aceito pela autoridade; parceiro
 * só com delegação vigente para a party representada **e** `authorization_grant` vigente que liste o command e cubra o
 * escopo (cadeia `user → party_delegation → party → authorization_grant`, REQ-014); convidado só sobre a própria
 * delegação (ativação, W7); Titular só com delegação vigente para a party representada **e** holding vigente dela na
 * Second Home do command (W12). Sistema (jobs, W10+) tem guard próprio no platform.
 */
export function createAuthorizationGuard(deps: GuardDependencies): CommandGuard {
  return {
    authorize: (spec, actor, _input, scope) => authorize(deps, spec, actor, scope),
  };
}

async function authorize(
  deps: GuardDependencies,
  spec: CommandSpec,
  actor: Actor,
  scope: CommandScope | null,
): Promise<AuthorizationDecision> {
  const { session } = deps;
  if (actor.kind !== 'user' || session === null || session.userId !== actor.userId) return DENY;
  const accepted = STAFF_AUTHORITIES[spec.authority];
  if (accepted !== undefined) return authorizeStaff(deps, session, accepted, actor);
  if (spec.authority === 'grantee') return authorizeGrantee(deps, spec, actor, scope);
  if (spec.authority === 'invitee') return authorizeInvitee(deps, actor, scope);
  if (spec.authority === 'titular') return authorizeTitular(deps, actor, scope);
  return DENY;
}

/**
 * Command do Titular (TECH-050, TECH-051; W12): `user → party_delegation → party → holding`, tudo vigente no instante. O
 * Membership não entra (uso próprio independe dele). A decisão é revalidada dentro da transação (ADR-0021, ADR-0026).
 */
async function authorizeTitular(
  deps: GuardDependencies,
  actor: Extract<Actor, { kind: 'user' }>,
  scope: CommandScope | null,
): Promise<AuthorizationDecision> {
  if (actor.role !== 'titular' || actor.actingPartyId === null || deps.holdings === undefined)
    return DENY;
  if (scope === null || scope.type !== 'second_home') return DENY;
  const now = deps.clock.now();
  const delegation = await deps.delegations.currentDelegation(
    actor.userId,
    actor.actingPartyId,
    now,
  );
  if (delegation === null) return DENY;
  const holding = await deps.holdings.currentHolding(actor.actingPartyId, scope.id, now);
  return holding === null ? DENY : { allowed: true, authorizationRef: `holding:${holding.id}` };
}

async function authorizeStaff(
  deps: GuardDependencies,
  session: VerifiedSession,
  accepted: readonly StaffRole[],
  actor: Extract<Actor, { kind: 'user' }>,
): Promise<AuthorizationDecision> {
  // TECH-050: Admin e Super Admin exigem MFA.
  if (session.assurance !== 'aal2') return DENY;
  const role = actor.role;
  if (!isStaffRole(role) || !accepted.includes(role)) return DENY;
  const active = await deps.staff.activeRoles(actor.userId, deps.clock.now());
  const record = active.find((candidate) => candidate.role === role);
  return record === undefined
    ? DENY
    : { allowed: true, authorizationRef: `staff_role:${record.id}` };
}

async function authorizeGrantee(
  deps: GuardDependencies,
  spec: CommandSpec,
  actor: Extract<Actor, { kind: 'user' }>,
  scope: CommandScope | null,
): Promise<AuthorizationDecision> {
  if (actor.role !== 'grantee' || actor.actingPartyId === null || scope === null) return DENY;
  const now = deps.clock.now();
  // TECH-050: sem delegação vigente o usuário não representa a party — o grant dela não vale para ele.
  const delegation = await deps.delegations.currentDelegation(
    actor.userId,
    actor.actingPartyId,
    now,
  );
  if (delegation === null) return DENY;
  const grants = await deps.grants.activeGrants(actor.actingPartyId, spec.name, now);
  const grant = grants.find((candidate) => grantCovers(candidate, spec.name, scope, now));
  return grant === undefined
    ? DENY
    : { allowed: true, authorizationRef: `authorization_grant:${grant.id}` };
}

/**
 * Ativação da delegação pendente (spec identity §13.4): só o próprio usuário, com sessão verificada, sobre a delegação
 * dele. Inexistente e de outro usuário respondem igual. O estado (pendente, não expirada) é revalidado no handler.
 */
async function authorizeInvitee(
  deps: GuardDependencies,
  actor: Extract<Actor, { kind: 'user' }>,
  scope: CommandScope | null,
): Promise<AuthorizationDecision> {
  if (actor.role !== 'titular' || actor.actingPartyId !== null) return DENY;
  if (scope === null || scope.type !== 'party_delegation') return DENY;
  const delegation = await deps.delegations.delegation(scope.id);
  return delegation === null || delegation.userId !== actor.userId
    ? DENY
    : { allowed: true, authorizationRef: `party_delegation:${delegation.id}` };
}
