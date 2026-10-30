import { z } from 'zod';
import type { Clock, ConsumerEventDraft, OutboxConsumer } from '@/features/platform';
import type { UseRightCalendar } from '../domain/use-right-calendar';
import {
  LEAP_DAY_GRANTED,
  USE_WINDOW_OPENED,
  windowOpeningEvents,
  type UseRightFacts,
  type UseRightStore,
} from './use-rights';

/** Evento do ownership (W9, AsyncAPI) que torna as posições conhecidas. */
const INITIAL_DRAW_COMPLETED = 'ownership.initial_draw_completed';

export const USE_WINDOW_NOTIFICATION = 'calendar.use_window_opened';
export const LEAP_DAY_NOTIFICATION = 'calendar.leap_day_right';

const drawCompleted = z.object({ second_home_id: z.uuid() }).loose();
const windowOpened = z
  .object({
    second_home_id: z.uuid(),
    stake_id: z.uuid(),
    exercise_year: z.number().int(),
    position: z.number().int(),
  })
  .loose();
const leapDayGranted = z
  .object({
    second_home_id: z.uuid(),
    stake_id: z.uuid(),
    exercise_year: z.number().int(),
    expires_at: z.iso.datetime(),
  })
  .loose();

export interface UseRightConsumerDependencies<Tx> {
  readonly clock: Clock;
  readonly useRightCalendar: UseRightCalendar;
  readonly useRights: Pick<UseRightStore<Tx>, 'sealedExerciseYears'>;
  readonly lockSecondHome: (tx: Tx, secondHomeId: string) => Promise<void>;
  readonly findUseRightFacts: (tx: Tx, secondHomeId: string) => Promise<UseRightFacts | null>;
  readonly enqueue: (tx: Tx, draft: ConsumerEventDraft) => Promise<boolean>;
  /** Pessoas ou empresas titulares vigentes da Ação no instante (superfície pública do ownership). */
  readonly stakeHolders: (tx: Tx, stakeId: string, at: Date) => Promise<readonly string[]>;
  readonly notify: (
    tx: Tx,
    draft: {
      readonly eventId: string;
      readonly recipientPartyId: string;
      readonly kind: string;
      readonly data: Record<string, string | number>;
      readonly at: Date;
    },
  ) => Promise<boolean>;
}

/**
 * Janelas dos exercícios já selados quando o sorteio termina depois da selagem (W9 → W11). Sob a mesma trava da Second
 * Home do passo `seal`: um dos dois sempre enxerga selagem e revelação commitadas, e a `dedup_key` descarta a cópia.
 */
function windowsOnDraw<Tx>(deps: UseRightConsumerDependencies<Tx>): OutboxConsumer<Tx> {
  return {
    name: 'calendar_use_windows_on_draw',
    eventTypes: [INITIAL_DRAW_COMPLETED],
    async handle(event, tx) {
      const { second_home_id: secondHomeId } = drawCompleted.parse(event.payload);
      await deps.lockSecondHome(tx, secondHomeId);
      const facts = await deps.findUseRightFacts(tx, secondHomeId);
      if (facts === null) return;
      const at = deps.clock.now();
      for (const exerciseYear of await deps.useRights.sealedExerciseYears(tx, secondHomeId)) {
        for (const draft of windowOpeningEvents(facts, exerciseYear, at, deps.useRightCalendar)) {
          await deps.enqueue(tx, { ...draft, operationId: event.operationId, occurredAt: at });
        }
      }
    },
  };
}

/**
 * Registro das notificações (REQ-097; catálogo e interface na W30): uma por titular vigente da Ação na entrega — a
 * posição pertence à Ação e sobrevive a uma transferência (TECH-042). Só ids e números. Notificação não cria direito: o
 * 29/02 já vencido não é notificado.
 */
function notifications<Tx>(deps: UseRightConsumerDependencies<Tx>): OutboxConsumer<Tx> {
  return {
    name: 'calendar_use_right_notification',
    eventTypes: [USE_WINDOW_OPENED, LEAP_DAY_GRANTED],
    async handle(event, tx) {
      const at = deps.clock.now();
      let kind: string;
      let data: Record<string, string | number>;
      let stakeId: string;
      if (event.type === USE_WINDOW_OPENED) {
        const payload = windowOpened.parse(event.payload);
        kind = USE_WINDOW_NOTIFICATION;
        stakeId = payload.stake_id;
        data = {
          second_home_id: payload.second_home_id,
          exercise_year: payload.exercise_year,
          position: payload.position,
        };
      } else {
        const payload = leapDayGranted.parse(event.payload);
        if (at.getTime() >= new Date(payload.expires_at).getTime()) return;
        kind = LEAP_DAY_NOTIFICATION;
        stakeId = payload.stake_id;
        data = { second_home_id: payload.second_home_id, exercise_year: payload.exercise_year };
      }
      for (const recipientPartyId of await deps.stakeHolders(tx, stakeId, at)) {
        await deps.notify(tx, { eventId: event.id, recipientPartyId, kind, data, at });
      }
    },
  };
}

export function buildUseRightConsumers<Tx>(
  deps: UseRightConsumerDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  return [windowsOnDraw(deps), notifications(deps)];
}
