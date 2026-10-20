import type { RejectionCode } from '../../domain/errors';
import type { JsonObject, JsonValue } from '../../domain/json';
import type { Actor } from './actor';
import type { CommandSpec } from './registry';

/** Decisão do guard (W2). `authorizationRef` identifica a autorização ou a base registrada (TECH-002). */
export type AuthorizationDecision =
  { readonly allowed: true; readonly authorizationRef: string } | { readonly allowed: false };

/** Objeto sobre o qual o command age (ex.: um Home Concept); o guard confere contra o escopo do `authorization_grant`. */
export interface CommandScope {
  readonly type: string;
  readonly id: string;
}

export interface CommandGuard {
  authorize(
    spec: CommandSpec,
    actor: Actor,
    input: unknown,
    scope: CommandScope | null,
  ): Promise<AuthorizationDecision>;
}

/** Resposta gravada para o replay (ADR-006 do `03`). */
export type StoredResponse =
  | { readonly outcome: 'committed'; readonly result: JsonValue }
  | { readonly outcome: 'rejected'; readonly code: RejectionCode };

export interface IdempotencyEntry {
  readonly command: string;
  readonly requestHash: string;
  readonly operationId: string;
  readonly response: StoredResponse | null;
}

/** Uma tentativa de command: as colunas do TECH-002 mais o escopo e o hash da idempotência. */
export interface OperationDraft {
  readonly id: string;
  readonly command: string;
  readonly actor: Actor;
  readonly secondHomeId: string | null;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly authorizationRef: string;
  readonly scope: string;
  readonly requestHash: string;
  readonly at: Date;
}

/** Objeto e antes/depois de um registro de auditoria; ator, papel, instante, operation e base vêm do draft. */
export interface AuditRecord {
  readonly objectType: string;
  readonly objectId: string;
  readonly before: JsonValue | null;
  readonly after: JsonValue | null;
}

export interface OutboxEventDraft {
  readonly type: string;
  readonly dedupKey: string;
  readonly payload: JsonObject;
}

/** Persistência do pipeline de commands (implementação PostgreSQL em `infrastructure/commands/`). */
export interface CommandStore<Tx> {
  findIdempotency(scope: string, idempotencyKey: string): Promise<IdempotencyEntry | null>;
  /** Transação `READ COMMITTED` (ADR-005) com `lock_timeout` local. */
  transaction<T>(lockTimeoutMs: number, work: (tx: Tx) => Promise<T>): Promise<T>;
  /** Cria `operation(pending)` e reserva a chave; `false` = chave já usada (desfazer a transação). */
  reserve(tx: Tx, draft: OperationDraft): Promise<boolean>;
  /** Auditoria, eventos, `operation(committed)` e resposta gravada, na transação do command. */
  complete(
    tx: Tx,
    draft: OperationDraft,
    result: JsonValue,
    audit: readonly AuditRecord[],
    events: readonly OutboxEventDraft[],
  ): Promise<void>;
  /** Em transação própria: `operation(failed)` e resposta `rejected`; `false` = chave já usada. */
  recordRejection(draft: OperationDraft, code: RejectionCode): Promise<boolean>;
  /** Deadlock ou tempo de espera de lock esgotado (TECH-053): refazer com a mesma chave. */
  isTransient(error: unknown): boolean;
  /** Nome da constraint violada, se o erro for de integridade. */
  violatedConstraint(error: unknown): string | null;
}
