import { z } from 'zod';
import type { CommandHandler, CommandRegistry } from '@/features/platform';
import { isStaffRole } from '../domain/staff';
import type { GrantWriter } from './ports';

const NAME = /^[a-z][a-z0-9_]*$/;
const MAX_COMMANDS = 64;
const MAX_TEXT = 255;
const MAX_SCOPE_TYPE = 64;

/**
 * Corpo de `POST /v1/admin/authorization-grants` (OpenAPI `AuthorizationGrantRequest`). `commands` só aceita operações
 * concedíveis do registro (autoridade `grantee`, REQ-014) — nenhuma existe na W2, então todo pedido é recusado.
 */
export function grantAuthorizationInput(registry: CommandRegistry) {
  const grantable = new Set(registry.grantable().map((spec) => spec.name));
  return z
    .strictObject({
      grantee_party_id: z.uuid(),
      commands: z
        .array(z.string().regex(NAME))
        .min(1)
        .max(MAX_COMMANDS)
        .refine((names) => new Set(names).size === names.length, 'duplicated command')
        .refine((names) => names.every((name) => grantable.has(name)), 'command not grantable'),
      scope: z.strictObject({
        type: z.string().regex(NAME).max(MAX_SCOPE_TYPE),
        id: z.string().min(1).max(MAX_TEXT),
      }),
      valid_from: z.iso.datetime({ offset: true }),
      valid_until: z.iso.datetime({ offset: true }),
      basis: z.string().min(1).max(MAX_TEXT),
    })
    .refine((input) => Date.parse(input.valid_until) > Date.parse(input.valid_from), {
      message: 'valid_until must be after valid_from',
      path: ['valid_until'],
    });
}

export type GrantAuthorizationInput = z.infer<ReturnType<typeof grantAuthorizationInput>>;

/** Resposta (OpenAPI `AuthorizationGrant`). */
export interface GrantAuthorizationResult {
  readonly [field: string]:
    string | readonly string[] | { readonly type: string; readonly id: string };
  readonly id: string;
  readonly grantee_party_id: string;
  readonly commands: readonly string[];
  readonly scope: { readonly type: string; readonly id: string };
  readonly valid_from: string;
  readonly valid_until: string;
  readonly basis: string;
  readonly granted_by_user_id: string;
  readonly granted_role: string;
  readonly operation_id: string;
  readonly created_at: string;
}

export interface GrantAuthorizationDependencies<Tx> {
  readonly registry: CommandRegistry;
  readonly grants: GrantWriter<Tx>;
  readonly newId: () => string;
}

/** Operação não crítica `grant_authorization` (REQ-095): o guard já exigiu Admin com MFA; aqui grava e audita. */
export function createGrantAuthorizationHandler<Tx>(
  deps: GrantAuthorizationDependencies<Tx>,
): CommandHandler<GrantAuthorizationInput, GrantAuthorizationResult, Tx> {
  return {
    command: 'grant_authorization',
    input: grantAuthorizationInput(deps.registry),
    async execute({ input, actor, operationId, now, tx, audit }) {
      if (actor.kind !== 'user' || !isStaffRole(actor.role)) {
        throw new Error('grant_authorization reached the handler without a staff actor');
      }
      const grant = {
        id: deps.newId(),
        granteePartyId: input.grantee_party_id,
        commands: input.commands,
        scope: input.scope,
        validFrom: new Date(input.valid_from),
        validUntil: new Date(input.valid_until),
        revokedAt: null,
        basis: input.basis,
        grantedByUserId: actor.userId,
        grantedRole: actor.role,
        operationId,
        createdAt: now,
      };
      await deps.grants.insert(tx, grant);
      const result: GrantAuthorizationResult = {
        id: grant.id,
        grantee_party_id: grant.granteePartyId,
        commands: [...grant.commands],
        scope: { type: grant.scope.type, id: grant.scope.id },
        valid_from: grant.validFrom.toISOString(),
        valid_until: grant.validUntil.toISOString(),
        basis: grant.basis,
        granted_by_user_id: grant.grantedByUserId,
        granted_role: grant.grantedRole,
        operation_id: operationId,
        created_at: now.toISOString(),
      };
      audit({ objectType: 'authorization_grant', objectId: grant.id, before: null, after: result });
      return result;
    },
  };
}
