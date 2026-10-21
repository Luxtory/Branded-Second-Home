import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import {
  CommandRejection,
  rejectionForConstraint,
  type ErrorCode,
  type RejectionCode,
} from '../../domain/errors';
import type { JsonObject, JsonValue } from '../../domain/json';
import { LockSequence } from '../../domain/lock-order';
import { redactPersonalData } from '../../domain/personal-data';
import type { Clock } from '../clock';
import type { LogPort } from '../log';
import { idempotencyScope, type Actor } from './actor';
import type {
  AuditRecord,
  CommandGuard,
  CommandScope,
  CommandStore,
  IdempotencyEntry,
  OperationDraft,
  OutboxEventDraft,
} from './ports';
import { commandRegistry, type CommandRegistry, type CommandSpec } from './registry';
import { requestHash } from './request-hash';

/** Header `Idempotency-Key` (TECH-056): 1 a 255 caracteres ASCII visíveis. */
export const IDEMPOTENCY_KEY = /^[!-~]{1,255}$/;

export interface CommandContext<I, Tx> {
  readonly input: I;
  readonly actor: Actor;
  readonly operationId: string;
  /** Instante da tentativa, do `Clock` injetado (TECH-110). */
  readonly now: Date;
  readonly tx: Tx;
  /** Todo lock passa por aqui, na ordem do TECH-053. */
  readonly locks: LockSequence;
  /** Registra objeto e antes/depois; sem ao menos um registro o commit é recusado (REQ-015). */
  audit(record: AuditRecord): void;
  emit(event: OutboxEventDraft): void;
}

/** Handler de um command do registro: revalida tudo dentro da transação e lança `CommandRejection` para recusar. */
export interface CommandHandler<I, R extends JsonValue, Tx> {
  readonly command: string;
  readonly input: ZodType<I>;
  secondHomeId?(input: I): string | null;
  /** Objeto do command, para o guard conferir o escopo de um `authorization_grant` (REQ-014). */
  scope?(input: I): CommandScope;
  /**
   * Forma do input que entra no hash de idempotência quando o input carrega dado pessoal (ADR-0020 §5): o handler troca
   * o valor sensível por um pseudônimo chaveado. Sem o hook, o hash usa o input validado.
   */
  fingerprint?(input: I): unknown;
  execute(context: CommandContext<I, Tx>): Promise<R>;
}

export interface CommandRequest {
  readonly actor: Actor;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly input: unknown;
}

export type CommandOutcome<R> =
  | {
      readonly status: 'committed';
      readonly operationId: string;
      readonly result: R;
      readonly replayed: boolean;
    }
  | {
      readonly status: 'rejected';
      readonly operationId: string | null;
      readonly code: ErrorCode;
      readonly replayed: boolean;
    };

/** Valores do runbook (TECH-001): `COMMAND_MAX_ATTEMPTS` e `COMMAND_LOCK_TIMEOUT_MS`. */
export interface ExecutorLimits {
  readonly maxAttempts: number;
  readonly lockTimeoutMs: number;
}

export interface ExecutorDependencies<Tx> {
  readonly store: CommandStore<Tx>;
  readonly guard: CommandGuard;
  readonly clock: Clock;
  readonly limits: ExecutorLimits;
  readonly log: LogPort;
  readonly registry?: CommandRegistry;
  readonly newId?: () => string;
}

export class UnregisteredCommandError extends Error {
  constructor(command: string) {
    super(`Command is not in the closed registry (TECH-051): ${command}`);
    this.name = 'UnregisteredCommandError';
  }
}

export class MissingAuditError extends Error {
  constructor(command: string) {
    super(`Command ${command} produced no audit record (REQ-015)`);
    this.name = 'MissingAuditError';
  }
}

// Outra transação comitou a mesma chave antes desta: desfaz e responde com o replay.
class IdempotencyKeyTaken extends Error {}
const RETRY = Symbol('retry');

export interface CommandExecutor<Tx> {
  execute<I, R extends JsonValue>(
    handler: CommandHandler<I, R, Tx>,
    request: CommandRequest,
  ): Promise<CommandOutcome<R>>;
}

/** Pipeline único do TECH-054: autoriza → idempotência → BEGIN → locks → revalidação → escrita → COMMIT → outbox. */
export function createCommandExecutor<Tx>(deps: ExecutorDependencies<Tx>): CommandExecutor<Tx> {
  return { execute: (handler, request) => execute(deps, handler, request) };
}

const early = (code: ErrorCode): CommandOutcome<never> => ({
  status: 'rejected',
  operationId: null,
  code,
  replayed: false,
});

async function execute<I, R extends JsonValue, Tx>(
  deps: ExecutorDependencies<Tx>,
  handler: CommandHandler<I, R, Tx>,
  request: CommandRequest,
): Promise<CommandOutcome<R>> {
  const spec = resolveSpec(deps.registry ?? commandRegistry, handler.command);
  if (!IDEMPOTENCY_KEY.test(request.idempotencyKey)) return early('ERR_VALIDATION');
  const parsed = handler.input.safeParse(request.input);
  if (!parsed.success) return early('ERR_VALIDATION');
  const scope = handler.scope?.(parsed.data) ?? null;
  const decision = await deps.guard.authorize(spec, request.actor, parsed.data, scope);
  if (!decision.allowed) return early('ERR_PERMISSION');

  const base = {
    id: (deps.newId ?? randomUUID)(),
    command: spec.name,
    actor: request.actor,
    secondHomeId: handler.secondHomeId?.(parsed.data) ?? null,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    authorizationRef: decision.authorizationRef,
    scope: idempotencyScope(request.actor),
    requestHash: requestHash(
      spec.name,
      request.actor,
      handler.fingerprint === undefined ? parsed.data : handler.fingerprint(parsed.data),
    ),
  };
  const existing = await deps.store.findIdempotency(base.scope, base.idempotencyKey);
  if (existing !== null) return replay<R>(existing, base.command, base.requestHash);
  return run(deps, handler, parsed.data, base);
}

