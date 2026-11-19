/**
 * Seleção Luxtory (REQ-016, REQ-036; BR-120 a BR-122; TECH-022, TECH-027; ADR-0030; spec calendar §9): regras puras
 * sobre os fatos das noites. O banco repete todas no gatilho; aqui elas produzem a recusa funcional antes da escrita.
 */
export type SelectionSeason = 'alta' | 'media';

export interface SelectionNightFacts {
  readonly stayDate: string;
  readonly exerciseYear: number;
  readonly season: SelectionSeason;
  readonly isLeapDay: boolean;
  readonly checkinAt: Date;
}

export type NightRefusal = 'not_sealed' | 'started' | 'leap_day';

/** Noite selecionável: selada, ainda não iniciada (check-in futuro) e fora do 29/02 (TECH-027). */
export function nightRefusal(
  fact: SelectionNightFacts | undefined,
  now: Date,
): NightRefusal | null {
  if (fact === undefined) return 'not_sealed';
  if (fact.checkinAt.getTime() <= now.getTime()) return 'started';
  if (fact.isLeapDay) return 'leap_day';
  return null;
}

/** Chave de capacidade: exercício e categoria da noite (categorias não se compensam, INV-4). */
export const capacityKey = (year: number, season: SelectionSeason) => `${year}:${season}`;

/** Quantas noites a seleção pede por (exercício, categoria). */
export function requestedByCategory(
  facts: readonly SelectionNightFacts[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const fact of facts) {
    const key = capacityKey(fact.exerciseYear, fact.season);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const DAY_MS = 86_400_000;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Data civil `YYYY-MM-DD` que existe no calendário: a conversão volta exatamente ao mesmo texto (`2026-02-30`, que o
 * `Date.parse` normalizaria para `2026-03-02`, é recusada).
 */
export function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
}

/**
 * Datas civis de `first` a `last`, inclusive, para montar a seleção de um intervalo. O tamanho é calculado antes de
 * expandir: `null` para data inexistente, intervalo invertido ou mais de `max` noites — nunca percorre um intervalo
 * arbitrariamente grande.
 */
export function civilDatesBetween(first: string, last: string, max: number): string[] | null {
  if (!isCivilDate(first) || !isCivilDate(last)) return null;
  const start = Date.parse(`${first}T00:00:00Z`);
  const nights = (Date.parse(`${last}T00:00:00Z`) - start) / DAY_MS + 1;
  if (nights < 1 || nights > max) return null;
  return Array.from({ length: nights }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}
