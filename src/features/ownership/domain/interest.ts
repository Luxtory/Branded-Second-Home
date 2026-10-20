/**
 * Manifestação de interesse (`03` v3.15 §3.1; spec ownership §13): preferência comercial registrada a partir de uma Home
 * Edition, antes de qualquer estruturação ou formalização. Nunca constitui aquisição (REQ-024, BR-050) nem cria Ação, Direito de Uso ou prerrogativa (REQ-023,
 * REQ-025, BR-060, BR-065) — só a formalização (W8) cria Ação e Direito de Uso.
 */
export const INTEREST_MODALITIES = ['owner', 'co_owner'] as const;
export type InterestModality = (typeof INTEREST_MODALITIES)[number];

/** Limite técnico dos textos livres, em pontos de código, depois da normalização (TECH-100; não é regra de negócio). */
export const INTEREST_TEXT_MAX = 200;

/** Maior valor da coluna `integer`: limite de representação, não teto de negócio (REQ-025: sem teto presumido). */
export const APPROX_DAYS_MAX = 2_147_483_647;

/** Corpo efetivo máximo do request (TECH-100): folga sobre os campos no maior tamanho em UTF-8. */
export const INTEREST_BODY_MAX_BYTES = 8 * 1024;

export interface Interest {
  /** A Home Edition da manifestação (BR-030); o Home Concept vem dela. */
  readonly homeEditionId: string;
  /** Modalidade desejada: a Home Edition não restringe modalidade (BR-032). */
  readonly modality: InterestModality;
  /** Localização pretendida (BR-030) — não é a localização concreta de uma Second Home. */
  readonly desiredLocation: string;
  /** Só Co-Owner, e obrigatório para Co-Owner: preferência comercial, jamais direito adquirido (REQ-025, BR-060). */
  readonly approxDays: number | null;
  /** Metadados declarados e não confiáveis (REQ-023): nunca concedem acesso, autorização ou atribuição comercial. */
  readonly origin: string | null;
  readonly partnerRef: string | null;
}

/** F2b: `approx_days` é obrigatório para Co-Owner e ausente para Owner (REQ-025). */
export function approxDaysRule(
  modality: InterestModality,
  approxDays: number | null,
): 'ok' | 'required' | 'not_allowed' {
  if (modality === 'co_owner') return approxDays === null ? 'required' : 'ok';
  return approxDays === null ? 'ok' : 'not_allowed';
}

/** Texto livre normalizado: sem espaços nas pontas e com cada sequência interna de espaços reduzida a um. */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

/** Quantidade de pontos de código (não de unidades UTF-16): "😀" conta 1. */
export const codePointLength = (value: string): number => [...value].length;
