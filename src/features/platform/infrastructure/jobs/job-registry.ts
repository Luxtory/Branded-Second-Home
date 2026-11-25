import {
  createCloseExerciseJob,
  createOpenExerciseJob,
  createUseRightConsumers,
} from '@/features/calendar/jobs';
import {
  createAdvanceBookingStatesJob,
  createFlagNoShowCandidatesJob,
  createOwnUseBookingConsumers,
} from '@/features/booking/jobs';
import { createReconciliationJob } from '@/features/billing/jobs';
import { createExpireCreditLotsJob } from '@/features/credits/jobs';
import { createMembershipConsumers } from '@/features/identity/jobs';
import { createExpireRequestsJob, createLuxchangeConsumers } from '@/features/luxchange/jobs';
import { createInitialDrawConsumers } from '@/features/ownership';
import type { Clock } from '../../application/clock';
import { JobRegistry, type JobResult, type JobRunner } from '../../application/jobs/registry';
import type { LogPort } from '../../application/log';
import { ConsumerRegistry } from '../../application/outbox/consumers';
import { dispatchOutbox } from '../../application/outbox/dispatcher';
import type { Database, DatabaseTransaction } from '../database/connection';
import { getDatabase } from '../database/connection';
import { loadRuntimeConfig, type EnvSource } from '../env';
import { createPostgresOutboxStore } from '../outbox/postgres-outbox-store';
import { systemClock } from '../system-clock';

export interface JobEnvironment {
  readonly log: LogPort;
  readonly source?: EnvSource;
  readonly clock?: Clock;
}

/**
 * Consumidores do outbox: cada wave registra aqui os consumidores dos eventos que produz (AsyncAPI). Criados a cada
 * varredura, sem ler configuração: o estado de falha rápida do beacon vale só para ela (ADR-0022 §6).
 */
export function createOutboxConsumers({
  source,
  clock,
  onRequestClosureDue,
}: Omit<JobEnvironment, 'log'> & {
  readonly onRequestClosureDue?: () => void;
}): ConsumerRegistry<DatabaseTransaction> {
  return new ConsumerRegistry<DatabaseTransaction>([
    // W9 — sorteio inicial (spec ownership §16).
    ...createInitialDrawConsumers({ source, clock }),
    // W11 — janelas e notificações do Direito de Uso (spec calendar §6).
    ...createUseRightConsumers({ clock }),
    // W12 — notificação da confirmação da reserva de uso próprio (spec booking).
    ...createOwnUseBookingConsumers({ clock }),
    // W15 — notificação da mudança de estado do Membership (spec identity §15).
    ...createMembershipConsumers({ clock }),
    // W20 — notificação da originação de Créditos pelo depósito Luxchange (spec luxchange §5.5); W21 — notificações
    // do envio e do encerramento da Request (spec luxchange §13.6) e o gatilho dos encerramentos por evento.
    ...createLuxchangeConsumers({ clock, onRequestClosureDue }),
  ]);
}

/**
 * Varredura do outbox (TECH-090 `outbox`, TECH-091); também serve de disparo logo após um commit. W21 (ADR-0037 §7):
 * se a varredura entregou evento que pode tirar a elegibilidade de uma Request, depois dela — com as transações de
 * entrega já encerradas — roda uma vez o job `expire_requests`, que encerra pelo executor só as Requests que o banco diz
 * não poderem mais ser aceitas. Falha aqui só vira log: o evento já foi entregue e o cron diário recupera.
 */
export function createOutboxDispatch({
  log,
  source,
  clock = systemClock,
  database,
  closeRequests,
}: JobEnvironment & {
  readonly database?: Database;
  /** Encerramentos por evento; padrão: o job `expire_requests` de produção. */
  readonly closeRequests?: JobRunner;
}): JobRunner {
  return async (context) => {
    const { OUTBOX_BATCH_SIZE } = loadRuntimeConfig(['OUTBOX_BATCH_SIZE'], source);
    const db = database ?? getDatabase(source);
    let closureDue = false;
    const result = await dispatchOutbox({
      store: createPostgresOutboxStore(db),
      consumers: createOutboxConsumers({
        source,
        clock,
        onRequestClosureDue: () => {
          closureDue = true;
        },
      }),
      clock,
      batchSize: OUTBOX_BATCH_SIZE,
      log,
    });
    if (!closureDue) return result;
    const close = closeRequests ?? createExpireRequestsJob({ log, source, clock, database: db });
    try {
      return { ...result, ...prefixed('request_closures_', await close(context)) };
    } catch (error) {
      log.error('request closures after outbox failed', {
        error_name: error instanceof Error ? error.name : 'UnknownError',
      });
      return { ...result, request_closures_failed: 1 };
    }
  };
}

const prefixed = (prefix: string, counts: JobResult): JobResult =>
  Object.fromEntries(Object.entries(counts).map(([key, value]) => [`${prefix}${key}`, value]));

/** Jobs implementados, com as dependências de produção. */
export function createJobRegistry(environment: JobEnvironment): JobRegistry {
  return new JobRegistry({
    outbox: createOutboxDispatch(environment),
    // W10 — selagem e custódia raiz (spec calendar §5); W11 — concessões e 29/02 (spec calendar §6).
    open_exercise: createOpenExerciseJob(environment),
    // W11 — expiração do Direito de Uso no fim efetivo (spec calendar §6).
    close_exercise: createCloseExerciseJob(environment),
    // W13 — estado informativo da reserva de uso próprio pelo instante (spec booking §10.14).
    advance_booking_states: createAdvanceBookingStatesJob(environment),
    // W13 — candidatas a no-show; nunca declara (spec booking §10.14).
    flag_no_show_candidates: createFlagNoShowCandidatesJob(environment),
    // W17 — materializa a expiração do saldo disponível de lotes vencidos; nunca prorroga (spec credits §5.3).
    expire_credit_lots: createExpireCreditLotsJob(environment),
    // W19 — conciliação de pagamentos e estornos; no-op sem gateway (spec billing §4.5).
    reconciliation: createReconciliationJob(environment),
    // W21 — encerramentos pré-aceite das Requests vencidas ou inelegíveis; nunca a única proteção (ADR-0037 §7).
    expire_requests: createExpireRequestsJob(environment),
  });
}
