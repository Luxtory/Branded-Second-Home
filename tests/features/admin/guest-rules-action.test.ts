import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => vi.fn());
const getDatabase = vi.hoisted(() => vi.fn());
vi.mock('@/features/identity', () => ({
  executeAdminCommand: execute,
  getStaffAccess: access,
  // Mesmo critério do identity: o papel pedido precisa estar entre as atribuições ativas.
  exercisedRole: (granted: { records: { role: string }[] }, role: string) =>
    granted.records.some((record) => record.role === role)
      ? { role, authorizationRef: 'staff_role:test' }
      : null,
  assertTransactionalAdminAuthority: vi.fn(),
}));
vi.mock('@/features/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/platform')>()),
  getDatabase,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { setGuestRulesAction } from '@/features/admin/presentation/guest-rules-action';

const initial = { key: 'key', values: {}, fieldErrors: {}, rejection: null };
const form = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    second_home_id: randomUUID(),
    value: 'Regras de convidados (texto de teste)',
    effective_from: '',
    effective_to: '',
    basis: 'Ata sintética W14',
  }))
    data.set(key, value);
  return data;
};
const granted = (roles: string[]) => ({
  kind: 'granted',
  userId: randomUUID(),
  roles,
  records: roles.map((role) => ({ role })),
});

beforeEach(() => {
  execute.mockReset();
  access.mockReset();
  getDatabase.mockReset();
  getDatabase.mockReturnValue({
    selectFrom: () => ({
      select: () => ({
        where: () => ({ executeTakeFirst: async () => ({ timezone: 'America/Sao_Paulo' }) }),
      }),
    }),
  });
});

describe('W14 — Server Action das regras de convidados: autoriza antes de ler [REQ-095][TECH-051]', () => {
  it('[TECH-051] sem sessão Admin válida, nenhuma leitura do banco e nenhum command', async () => {
    access.mockResolvedValue({ kind: 'anonymous' });
    await expect(setGuestRulesAction(initial, form())).rejects.toThrow('redirect:/entrar');
    access.mockResolvedValue({ kind: 'mfa_required' });
    await expect(setGuestRulesAction(initial, form())).rejects.toThrow('redirect:/entrar/mfa');
    access.mockResolvedValue({ kind: 'unavailable' });
    expect((await setGuestRulesAction(initial, form())).rejection).toBe('unavailable');
    access.mockResolvedValue({ kind: 'forbidden' });
    expect((await setGuestRulesAction(initial, form())).rejection).toBe('permission');
    access.mockResolvedValue(granted(['super_admin']));
    expect((await setGuestRulesAction(initial, form())).rejection).toBe('permission');
    expect(getDatabase).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('[REQ-095] com o papel Admin exercido, lê o fuso da Second Home e só então executa o command', async () => {
    access.mockResolvedValue(granted(['admin']));
    execute.mockResolvedValue({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
      operationId: 'op',
      replayed: false,
    });
    const state = await setGuestRulesAction(initial, form());
    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(state.rejection).toBe('vigency');
  });
});
