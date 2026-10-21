import type { InterestModality } from './interest';

/**
 * Pré-qualificação comercial do interesse (W6; `02` v4.3 REQ-022; `03` v3.15 §3.1 `interest_qualification`; spec
 * ownership §14.5; revisão do fundador de 2026-10-21). Inspirada em BANT adaptado a B2C high-ticket — o termo nunca
 * aparece ao visitante: o Need vem do próprio interesse (Home Edition, modalidade, localização, dias); aqui ficam Budget,
 * Authority e Timeline. Contexto para o SDR (BR-041, BR-064): nunca score, Hot/Warm/Cold, prioridade, aprovação,
 * aquisição nem agendamento. Nenhum valor exato é gravado e nenhum valor é derivado da média projetada (BR-034).
 */

/** Versão dos códigos e das faixas: uma mudança exige versão nova, e os registros antigos seguem interpretáveis. */
export const QUALIFICATION_VERSION = 1;

/**
 * Faixa autodeclarada de recursos disponíveis para iniciar o investimento (versão 1, em reais) — para Owner e
 * Co-Owner. Não é renda, patrimônio, comprovação, financiamento, preço nem capacidade financeira comprovada. Fronteiras
 * sem sobreposição (spec §14.5): `up_to_250k` ≤ 250 mil; `from_250k_to_500k` > 250 mil e ≤ 500 mil; `from_500k_to_1m`
 * > 500 mil e ≤ 1 milhão; `from_1m_to_2_5m` > 1 milhão e ≤ 2,5 milhões; `from_2_5m_to_5m` > 2,5 milhões e ≤ 5 milhões;
 * `above_5m` > 5 milhões; `not_defined` sem faixa definida.
 */
export const AVAILABLE_TO_START_BANDS = [
  'up_to_250k',
  'from_250k_to_500k',
  'from_500k_to_1m',
  'from_1m_to_2_5m',
  'from_2_5m_to_5m',
  'above_5m',
  'not_defined',
] as const;
export type AvailableToStartBand = (typeof AVAILABLE_TO_START_BANDS)[number];

/** Comparação declarada com a média projetada apresentada — só para Owner com média apresentada. */
export const REFERENCE_FIT_ANSWERS = ['within', 'could_consider', 'above'] as const;
export type ReferenceFit = (typeof REFERENCE_FIT_ANSWERS)[number];

/** Unidade de decisão: quem participa da decisão — nenhum dado das outras pessoas. */
export const DECISION_UNITS = ['self', 'with_partner_or_family', 'with_others'] as const;
export type DecisionUnit = (typeof DECISION_UNITS)[number];

/** Horizonte da decisão: quem está pronto para avançar agora (`immediate`) separado de quem pensa em semanas. */
export const DECISION_HORIZONS = [
  'immediate',
  'within_30_days',
  'one_to_three_months',
  'three_to_six_months',
  'six_to_twelve_months',
  'over_twelve_months',
  'exploring',
] as const;
export type DecisionHorizon = (typeof DECISION_HORIZONS)[number];

export interface InterestQualification {
  readonly version: typeof QUALIFICATION_VERSION;
  readonly availableToStartBand: AvailableToStartBand;
  /** Só existe para Owner com média apresentada; `null` nos demais casos. */
  readonly referenceFit: ReferenceFit | null;
  /** A média projetada que a página efetivamente apresentou (`02` §15, item 14); `null` = nenhuma. */
  readonly presentedProjectedInvestmentId: string | null;
  readonly decisionUnit: DecisionUnit;
  readonly decisionHorizon: DecisionHorizon;
}

/**
 * A comparação com a média só é perguntada a Owner quando a página mostrou a média — nunca ao Co-Owner, cujo valor
 * individual depende da configuração da Second Home (BR-034, BR-063), e nunca sem a referência apresentada.
 */
export function asksReferenceFit(
  modality: InterestModality,
  hasPresentedReference: boolean,
): boolean {
  return modality === 'owner' && hasPresentedReference;
}
