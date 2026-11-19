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

/** Datas civis de `first` a `last`, inclusive (`YYYY-MM-DD`), para montar a seleção de um intervalo. */
export function civilDatesBetween(first: string, last: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${last}T00:00:00Z`);
  for (let at = Date.parse(`${first}T00:00:00Z`); at <= end; at += 86_400_000)
    dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}
