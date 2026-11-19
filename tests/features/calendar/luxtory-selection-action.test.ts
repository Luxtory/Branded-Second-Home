import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/features/identity', () => ({
  executeAdminCommand: execute,
  assertTransactionalAdminAuthority: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { selectLuxtoryCapacityAction } from '@/features/calendar/presentation/luxtory-selection-action';

const home = randomUUID();
const initial = { key: 'key', values: {}, fieldErrors: {}, rejection: null };
const form = (first: string, last: string) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    second_home_id: home,
    first,
    last,
    purpose: 'maintenance',
    basis: 'Ata sintética W14',
    confirm: 'on',
  }))
    data.set(key, value);
  return data;
};

beforeEach(() => execute.mockReset());

describe('W14 — Server Action da seleção Luxtory: datas civis estritas e limite antes de expandir [REQ-036]', () => {
  it('[REQ-036] data inexistente é erro de campo e nunca vira outra noite nem chega ao command', async () => {
    for (const [first, last] of [
      ['2026-02-30', '2026-03-02'],
      ['2027-02-27', '2027-02-29'],
      ['2027-04-31', '2027-05-01'],
    ]) {
      const state = await selectLuxtoryCapacityAction(initial, form(first!, last!));
      expect(state.fieldErrors).toMatchObject({ first: true, last: true });
      expect(state.rejection).toBe('invalid');
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('[REQ-036] 366 noites chegam ao command; 367 e intervalos enormes são recusados sem expandir', async () => {
    execute.mockResolvedValue({
      status: 'committed',
      result: {},
      operationId: 'op',
      replayed: false,
    });
    await expect(
      selectLuxtoryCapacityAction(initial, form('2027-01-01', '2028-01-01')),
    ).rejects.toThrow(/redirect:.*selecao-luxtory\?feito=1/);
    expect(execute).toHaveBeenCalledTimes(1);
    const input = execute.mock.calls[0]![1] as { nights: { stay_date: string; purpose: string }[] };
    expect(input.nights).toHaveLength(366);
    expect(input.nights[0]).toEqual({ stay_date: '2027-01-01', purpose: 'maintenance' });
    expect(input.nights.at(-1)).toEqual({ stay_date: '2028-01-01', purpose: 'maintenance' });

    execute.mockReset();
    for (const [first, last] of [
      ['2027-01-01', '2028-01-02'],
      ['0001-01-01', '9999-12-31'],
      ['2027-03-11', '2027-03-10'],
    ]) {
      const started = performance.now();
      const state = await selectLuxtoryCapacityAction(initial, form(first!, last!));
      expect(performance.now() - started).toBeLessThan(200);
      expect(state.fieldErrors).toMatchObject({ first: true, last: true });
    }
    expect(execute).not.toHaveBeenCalled();
  });
});
