import { describe, expect, it } from 'vitest';
import {
  asksReferenceFit,
  AVAILABLE_TO_START_BANDS,
  DECISION_HORIZONS,
  DECISION_UNITS,
  QUALIFICATION_VERSION,
  REFERENCE_FIT_ANSWERS,
} from '@/features/ownership/domain/interest-qualification';

// Pré-qualificação (spec ownership §14.5; revisão do fundador de 2026-10-21): BANT adaptado — Budget, Authority e
// Timeline com códigos estáveis e versionados; o Need vem do próprio interesse.
describe('pré-qualificação do interesse — dimensões e códigos', () => {
  it('[REQ-022] [BR-034] a comparação com a média só é perguntada a Owner com média apresentada; nunca ao Co-Owner', () => {
    expect(asksReferenceFit('owner', true)).toBe(true);
    expect(asksReferenceFit('owner', false)).toBe(false);
    // Co-Owner: o valor individual depende da configuração da Second Home — nunca comparação com a média total (BR-063).
    expect(asksReferenceFit('co_owner', true)).toBe(false);
    expect(asksReferenceFit('co_owner', false)).toBe(false);
  });

  it('[REQ-022] faixa autodeclarada de recursos para iniciar: 7 opções da versão 1, sem valor exato', () => {
    expect(QUALIFICATION_VERSION).toBe(1);
    expect(AVAILABLE_TO_START_BANDS).toEqual([
      'up_to_250k',
      'from_250k_to_500k',
      'from_500k_to_1m',
      'from_1m_to_2_5m',
      'from_2_5m_to_5m',
      'above_5m',
      'not_defined',
    ]);
    expect(REFERENCE_FIT_ANSWERS).toEqual(['within', 'could_consider', 'above']);
  });

  it('[REQ-022] unidade de decisão (3) e horizonte com "imediatamente" separado de "nos próximos 30 dias"', () => {
    expect(DECISION_UNITS).toEqual(['self', 'with_partner_or_family', 'with_others']);
    expect(DECISION_HORIZONS).toEqual([
      'immediate',
      'within_30_days',
      'one_to_three_months',
      'three_to_six_months',
      'six_to_twelve_months',
      'over_twelve_months',
      'exploring',
    ]);
    for (const code of [
      ...AVAILABLE_TO_START_BANDS,
      ...REFERENCE_FIT_ANSWERS,
      ...DECISION_UNITS,
      ...DECISION_HORIZONS,
    ]) {
      expect(code, code).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(code, code).not.toMatch(/score|hot|warm|cold|priority|rank|entrada|income|equity/);
    }
  });
});
