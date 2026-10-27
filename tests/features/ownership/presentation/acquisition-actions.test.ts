import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('@/features/identity', () => ({ executeAdminCommand: execute }));
vi.mock('@/features/admin', () => ({ adminRoleGate: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/features/ownership/presentation/acquisition-handlers', () => ({
  createAcquisitionHandlers: () => ({
    formalizeAcquisition: 'formalize',
    initialAllocation: 'allocation',
    administration: 'administration',
    operationStart: 'start',
  }),
  acquisitionAdminCommand: (handler: unknown) => ({ role: 'admin', handler }),
}));
import {
  administrationAction,
  formalizeAcquisitionAction,
  operationStartAction,
} from '@/features/ownership/presentation/acquisition-actions';
import { acquisitionInitialState } from '@/features/ownership/presentation/acquisition-form-state';
const home = randomUUID();
const party = randomUUID();
const payload = (values: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    second_home_id: home,
    modality: 'owner',
    location: 'Local sintético',
    operation_start_date: '2026-12-31',
    acquirer_1: party,
    basis_ref: 'Ato sintético',
    confirmation: 'on',
    ...values,
  }))
    form.set(key, value);
  return form;
};
beforeEach(() => execute.mockReset());
describe('W8 Admin actions [TECH-054] [TECH-002]', () => {
  it('identifies a repeated acquirer with an actionable field error', async () => {
    const state = await formalizeAcquisitionAction(
      acquisitionInitialState('key'),
      payload({
        modality: 'co_owner',
        configuration_id: '2',
        spe_party_id: randomUUID(),
        operation_start_date: '2026-01-01',
        acquirer_2: party,
      }),
    );
    expect(state.errors.acquirer_1).toBe('duplicateAcquirer');
    expect(execute).not.toHaveBeenCalled();
  });
  it('explains the relationship between the civil date and initial allocation', async () => {
    const state = await formalizeAcquisitionAction(
      acquisitionInitialState('key'),
      payload({
        modality: 'co_owner',
        configuration_id: '2',
        spe_party_id: randomUUID(),
        acquirer_2: randomUUID(),
      }),
    );
    expect(state.errors.operation_start_date).toBe('allocationDate');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['2026-12-31', '2026-12-30'])('identifies an invalid coverage end %s', async (end) => {
    const state = await administrationAction(
      acquisitionInitialState('key'),
      payload({
        provider_party_id: party,
        scope: 'professional_administration',
        professional: 'on',
        valid_from: '2026-12-31',
        end_kind: 'defined',
        valid_until: end,
      }),
    );
    expect(state.errors.valid_until).toBe('endBeforeStart');
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires deliberate confirmation and sends no mutation when missing', async () => {
    const state = await formalizeAcquisitionAction(
      acquisitionInitialState('key'),
      payload({ confirmation: '' }),
    );
    expect(state.errors.confirmation).toBe('confirmation');
    expect(execute).not.toHaveBeenCalled();
  });
  it('uses a fresh key after a definitive 4xx even when no operation was persisted', async () => {
    execute.mockResolvedValue({ status: 'rejected', code: 'ERR_PERMISSION', operationId: null });
    const state = await formalizeAcquisitionAction(acquisitionInitialState('old'), payload());
    expect(state.key).not.toBe('old');
    expect(state.values.location).toBe('Local sintético');
    expect(execute).toHaveBeenCalledWith(
      { role: 'admin', handler: 'formalize' },
      expect.objectContaining({ second_home_id: home, acquirer_party_ids: [party] }),
      'old',
    );
  });
  it.each(['unavailable', { status: 'rejected', code: 'ERR_INTERNAL', operationId: null }])(
    'keeps input and key when result is unconfirmed: %j',
    async (outcome) => {
      execute.mockResolvedValue(outcome);
      const state = await formalizeAcquisitionAction(acquisitionInitialState('same'), payload());
      expect(state.key).toBe('same');
      expect(state.values.operation_start_date).toBe('2026-12-31');
    },
  );
  it('refuses an unanswered contract end even though the command supports an omitted final date', async () => {
    const state = await administrationAction(
      acquisitionInitialState('key'),
      payload({
        provider_party_id: party,
        scope: 'professional_administration',
        professional: 'on',
        valid_from: '2026-12-31',
        end_kind: '',
      }),
    );
    expect(state.errors.end_kind).toBe('required');
    expect(execute).not.toHaveBeenCalled();
  });
  it('uses the shared command and returns to persisted facts on success', async () => {
    const operationId = randomUUID();
    execute.mockResolvedValue({
      status: 'committed',
      replayed: false,
      operationId,
      result: { id: randomUUID(), second_home_id: home, operation_id: randomUUID() },
    });
    await expect(
      operationStartAction(
        acquisitionInitialState('key'),
        payload({ effective_start_date: '2026-12-31' }),
      ),
    ).rejects.toThrow(
      `/admin/catalogo/second-homes/${home}/formalizacao?registered=${operationId}#registered`,
    );
    expect(execute).toHaveBeenCalledWith(
      { role: 'admin', handler: 'start' },
      { second_home_id: home, effective_start_date: '2026-12-31', basis_ref: 'Ato sintético' },
      'key',
    );
  });
});
