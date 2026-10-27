import { describe, expect, it } from 'vitest';
import { acquisitionFormInput } from '@/features/ownership/presentation/acquisition-form-input';

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe('W8 Admin input [TECH-001] [BR-071] [BR-081]', () => {
  it('keeps blank quantities absent and accepts only explicit zero, without proportional calculation', () => {
    const input = acquisitionFormInput(
      'allocation',
      form({ configuration_id: '2', alta: '', media: '0', luxtory_alta: '0', luxtory_media: '12' }),
    );
    expect(input.grants).toEqual([
      { position: 1, alta: undefined, media: 0 },
      { position: 2, alta: undefined, media: 0 },
    ]);
    expect(input.luxtory_capacity).toEqual({ alta: 0, media: 12 });
  });
  it('never manufactures Owner stakes or coerces a civil date through a timestamp', () => {
    const input = acquisitionFormInput(
      'formalize',
      form({
        modality: 'owner',
        acquirer_1: 'party',
        operation_start_date: '2026-12-31',
        configuration_id: '2',
        spe_party_id: 'ignored',
      }),
    );
    expect(input.acquirer_party_ids).toEqual(['party']);
    expect(input.operation_start_date).toBe('2026-12-31');
    expect(input).not.toHaveProperty('configuration_id');
    expect(input).not.toHaveProperty('spe_party_id');
  });
  it('does not turn an unanswered contract end into a perpetual contract', () => {
    expect(
      acquisitionFormInput('administration', form({ end_kind: '', professional: '' })).coverages,
    ).toEqual([
      {
        provider_party_id: '',
        scope: '',
        professional: undefined,
        valid_from: '',
        valid_until: undefined,
        replaces_id: undefined,
      },
    ]);
  });
  it('copies all declared technical positions without calculating grants or omitting blank acquirers', () => {
    const input = acquisitionFormInput(
      'formalize',
      form({
        modality: 'co_owner',
        configuration_id: '2',
        acquirer_1: 'first',
        acquirer_2: '',
        initial_allocation_id: 'allocation',
      }),
    );
    expect(input.acquirer_party_ids).toEqual(['first', '']);
    expect(input.initial_allocation_id).toBe('allocation');
  });
});

it('preserves the exact attempt and entered fields when the action response is lost [TECH-002]', async () => {
  const { acquisitionInitialState, retryableAcquisitionSubmission } =
    await import('@/features/ownership/presentation/acquisition-form-state');
  const state = await retryableAcquisitionSubmission(
    async () => {
      throw new Error('network');
    },
    acquisitionInitialState('same-key'),
    form({ alta: '0', operation_start_date: '2026-12-31' }),
  );
  expect(state.key).toBe('same-key');
  expect(state.values).toEqual({ alta: '0', operation_start_date: '2026-12-31' });
  expect(state.rejection).toBe('unexpected');
});

it('keeps framework redirects intact while handling transport failures', async () => {
  const { acquisitionInitialState, retryableAcquisitionSubmission } =
    await import('@/features/ownership/presentation/acquisition-form-state');
  const redirect = Object.assign(new Error('redirect'), {
    digest: 'NEXT_REDIRECT;push;/admin;303;',
  });
  await expect(
    retryableAcquisitionSubmission(
      async () => {
        throw redirect;
      },
      acquisitionInitialState('key'),
      form({}),
    ),
  ).rejects.toBe(redirect);
});
