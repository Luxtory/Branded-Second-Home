import { z } from 'zod';
import {
  CapabilityNotActivatedError,
  CommandRejection,
  isNonPersonalReference,
  type Actor,
  type CommandHandler,
} from '@/features/platform';
import {
  LUXTORY_PURPOSES,
  type LuxtoryPurpose,
  type LuxtorySelectionInventory,
} from '@/features/inventory';
import {
  nightRefusal,
  requestedByCategory,
  type SelectionNightFacts,
  type SelectionSeason,
} from '../domain/luxtory-selection';

/** K3 (ADR-0030 §2). */
export const LUXTORY_SELECTION_CAPABILITY = 'luxtory_selection';
/** Limite técnico do lote (um exercício inteiro); não é regra de negócio. */
export const MAX_SELECTION_NIGHTS = 366;

const civilDate = z.iso.date();

export const selectLuxtoryCapacityInput = z
  .strictObject({
    second_home_id: z.uuid(),
    nights: z
      .array(z.strictObject({ stay_date: civilDate, purpose: z.enum(LUXTORY_PURPOSES) }))
      .min(1)
      .max(MAX_SELECTION_NIGHTS),
    /** Base registrada (TECH-051): referência não pessoal a um registro verificável. */
    basis: z.string().trim().min(1).max(255).refine(isNonPersonalReference),
  })
  .refine(
    (input) => new Set(input.nights.map((night) => night.stay_date)).size === input.nights.length,
    {
      path: ['nights'],
      message: 'uniqueDates',
    },
  );

export type SelectLuxtoryCapacityInput = z.infer<typeof selectLuxtoryCapacityInput>;

export type SelectLuxtoryCapacityResult = {
  readonly second_home_id: string;
  readonly selected: readonly { readonly stay_date: string; readonly purpose: LuxtoryPurpose }[];
};

export interface LuxtorySelectionStore<Tx> {
  /** K3; a leitura mantém a tabela de ativação travada em modo compartilhado. */
  capabilityActive(tx: Tx): Promise<boolean>;
  /** Modalidade da aquisição da Second Home, ou `null` sem aquisição formalizada. */
  modality(tx: Tx, secondHomeId: string): Promise<'owner' | 'co_owner' | null>;
  lockNights(tx: Tx, secondHomeId: string, stayDates: readonly string[]): Promise<void>;
  nights(
    tx: Tx,
    secondHomeId: string,
    stayDates: readonly string[],
  ): Promise<readonly SelectionNightFacts[]>;
  /** Janela N+1 (`app.luxtory_window_opens_at`); `null` = sem janela (sorteio não revelado, exercício anterior). */
  windowOpensAt(tx: Tx, secondHomeId: string, exerciseYear: number): Promise<Date | null>;
  lockCapacity(tx: Tx, secondHomeId: string, exerciseYear: number): Promise<void>;
  capacity(
    tx: Tx,
    secondHomeId: string,
    exerciseYear: number,
    season: SelectionSeason,
  ): Promise<number>;
  used(
    tx: Tx,
    secondHomeId: string,
    exerciseYear: number,
    season: SelectionSeason,
  ): Promise<number>;
}

export interface SelectLuxtoryCapacityDependencies<Tx> {
  readonly store: LuxtorySelectionStore<Tx>;
  readonly inventory: LuxtorySelectionInventory<Tx>;
  assertAdmin(tx: Tx, actor: Actor, authorizationRef: string): Promise<void>;
}

const reject = (code: ConstructorParameters<typeof CommandRejection>[0]) =>
  new CommandRejection(code);

/**
 * `select_luxtory_capacity` (REQ-016, REQ-036; BR-120 a BR-122; TECH-022, TECH-027, TECH-051, TECH-053; ADR-0030;
 * spec calendar §9): Admin + base registrada; só a custódia `spe_pool → luxtory/{finalidade}` (D1). Ordem: autoridade
 * → K3 → modalidade → noites (classe 5) → fatos e janela → capacidade (entre 5 e 6) → custódias (classe 6). Lote
 * atômico: qualquer noite recusada recusa tudo. O banco revalida cada escrita no gatilho.
 */
