import { z } from 'zod';
import { CommandRejection, type CommandHandler } from '@/features/platform';
import type { CivilCalendar, CivilDate, SealedNight } from '../domain/civil-calendar';

export const openExerciseInput = z.strictObject({
  second_home_id: z.uuid(),
  exercise_year: z.number().int().min(1).max(9999),
});
export type OpenExerciseInput = z.infer<typeof openExerciseInput>;

export type OpenExerciseResult = {
  readonly second_home_id: string;
  readonly exercise_year: number;
  readonly nights: number;
  readonly root_holder: string;
};

export type SealingModality = 'owner' | 'co_owner';

/** Second Home formalizada, como a selagem a lê (W8: modalidade, data-base civil e fuso). */
export interface SealingTarget {
  readonly secondHomeId: string;
  readonly modality: SealingModality;
  readonly operationStartDate: CivilDate;
  readonly timezone: string;
}

export interface SealingStore<Tx> {
  /** Preâmbulo da W8: trava consultiva da raiz Second Home, antes de qualquer leitura (formalização × selagem). */
  lockSecondHome(tx: Tx, secondHomeId: string): Promise<void>;
  isSealed(tx: Tx, secondHomeId: string, exerciseYear: number): Promise<boolean>;
  /** O instante da selagem é carimbado pelo banco (ADR-0024 §1), nunca enviado. */
  seal(tx: Tx, secondHomeId: string, nights: readonly SealedNight[]): Promise<void>;
}

export interface OpenExerciseDependencies<Tx> {
  readonly calendar: CivilCalendar;
  readonly store: SealingStore<Tx>;
  readonly findFormalized: (tx: Tx, secondHomeId: string) => Promise<SealingTarget | null>;
  /** Interface do inventory na mesma transação (TECH-011): custódia raiz de cada noite selada. */
  readonly openRoots: (
    tx: Tx,
    input: {
      readonly secondHomeId: string;
      readonly modality: SealingModality;
      readonly stayDates: readonly string[];
      readonly operationId: string;
    },
  ) => Promise<string>;
}

function seasonSummary(nights: readonly SealedNight[]) {
  return {
    alta: nights.filter((night) => night.season === 'alta').length,
    media: nights.filter((night) => night.season === 'media' && !night.isLeapDay).length,
    leap_day: nights.some((night) => night.isLeapDay),
  };
}

/**
 * `open_exercise` (TECH-021, TECH-041; spec calendar §5): sela, numa transação, todas as noites do exercício a partir
 * da data-base e abre a custódia raiz de cada uma. Exatamente-uma-vez pelo estado: já selado, sem formalização ou
 * anterior à data-base → `ERR_STATE_TRANSITION`, sem efeito.
 */
export function createOpenExerciseHandler<Tx>(
  deps: OpenExerciseDependencies<Tx>,
): CommandHandler<OpenExerciseInput, OpenExerciseResult, Tx> {
  return {
    command: 'open_exercise',
    input: openExerciseInput,
    secondHomeId: (input) => input.second_home_id,
    async execute({ input, tx, operationId, audit }) {
      const { second_home_id: secondHomeId, exercise_year: exerciseYear } = input;
      await deps.store.lockSecondHome(tx, secondHomeId);
      const home = await deps.findFormalized(tx, secondHomeId);
      if (home === null || exerciseYear < deps.calendar.exerciseYear(home.operationStartDate)) {
        throw new CommandRejection('ERR_STATE_TRANSITION');
      }
      if (await deps.store.isSealed(tx, secondHomeId, exerciseYear)) {
        throw new CommandRejection('ERR_STATE_TRANSITION');
      }
      const nights = deps.calendar.exerciseNights({
        exerciseYear,
        operationStartDate: home.operationStartDate,
        timezone: home.timezone,
      });
      await deps.store.seal(tx, secondHomeId, nights);
      const rootHolder = await deps.openRoots(tx, {
        secondHomeId,
        modality: home.modality,
        stayDates: nights.map((night) => night.stayDate),
        operationId,
      });
      // Uma auditoria por exercício (TECH-092), não por noite.
      audit({
        objectType: 'second_home_exercise',
        objectId: `${secondHomeId}:${exerciseYear}`,
        before: null,
        after: {
          exercise_year: exerciseYear,
          first_night: nights[0]?.stayDate ?? null,
          last_night: nights.at(-1)?.stayDate ?? null,
          nights: nights.length,
          ...seasonSummary(nights),
          root_holder: rootHolder,
        },
      });
      return {
        second_home_id: secondHomeId,
        exercise_year: exerciseYear,
        nights: nights.length,
        root_holder: rootHolder,
      };
    },
  };
}
