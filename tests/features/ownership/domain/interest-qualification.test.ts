import { describe, expect, it } from 'vitest';
import {
  ALL_INVESTMENT_ANSWERS,
  DECISION_HORIZONS,
  DECISION_UNITS,
  INVESTMENT_ANSWERS,
  investmentQuestionFor,
  isAnswerOf,
} from '@/features/ownership/domain/interest-qualification';

// Pré-qualificação (spec ownership §14.5; decisão do fundador de 2026-10-20): três dimensões, códigos estáveis.
describe('pré-qualificação do interesse — dimensões e variantes', () => {
  it('[REQ-022] [BR-034] reference_fit só para Owner com média apresentada; investment_definition nos demais casos', () => {
    expect(investmentQuestionFor('owner', true)).toBe('reference_fit');
    expect(investmentQuestionFor('owner', false)).toBe('investment_definition');
    // Co-Owner: o valor individual depende da configuração da Second Home — nunca comparação com a média (BR-063).
    expect(investmentQuestionFor('co_owner', true)).toBe('investment_definition');
    expect(investmentQuestionFor('co_owner', false)).toBe('investment_definition');
  });

  it('[REQ-022] respostas fechadas por variante, sem número nem faixa de valor', () => {
    expect(INVESTMENT_ANSWERS).toEqual({
      reference_fit: ['within', 'needs_understanding', 'above'],
      investment_definition: ['range_defined', 'idea_without_range', 'needs_understanding'],
    });
    expect(isAnswerOf('reference_fit', 'above')).toBe(true);
    expect(isAnswerOf('investment_definition', 'above')).toBe(false);
    expect(isAnswerOf('reference_fit', 'range_defined')).toBe(false);
    expect(ALL_INVESTMENT_ANSWERS).toEqual([
      'within',
      'needs_understanding',
      'above',
      'range_defined',
      'idea_without_range',
    ]);
    for (const code of [...ALL_INVESTMENT_ANSWERS, ...DECISION_UNITS, ...DECISION_HORIZONS]) {
      expect(code, code).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(code, code).not.toMatch(/score|hot|warm|cold|priority|rank/);
    }
  });

  it('[REQ-022] unidade de decisão (3) e horizonte (5) da decisão do fundador', () => {
    expect(DECISION_UNITS).toEqual(['self', 'with_partner_or_family', 'with_others']);
    expect(DECISION_HORIZONS).toEqual([
      'within_3_months',
      'from_3_to_6_months',
      'from_6_to_12_months',
      'over_12_months',
      'exploring',
    ]);
  });
});