function resolveSpec(registry: CommandRegistry, command: string): CommandSpec {
  const spec = registry.get(command);
  if (spec === undefined) throw new UnregisteredCommandError(command);
  return spec;
}

async function run<I, R extends JsonValue, Tx>(
  deps: ExecutorDependencies<Tx>,
  handler: CommandHandler<I, R, Tx>,
  input: I,
  base: Omit<OperationDraft, 'at'>,
): Promise<CommandOutcome<R>> {
  for (let attempt = 1; ; attempt += 1) {
    const draft: OperationDraft = { ...base, at: deps.clock.now() };
    try {
      const result = await deps.store.transaction(deps.limits.lockTimeoutMs, (tx) =>
        runOnce(deps, handler, input, draft, tx),
      );
      deps.log.info('command committed', { command: draft.command, operation_id: draft.id });
      return { status: 'committed', operationId: draft.id, result, replayed: false };
    } catch (error) {
      const outcome = await settle<R, Tx>(deps, draft, error, attempt);
      if (outcome !== RETRY) return outcome;
    }
  }
}

async function runOnce<I, R extends JsonValue, Tx>(
  deps: ExecutorDependencies<Tx>,
  handler: CommandHandler<I, R, Tx>,
  input: I,
  draft: OperationDraft,
  tx: Tx,
): Promise<R> {
  if (!(await deps.store.reserve(tx, draft))) throw new IdempotencyKeyTaken();
  const audit: AuditRecord[] = [];
  const events: OutboxEventDraft[] = [];
  const result = await handler.execute({
    input,
    actor: draft.actor,
    operationId: draft.id,
    now: draft.at,
    tx,
    locks: new LockSequence(),
    audit: (record) => {
      audit.push(redactPersonalData(record));
    },
    emit: (event) => {
      events.push({ ...event, payload: redactPersonalData<JsonObject>(event.payload) });
    },
  });
  if (audit.length === 0) throw new MissingAuditError(draft.command);
  await deps.store.complete(tx, draft, result, audit, events);
  return result;
}

/** Destino de uma tentativa que falhou: replay, recusa gravada, nova tentativa ou erro inesperado. */
async function settle<R, Tx>(
  deps: ExecutorDependencies<Tx>,
  draft: OperationDraft,
  error: unknown,
  attempt: number,
): Promise<CommandOutcome<R> | typeof RETRY> {
  if (error instanceof IdempotencyKeyTaken) return replayTaken<R, Tx>(deps, draft);
  if (error instanceof CommandRejection) return reject<R, Tx>(deps, draft, error.code);
  if (deps.store.isTransient(error)) {
    const fields = { command: draft.command, operation_id: draft.id, attempt };
    if (attempt < deps.limits.maxAttempts) {
      deps.log.warn('command retry', fields);
      return RETRY;
    }
    deps.log.error('command retries exhausted', fields);
    return early('ERR_UNAVAILABLE');
  }
  const constraint = deps.store.violatedConstraint(error);
  const code = constraint === null ? null : rejectionForConstraint(constraint);
  if (code !== null) return reject<R, Tx>(deps, draft, code);
  throw error;
}

async function reject<R, Tx>(
  deps: ExecutorDependencies<Tx>,
  draft: OperationDraft,
  code: RejectionCode,
): Promise<CommandOutcome<R>> {
  if (!(await deps.store.recordRejection(draft, code))) return replayTaken<R, Tx>(deps, draft);
  deps.log.info('command rejected', { command: draft.command, operation_id: draft.id, code });
  return { status: 'rejected', operationId: draft.id, code, replayed: false };
}

async function replayTaken<R, Tx>(
  deps: ExecutorDependencies<Tx>,
  draft: OperationDraft,
): Promise<CommandOutcome<R>> {
  const existing = await deps.store.findIdempotency(draft.scope, draft.idempotencyKey);
  if (existing === null) {
    throw new Error(`Idempotency key reported as taken but not found (${draft.command})`);
  }
  return replay<R>(existing, draft.command, draft.requestHash);
}

function replay<R>(existing: IdempotencyEntry, command: string, hash: string): CommandOutcome<R> {
  if (existing.command !== command || existing.requestHash !== hash) {
    return early('ERR_IDEMPOTENCY_CONFLICT');
  }
  const response = existing.response;
  if (response === null) {
    // A resposta é gravada no mesmo commit que torna a chave visível: nulo aqui é corrupção.
    throw new Error(`Idempotency record without response (${command})`);
  }
  if (response.outcome === 'rejected') {
    return {
      status: 'rejected',
      operationId: existing.operationId,
      code: response.code,
      replayed: true,
    };
  }
  // Mesmo command e mesmo input validado: o resultado gravado é o JSON do mesmo tipo `R`.
  const result = response.result as R;
  return { status: 'committed', operationId: existing.operationId, result, replayed: true };
}
