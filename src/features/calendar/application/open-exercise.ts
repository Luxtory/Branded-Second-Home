import { z } from 'zod';
import { CommandRejection, type CommandHandler } from '@/features/platform';
import type { CivilCalendar, CivilDate, SealedNight } from '../domain/civil-calendar';
import { isLeapYear, leapDayBeneficiary } from '../domain/use-right';
import type { UseRightCalendar } from '../domain/use-right-calendar';
import {
  LEAP_DAY_GRANTED,
  windowOpeningEvents,
  type UseRightFacts,
  type UseRightStore,
} from './use-rights';

/**
 * Passos do command de sistema `open_exercise` (spec calendar §5–§6), um por transação: `seal` sela o exercício, abre as
 * custódias raiz e concede o Direito de Uso da configuração (W10 + W11); `leap_day` concede o 29/02 quando o sorteio já
 * permite saber a Ação contemplada. Uma falha no 29/02 nunca desfaz a selagem.
 */
export const OPEN_EXERCISE_STEPS = ['seal', 'leap_day'] as const;
export type OpenExerciseStep = (typeof OPEN_EXERCISE_STEPS)[number];

export const openExerciseInput = z.strictObject({
  second_home_id: z.uuid(),
  exercise_year: z.number().int().min(1).max(9999),
  step: z.enum(OPEN_EXERCISE_STEPS).default('seal'),
});
export type OpenExerciseInput = z.infer<typeof openExerciseInput>;

export type OpenExerciseResult =
  | {
      readonly second_home_id: string;
      readonly exercise_year: number;
      readonly nights: number;
      readonly root_holder: string;
      readonly use_right_grants: number;
    }
  | {
      readonly second_home_id: string;
      readonly exercise_year: number;
      readonly step: 'leap_day';
      readonly stake_id: string;
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
  readonly useRightCalendar: UseRightCalendar;
  readonly store: SealingStore<Tx>;
  readonly useRights: UseRightStore<Tx>;
  readonly findFormalized: (tx: Tx, secondHomeId: string) => Promise<SealingTarget | null>;
  /** Superfície pública do ownership (TECH-011): fatos da formalização e do sorteio. */
  readonly findUseRightFacts: (tx: Tx, secondHomeId: string) => Promise<UseRightFacts | null>;
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

const notApplicable = () => new CommandRejection('ERR_STATE_TRANSITION');

/**
 * `open_exercise` (TECH-021, TECH-026, TECH-027, TECH-041, TECH-042; spec calendar §5–§6). Exatamente-uma-vez pelo
 * estado: passo já feito, sem formalização, anterior à data-base ou ainda não aplicável → `ERR_STATE_TRANSITION`, sem
 * efeito. O banco confere de novo cada concessão pelos fatos (ADR-0025).
 */
export function createOpenExerciseHandler<Tx>(
  deps: OpenExerciseDependencies<Tx>,
): CommandHandler<OpenExerciseInput, OpenExerciseResult, Tx> {
  return {
    command: 'open_exercise',
    input: openExerciseInput,
    secondHomeId: (input) => input.second_home_id,
    async execute(context) {
      const { input, tx } = context;
      await deps.store.lockSecondHome(tx, input.second_home_id);
      const home = await deps.findFormalized(tx, input.second_home_id);
      if (
        home === null ||
        input.exercise_year < deps.calendar.exerciseYear(home.operationStartDate)
      ) {
        throw notApplicable();
      }
      return input.step === 'seal'
        ? sealExercise(deps, context, home)
        : grantLeapDay(deps, context, home);
    },
  };
}

type Context<Tx> = Parameters<
  CommandHandler<OpenExerciseInput, OpenExerciseResult, Tx>['execute']
>[0];

async function sealExercise<Tx>(
  deps: OpenExerciseDependencies<Tx>,
  { input, tx, operationId, now, audit, emit }: Context<Tx>,
  home: SealingTarget,
): Promise<OpenExerciseResult> {
  const { second_home_id: secondHomeId, exercise_year: exerciseYear } = input;
  if (await deps.store.isSealed(tx, secondHomeId, exerciseYear)) throw notApplicable();
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
  let grants = 0;
  if (home.modality === 'co_owner') {
    const facts = await requiredFacts(deps, tx, secondHomeId);
    // BR-107/BR-108: o primeiro exercício vem da formalização (W8); do seguinte em diante, a configuração inteira.
    if (exerciseYear > deps.calendar.exerciseYear(home.operationStartDate)) {
      const configuration = facts.configuration!;
      for (const stakeId of facts.stakeIds) {
        for (const bucket of ['alta', 'media'] as const) {
          await deps.useRights.insertGrant(tx, {
            secondHomeId,
            acquisitionId: facts.acquisitionId,
            stakeId,
            exerciseYear,
            bucket,
            quantity: configuration[bucket],
            operationId,
          });
          grants += 1;
        }
      }
    }
    for (const event of windowOpeningEvents(facts, exerciseYear, now, deps.useRightCalendar))
      emit(event);
  }
  // Uma auditoria por exercício (TECH-092), não por noite nem por concessão.
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
      use_right_grants: grants,
    },
  });
  return {
    second_home_id: secondHomeId,
    exercise_year: exerciseYear,
    nights: nights.length,
    root_holder: rootHolder,
    use_right_grants: grants,
  };
}

