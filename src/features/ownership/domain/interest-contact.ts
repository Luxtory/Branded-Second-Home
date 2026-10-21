/**
 * Contato do interesse (W6; `03` v3.15 §3.1 `interest_contact`; spec ownership §14.7; ADR-0018): nome, telefone e e-mail
 * obrigatórios, só para responder à solicitação de conversa e conduzir a pré-qualificação comercial (D4, BR-064).
 * Guardado à parte do `interest`, que continua imutável; não cria Titular, conta, vínculo nem direito. Os limites são
 * técnicos (TECH-100), não regra de negócio.
 */
export interface InterestContact {
  readonly name: string;
  /** `+` inicial opcional e dígitos; o código do país nunca é inferido. */
  readonly phone: string;
  readonly email: string;
}

/** Limite técnico do e-mail (RFC 5321), em pontos de código. */
export const EMAIL_MAX = 254;

/** Limite do telefone como digitado, antes da normalização (formatos humanos com separadores). */
export const PHONE_INPUT_MAX = 32;

// Depois da normalização: `+` inicial opcional e 8 a 15 dígitos (limite técnico do E.164).
const PHONE = /^\+?[0-9]{8,15}$/u;
// Separadores humanos usuais removidos pelo servidor: espaços, parênteses, hífens e pontos.
const PHONE_SEPARATORS = /[\s().-]/gu;
// `local@domínio` com ponto no domínio, sem espaços, controles ou um segundo `@` (formato, não existência).
const EMAIL = /^[^@\s\p{Cc}]+@[^@\s\p{Cc}]+\.[^@\s\p{Cc}]+$/u;

/** Telefone sem separadores; o resultado ainda precisa passar por `isPhone`. Nunca acrescenta código de país. */
export function normalizePhone(value: string): string {
  return value.replace(PHONE_SEPARATORS, '');
}

/** Telefone normalizado válido: `+` só no início, 8 a 15 dígitos. */
export function isPhone(value: string): boolean {
  return PHONE.test(value);
}

/** E-mail sem espaços nas pontas e com o domínio em minúsculas; a parte local é preservada como digitada. */
export function normalizeEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  return `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}

/** E-mail normalizado no formato aceito; não confirma que a caixa existe. */
export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}
