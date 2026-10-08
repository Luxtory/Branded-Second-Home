/**
 * Dinheiro na interface (TECH-033): unidades menores `bigint` + moeda, nunca ponto flutuante. O Admin digita reais
 * ("4.800.000" ou "4.800.000,50"); a tela mostra "R$ 4.800.000" (sem centavos quando são zero).
 */
const CENTS_PER_UNIT = 100n;
const REAIS = /^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/;

/** Reais digitados → unidades menores; `null` quando o texto não é um valor em reais. */
export function reaisToMinor(input: string): bigint | null {
  const text = input.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!REAIS.test(text)) return null;
  const [units = '', cents = ''] = text.split(',');
  return BigInt(units.replace(/\./g, '')) * CENTS_PER_UNIT + BigInt(cents.padEnd(2, '0') || '0');
}

/** Unidades menores → texto da moeda em pt-BR, exato (o `Intl` recebe a parte inteira como `bigint`). */
export function formatMoney(amountMinor: bigint, currency: string): string {
  const units = amountMinor / CENTS_PER_UNIT;
  const cents = amountMinor % CENTS_PER_UNIT;
  const whole = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(units);
  return cents === 0n ? whole : `${whole},${cents.toString().padStart(2, '0')}`;
}
