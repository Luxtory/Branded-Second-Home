import { randomInt } from 'node:crypto';

// CPF/CNPJ sintéticos para testes (W7): dígitos verificadores calculados; nunca documentos reais. Sem dependência de
// Vitest, para servir também ao Playwright.
const MODULUS = 11;
const ASCII_ZERO = 48;
const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CPF_BASE_DIGITS = 9;

const digit = (sum: number) => (sum % MODULUS < 2 ? 0 : MODULUS - (sum % MODULUS));

/** CPF sintético válido a partir de 9 dígitos. */
export function validCpf(base: string): string {
  const withFirst = base + digit([...base].reduce((sum, d, i) => sum + Number(d) * (10 - i), 0));
  return withFirst + digit([...withFirst].reduce((sum, d, i) => sum + Number(d) * (11 - i), 0));
}

const cnpjDigit = (value: string) => {
  const weights = CNPJ_WEIGHTS.slice(CNPJ_WEIGHTS.length - value.length);
  return digit(
    [...value].reduce((sum, c, i) => sum + (c.charCodeAt(0) - ASCII_ZERO) * (weights[i] ?? 0), 0),
  );
};

/** CNPJ sintético válido (numérico ou alfanumérico) a partir de 12 caracteres. */
export function validCnpj(base: string): string {
  const withFirst = base + cnpjDigit(base);
  return withFirst + cnpjDigit(withFirst);
}

/** CPF sintético aleatório (testes paralelos no mesmo banco não colidem). */
export function randomCpf(): string {
  const base = Array.from({ length: CPF_BASE_DIGITS }, () => randomInt(10)).join('');
  return /^(\d)\1*$/.test(base) ? randomCpf() : validCpf(base);
}

/** CPF com a pontuação usual (não é a máscara de apresentação, que esconde dígitos). */
export const punctuatedCpf = (cpf: string) =>
  `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

/** Máscara de apresentação do CPF (spec identity §13.3). */
export const maskOfCpf = (cpf: string) => `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
