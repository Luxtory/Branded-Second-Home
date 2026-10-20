import { describe, expect, it } from 'vitest';
import { CRITICAL_COMMANDS } from '@/features/platform/application/commands/registry';
import type { Actor, CommandSpec } from '@/features/platform';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import type { VerifiedSession } from '@/features/identity/domain/session';
import {
  grant,
  grantDirectory,
  PARTNER_OPERATION,
  PARTNER_USER,
  partnerActor,
  PARTY,
  SCOPE,
  STAFF_USER,
  staffActor,
  staffDirectory,
} from '../../../support/identity-fixtures';

const clock = { now: () => new Date('2026-09-15T00:00:00.000Z') };
const spec = (name: string): CommandSpec => {
  const found = CRITICAL_COMMANDS.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`no spec ${name}`);
  return found;
};
const ADMIN_SPEC = spec('formalize_acquisition');
const EITHER_SPEC = spec('publish_initial_prl');
const SUPER_SPEC = spec('change_published_prl');
const aal2 = (userId = STAFF_USER): VerifiedSession => ({ userId, assurance: 'aal2' });

const roles = {
  [STAFF_USER]: [{ id: 'role-admin', role: 'admin' as const }],
  super: [{ id: 'role-super', role: 'super_admin' as const }],
};

function guardFor(
  session: VerifiedSession | null,
  options: {
    staff?: Parameters<typeof staffDirectory>[0];
    grants?: Parameters<typeof grantDirectory>[0];
  } = {},
) {
  return createAuthorizationGuard({
    session,
    staff: staffDirectory(options.staff ?? roles),
    grants: grantDirectory(options.grants ?? []),
    clock,
  });
}

describe('guard de staff (TECH-050/051)', () => {
  it('[TECH-050] Admin com papel ativo e sessão AAL2 é autorizado com a base staff_role', async () => {
    await expect(
      guardFor(aal2()).authorize(ADMIN_SPEC, staffActor('admin'), {}, null),
    ).resolves.toEqual({
      allowed: true,
      authorizationRef: 'staff_role:role-admin',
    });
  });

  it('[TECH-050] Admin sem MFA (AAL1) é negado', async () => {
    const session: VerifiedSession = { userId: STAFF_USER, assurance: 'aal1' };

    await expect(
      guardFor(session).authorize(ADMIN_SPEC, staffActor('admin'), {}, null),
    ).resolves.toEqual({
      allowed: false,
    });
  });

  it('[TECH-050] papel inexistente ou revogado (fora dos papéis ativos) é negado', async () => {
    const guard = guardFor(aal2(), { staff: {} });

    await expect(guard.authorize(ADMIN_SPEC, staffActor('admin'), {}, null)).resolves.toEqual({
      allowed: false,
    });
  });

  it('[TECH-050] sem hierarquia: Super Admin não exerce autoridade de Admin, nem Admin a de Super Admin', async () => {
    const onlySuper = guardFor(aal2(), { staff: { [STAFF_USER]: roles.super } });

    await expect(
      onlySuper.authorize(ADMIN_SPEC, staffActor('super_admin'), {}, null),
    ).resolves.toEqual({
      allowed: false,
    });
    await expect(
      guardFor(aal2()).authorize(SUPER_SPEC, staffActor('admin'), {}, null),
    ).resolves.toEqual({
      allowed: false,
    });
    await expect(
      onlySuper.authorize(SUPER_SPEC, staffActor('super_admin'), {}, null),
    ).resolves.toEqual({
      allowed: true,
      authorizationRef: 'staff_role:role-super',
    });
  });

  it('[TECH-050] "Admin ou Super Admin" aceita qualquer um dos dois como papel exercido', async () => {
    const both = guardFor(aal2(), {
      staff: { [STAFF_USER]: [...roles[STAFF_USER], ...roles.super] },
    });

    await expect(both.authorize(EITHER_SPEC, staffActor('admin'), {}, null)).resolves.toMatchObject(
      {
        allowed: true,
        authorizationRef: 'staff_role:role-admin',
      },
    );
    await expect(
      both.authorize(EITHER_SPEC, staffActor('super_admin'), {}, null),
    ).resolves.toMatchObject({
      allowed: true,
      authorizationRef: 'staff_role:role-super',
    });
  });

  it('[TECH-050] papel exercido que o usuário não tem é negado mesmo com outro papel ativo', async () => {
    await expect(
      guardFor(aal2()).authorize(EITHER_SPEC, staffActor('super_admin'), {}, null),
    ).resolves.toEqual({
      allowed: false,
    });
  });

  it('[TECH-051] nega por padrão: sem sessão, sessão de outro usuário, ator de sistema, Titular', async () => {
    const system: Actor = { kind: 'system', job: 'outbox' };
    const titular: Actor = {
      kind: 'user',
      userId: STAFF_USER,
      actingPartyId: PARTY,
      role: 'titular',
    };

    await expect(
      guardFor(null).authorize(ADMIN_SPEC, staffActor('admin'), {}, null),
    ).resolves.toEqual({
      allowed: false,
    });
    await expect(
      guardFor(aal2(PARTNER_USER)).authorize(ADMIN_SPEC, staffActor('admin'), {}, null),
    ).resolves.toEqual({ allowed: false });
    await expect(guardFor(aal2()).authorize(ADMIN_SPEC, system, {}, null)).resolves.toEqual({
      allowed: false,
    });
    await expect(
      guardFor(aal2()).authorize(spec('create_own_use_booking'), titular, {}, null),
    ).resolves.toEqual({ allowed: false });
  });
});

