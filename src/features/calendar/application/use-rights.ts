import type { JsonObject } from '@/features/platform';
import type { CivilDate } from '../domain/civil-calendar';
import { ordinaryOrder, type DrawnStake, type UseRightBucket } from '../domain/use-right';
import type { UseRightCalendar } from '../domain/use-right-calendar';

/** Eventos do Direito de Uso (AsyncAPI): só ids, números e instantes, sem dado pessoal (TECH-091, REQ-097). */
export const USE_WINDOW_OPENED = 'calendar.use_window_opened';
export const LEAP_DAY_GRANTED = 'calendar.leap_day_granted';

/** Fatos imutáveis da formalização e do sorteio (lidos pela superfície pública do ownership). */
export interface UseRightFacts {
  readonly secondHomeId: string;
  readonly acquisitionId: string;
  readonly modality: 'owner' | 'co_owner';
  readonly operationStartDate: CivilDate;
  readonly formalizedAt: Date;
  readonly timezone: string;
  readonly configuration: {
    readonly stakes: number;
    readonly alta: number;
    readonly media: number;
  } | null;
  readonly stakeIds: readonly string[];
  /** `null` enquanto o sorteio não foi revelado. */
  readonly drawn: readonly DrawnStake[] | null;
}

export interface UseRightGrant {
  readonly secondHomeId: string;
  readonly acquisitionId: string;
  readonly stakeId: string;
  readonly exerciseYear: number;
  readonly bucket: UseRightBucket;
  readonly quantity: number;
  readonly operationId: string;
}

export interface ExpirableBalance {
  readonly stakeId: string;
  readonly bucket: UseRightBucket;
  readonly remaining: number;
}

/** Ledger e projeção do TECH-026 por SQL direto do servidor; o banco confere cada movimento pelos fatos. */
export interface UseRightStore<Tx> {
  insertGrant(tx: Tx, grant: UseRightGrant): Promise<void>;
  insertExpiration(tx: Tx, expiration: UseRightGrant): Promise<void>;
  hasLeapDayGrant(tx: Tx, secondHomeId: string, exerciseYear: number): Promise<boolean>;
  isLeapNightSealed(tx: Tx, secondHomeId: string, exerciseYear: number): Promise<boolean>;
  sealedExerciseYears(tx: Tx, secondHomeId: string): Promise<readonly number[]>;
  /** Saldos com sobra do exercício, em ordem determinística (Ação, bucket). */
  remainingBalances(
    tx: Tx,
    secondHomeId: string,
    exerciseYear: number,
  ): Promise<readonly ExpirableBalance[]>;
}

export interface WindowEventDraft {
  readonly type: string;
  readonly dedupKey: string;
  readonly payload: JsonObject;
  readonly availableAt: Date;
}

/**
 * Uma notificação por Ação na abertura da própria janela (REQ-097, D4): o evento fica disponível no instante canônico
 * (`available_at`); janela já aberta é entregue já. Exercício encerrado não notifica. Elegibilidade nunca depende da
 * entrega: é sempre recalculada pelas regras (`UseRightCalendar`).
 */
export function windowOpeningEvents(
  facts: UseRightFacts,
  exerciseYear: number,
  now: Date,
  calendar: UseRightCalendar,
): readonly WindowEventDraft[] {
  if (facts.modality !== 'co_owner' || facts.drawn === null || facts.configuration === null)
    return [];
  if (now.getTime() >= calendar.effectiveEnd('media', exerciseYear, facts.timezone).getTime())
    return [];
  const order = ordinaryOrder(facts.drawn, facts.operationStartDate, exerciseYear);
  return order.map((stakeId, index) => {
    const opensAt = calendar.windowOpensAt({
      exerciseYear,
      position: index + 1,
      stakes: order.length,
      formalizedAt: facts.formalizedAt,
      timezone: facts.timezone,
    });
    return {
      type: USE_WINDOW_OPENED,
      dedupKey: `${USE_WINDOW_OPENED}:${stakeId}:${exerciseYear}`,
      payload: {
        second_home_id: facts.secondHomeId,
        stake_id: stakeId,
        exercise_year: exerciseYear,
        position: index + 1,
        opens_at: opensAt.toISOString(),
      },
      availableAt: opensAt,
    };
  });
}
