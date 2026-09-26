import type { Clock } from '../clock';
import type { LogPort } from '../log';
import type { ConsumerRegistry, OutboxEvent } from './consumers';

/** Persistência do outbox (implementação PostgreSQL em `infrastructure/outbox/`). */
export interface OutboxStore<Tx> {
  /**
   * Em transação própria, trava o evento pendente mais antigo fora de `skip` (sem esperar por eventos travados por
   * outra varredura) e roda `work`. `null` quando não há evento.
   */
  withNextPending<T>(
    skip: readonly string[],
    work: (event: OutboxEvent, tx: Tx) => Promise<T>,
  ): Promise<{ readonly event: OutboxEvent; readonly value: T } | null>;
  /** Roda `work` isolado (savepoint): se lançar, só o efeito dele é desfeito, e o erro é relançado. */
  isolated(tx: Tx, work: () => Promise<void>): Promise<void>;
  /** Grava o recibo do consumidor; `false` = ele já recebeu este evento. */
  claimReceipt(tx: Tx, eventId: string, consumer: string, at: Date): Promise<boolean>;
  markDelivered(tx: Tx, eventId: string, at: Date): Promise<void>;
  markFailed(tx: Tx, eventId: string, errorName: string): Promise<void>;
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
 * consumidor mantém o evento pendente para a próxima varredura e nunca desfaz o domínio.
 */
export async function dispatchOutbox<Tx>(deps: DispatchDependencies<Tx>): Promise<DispatchResult> {
  const seen: string[] = [];
  let delivered = 0;
  while (seen.length < deps.batchSize) {
    const outcome = await deps.store.withNextPending(seen, (event, tx) => deliver(deps, event, tx));
    if (outcome === null) break;
    seen.push(outcome.event.id);
    if (outcome.value) delivered += 1;
  }
  return { delivered, failed: seen.length - delivered };
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
