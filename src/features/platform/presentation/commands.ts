import type { CommandOutcome } from '../application/commands/executor';
import type { LogPort } from '../application/log';
import type { JsonValue } from '../domain/json';
import { createOutboxDispatch } from '../infrastructure/jobs/job-registry';
import { errorResponse } from './errors';
import { scheduleOutboxDispatch } from './outbox-dispatch';

/** Header da chave de idempotência (TECH-056); ausente vira chave vazia, que o executor recusa com `ERR_VALIDATION`. */
export function idempotencyKey(request: Request): string {
  return request.headers.get('idempotency-key') ?? '';
}

export interface CommandResponseOptions {
  readonly correlationId: string;
  readonly successStatus: number;
  readonly log: LogPort;
  /** Depois de um commit novo, entrega o outbox sem esperar o cron (TECH-091); injetável nos testes. */
  readonly afterCommit?: (log: LogPort) => void;
}

/** Depois de um commit novo, agenda a entrega do outbox sem esperar o cron (TECH-091): rotas e Server Actions. */
export function dispatchOutboxAfterCommit(log: LogPort): void {
  scheduleOutboxDispatch(createOutboxDispatch({ log }), log);
}

/**
 * Resposta HTTP de um command (TECH-056, ADR-006 do `03`): resultado com `successStatus`, a mesma resposta com
 * `idempotency-replayed: true` numa repetição, ou o schema `Error` com a causa em pt-BR (REQ-098).
 */
export function commandResponse<R extends JsonValue>(
  outcome: CommandOutcome<R>,
  {
    correlationId,
    successStatus,
    log,
    afterCommit = dispatchOutboxAfterCommit,
  }: CommandResponseOptions,
): Response {
  if (outcome.status === 'rejected') return errorResponse(outcome.code, correlationId);
  if (!outcome.replayed) afterCommit(log);
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (outcome.replayed) headers['idempotency-replayed'] = 'true';
  return Response.json(outcome.result, { status: successStatus, headers });
}
