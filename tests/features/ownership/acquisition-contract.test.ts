import { describe, expect, it } from 'vitest';
import { schemaValidator } from '../../support/openapi';

const home = '00000000-0000-4000-8000-000000000011';
const partyA = '00000000-0000-4000-8000-000000000012';
const partyB = '00000000-0000-4000-8000-000000000013';
const spe = '00000000-0000-4000-8000-000000000014';
const owner = {
  second_home_id: home,
  modality: 'owner',
  location: 'Trancoso, BA',
  operation_start_date: '2027-01-01',
  acquirer_party_ids: [partyA],
  basis_ref: 'Ata sintética',
};

describe('W8 API-first: aquisição patrimonial sem contratos financeiros inventados', () => {
  it('[REQ-024] Owner exige adquirente único e não recebe campos societários artificiais', () => {
    const validate = schemaValidator('FormalizeAcquisitionRequest');
    expect(validate(owner)).toBe(true);
    expect(validate({ ...owner, acquirer_party_ids: [partyA, partyB] })).toBe(false);
    expect(validate({ ...owner, spe_party_id: spe })).toBe(false);
    expect(validate({ ...owner, configuration_id: 2 })).toBe(false);
  });

  it('[REQ-026] Co-Owner usa configuração fechada e parties distintas; conceitos de reserva e Crédito não entram no ato', () => {
    const validate = schemaValidator('FormalizeAcquisitionRequest');
    const input = {
      ...owner,
      modality: 'co_owner',
      configuration_id: 2,
      spe_party_id: spe,
      acquirer_party_ids: [partyA, partyB],
    };
    expect(validate(input)).toBe(true);
    expect(validate({ ...input, configuration_id: 5 })).toBe(false);
    expect(validate({ ...input, acquirer_party_ids: [partyA, partyA] })).toBe(false);
    for (const field of [
      'booking_id',
      'credit_quantity',
      'price_owner',
      'stake_price',
      'installments',
      'commercial_terms',
    ])
      expect(validate({ ...input, [field]: 'conteúdo não autorizado' }), field).toBe(false);
  });

  it('[TECH-020] alocação exige quantidades explícitas, com zero somente quando fornecido; nenhuma coleção de datas', () => {
    const validate = schemaValidator('InitialAllocationRequest');
    const input = {
      configuration_id: 2,
      operation_start_date: '2027-07-01',
      grants: [
        { position: 1, alta: 5, media: 20 },
        { position: 2, alta: 5, media: 20 },
      ],
      luxtory_capacity: { alta: 0, media: 3 },
      basis_ref: 'Estruturação sintética',
    };
    expect(validate(input)).toBe(true);
    expect(validate({ ...input, luxtory_capacity: { media: 3 } })).toBe(false);
    expect(validate({ ...input, dates: ['2027-07-01'] })).toBe(false);
    expect(validate({ ...input, grants: [{ position: 1, alta: 5.5, media: 20 }] })).toBe(false);
  });

  it('[TECH-020] administração e início têm contratos explícitos sem lifecycle genérico', () => {
    const administration = schemaValidator('SecondHomeAdministrationRequest');
    const coverage = {
      provider_party_id: partyA,
      professional: true,
      scope: 'professional_administration',
      valid_from: '2027-01-01',
    };
    expect(
      administration({ coverages: [coverage], basis_ref: 'Contrato de administração sintético' }),
    ).toBe(true);
    expect(
      administration({ coverages: [{ ...coverage, professional: false }], basis_ref: 'Base' }),
    ).toBe(false);
    const start = schemaValidator('SecondHomeOperationStartRequest');
    expect(start({ effective_start_date: '2027-01-01', basis_ref: 'Declaração sintética' })).toBe(
      true,
    );
    expect(
      start({ effective_start_date: '2027-01-01', basis_ref: 'Declaração', state: 'closed' }),
    ).toBe(false);
  });
});
