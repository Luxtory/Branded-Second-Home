import type { InterestModality } from '../domain/interest';
import type { InterestCount } from './ports';

/**
 * Visão agrupada do Admin (spec ownership §5, BR-062): Concept → região → modalidade e, dentro de `co_owner`, os valores
 * exatos de `approx_days` com a contagem de cada um. Não destrutiva: nenhuma faixa, bucket, ranking ou algoritmo — a
 * Luxtory agrupa (BR-062–BR-064); o software só apresenta o que foi registrado. A ordem é só de leitura.
 */
export interface DaysCount {
  readonly days: number;
  readonly count: number;
}

export interface ModalityGroup {
  readonly modality: InterestModality;
  readonly total: number;
  /** Só `co_owner`; vazio para `owner`, que não tem `approx_days`. */
  readonly approxDays: readonly DaysCount[];
}

export interface RegionGroup {
  readonly region: string;
  readonly total: number;
  readonly modalities: readonly ModalityGroup[];
}

export interface ConceptGroup<L> {
  readonly conceptId: string;
  /** Título e marca vindos do catálogo; `null` se indisponível (nada é presumido). */
  readonly label: L | null;
  readonly total: number;
  readonly regions: readonly RegionGroup[];
}

const MODALITY_ORDER: readonly InterestModality[] = ['owner', 'co_owner'];
const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const sum = (counts: readonly { readonly count: number }[]) =>
  counts.reduce((total, item) => total + item.count, 0);

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

function modalityGroup(modality: InterestModality, rows: readonly InterestCount[]): ModalityGroup {
  const approxDays = rows
    .flatMap((row) => (row.approxDays === null ? [] : [{ days: row.approxDays, count: row.count }]))
    .sort((a, b) => a.days - b.days);
  return { modality, total: sum(rows), approxDays: modality === 'co_owner' ? approxDays : [] };
}

function regionGroup(region: string, rows: readonly InterestCount[]): RegionGroup {
  const byModality = groupBy(rows, (row) => row.modality);
  const modalities = MODALITY_ORDER.flatMap((modality) => {
    const group = byModality.get(modality);
    return group === undefined ? [] : [modalityGroup(modality, group)];
  });
  return { region, total: sum(rows), modalities };
}

/** Agrupa as contagens; Concepts pelo título (sem título, pelo id), regiões em ordem alfabética, dias crescentes. */
export function groupInterests<L extends { readonly title: string }>(
  counts: readonly InterestCount[],
  labels: ReadonlyMap<string, L>,
): readonly ConceptGroup<L>[] {
  const concepts = [...groupBy(counts, (row) => row.conceptId)].map(([conceptId, rows]) => {
    const regions = [...groupBy(rows, (row) => row.region)]
      .map(([region, regionRows]) => regionGroup(region, regionRows))
      .sort((a, b) => COLLATOR.compare(a.region, b.region));
    return { conceptId, label: labels.get(conceptId) ?? null, total: sum(rows), regions };
  });
  const sortKey = (group: ConceptGroup<L>) => group.label?.title ?? group.conceptId;
  return concepts.sort((a, b) => COLLATOR.compare(sortKey(a), sortKey(b)));
}
