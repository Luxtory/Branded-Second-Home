/**
 * CPF/CNPJ da party (`03` §3.1, spec identity §13.3). Normalização determinística antes de cifrar e de calcular o HMAC:
 * a mesma pessoa ou empresa, com ou sem máscara, chega sempre à mesma forma. Domínio puro: nada aqui guarda, registra ou
 * devolve o documento fora do valor normalizado.
 */
export const DOCUMENT_TYPES = ['cpf', 'cnpj'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Documento validado na forma normalizada (só dígitos no CPF; 12 alfanuméricos + 2 dígitos no CNPJ). */
export interface PartyDocument {
  readonly type: DocumentType;
  readonly value: string;
}

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;
const CHECK_DIGITS = 2;
const MODULUS = 11;
// Resto abaixo deste valor gera dígito verificador 0 (CPF e CNPJ).
const ZERO_DIGIT_BELOW = 2;
// CNPJ alfanumérico (IN RFB 2.229/2024): o valor de cada caractere é o código ASCII menos o de '0'.
const ASCII_ZERO = 48;
const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

const SEPARATORS = /[\s.\-/]/g;
const CPF_SHAPE = /^\d{11}$/;
const CNPJ_SHAPE = /^[0-9A-Z]{12}\d{2}$/;
const REPEATED = /^(.)\1*$/;

function checkDigit(sum: number): number {
  const remainder = sum % MODULUS;
  return remainder < ZERO_DIGIT_BELOW ? 0 : MODULUS - remainder;
}

function cpfDigit(digits: string, length: number): number {
  let sum = 0;
  for (let index = 0; index < length; index += 1)
    sum += Number(digits[index]) * (length + 1 - index);
  return checkDigit(sum);
}

function isValidCpf(value: string): boolean {
  if (!CPF_SHAPE.test(value) || REPEATED.test(value)) return false;
  const base = CPF_LENGTH - CHECK_DIGITS;
  return (
    cpfDigit(value, base) === Number(value[base]) &&
    cpfDigit(value, base + 1) === Number(value[base + 1])
  );
}

function cnpjDigit(value: string, length: number): number {
  const weights = CNPJ_WEIGHTS.slice(CNPJ_WEIGHTS.length - length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += (value.charCodeAt(index) - ASCII_ZERO) * (weights[index] ?? 0);
  }
  return checkDigit(sum);
}

function isValidCnpj(value: string): boolean {
  if (!CNPJ_SHAPE.test(value) || REPEATED.test(value)) return false;
  const base = CNPJ_LENGTH - CHECK_DIGITS;
  return (
    cnpjDigit(value, base) === Number(value[base]) &&
    cnpjDigit(value, base + 1) === Number(value[base + 1])
  );
}

/** Texto digitado → documento normalizado e validado, ou `null` (forma ou dígito verificador inválidos). */
export function normalizePartyDocument(input: string): PartyDocument | null {
  const value = input.replace(SEPARATORS, '').toUpperCase();
  if (value.length === CPF_LENGTH) return isValidCpf(value) ? { type: 'cpf', value } : null;
  if (value.length === CNPJ_LENGTH) return isValidCnpj(value) ? { type: 'cnpj', value } : null;
  return null;
}

/**
 * Máscara de apresentação (spec identity §13.3): CPF `***.456.789-**`; CNPJ `**.345.678/0001-**`. Só para exibir depois
 * de decifrar; nunca gravada.
 */
export function maskPartyDocument(document: PartyDocument): string {
  const { value } = document;
  if (document.type === 'cpf') return `***.${value.slice(3, 6)}.${value.slice(6, 9)}-**`;
  return `**.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-**`;
}

/** Forma de exibição completa (com pontuação), só para a leitura deliberada e auditada do Admin. */
export function formatPartyDocument(document: PartyDocument): string {
  const { value } = document;
  if (document.type === 'cpf') {
    return `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
  }
  return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}`;
}

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}
