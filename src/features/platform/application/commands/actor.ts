import type { JobName } from '../jobs/names';

/** Papel de um usuário no command (TECH-051); parceiros agem por `authorization_grant` (`grantee`). */
export type UserRole = 'titular' | 'admin' | 'super_admin' | 'grantee';
export type ActorRole = UserRole | 'system';

/** Quem executa: um usuário autenticado (resolvido pelo guard, W2) ou um job do TECH-090 (ADR-006 do `03`). */
export type Actor =
  | {
      readonly kind: 'user';
      readonly userId: string;
      readonly actingPartyId: string | null;
      readonly role: UserRole;
    }
  | { readonly kind: 'system'; readonly job: JobName };

export function actorRole(actor: Actor): ActorRole {
  return actor.kind === 'user' ? actor.role : 'system';
}

/** Escopo da chave de idempotência: "mesma key + ator" (ADR-006 do `03`). */
export function idempotencyScope(actor: Actor): string {
  return actor.kind === 'user' ? `user:${actor.userId}` : `system:${actor.job}`;
}
