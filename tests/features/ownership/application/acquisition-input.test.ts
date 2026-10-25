import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  formalizeAcquisitionInput,
  initialAllocationInput,
  administrationInput,
  operationStartInput,
} from '@/features/ownership/application/acquisition-input';
const base = {
  second_home_id: randomUUID(),
  location: 'Localização sintética',
  operation_start_date: '2028-01-01',
  basis_ref: 'ato:123',
};
describe('Acquisition strict inputs [REQ-024] [REQ-026]', () => {
  it('accepts only an integral Owner and refuses financial/document extras', () => {
    const input = { ...base, modality: 'owner', acquirer_party_ids: [randomUUID()] };
    expect(formalizeAcquisitionInput.safeParse(input).success).toBe(true);
    for (const patch of [
      { acquirer_party_ids: [randomUUID(), randomUUID()] },
      { configuration_id: 2 },
      { price: 100 },
      { document: '123' },
      { basis_ref: ' ' },
      { operation_start_date: '2027-02-29' },
      { operation_start_date: '0000-01-01' },
    ])
      expect(formalizeAcquisitionInput.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('normalizes UUID case, requires N distinct acquirers and an explicit partial source', () => {
    const party = randomUUID();
    const input = {
      ...base,
      modality: 'co_owner',
      configuration_id: 2,
      spe_party_id: randomUUID(),
      acquirer_party_ids: [party, randomUUID()],
    };
    expect(formalizeAcquisitionInput.safeParse(input).success).toBe(true);
    for (const patch of [
      { acquirer_party_ids: [party, party.toUpperCase()] },
      { configuration_id: 4 },
      { operation_start_date: '2028-07-01' },
      { initial_allocation_id: randomUUID() },
    ])
      expect(formalizeAcquisitionInput.safeParse({ ...input, ...patch }).success).toBe(false);
    expect(
      formalizeAcquisitionInput.safeParse({
        ...input,
        operation_start_date: '2028-07-01',
        initial_allocation_id: randomUUID(),
      }).success,
    ).toBe(true);
  });
  it('requires every explicit allocation category and partial civil date', () => {
    const input = {
      second_home_id: base.second_home_id,
      basis_ref: base.basis_ref,
      configuration_id: 2,
      operation_start_date: '2028-07-01',
      grants: [
        { position: 1, alta: 1, media: 1 },
        { position: 2, alta: 1, media: 1 },
      ],
      luxtory_capacity: { alta: 0, media: 0 },
    };
    expect(initialAllocationInput.safeParse(input).success).toBe(true);
    expect(
      initialAllocationInput.safeParse({ ...input, operation_start_date: '2028-01-01' }).success,
    ).toBe(false);
    expect(
      initialAllocationInput.safeParse({ ...input, luxtory_capacity: { alta: 0 } }).success,
    ).toBe(false);
  });
  it('bounds administration batches and civil ranges without inferring an end', () => {
    const coverage = {
      provider_party_id: randomUUID(),
      professional: true,
      scope: 'professional_administration',
      valid_from: '2028-01-01',
    };
    const input = {
      second_home_id: base.second_home_id,
      basis_ref: base.basis_ref,
      coverages: [coverage],
    };
    expect(administrationInput.safeParse(input).success).toBe(true);
    for (const coverages of [
      [],
      Array.from({ length: 21 }, () => coverage),
      [{ ...coverage, professional: false }],
      [{ ...coverage, valid_until: '2028-01-01' }],
    ])
      expect(administrationInput.safeParse({ ...input, coverages }).success).toBe(false);
    expect(
      operationStartInput.safeParse({
        second_home_id: base.second_home_id,
        basis_ref: base.basis_ref,
        effective_start_date: '2028-02-29',
      }).success,
    ).toBe(true);
  });
});
