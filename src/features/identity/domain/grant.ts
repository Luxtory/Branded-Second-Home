/** Objeto sobre o qual a autorização vale (ex.: um Concept). */
export interface GrantScope {
  readonly type: string;
  readonly id: string;
}

/** `authorization_grant` (`03` §3.1): comandos explícitos, escopo, vigência [validFrom, validUntil) e revogação. */
export interface AuthorizationGrant {
  readonly id: string;
  readonly granteePartyId: string;
  readonly commands: readonly string[];
  readonly scope: GrantScope;
  readonly validFrom: Date;
  readonly validUntil: Date;
  readonly revokedAt: Date | null;
}

/** Vigente e não revogado no instante `at` (REQ-014). */
export function isGrantActive(grant: AuthorizationGrant, at: Date): boolean {
  return (
    grant.revokedAt === null &&
    grant.validFrom.getTime() <= at.getTime() &&
    at.getTime() < grant.validUntil.getTime()
  );
}

/** O grant autoriza `command` sobre `scope` no instante `at`: fora disso, a party não age (REQ-014). */
export function grantCovers(
  grant: AuthorizationGrant,
  command: string,
  scope: GrantScope,
  at: Date,
): boolean {
  return (
    isGrantActive(grant, at) &&
    grant.commands.includes(command) &&
    grant.scope.type === scope.type &&
    grant.scope.id === scope.id
  );
}