/**
 * TECH-027/TECH-042: o 29/02 selado da operação vai para a Ação da lista bissexta, com saldo próprio 1. Sem sorteio
 * revelado, sem a noite selada, já concedido ou depois do fim efetivo (D5: sem concessão retroativa) → não aplicável.
 */
async function grantLeapDay<Tx>(
  deps: OpenExerciseDependencies<Tx>,
  { input, tx, operationId, now, audit, emit }: Context<Tx>,
  home: SealingTarget,
): Promise<OpenExerciseResult> {
  const { second_home_id: secondHomeId, exercise_year: exerciseYear } = input;
  if (home.modality !== 'co_owner' || !isLeapYear(exerciseYear)) throw notApplicable();
  const facts = await requiredFacts(deps, tx, secondHomeId);
  if (facts.drawn === null) throw notApplicable();
  const stakeId = leapDayBeneficiary({
    drawn: facts.drawn,
    operationStartDate: facts.operationStartDate,
    exerciseYear,
  });
  const end = deps.useRightCalendar.effectiveEnd('leap', exerciseYear, facts.timezone);
  if (
    stakeId === null ||
    now.getTime() >= end.getTime() ||
    !(await deps.useRights.isLeapNightSealed(tx, secondHomeId, exerciseYear)) ||
    (await deps.useRights.hasLeapDayGrant(tx, secondHomeId, exerciseYear))
  ) {
    throw notApplicable();
  }
  await deps.useRights.insertGrant(tx, {
    secondHomeId,
    acquisitionId: facts.acquisitionId,
    stakeId,
    exerciseYear,
    bucket: 'leap',
    quantity: 1,
    operationId,
  });
  // REQ-097: direito ao 29/02, notificado quando o direito abre para a Ação (TECH-042: na base).
  emit({
    type: LEAP_DAY_GRANTED,
    dedupKey: `${LEAP_DAY_GRANTED}:${secondHomeId}:${exerciseYear}`,
    payload: {
      second_home_id: secondHomeId,
      stake_id: stakeId,
      exercise_year: exerciseYear,
      expires_at: end.toISOString(),
    },
    availableAt: deps.useRightCalendar.windowBase({
      exerciseYear,
      formalizedAt: facts.formalizedAt,
      timezone: facts.timezone,
    }),
  });
  audit({
    objectType: 'use_right_leap_day',
    objectId: `${secondHomeId}:${exerciseYear}`,
    before: null,
    after: { exercise_year: exerciseYear, stake_id: stakeId, quantity: 1 },
  });
  return {
    second_home_id: secondHomeId,
    exercise_year: exerciseYear,
    step: 'leap_day',
    stake_id: stakeId,
  };
}

class UseRightFactsMissingError extends Error {
  constructor(secondHomeId: string) {
    super(`Formalized Second Home ${secondHomeId} has no use right facts`);
    this.name = 'UseRightFactsMissingError';
  }
}

async function requiredFacts<Tx>(
  deps: OpenExerciseDependencies<Tx>,
  tx: Tx,
  secondHomeId: string,
): Promise<UseRightFacts> {
  const facts = await deps.findUseRightFacts(tx, secondHomeId);
  if (facts === null || facts.configuration === null)
    throw new UseRightFactsMissingError(secondHomeId);
  return facts;
}
