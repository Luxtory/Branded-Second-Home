import type { Actor, CommandSpec } from '@/features/platform';
import {
  CommandRegistry,
  CRITICAL_COMMANDS,
} from '@/features/platform/application/commands/registry';
import type { GrantDirectory, StaffDirectory } from '@/features/identity/application/ports';
import type { AuthorizationGrant } from '@/features/identity/domain/grant';
import type { StaffRoleRecord } from '@/features/identity/domain/staff';

export const STAFF_USER = '00000000-0000-4000-8000-0000000000b1';
export const PARTNER_USER = '00000000-0000-4000-8000-0000000000b2';
export const PARTY = '00000000-0000-4000-8000-0000000000c1';
export const SCOPE = { type: 'concept', id: 'concept-1' } as const;

/** Operação concedível só de teste: na W2 o registro de produção não tem nenhuma (D-W2-1). */
export const PARTNER_OPERATION: CommandSpec = {
  name: 'test_partner_operation',
  module: 'catalog',
  authority: 'grantee',
  membership: 'not_applicable',
  critical: false,
};

export const PARTNER_REGISTRY = new CommandRegistry([
  ...CRITICAL_COMMANDS,
  {
    name: 'grant_authorization',
    module: 'identity',
    authority: 'admin',
    membership: 'not_applicable',
    critical: false,
  },
  PARTNER_OPERATION,
]);

export const staffActor = (role: 'admin' | 'super_admin', userId = STAFF_USER): Actor => ({
  kind: 'user',
  userId,
  actingPartyId: null,
  role,
});

export const partnerActor = (partyId: string | null = PARTY): Actor => ({
  kind: 'user',
  userId: PARTNER_USER,
  actingPartyId: partyId,
  role: 'grantee',
});

export function staffDirectory(
  records: Record<string, readonly StaffRoleRecord[]>,
): StaffDirectory {
  return { activeRoles: (userId) => Promise.resolve(records[userId] ?? []) };
}

/** Diretório em memória que devolve todos os grants da party (o filtro de vigência é do domínio/guard). */
export function grantDirectory(grants: readonly AuthorizationGrant[]): GrantDirectory {
  return {
    activeGrants: (partyId, command) =>
      Promise.resolve(
        grants.filter(
          (grant) => grant.granteePartyId === partyId && grant.commands.includes(command),
        ),
      ),
  };
}

export function grant(overrides: Partial<AuthorizationGrant> = {}): AuthorizationGrant {
  return {
    id: '00000000-0000-4000-8000-0000000000d1',
    granteePartyId: PARTY,
    commands: [PARTNER_OPERATION.name],
    scope: SCOPE,
    validFrom: new Date('2026-09-01T00:00:00.000Z'),
    validUntil: new Date('2026-10-01T00:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}