export function createSelectLuxtoryCapacityHandler<Tx>(
  deps: SelectLuxtoryCapacityDependencies<Tx>,
): CommandHandler<SelectLuxtoryCapacityInput, SelectLuxtoryCapacityResult, Tx> {
  return {
    command: 'select_luxtory_capacity',
    input: selectLuxtoryCapacityInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx, locks, now } = context;
      const home = input.second_home_id;
      await deps.assertAdmin(tx, context.actor, context.authorizationRef);
      if (!(await deps.store.capabilityActive(tx)))
        throw new CapabilityNotActivatedError(LUXTORY_SELECTION_CAPABILITY);
      const modality = await deps.store.modality(tx, home);
      if (modality === null) throw reject('ERR_NOT_FOUND');
      // REQ-037: a Second Home Owner não tem capacidade Luxtory.
      if (modality !== 'co_owner') throw reject('ERR_CAPACITY_UNAVAILABLE');

      const nights = [...input.nights].sort((a, b) => a.stay_date.localeCompare(b.stay_date));
      const dates = nights.map((night) => night.stay_date);
      const nightKeys = locks.claim(
        'second_home_date',
        dates.map((date) => [home, date] as const),
      );
      await deps.store.lockNights(
        tx,
        home,
        nightKeys.map(([, date]) => date),
      );
      const facts = await deps.store.nights(tx, home, dates);
      const byDate = new Map(facts.map((fact) => [fact.stayDate, fact]));
      for (const date of dates)
        if (nightRefusal(byDate.get(date), now) !== null) throw reject('ERR_CAPACITY_UNAVAILABLE');

      const exercises = [...new Set(facts.map((fact) => fact.exerciseYear))].sort((a, b) => a - b);
      for (const year of exercises) {
        const opens = await deps.store.windowOpensAt(tx, home, year);
        if (opens === null || now.getTime() < opens.getTime()) throw reject('ERR_WINDOW_NOT_OPEN');
      }
      for (const [, year] of locks.claim(
        'luxtory_capacity',
        exercises.map((year) => [home, String(year)] as const),
      ))
        await deps.store.lockCapacity(tx, home, Number(year));
      for (const [key, requested] of requestedByCategory(facts)) {
        const [year, season] = key.split(':') as [string, SelectionSeason];
        const exercise = Number(year);
        const capacity = await deps.store.capacity(tx, home, exercise, season);
        const used = await deps.store.used(tx, home, exercise, season);
        // INV-4 / REQ-098: causa "saldo ou limite sazonal" (o texto ao Admin não fala em Direito de Uso).
        if (used + requested > capacity) throw reject('ERR_USE_RIGHT_BALANCE');
      }

      locks.claim(
        'balance_and_custody',
        dates.map((date) => [home, date] as const),
      );
      const states = new Map(
        (await deps.inventory.nightStates(tx, home, dates)).map((s) => [s.stayDate, s]),
      );
      for (const night of nights) {
        const state = states.get(night.stay_date);
        if (state === undefined || state.holderKind !== 'spe_pool' || state.occupied)
          throw reject('ERR_CAPACITY_UNAVAILABLE');
        const opened = await deps.inventory.select(tx, {
          secondHomeId: home,
          stayDate: night.stay_date,
          parentCustodyId: state.custodyId,
          purpose: night.purpose,
          authorizationRef: input.basis,
          operationId: context.operationId,
        });
        if (opened === null) throw reject('ERR_CAPACITY_UNAVAILABLE');
      }

      const selected = nights.map((night) => ({
        stay_date: night.stay_date,
        purpose: night.purpose,
      }));
      context.audit({
        objectType: 'second_home',
        objectId: home,
        before: null,
        after: { act: 'select_luxtory_capacity', basis: input.basis, nights: selected },
      });
      return { second_home_id: home, selected };
    },
  };
}
