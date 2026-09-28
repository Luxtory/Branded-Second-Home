import { describe, expect, it } from 'vitest';
import {
  approveConceptVersionInput,
  createConceptVersionInput,
  createEditionInput,
  registerBrandPartnerInput,
  registerInvestorAuthorizationInput,
  registerResidenceInput,
} from '@/features/catalog/application/inputs';
import { fieldErrorsFrom, rejectionFor } from '@/features/catalog/presentation/form-state';
import { CONTENT } from '../../../support/catalog-fixtures';

const ID = '00000000-0000-4000-8000-0000000000e1';

function errors(
  schema: { safeParse(value: unknown): { success: boolean; error?: unknown } },
  value: unknown,
) {
  const parsed = schema.safeParse(value) as ReturnType<typeof registerBrandPartnerInput.safeParse>;
  return parsed.success ? {} : fieldErrorsFrom(parsed.error);
}

describe('entradas das operações do catálogo (schemas do command e da tela)', () => {
  it('[REQ-100] texto com termo vedado aponta o campo; vazio é obrigatório; espaços nas pontas são removidos', () => {
    expect(errors(registerBrandPartnerInput, { brand_name: 'Casa da cota' })).toEqual({
      brand_name: 'forbidden_term',
    });
    expect(errors(registerBrandPartnerInput, { brand_name: '   ' })).toEqual({
      brand_name: 'required',
    });
    expect(errors(registerBrandPartnerInput, {})).toEqual({ brand_name: 'required' });
    expect(errors(registerBrandPartnerInput, { brand_name: 'x'.repeat(201) })).toEqual({
      brand_name: 'too_long',
    });
    expect(registerBrandPartnerInput.parse({ brand_name: '  Maison  ' })).toEqual({
      brand_name: 'Maison',
    });
    expect(registerBrandPartnerInput.safeParse({ brand_name: 'Maison', extra: 1 }).success).toBe(
      false,
    );
  });

  it('[REQ-096] Concept novo (Brand Partner + título) ou versão nova (Concept); listas não vazias e sem termo vedado', () => {
    expect(
      createConceptVersionInput.safeParse({ brand_partner_id: ID, title: 'Casa', ...CONTENT })
        .success,
    ).toBe(true);
    expect(createConceptVersionInput.safeParse({ concept_id: ID, ...CONTENT }).success).toBe(true);
    expect(
      createConceptVersionInput.safeParse({ concept_id: ID, brand_partner_id: ID, ...CONTENT })
        .success,
    ).toBe(false);
    expect(
      createConceptVersionInput.safeParse({ concept_id: ID, ...CONTENT, essential_elements: [] })
        .success,
    ).toBe(false);
    expect(
      errors(approveConceptVersionInput, { concept_version_id: ID, approval_refs: ['Ata', 'Ata'] }),
    ).toEqual({ approval_refs: 'duplicate_item' });
  });

  it('[REQ-027] vigência da autorização do Investor: fim depois do início; termo final opcional', () => {
    const base = {
      concept_id: ID,
      instrument_ref: 'Instrumento 1',
      valid_from: '2026-09-01T00:00:00Z',
    };
    expect(registerInvestorAuthorizationInput.safeParse(base).success).toBe(true);
    expect(
      errors(registerInvestorAuthorizationInput, { ...base, valid_until: '2026-08-01T00:00:00Z' }),
    ).toEqual({ valid_until: 'end_before_start' });
    expect(
      errors(registerInvestorAuthorizationInput, { ...base, valid_from: '2026-09-01' }),
    ).toEqual({
      valid_from: 'invalid',
    });
  });

  it('[REQ-020] Edition com modalidade Owner, Co-Owner ou ambas; Residence com fuso IANA', () => {
    const edition = { concept_id: ID, region: 'Região', commercial_conditions: 'Condições.' };
    for (const modality of ['owner', 'co_owner', 'owner_and_co_owner']) {
      expect(createEditionInput.safeParse({ ...edition, modality }).success).toBe(true);
    }
    expect(errors(createEditionInput, { ...edition, modality: 'both' })).toEqual({
      modality: 'invalid',
    });
    expect(
      errors(registerResidenceInput, { edition_id: ID, label: 'Unidade 1', timezone: 'Brasilia' }),
    ).toEqual({ timezone: 'invalid_time_zone' });
  });

  it('[REQ-098] recusa do command vira causa funcional clara na tela', () => {
    expect(rejectionFor('ERR_STATE_TRANSITION')).toBe('state');
    expect(rejectionFor('ERR_NOT_FOUND')).toBe('not_found');
    expect(rejectionFor('ERR_PERMISSION')).toBe('permission');
    expect(rejectionFor('ERR_IDEMPOTENCY_CONFLICT')).toBe('conflict');
    expect(rejectionFor('ERR_UNAVAILABLE')).toBe('unavailable');
    expect(rejectionFor('ERR_VALIDATION')).toBe('invalid');
    expect(rejectionFor('ERR_INTERNAL')).toBe('unexpected');
  });
});
