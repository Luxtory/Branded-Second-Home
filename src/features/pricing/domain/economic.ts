import { Exact, MoneyRangeError, minorToExact, type Currency } from './money';

/**
 * Fórmulas do `01` sobre valores exatos (TECH-033; spec pricing §5). Os parâmetros chegam como texto canônico já tipado
 * pelo banco (`app.parameter`); nenhum valor padrão existe aqui (TECH-001). Consumidores: W19 (Fee), W20 (Créditos).
 */
const POSITIVE_DECIMAL = /^(0|[1-9][0-9]{0,8})(\.[0-9]{0,5}[1-9])?$/;
const RATE = /^(0\.[0-9]{0,5}[1-9]|1)$/;

function positiveDecimal(value: string, name: string) {
  if (!POSITIVE_DECIMAL.test(value) || value === '0')
    throw new MoneyRangeError(`${name} must be a positive canonical decimal`);
  return new Exact(value);
}

/**
 * Créditos do PRL (`01` §20): PRL do período convertido de unidade mínima para unidade da moeda **antes** do
 * multiplicador. Resultado decimal exato, sem arredondamento (`numeric`), em notação posicional canônica.
 */
export function creditsForPrl(
  prlTotalMinor: bigint,
  currency: Currency,
  multiplier: string,
): string {
  if (prlTotalMinor < 1n) throw new MoneyRangeError('PRL total must be positive');
  return minorToExact(prlTotalMinor, currency)
    .times(positiveDecimal(multiplier, 'multiplier'))
    .toFixed();
}

/**
 * Luxchange Fee (`01` §24): maior entre percentual vigente × PRL do período e mínimo vigente, em unidade mínima.
 * HALF_UP uma única vez, na unidade mínima do valor final; o mínimo já é inteiro em unidade mínima.
 */
export function luxchangeFee(prlTotalMinor: bigint, rate: string, minimumMinor: bigint): bigint {
  if (prlTotalMinor < 1n) throw new MoneyRangeError('PRL total must be positive');
  if (minimumMinor < 1n) throw new MoneyRangeError('minimum must be positive');
  if (!RATE.test(rate)) throw new MoneyRangeError('rate must be a canonical fraction in (0, 1]');
  const percentage = BigInt(
    new Exact(prlTotalMinor.toString())
      .times(rate)
      .toDecimalPlaces(0, Exact.ROUND_HALF_UP)
      .toFixed(0),
  );
  return percentage > minimumMinor ? percentage : minimumMinor;
}
