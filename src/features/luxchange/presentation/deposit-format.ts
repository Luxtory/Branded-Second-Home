/**
 * Formatação da jornada do depósito (W20), pura e comum a servidor e cliente. Créditos em texto decimal exato,
 * agrupados à brasileira sem passar por `Number` (TECH-033) e nunca com símbolo monetário (BR-190).
 */
export function formatCredits(value: string): string {
  const [whole = '0', fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options });

export const dayMonth = (date: string) =>
  fmt({ day: '2-digit', month: '2-digit' }).format(toDate(date));
export const longDate = (date: string) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(date));
export const fullDate = (date: string) =>
  fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(date));
export const monthName = (month: string) =>
  fmt({ month: 'long', year: 'numeric' }).format(toDate(`${month}-01`));

/** Instante no fuso da Second Home (validade dos Créditos). */
export const instantDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));

/** Lista curta de datas: faixa contínua como "10/03 a 14/03"; senão separadas por vírgula. */
export function dateList(dates: readonly string[]): string {
  if (dates.length === 0) return '';
  const DAY = 86_400_000;
  const contiguous = dates.every(
    (date, index) =>
      index === 0 ||
      Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dates[index - 1]}T00:00:00Z`) === DAY,
  );
  if (dates.length > 2 && contiguous) return `${dayMonth(dates[0]!)} a ${dayMonth(dates.at(-1)!)}`;
  return dates.map(dayMonth).join(', ');
}

/** Referência curta e legível de uma operação (os 8 primeiros hexadecimais, como os lotes da Carteira). */
export const operationCode = (id: string) => id.replaceAll('-', '').slice(0, 8).toUpperCase();
