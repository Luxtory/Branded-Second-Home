/**
 * Datas e instantes das telas do ciclo da reserva (W13 E4b). Datas civis da Second Home sem fuso do navegador (W12);
 * instantes no fuso IANA da Second Home ("qui., 26/11/2026 às 14:00"; com horário de verão pode ser 13:00 ou 15:00 —
 * spec booking §10.4). Nunca o relógio do navegador.
 */
const LOCALE = 'pt-BR';
const MICROS_PER_MILLI = 1000n;

const civil = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

export const fullDate = (date: string) =>
  civil(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const shortDate = (date: string) =>
  civil(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const dayMonth = (date: string) => civil(date, { day: '2-digit', month: '2-digit' });
const weekday = (date: string) => civil(date, { weekday: 'short' });
const month = (date: string) => civil(date, { month: 'short' });
const day = (date: string) => Number(date.slice(8, 10));

/** "11, 12, 13 e 14/12" → aqui "11/12, 12/12, 13/12 e 14/12" (sem ambiguidade de mês). */
export const dateList = (dates: readonly string[]) => {
  const items = dates.map(dayMonth);
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
};

/** Período do detalhe e da prévia: "sex., 11 → ter., 15 de dez. de 2026" (mês e ano só quando mudam). */
export function periodRange(checkin: string, checkout: string): string {
  const sameYear = checkin.slice(0, 4) === checkout.slice(0, 4);
  if (sameYear && checkin.slice(5, 7) === checkout.slice(5, 7))
    return `${weekday(checkin)}, ${day(checkin)} → ${weekday(checkout)}, ${day(checkout)} de ${month(checkin)} de ${checkin.slice(0, 4)}`;
  if (sameYear)
    return `${weekday(checkin)}, ${day(checkin)} de ${month(checkin)} → ${weekday(checkout)}, ${day(checkout)} de ${month(checkout)} de ${checkin.slice(0, 4)}`;
  return `${shortDate(checkin)} → ${shortDate(checkout)}`;
}

/** Período compacto da lista: "11 → 15 de dez. de 2026". */
export function listRange(checkin: string, checkout: string): string {
  if (checkin.slice(0, 7) === checkout.slice(0, 7))
    return `${day(checkin)} → ${day(checkout)} de ${month(checkin)} de ${checkin.slice(0, 4)}`;
  if (checkin.slice(0, 4) === checkout.slice(0, 4))
    return `${day(checkin)} de ${month(checkin)} → ${day(checkout)} de ${month(checkout)} de ${checkin.slice(0, 4)}`;
  return `${fullDate(checkin)} → ${fullDate(checkout)}`;
}

export const nightsBetween = (checkin: string, checkout: string) =>
  Math.round(
    (Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / 86_400_000,
  );

/** Instante no fuso da Second Home: "qui., 26/11/2026 às 14:00". */
export function instantIn(at: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday}, ${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`;
}

/** Instante curto no fuso da Second Home: "20/11/2026 10:42". */
export const shortInstantIn = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);

/** Data civil de hoje no fuso da Second Home (`YYYY-MM-DD`). */
export const civilToday = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

export const dateFromMicros = (value: bigint) => new Date(Number(value / MICROS_PER_MILLI));
