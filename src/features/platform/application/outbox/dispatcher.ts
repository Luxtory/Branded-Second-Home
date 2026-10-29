import type { Clock } from '../clock';
import type { LogPort } from '../log';
import type { ConsumerRegistry, OutboxEvent } from './consumers';

/** Persistência do outbox (implementação PostgreSQL em `infrastructure/outbox/`). */
export interface OutboxStore<Tx> {
  /**
   * Filter `eventTypes` and availability (`available_at` null or not after `at`, ADR-0022) before ordering/limiting/
   * locking, then lock the pending event with fewest attempts (then oldest) outside `skip`, in its own transaction,
   * without waiting for other scans. An empty list never queries events. `null` means no event.
   */
  withNextPending<T>(
    eventTypes: readonly string[],
    skip: readonly string[],
    work: (event: OutboxEvent, tx: Tx) => Promise<T>,
    at?: Date,
  ): Promise<{ readonly event: OutboxEvent; readonly value: T } | null>;
  /** Roda `work` isolado (savepoint): se lançar, só o efeito dele é desfeito, e o erro é relançado. */
  isolated(tx: Tx, work: () => Promise<void>): Promise<void>;
  /** Grava o recibo do consumidor; `false` = ele já recebeu este evento. */
  claimReceipt(tx: Tx, eventId: string, consumer: string, at: Date): Promise<boolean>;
  markDelivered(tx: Tx, eventId: string, at: Date): Promise<void>;
  markFailed(tx: Tx, eventId: string, errorName: string): Promise<void>;
  /** Falha da transação do evento fora do savepoint (COMMIT, conexão encerrada): registrada em transação própria. */
  recordFailure(eventId: string, errorName: string): Promise<void>;
}

export interface DispatchDependencies<Tx> {
  readonly store: OutboxStore<Tx>;
  readonly consumers: ConsumerRegistry<Tx>;
  readonly clock: Clock;
  /** `OUTBOX_BATCH_SIZE` do runbook (TECH-001). */
  readonly batchSize: number;
  readonly log: LogPort;
}

// Tipo (não interface) para servir de `JobResult`, que é um registro de contagens.
export type DispatchResult = {
  readonly delivered: number;
  readonly failed: number;
};

const MAX_ERROR_NAME = 200;

// Só o nome do erro sai do consumidor: mensagens podem carregar dado pessoal (TECH-100).
const errorName = (error: unknown): string =>
  (error instanceof Error ? error.name : 'UnknownError').slice(0, MAX_ERROR_NAME);

/**
 * Entrega ao menos uma vez (TECH-091): cada evento em transação própria, cada consumidor isolado. Falha de um
 * consumidor mantém o evento pendente para a próxima varredura e nunca desfaz o domínio. Falha da transação do evento
 * fora do savepoint (COMMIT com constraint diferida, conexão encerrada) é registrada à parte e a varredura continua;
 * sem evento travado (banco indisponível), o erro propaga (ADR-0022 §5).
 */
export async function dispatchOutbox<Tx>(deps: DispatchDependencies<Tx>): Promise<DispatchResult> {
  const eventTypes = deps.consumers.eventTypes();
  if (eventTypes.length === 0) return { delivered: 0, failed: 0 };
  const seen: string[] = [];
  let delivered = 0;
  while (seen.length < deps.batchSize) {
    const current: { event?: OutboxEvent } = {};
    let outcome: { readonly event: OutboxEvent; readonly value: boolean } | null;
    try {
      outcome = await deps.store.withNextPending(
        eventTypes,
        seen,
        (event, tx) => {
          current.event = event;
          return deliver(deps, event, tx);
        },
        deps.clock.now(),
      );
    } catch (error) {
      if (current.event === undefined) throw error;
      await recordAborted(deps, current.event, error);
      seen.push(current.event.id);
      continue;
    }
    if (outcome === null) break;
    seen.push(outcome.event.id);
    if (outcome.value) delivered += 1;
  }
  return { delivered, failed: seen.length - delivered };
}

async function recordAborted<Tx>(
  deps: DispatchDependencies<Tx>,
  event: OutboxEvent,
  error: unknown,
): Promise<void> {
  deps.log.error('outbox delivery failed', {
    event_id: event.id,
    event_type: event.type,
    phase: 'commit',
    error_name: errorName(error),
  });
  await deps.store.recordFailure(event.id, errorName(error));
}

async function deliver<Tx>(
  deps: DispatchDependencies<Tx>,
  event: OutboxEvent,
  tx: Tx,
): Promise<boolean> {
  const failures: string[] = [];
  for (const consumer of deps.consumers.forEvent(event.type)) {
    try {
      await deps.store.isolated(tx, async () => {
        if (!(await deps.store.claimReceipt(tx, event.id, consumer.name, deps.clock.now()))) return;
        await consumer.handle(event, tx);
      });
    } catch (error) {
      failures.push(errorName(error));
      deps.log.error('outbox delivery failed', {
        event_id: event.id,
        event_type: event.type,
        consumer: consumer.name,
        error_name: errorName(error),
      });
    }
  }
  const [firstFailure] = failures;
  if (firstFailure === undefined) {
    await deps.store.markDelivered(tx, event.id, deps.clock.now());
    return true;
  }
  await deps.store.markFailed(tx, event.id, firstFailure);
  return false;
}
