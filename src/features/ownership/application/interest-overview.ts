import type { InterestModality } from '../domain/interest';
import type { InterestCount } from './ports';

/**
 * Visão agrupada do Admin (spec ownership §5, BR-062): Home Edition → localização pretendida → modalidade e, dentro de
 * `co_owner`, os valores exatos de `approx_days` com a contagem de cada um. Não destrutiva: nenhuma faixa, bucket, ranking ou algoritmo — a
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

export interface LocationGroup {
  /** Localização pretendida, como registrada (já normalizada); nenhuma taxonomia. */
  readonly desiredLocation: string;
  readonly total: number;
  readonly modalities: readonly ModalityGroup[];
}

export interface HomeEditionGroup<L> {
  readonly homeEditionId: string;
  /** Nome da Home Edition, título do Home Concept e marca vindos do catálogo; `null` se indisponível. */
  readonly label: L | null;
  readonly total: number;
  readonly locations: readonly LocationGroup[];
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

function locationGroup(desiredLocation: string, rows: readonly InterestCount[]): LocationGroup {
  const byModality = groupBy(rows, (row) => row.modality);
  const modalities = MODALITY_ORDER.flatMap((modality) => {
    const group = byModality.get(modality);
    return group === undefined ? [] : [modalityGroup(modality, group)];
  });
  return { desiredLocation, total: sum(rows), modalities };
}

/**
 * Agrupa as contagens; Home Editions pelo título do Home Concept e depois pelo nome (sem rótulo, pelo id), localizações
 * em ordem alfabética, dias crescentes.
 */
export function groupInterests<
  L extends { readonly homeConceptTitle: string; readonly homeEditionName: string },
>(
  counts: readonly InterestCount[],
  labels: ReadonlyMap<string, L>,
): readonly HomeEditionGroup<L>[] {
  const homeEditions = [...groupBy(counts, (row) => row.homeEditionId)].map(
    ([homeEditionId, rows]) => {
      const locations = [...groupBy(rows, (row) => row.desiredLocation)]
        .map(([desiredLocation, locationRows]) => locationGroup(desiredLocation, locationRows))
        .sort((a, b) => COLLATOR.compare(a.desiredLocation, b.desiredLocation));
      return {
        homeEditionId,
        label: labels.get(homeEditionId) ?? null,
        total: sum(rows),
        locations,
      };
    },
  );
  const sortKeys = (group: HomeEditionGroup<L>) =>
    group.label === null
      ? [group.homeEditionId, '']
      : [group.label.homeConceptTitle, group.label.homeEditionName];
  return homeEditions.sort((a, b) => {
    const [titleA = '', nameA = ''] = sortKeys(a);
    const [titleB = '', nameB = ''] = sortKeys(b);
    return COLLATOR.compare(titleA, titleB) || COLLATOR.compare(nameA, nameB);
  });
}
