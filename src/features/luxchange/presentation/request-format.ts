/**
 * Formatação da Request (W21), pura e comum a servidor e cliente: a Taxa de intermediação em reais (centavos em texto,
 * sem `Number` acima do inteiro seguro) e o prazo de resposta com data e hora no fuso da Second Home.
 */
export function formatFee(amountMinor: string): string {
  const digits = amountMinor.replace(/^0+(?=\d)/, '').padStart(3, '0');
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${whole},${digits.slice(-2)}`;
}

/** Instante com data e hora no fuso informado (prazo de resposta, envio, encerramento). */
export const instantDateTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const DAY_MS = 86_400_000;

/** Noite seguinte (data civil), para o checkout de `[checkin, checkout)`. */
export const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** Datas civis `[from, to]` inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= Date.parse(`${to}T00:00:00Z`); at += DAY_MS)
    dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}
