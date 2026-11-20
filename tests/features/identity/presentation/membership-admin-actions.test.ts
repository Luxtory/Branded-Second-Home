import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/features/identity/presentation/admin-command', () => ({ executeAdminCommand: execute }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { changeMembershipAction } from '@/features/identity/presentation/membership-admin-actions';

const initial = {
  key: 'key-1',
  values: {},
  fieldErrors: {},
  rejection: null,
  step: 'edit' as const,
};
const PARTY = randomUUID();

const form = (action: string, basis = 'Decisão registrada da Luxtory W15') => {
  const data = new FormData();
  data.set('party_id', PARTY);
  data.set('action', action);
  data.set('basis', basis);
  return data;
};

beforeEach(() => {
  execute.mockReset();
});

describe('Server Action da mudança do Membership (W15)', () => {
  it('[REQ-095] só as quatro ações próprias; herdadas do protótipo ou desconhecidas são recusadas sem command', async () => {
    for (const action of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
      'valueOf',
      '',
      'delete',
      'Activate',
    ]) {
      const state = await changeMembershipAction(initial, form(action));
      expect(state, action).toMatchObject({ rejection: 'unexpected', key: 'key-1' });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('[REQ-095][TECH-055] as quatro ações válidas executam o handler da sua operação e voltam ao detalhe com o aviso', async () => {
    for (const action of ['activate', 'suspend', 'reactivate', 'end']) {
      execute.mockResolvedValueOnce({
        status: 'committed',
        operationId: randomUUID(),
        result: {},
        replayed: false,
      });
      await expect(changeMembershipAction(initial, form(action))).rejects.toThrow(
        `redirect:/admin/pessoas-e-empresas/${PARTY}?status=membership_${action}`,
      );
      const [command, input, key] = execute.mock.calls.at(-1)!;
      expect(command).toMatchObject({
        role: 'admin',
        handler: { command: `${action}_membership` },
      });
      expect(input).toEqual({ party_id: PARTY, basis: 'Decisão registrada da Luxtory W15' });
      expect(key).toBe('key-1');
    }
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('[TECH-051] base inválida não chega ao command; recusa gravada troca a chave do próximo envio', async () => {
    expect(
      await changeMembershipAction(initial, form('suspend', 'contato@exemplo.test')),
    ).toMatchObject({
      rejection: 'invalid',
    });
    expect(execute).not.toHaveBeenCalled();
    execute.mockResolvedValueOnce({
      status: 'rejected',
      operationId: randomUUID(),
      code: 'ERR_STATE_TRANSITION',
    });
    const state = await changeMembershipAction(initial, form('suspend'));
    expect(state).toMatchObject({ rejection: 'state' });
    expect(state.key).not.toBe('key-1');
  });
});
