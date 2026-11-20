import { minorToDecimal, parseMoneyInput } from '@/features/pricing';
import {
  ECONOMIC_PARAMETER_TYPES,
  isEconomicParameterValue,
  type EconomicParameterKey,
} from '../domain/parameter';

/**
 * Conversão exata entre o formato da tela (pt-BR) e o valor canônico gravado (spec admin §14). Nada passa por `number`;
 * entrada fora do formato volta `null` (recusa, nunca arredondamento).
 */
const DECIMAL = /^(\d{1,9})(?:,(\d{1,6}))?$/;
const PERCENT = /^(\d{1,3})(?:,(\d{1,4}))?$/;
const INTEGER = /^[1-9]\d{0,3}$/;

/** Decimal canônico: sem zeros à esquerda nem à direita da fração. */
function canonical(units: string, fraction: string): string {
  const integer = units.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals === '' ? integer : `${integer}.${decimals}`;
}

/** Percentual (até 4 casas) → fração canônica (desloca a vírgula duas casas, em texto). */
function percentToFraction(text: string): string | null {
  const match = PERCENT.exec(text);
  if (match === null) return null;
  const digits = `${match[1]}${match[2] ?? ''}`;
  const scale = (match[2] ?? '').length + 2;
  const padded = digits.padStart(scale + 1, '0');
  return canonical(padded.slice(0, padded.length - scale), padded.slice(padded.length - scale));
}

export function toCanonicalValue(key: EconomicParameterKey, input: string): string | null {
  const text = input.trim();
  let value: string | null;
  switch (ECONOMIC_PARAMETER_TYPES[key]) {
    case 'money': {
      const amount = parseMoneyInput(text);
      value = amount === null ? null : amount.toString();
      break;
    }
    case 'fraction':
      value = percentToFraction(text);
      break;
    case 'decimal': {
      const match = DECIMAL.exec(text);
      value = match === null ? null : canonical(match[1]!, match[2] ?? '');
      break;
    }
    default:
      value = INTEGER.test(text) ? text : null;
  }
  return value !== null && isEconomicParameterValue(key, value) ? value : null;
}

/** Valor canônico para leitura: dinheiro em reais, percentual, decimal em pt-BR, meses ou horas. */
export function displayValue(
  key: EconomicParameterKey,
  value: string,
  units: { months: (count: string) => string; hours: (count: string) => string },
): string {
  switch (ECONOMIC_PARAMETER_TYPES[key]) {
    case 'money':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        minorToDecimal(BigInt(value)) as `${number}`,
      );
    case 'fraction':
      return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 4 }).format(
        value as `${number}`,
      );
    case 'decimal':
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(
        value as `${number}`,
      );
    case 'months':
      return units.months(value);
    default:
      return units.hours(value);
  }
}
