import type { InterestModality } from '../domain/interest';
import type { InterestRecord } from './ports';

/**
 * Grupo de uma Home Edition no drill-down do Admin (spec ownership §14.10): os interesses individuais, **sem dado de
 * contato nem pré-qualificação**, por localização pretendida → modalidade e, dentro da modalidade, do mais recente ao
 * mais antigo. Só leitura e ordem de apresentação — nenhuma faixa, ranking, score ou algoritmo comercial (BR-062,
 * BR-063).
 */
export interface ModalityInterests {
  readonly modality: InterestModality;
  readonly interests: readonly InterestRecord[];
}

export interface LocationInterests {
  readonly desiredLocation: string;
  readonly modalities: readonly ModalityInterests[];
}

const MODALITY_ORDER: readonly InterestModality[] = ['owner', 'co_owner'];
const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const newestFirst = (a: InterestRecord, b: InterestRecord) =>
  b.createdAt.getTime() - a.createdAt.getTime();

function locationInterests(
  desiredLocation: string,
  records: readonly InterestRecord[],
): LocationInterests {
  const modalities = MODALITY_ORDER.flatMap((modality) => {
    const interests = records.filter((record) => record.modality === modality).sort(newestFirst);
    return interests.length === 0 ? [] : [{ modality, interests }];
  });
  return { desiredLocation, modalities };
}

/** Agrupa os interesses de uma Home Edition; localizações pretendidas em ordem alfabética (pt-BR). */
export function groupHomeEditionInterests(
  records: readonly InterestRecord[],
): readonly LocationInterests[] {
  const locations = [...new Set(records.map((record) => record.desiredLocation))].sort(
    COLLATOR.compare,
  );
  return locations.map((location) =>
    locationInterests(
      location,
      records.filter((record) => record.desiredLocation === location),
    ),
  );
}
