import { describe, expect, it } from 'vitest';
import type { Actor } from '@/features/platform/application/commands/actor';
import { commandRegistry } from '@/features/platform/application/commands/registry';
import { systemCommandGuard } from '@/features/platform/application/commands/system-guard';

const openExercise = commandRegistry.get('open_exercise')!;
const formalize = commandRegistry.get('formalize_acquisition')!;
const admin: Actor = {
  kind: 'user',
  userId: '00000000-0000-4000-8000-000000000001',
  actingPartyId: null,
  role: 'admin',
};

describe('guard dos commands de sistema (W10, ADR-0024)', () => {
  it('[TECH-090] só o job dono executa o command de sistema, com a referência do job', async () => {
    await expect(
      systemCommandGuard.authorize(
        openExercise,
        { kind: 'system', job: 'open_exercise' },
        {},
        null,
      ),
    ).resolves.toEqual({ allowed: true, authorizationRef: 'job:open_exercise' });
  });

  it('[TECH-090] outro job, usuário ou command de usuário são negados por padrão', async () => {
    await expect(
      systemCommandGuard.authorize(openExercise, { kind: 'system', job: 'outbox' }, {}, null),
    ).resolves.toEqual({ allowed: false });
    await expect(systemCommandGuard.authorize(openExercise, admin, {}, null)).resolves.toEqual({
      allowed: false,
    });
    await expect(
      systemCommandGuard.authorize(formalize, { kind: 'system', job: 'open_exercise' }, {}, null),
    ).resolves.toEqual({ allowed: false });
  });
});