describe('guard de parceiros por authorization_grant (REQ-014)', () => {
  const session = { userId: PARTNER_USER, assurance: 'aal1' } as const;

  it('[REQ-014] grant vigente com o command e o escopo autoriza, com a base authorization_grant', async () => {
    const guard = guardFor(session, { grants: [grant()] });

    await expect(guard.authorize(PARTNER_OPERATION, partnerActor(), {}, SCOPE)).resolves.toEqual({
      allowed: true,
      authorizationRef: `authorization_grant:${grant().id}`,
    });
  });

  it.each([
    ['sem grant', []],
    ['grant de outro command', [grant({ commands: ['other_operation'] })]],
    ['grant de outro escopo', [grant({ scope: { type: 'home_concept', id: 'home-concept-2' } })]],
    ['grant ainda não vigente', [grant({ validFrom: new Date('2026-09-20T00:00:00.000Z') })]],
    ['grant vencido', [grant({ validUntil: new Date('2026-09-15T00:00:00.000Z') })]],
    ['grant revogado', [grant({ revokedAt: new Date('2026-09-10T00:00:00.000Z') })]],
  ])('[REQ-014] quem não tem grant válido é negado: %s', async (_case, grants) => {
    await expect(
      guardFor(session, { grants }).authorize(PARTNER_OPERATION, partnerActor(), {}, SCOPE),
    ).resolves.toEqual({ allowed: false });
  });

  it('[REQ-014] existir no modelo não concede acesso: sem party, sem escopo ou sem papel grantee → negado', async () => {
    const guard = guardFor(session, { grants: [grant()] });
    const notGrantee: Actor = {
      kind: 'user',
      userId: PARTNER_USER,
      actingPartyId: PARTY,
      role: 'titular',
    };

    await expect(
      guard.authorize(PARTNER_OPERATION, partnerActor(null), {}, SCOPE),
    ).resolves.toEqual({
      allowed: false,
    });
    await expect(guard.authorize(PARTNER_OPERATION, partnerActor(), {}, null)).resolves.toEqual({
      allowed: false,
    });
    await expect(guard.authorize(PARTNER_OPERATION, notGrantee, {}, SCOPE)).resolves.toEqual({
      allowed: false,
    });
  });

  it('[REQ-014] grant não amplia autoridade de staff: parceiro não executa command de Admin', async () => {
    const guard = guardFor(session, { grants: [grant({ commands: [ADMIN_SPEC.name] })] });

    await expect(guard.authorize(ADMIN_SPEC, partnerActor(), {}, SCOPE)).resolves.toEqual({
      allowed: false,
    });
  });
});
