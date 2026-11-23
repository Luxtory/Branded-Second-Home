import Decimal from 'decimal.js';

/**
 * Créditos (BR-190, TECH-033; ADR-0033): unidade operacional interna, não financeira — quantidades decimais exatas em
 * texto canônico, sem moeda nem arredondamento. Nada vira `number`.
 */
const Quantity = Decimal.clone({ precision: 80, toExpNeg: -80, toExpPos: 80 });
type QuantityValue = InstanceType<typeof Quantity>;

/** Decimal positivo canônico: sem zeros à esquerda nem à direita, até 15 dígitos inteiros e 12 decimais. */
const CANONICAL = /^(0|[1-9][0-9]{0,14})(\.[0-9]{0,11}[1-9])?$/;

export class CreditQuantityError extends RangeError {
  constructor(value: string) {
    super(`Not a positive canonical credit quantity: ${value}`);
    this.name = 'CreditQuantityError';
  }
}

export function isCreditQuantity(value: string): boolean {
  return CANONICAL.test(value) && value !== '0';
}

export function parseCreditQuantity(value: string): QuantityValue {
  if (!isCreditQuantity(value)) throw new CreditQuantityError(value);
  return new Quantity(value);
}

/** Texto canônico de um valor exato lido do banco (`numeric::text`), ex.: `12.50` → `12.5`. */
export function canonicalQuantity(value: string): string {
  return new Quantity(value).toFixed();
}

export function sumQuantities(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new Quantity(0)).toFixed();
}

export function compareQuantities(left: string, right: string): number {
  return new Quantity(left).comparedTo(right);
}

/** Lote utilizável na ordem FEFO (PD-008, TECH-071): `ORDER BY expires_at, originated_at, id`. */
export interface UsableLot {
  readonly id: string;
  readonly available: string;
  readonly expiresAt: string;
  readonly originatedAt: string;
}

export interface Allocation {
  readonly lotId: string;
  readonly quantity: string;
}

/**
 * Consome `quantity` dos lotes na ordem recebida (já FEFO), cada lote até o seu disponível. `null` = saldo insuficiente.
 * A ordem não é refeita aqui: o banco a entrega e trava nessa mesma ordem (classe 7 da TECH-053).
 */
export function allocateFefo(lots: readonly UsableLot[], quantity: string): Allocation[] | null {
  let remaining = parseCreditQuantity(quantity);
  const allocations: Allocation[] = [];
  for (const lot of lots) {
    if (remaining.isZero()) break;
    const available = new Quantity(lot.available);
    if (available.lte(0)) continue;
    const take = Quantity.min(available, remaining);
    allocations.push({ lotId: lot.id, quantity: take.toFixed() });
    remaining = remaining.minus(take);
  }
  return remaining.isZero() ? allocations : null;
}

const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/;

/** Instante ISO 8601 UTC em microssegundos (a precisão do PostgreSQL), para comparar sem perder a fração. */
export function instantMicros(iso: string): bigint {
  const match = INSTANT.exec(iso);
  if (match === null) throw new RangeError(`Not a UTC ISO 8601 instant: ${iso}`);
  const seconds = BigInt(Date.parse(`${match[1]}Z`)) / 1000n;
  return seconds * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
}
