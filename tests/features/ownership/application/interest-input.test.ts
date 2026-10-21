import { describe, expect, it } from 'vitest';
import { parseInterestRequest } from '@/features/ownership/application/interest-input';
import { coOwnerBody, ownerBody } from '../../../support/interest-fixtures';

// Corpo da solicitação de conversa (spec ownership §5.1, §14.4.1): o mesmo schema no servidor e no formulário.
const HOME_EDITION = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const HOME_CONCEPT = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CO_OWNER = coOwnerBody(HOME_EDITION);

const without = (body: Record<string, unknown>, ...keys: string[]) =>
  Object.fromEntries(Object.entries(body).filter(([key]) => !keys.includes(key)));

describe('solicitação de conversa — validação do corpo', () => {
  it('[REQ-022] [BR-030] a Home Edition é obrigatória; Home Concept sem Home Edition não é manifestação', () => {
    expect(parseInterestRequest(without(CO_OWNER, 'home_edition_id'))).toEqual({
      ok: false,
      issues: [{ field: 'home_edition_id', code: 'required' }],
    });
    expect(
      parseInterestRequest({
        ...without(CO_OWNER, 'home_edition_id'),
        home_concept_id: HOME_CONCEPT,
      }),
    ).toEqual({ ok: false, issues: [{ field: 'home_edition_id', code: 'required' }] });
  });

  it('[REQ-022] contato, faixa para iniciar, unidade de decisão e horizonte obrigatórios — nenhum dado a mais é aceito', () => {
    const fields = [
      'available_to_start_band',
      'decision_unit',
      'decision_horizon',
      'name',
      'phone',
      'email',
      'presentation_context',
    ];
    expect(parseInterestRequest(without(CO_OWNER, ...fields))).toEqual({
      ok: false,
      issues: fields.map((field) => ({ field, code: 'required' })),
    });
    for (const extra of [
      { message: 'Olá' },
      { cpf: '00000000000' },
      { income: 1 },
      { budget: 1 },
      { amount_minor: 1 },
      { available_to_start_amount: 300_000 },
      { entrada: 'R$ 100 mil' },
      { patrimonio: 'alto' },
      { qualification_version: 2 },
      { presented_projected_investment_id: HOME_CONCEPT },
      { score: 'hot' },
    ]) {
      expect(parseInterestRequest({ ...CO_OWNER, ...extra }), JSON.stringify(extra)).toEqual({
        ok: false,
        issues: [],
      });
    }
  });

  it('[REQ-025] approx_days ausente para Co-Owner é required; informado para Owner é not_allowed (F2b)', () => {
    expect(parseInterestRequest(without(CO_OWNER, 'approx_days'))).toEqual({
      ok: false,
      issues: [{ field: 'approx_days', code: 'required' }],
    });
    expect(parseInterestRequest({ ...CO_OWNER, approx_days: null })).toMatchObject({
      issues: [{ field: 'approx_days', code: 'required' }],
    });
    expect(parseInterestRequest(ownerBody(HOME_EDITION, null, { approx_days: 14 }))).toMatchObject({
      issues: [{ field: 'approx_days', code: 'not_allowed' }],
    });
    expect(parseInterestRequest(ownerBody(HOME_EDITION, null))).toMatchObject({ ok: true });
  });

  it('[REQ-025] approx_days: inteiro positivo, sem teto de negócio — só o limite de 32 bits', () => {
    for (const invalid of [0, -1, 1.5, '14', 2_147_483_648, Number.NaN]) {
      expect(parseInterestRequest({ ...CO_OWNER, approx_days: invalid })).toMatchObject({
        issues: [{ field: 'approx_days', code: 'invalid' }],
      });
    }
    expect(parseInterestRequest({ ...CO_OWNER, approx_days: 2_147_483_647 })).toMatchObject({
      ok: true,
    });
  });

  it('[REQ-022] telefone e e-mail: formatos humanos aceitos; inválidos, vazios ou longos recusados sem o valor', () => {
    expect(parseInterestRequest({ ...CO_OWNER, phone: '+55 (61) 99999-9999' })).toMatchObject({
      ok: true,
      request: { contact: { phone: '+5561999999999' } },
    });
    for (const [phone, code] of [
      ['   ', 'required'],
      ['999-9999', 'invalid'],
      ['61 9999A-9999', 'invalid'],
      ['1'.repeat(33), 'too_long'],
    ] as const) {
      expect(parseInterestRequest({ ...CO_OWNER, phone }), phone).toEqual({
        ok: false,
        issues: [{ field: 'phone', code }],
      });
    }
    for (const [email, code] of [
      ['', 'required'],
      ['sem-arroba', 'invalid'],
      ['a@b', 'invalid'],
      [`${'a'.repeat(250)}@x.com`, 'too_long'],
    ] as const) {
      const result = parseInterestRequest({ ...CO_OWNER, email });
      expect(result, email).toEqual({ ok: false, issues: [{ field: 'email', code }] });
      if (email !== '') expect(JSON.stringify(result)).not.toContain(email);
    }
  });

  it('[REQ-022] faixa, comparação, unidade de decisão e horizonte: só códigos fechados, nunca valor em reais', () => {
    for (const band of ['300000', 'R$ 300 mil', 'between_1_and_2m', 300_000]) {
      expect(
        parseInterestRequest({ ...CO_OWNER, available_to_start_band: band }),
        String(band),
      ).toMatchObject({
        issues: [{ field: 'available_to_start_band', code: 'invalid' }],
      });
    }
    expect(
      parseInterestRequest({ ...CO_OWNER, reference_fit: 'needs_understanding' }),
    ).toMatchObject({
      issues: [{ field: 'reference_fit', code: 'invalid' }],
    });
    // A comparação é opcional no schema: o servidor a exige ou recusa pelo contexto apresentado (spec §14.5).
    expect(parseInterestRequest({ ...CO_OWNER, reference_fit: null })).toMatchObject({ ok: true });
    expect(parseInterestRequest({ ...CO_OWNER, reference_fit: 'could_consider' })).toMatchObject({
      ok: true,
      request: { answers: { referenceFit: 'could_consider' } },
    });
    expect(parseInterestRequest({ ...CO_OWNER, decision_unit: 'family_name' })).toMatchObject({
      issues: [{ field: 'decision_unit', code: 'invalid' }],
    });
    for (const horizon of ['hot', 'within_3_months', 'from_3_to_6_months']) {
      expect(
        parseInterestRequest({ ...CO_OWNER, decision_horizon: horizon }),
        horizon,
      ).toMatchObject({
        issues: [{ field: 'decision_horizon', code: 'invalid' }],
      });
    }
    expect(parseInterestRequest({ ...CO_OWNER, decision_horizon: 'within_30_days' })).toMatchObject(
      {
        ok: true,
        request: { answers: { decisionHorizon: 'within_30_days' } },
      },
    );
    expect(parseInterestRequest({ ...CO_OWNER, decision_horizon: 'immediate' })).toMatchObject({
      ok: true,
      request: {
        answers: { decisionHorizon: 'immediate', availableToStartBand: 'from_500k_to_1m' },
      },
    });
  });

  it('[TECH-100] campos na ordem do contrato, nunca com o valor enviado; textos com limite em pontos de código', () => {
    const result = parseInterestRequest({
      ...CO_OWNER,
      home_edition_id: 'não-é-uuid',
      modality: 'investor',
      desired_location: '   ',
      name: 'linha\nquebrada',
      origin: 'x'.repeat(201),
      presentation_context: 'sem ponto',
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        { field: 'home_edition_id', code: 'invalid' },
        { field: 'modality', code: 'invalid' },
        { field: 'desired_location', code: 'required' },
        { field: 'name', code: 'invalid' },
        { field: 'origin', code: 'too_long' },
        { field: 'presentation_context', code: 'invalid' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('quebrada');
    expect(parseInterestRequest({ ...CO_OWNER, name: '😀'.repeat(200) })).toMatchObject({
      ok: true,
    });
    expect(parseInterestRequest({ ...CO_OWNER, name: 'a'.repeat(201) })).toMatchObject({
      issues: [{ field: 'name', code: 'too_long' }],
    });
    expect(
      parseInterestRequest({ ...CO_OWNER, presentation_context: 'a.'.repeat(300) }),
    ).toMatchObject({ issues: [{ field: 'presentation_context', code: 'too_long' }] });
    expect(parseInterestRequest([CO_OWNER])).toEqual({ ok: false, issues: [] });
  });
});
