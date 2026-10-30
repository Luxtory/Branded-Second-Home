import { sql } from 'kysely';
import type { Database, DatabaseTransaction } from '@/features/platform';
import type { AcquisitionModality } from './formalized-second-homes';

/**
 * Fatos imutáveis da formalização (W8) e do sorteio (W9) que o Direito de Uso do calendar lê (W11, spec calendar §6):
 * data-base, instante da formalização, fuso, configuração, Ações e posições sorteadas — estas só depois da revelação.
 */
export interface UseRightFacts {
  readonly secondHomeId: string;
  readonly acquisitionId: string;
  readonly modality: AcquisitionModality;
  /** Data-base civil `YYYY-MM-DD` (ADR-0021). */
  readonly operationStartDate: string;
  readonly formalizedAt: Date;
  readonly timezone: string;
  /** Co-Owner: N e limites por categoria da configuração canônica; Owner: `null`. */
  readonly configuration: {
    readonly stakes: number;
    readonly alta: number;
    readonly media: number;
  } | null;
  /** Ações em ordem de `allocation_position` (técnica, nunca a ordem sorteada). */
  readonly stakeIds: readonly string[];
  /** Posição inicial de cada Ação (TECH-093); `null` enquanto o sorteio não foi revelado. */
  readonly drawn: readonly { readonly stakeId: string; readonly position: number }[] | null;
}

type Executor = Database | DatabaseTransaction;

class UnexpectedModalityError extends Error {
  constructor(value: string) {
    super(`Unexpected acquisition modality: ${value}`);
    this.name = 'UnexpectedModalityError';
  }
}

function modalityOf(value: string): AcquisitionModality {
  if (value === 'owner' || value === 'co_owner') return value;
  throw new UnexpectedModalityError(value);
}

async function factsOf(db: Executor, secondHomeIds: readonly string[] | null) {
  let query = db
    .selectFrom('app.acquisition as a')
    .innerJoin('app.second_home as h', 'h.id', 'a.second_home_id')
    .leftJoin('app.second_home_configuration as c', 'c.id', 'a.configuration_id')
    .select([
      'a.id as acquisitionId',
      'a.second_home_id as secondHomeId',
      'a.modality as modality',
      sql<string>`a.operation_start_date::text`.as('operationStartDate'),
      'a.formalized_at as formalizedAt',
      'h.timezone as timezone',
      'c.id as stakes',
      'c.alta as alta',
      'c.media as media',
    ])
    .orderBy('a.second_home_id');
  if (secondHomeIds !== null) {
    if (secondHomeIds.length === 0) return [];
    query = query.where('a.second_home_id', 'in', secondHomeIds);
  }
  const homes = await query.execute();
  if (homes.length === 0) return [];
  const acquisitionIds = homes.map((home) => home.acquisitionId);
  const stakes = await db
    .selectFrom('app.stake as s')
    .leftJoin('app.initial_draw as d', 'd.acquisition_id', 's.acquisition_id')
    .leftJoin('app.initial_draw_reveal as r', 'r.draw_id', 'd.id')
    .leftJoin('app.initial_draw_position as p', (join) =>
      join.onRef('p.draw_id', '=', 'r.draw_id').onRef('p.stake_id', '=', 's.id'),
    )
    .select(['s.acquisition_id as acquisitionId', 's.id as stakeId', 'p.position as position'])
    .where('s.acquisition_id', 'in', acquisitionIds)
    .orderBy('s.acquisition_id')
    .orderBy('s.allocation_position')
    .execute();
  return homes.map((home): UseRightFacts => {
    const own = stakes.filter((stake) => stake.acquisitionId === home.acquisitionId);
    const revealed = own.length > 0 && own.every((stake) => stake.position !== null);
    return {
      secondHomeId: home.secondHomeId,
      acquisitionId: home.acquisitionId,
      modality: modalityOf(home.modality),
      operationStartDate: home.operationStartDate,
      formalizedAt: new Date(home.formalizedAt),
      timezone: home.timezone,
      configuration:
        home.stakes === null || home.alta === null || home.media === null
          ? null
          : { stakes: home.stakes, alta: home.alta, media: home.media },
      stakeIds: own.map((stake) => stake.stakeId),
      drawn: revealed
        ? own.map((stake) => ({ stakeId: stake.stakeId, position: stake.position! }))
        : null,
    };
  });
}

/** Fatos de uma Second Home formalizada, ou `null` sem formalização. */
export async function findUseRightFacts(
  db: Executor,
  secondHomeId: string,
): Promise<UseRightFacts | null> {
  return (await factsOf(db, [secondHomeId]))[0] ?? null;
}

/** Fatos de todas as Second Homes formalizadas, em ordem estável. */
export async function listUseRightFacts(db: Executor): Promise<readonly UseRightFacts[]> {
  return factsOf(db, null);
}

/** Pessoas ou empresas titulares vigentes da Ação no instante (destinatários das notificações do calendar, W11). */
export async function stakeHolders(
  db: Executor,
  stakeId: string,
  at: Date,
): Promise<readonly string[]> {
  const rows = await db
    .selectFrom('app.holding')
    .select('party_id')
    .distinct()
    .where('stake_id', '=', stakeId)
    .where('valid_from', '<=', at)
    .where((eb) => eb.or([eb('valid_until', 'is', null), eb('valid_until', '>', at)]))
    .orderBy('party_id')
    .execute();
  return rows.map((row) => row.party_id);
}
