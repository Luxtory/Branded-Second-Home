import Decimal from 'decimal.js';

/**
 * Valores exatos (TECH-033; ADR-0032; spec pricing §5): dinheiro em unidade mínima (`bigint`) + moeda; Créditos em
 * decimal exato. Nada vira `number`, e nenhum arredondamento acontece antes do valor monetário final aplicável.
 */
export const CURRENCIES = ['BRL'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Casas da unidade mínima por moeda (o `01` só usa BRL). */
export const MINOR_UNIT_DIGITS: Readonly<Record<Currency, number>> = { BRL: 2 };

/** Limite técnico (o mesmo do banco): 15 dígitos em unidade mínima, exato também como número em JS. */
export const MAX_AMOUNT_MINOR = 999_999_999_999_999n;

const MINOR_AMOUNT = /^[1-9][0-9]{0,14}$/;
/** Reais em pt-BR: milhares com ponto (opcional, em grupos de três) e até 2 casas após a vírgula. */
const MONEY_INPUT = /^(?<units>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?<cents>\d{1,2}))?$/;

/**
 * Aritmética decimal isolada (`decimal.js` 10.6.0, ADR-0004): precisão acima de qualquer produto dentro dos limites
 * técnicos e notação sempre posicional. O arredondamento HALF_UP só é aplicado explicitamente, no valor final.
 */
export const Exact = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -80,
  toExpPos: 80,
});
export type ExactValue = InstanceType<typeof Exact>;

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export class MoneyRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyRangeError';
  }
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** Valor canônico em unidade mínima (string de inteiro positivo, como no JSON e no banco) → `bigint`; senão `null`. */
export function parseMinorAmount(text: string): bigint | null {
  if (!MINOR_AMOUNT.test(text)) return null;
  return BigInt(text);
}

/**
 * Entrada da tela em reais (pt-BR) → unidade mínima. Mais de 2 casas, zero, negativo, separador fora do padrão ou acima
 * do limite técnico → `null`: recusa explícita, nunca arredondamento.
 */
export function parseMoneyInput(text: string, currency: Currency = 'BRL'): bigint | null {
  const match = MONEY_INPUT.exec(text.trim());
  if (match?.groups === undefined) return null;
  const digits = MINOR_UNIT_DIGITS[currency];
  const units = (match.groups.units ?? '').replaceAll('.', '');
  const cents = (match.groups.cents ?? '').padEnd(digits, '0');
  const amount = BigInt(units) * 10n ** BigInt(digits) + BigInt(cents === '' ? '0' : cents);
  return amount < 1n || amount > MAX_AMOUNT_MINOR ? null : amount;
}

/** Unidade mínima → decimal em unidade da moeda (ex.: `123456` → `"1234.56"`), exato. */
export function minorToDecimal(amountMinor: bigint, currency: Currency = 'BRL'): string {
  const digits = MINOR_UNIT_DIGITS[currency];
  const negative = amountMinor < 0n;
  const text = (negative ? -amountMinor : amountMinor).toString().padStart(digits + 1, '0');
  const units = text.slice(0, text.length - digits);
  const fraction = text.slice(text.length - digits);
  return `${negative ? '-' : ''}${units}${digits > 0 ? `.${fraction}` : ''}`;
}

/** Valor exato da unidade mínima em unidade da moeda: centavos → reais antes de qualquer multiplicação. */
export function minorToExact(amountMinor: bigint, currency: Currency = 'BRL'): ExactValue {
  return new Exact(amountMinor.toString()).div(new Exact(10).pow(MINOR_UNIT_DIGITS[currency]));
}

/** Soma exata de valores em unidade mínima (sem limite de `Number.MAX_SAFE_INTEGER`). */
export function sumMinor(amounts: readonly bigint[]): bigint {
  return amounts.reduce((total, amount) => total + amount, 0n);
}
