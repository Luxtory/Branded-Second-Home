import type { JsonObject } from '../../domain/json';

/** Evento do outbox como os consumidores o recebem (envelope do `docs/api/asyncapi.yaml`). */
export interface OutboxEvent {
  readonly id: string;
  readonly type: string;
  readonly dedupKey: string;
  readonly operationId: string;
  readonly occurredAt: Date;
  readonly payload: JsonObject;
}

/**
 * Consumidor idempotente (TECH-091): recebe o evento dentro de uma transação junto com o próprio recibo, então uma
 * entrega repetida não repete os efeitos **no banco** feitos com `tx`. Efeito externo (e-mail, PSP, HTTP) não entra
 * nessa transação e pode se repetir se ela falhar depois da chamada: use idempotência no destino, com `event.id` como
 * chave. Nunca decide estado crítico: invoca os mesmos commands (ADR-006 do `03`).
 */
export interface OutboxConsumer<Tx> {
  readonly name: string;
  readonly eventTypes: readonly string[];
  handle(event: OutboxEvent, tx: Tx): Promise<void>;
}

const CONSUMER_NAME = /^[a-z][a-z0-9_]*$/;
const EVENT_TYPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export class ConsumerRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsumerRegistryError';
  }
}

/** Registro de consumidores do outbox, separado do registro de jobs. */
export class ConsumerRegistry<Tx> {
  private readonly byName = new Map<string, OutboxConsumer<Tx>>();

  constructor(consumers: readonly OutboxConsumer<Tx>[]) {
    for (const consumer of consumers) {
      if (!CONSUMER_NAME.test(consumer.name) || this.byName.has(consumer.name)) {
        throw new ConsumerRegistryError(`Invalid or duplicate consumer: ${consumer.name}`);
      }
      const invalid = consumer.eventTypes.find((type) => !EVENT_TYPE.test(type));
      if (invalid !== undefined) {
        throw new ConsumerRegistryError(`Invalid event type for ${consumer.name}: ${invalid}`);
      }
      this.byName.set(consumer.name, consumer);
    }
  }

  forEvent(eventType: string): readonly OutboxConsumer<Tx>[] {
    return [...this.byName.values()].filter((consumer) => consumer.eventTypes.includes(eventType));
  }

  /** Eligible event types for SQL filtering before batch limits and locks (ADR-0021). */
  eventTypes(): readonly string[] {
    return [...new Set([...this.byName.values()].flatMap((consumer) => consumer.eventTypes))];
  }
}
