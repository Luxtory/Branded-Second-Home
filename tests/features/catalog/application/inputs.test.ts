import { describe, expect, it } from 'vitest';
import {
  approveHomeConceptVersionInput,
  createHomeConceptVersionInput,
  correctHomeEditionEditorialInput,
  createHomeEditionInput,
  registerBrandPartnerInput,
  registerHomeEditionProjectedInvestmentInput,
  registerInvestorAuthorizationInput,
  registerSecondHomeInput,
  updateHomeEditionDraftInput,
} from '@/features/catalog/application/inputs';
import { fieldErrorsFrom, rejectionFor } from '@/features/catalog/presentation/form-state';
import { CONTENT, HOME_EDITION_CONTENT } from '../../../support/catalog-fixtures';

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

  it('[REQ-096] Home Concept novo (Brand Partner + título) ou versão nova (Home Concept); listas não vazias e sem termo vedado', () => {
    expect(
      createHomeConceptVersionInput.safeParse({ brand_partner_id: ID, title: 'Casa', ...CONTENT })
        .success,
    ).toBe(true);
    expect(
      createHomeConceptVersionInput.safeParse({ home_concept_id: ID, ...CONTENT }).success,
    ).toBe(true);
    expect(
      createHomeConceptVersionInput.safeParse({
        home_concept_id: ID,
        brand_partner_id: ID,
        ...CONTENT,
      }).success,
    ).toBe(false);
    expect(
      createHomeConceptVersionInput.safeParse({
        home_concept_id: ID,
        ...CONTENT,
        essential_elements: [],
      }).success,
    ).toBe(false);
    expect(
      errors(approveHomeConceptVersionInput, {
        home_concept_version_id: ID,
        approval_refs: ['Ata', 'Ata'],
      }),
    ).toEqual({ approval_refs: 'duplicate_item' });
  });

  it('[REQ-027] vigência da autorização do Investor: fim depois do início; termo final opcional', () => {
    const base = {
      home_concept_id: ID,
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

  it('[REQ-022] [BR-031] Home Edition: definição material e textos, sem localização, modalidade nem condições comerciais', () => {
    const homeEdition = { home_concept_id: ID, ...HOME_EDITION_CONTENT };
    expect(createHomeEditionInput.safeParse(homeEdition).success).toBe(true);
    const required = Object.fromEntries(
      Object.entries(homeEdition).filter(
        ([key]) => !['rooms', 'amenities', 'characteristics'].includes(key),
      ),
    );
    expect(createHomeEditionInput.safeParse(required).success).toBe(true);
    for (const extra of [
      { region: 'Litoral' },
      { modality: 'owner' },
      { commercial_conditions: 'Condições.' },
    ]) {
      expect(createHomeEditionInput.safeParse({ ...homeEdition, ...extra }).success).toBe(false);
    }
    expect(errors(createHomeEditionInput, { ...homeEdition, suites: 0, rooms: [] })).toEqual({
      suites: 'required',
      rooms: 'required',
    });
    expect(errors(createHomeEditionInput, { ...homeEdition, suites: 51 })).toEqual({
      suites: 'too_long',
    });
    // A edição da preparação nunca troca o Home Concept (BR-031).
    expect(
      updateHomeEditionDraftInput.safeParse({ home_edition_id: ID, ...HOME_EDITION_CONTENT })
        .success,
    ).toBe(true);
    expect(
      updateHomeEditionDraftInput.safeParse({
        home_edition_id: ID,
        home_concept_id: ID,
        ...HOME_EDITION_CONTENT,
      }).success,
    ).toBe(false);
  });

  it('[BR-377] campos de produto não enquadram a Home Edition como moradia', () => {
    const homeEdition = { home_concept_id: ID, ...HOME_EDITION_CONTENT };
    for (const value of ['Residence Mar', 'Casa residencial', 'Uma residência de lazer']) {
      expect(errors(createHomeEditionInput, { ...homeEdition, name: value })).toEqual({
        name: 'forbidden_term',
      });
    }
  });

  it('[BR-036] correção editorial: nome e/ou descrição, com base; nada a corrigir aponta o nome', () => {
    const base = { home_edition_id: ID, correction_basis: 'Erro de digitação' };
    expect(correctHomeEditionEditorialInput.safeParse({ ...base, name: 'Novo nome' }).success).toBe(
      true,
    );
    expect(errors(correctHomeEditionEditorialInput, base)).toEqual({ name: 'nothing_to_correct' });
    expect(
      correctHomeEditionEditorialInput.safeParse({ ...base, name: 'Novo', typology: 'Outra' })
        .success,
    ).toBe(false);
  });

  it('[BR-034] média projetada: valor e moeda, sem modalidade, base ou Ação', () => {
    const value = { home_edition_id: ID, amount_minor: 480_000_000, currency: 'BRL' };
    expect(registerHomeEditionProjectedInvestmentInput.safeParse(value).success).toBe(true);
    expect(
      registerHomeEditionProjectedInvestmentInput.safeParse({ ...value, basis: 'owner' }).success,
    ).toBe(false);
    expect(
      errors(registerHomeEditionProjectedInvestmentInput, { ...value, amount_minor: 10 ** 16 }),
    ).toEqual({ amount_minor: 'too_long' });
  });

  it('[REQ-020] Second Home com fuso IANA', () => {
    expect(
      errors(registerSecondHomeInput, {
        home_edition_id: ID,
        label: 'Unidade 1',
        timezone: 'Brasilia',
      }),
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
