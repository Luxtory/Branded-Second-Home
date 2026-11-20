import { minorToDecimal, type Currency } from '../domain/money';

const LOCALE = 'pt-BR';

/**
 * Dinheiro para leitura: a unidade mínima vira decimal exato em texto e só então é formatada (o `Intl` aceita string
 * decimal sem passar por `number`), sem perda de precisão.
 */
export function formatMoney(amountMinor: bigint, currency: Currency = 'BRL'): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(
    minorToDecimal(amountMinor, currency) as `${number}`,
  );
}

/** Noite civil (`YYYY-MM-DD`) para leitura: "seg., 01/03/2027". */
export function formatNight(stayDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${stayDate}T00:00:00Z`));
}

/** Mês para leitura: "março de 2027". */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** Instante no fuso da Second Home, com o fuso explícito: "20/11/2026 10:42 (BRT)". */
export function formatInstant(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('day')}/${value('month')}/${value('year')} ${value('hour')}:${value('minute')} (${value('timeZoneName')})`;
}
