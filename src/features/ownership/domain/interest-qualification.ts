import type { InterestModality } from './interest';

/**
 * Pré-qualificação comercial do interesse (W6; `02` v4.3 REQ-022; `03` v3.15 §3.1 `interest_qualification`; spec
 * ownership §14.5; decisão do fundador de 2026-10-20). Três dimensões obrigatórias com códigos semânticos estáveis,
 * independentes da copy: contexto para a conversa comercial (BR-041, BR-064) — nunca score, faixa, prioridade,
 * aprovação, aquisição nem agendamento. Nenhum valor é gravado ou derivado da média projetada (BR-034).
 */

/**
 * Variantes da **dimensão de investimento** (nunca "Budget Fit" como nome universal): `reference_fit` compara a média
 * projetada apresentada com o que o interessado considera investir; `investment_definition` mede o estágio de definição
 * do investimento, sem valor.
 */
export const INVESTMENT_QUESTIONS = ['reference_fit', 'investment_definition'] as const;
export type InvestmentQuestion = (typeof INVESTMENT_QUESTIONS)[number];

/** Respostas de cada variante, na ordem da interface. */
export const INVESTMENT_ANSWERS = {
  reference_fit: ['within', 'needs_understanding', 'above'],
  investment_definition: ['range_defined', 'idea_without_range', 'needs_understanding'],
} as const satisfies Record<InvestmentQuestion, readonly string[]>;

export type InvestmentAnswer = (typeof INVESTMENT_ANSWERS)[InvestmentQuestion][number];

/** Todos os códigos de resposta, sem repetição (o mesmo código pode valer em mais de uma variante). */
export const ALL_INVESTMENT_ANSWERS: readonly InvestmentAnswer[] = [
  ...new Set<InvestmentAnswer>(Object.values(INVESTMENT_ANSWERS).flat()),
];

/** Unidade de decisão: quem participa da decisão — nenhum dado das outras pessoas. */
export const DECISION_UNITS = ['self', 'with_partner_or_family', 'with_others'] as const;
export type DecisionUnit = (typeof DECISION_UNITS)[number];

/** Horizonte da decisão. */
export const DECISION_HORIZONS = [
  'within_3_months',
  'from_3_to_6_months',
  'from_6_to_12_months',
  'over_12_months',
  'exploring',
] as const;
export type DecisionHorizon = (typeof DECISION_HORIZONS)[number];

export interface InterestQualification {
  readonly investmentQuestion: InvestmentQuestion;
  readonly investmentAnswer: InvestmentAnswer;
  /** A média projetada que a página efetivamente apresentou (`02` §15, item 14); `null` = nenhuma. */
  readonly presentedProjectedInvestmentId: string | null;
  readonly decisionUnit: DecisionUnit;
  readonly decisionHorizon: DecisionHorizon;
}

/**
 * Variante apresentada, decidida pela modalidade desejada e pelo contexto efetivamente apresentado — nunca pela média
 * vigente no envio: `reference_fit` só para Owner com média apresentada; `investment_definition` para Co-Owner (o valor
 * individual depende da configuração da Second Home, BR-034, BR-063) e para Owner sem média.
 */
export function investmentQuestionFor(
  modality: InterestModality,
  hasPresentedReference: boolean,
): InvestmentQuestion {
  return modality === 'owner' && hasPresentedReference ? 'reference_fit' : 'investment_definition';
}

/** A resposta pertence à variante. */
export function isAnswerOf(question: InvestmentQuestion, answer: string): boolean {
  return (INVESTMENT_ANSWERS[question] as readonly string[]).includes(answer);
}
