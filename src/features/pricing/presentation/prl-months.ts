/**
 * Meses do calendário do PRL (W16 E4): a navegação percorre só os meses efetivamente selados, em ordem — lacunas são
 * puladas, inclusive entre exercícios —, e o mês de referência é o do fuso IANA da Second Home (TECH-040), nunca UTC.
 */

/** Mês selado vizinho na direção pedida (`-1` anterior, `1` seguinte), ou `null` no fim da lista. */
export function adjacentMonth(
  months: readonly string[],
  month: string,
  direction: -1 | 1,
): string | null {
  if (direction > 0) return months.find((candidate) => candidate > month) ?? null;
  return [...months].reverse().find((candidate) => candidate < month) ?? null;
}

/** Mês civil (`AAAA-MM`) do instante no fuso da Second Home. */
export function monthIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at);
  const value = (type: 'year' | 'month') => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}`;
}

/** Mês inicial: o pedido, se selado; senão o mês corrente da Second Home, ou o selado mais próximo dele. */
export function initialMonth(
  months: readonly string[],
  requested: string,
  current: string,
): string | null {
  if (months.length === 0) return null;
  if (months.includes(requested)) return requested;
  if (months.includes(current)) return current;
  return adjacentMonth(months, current, 1) ?? adjacentMonth(months, current, -1);
}
