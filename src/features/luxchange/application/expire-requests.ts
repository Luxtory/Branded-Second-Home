import type { CommandOutcome, CommandRequest, LogPort } from '@/features/platform';
import type { RequestClosingResult } from './close-request';
import type { ClosableRequest } from './request-ports';

/** Orçamento de uma execução (Vercel Functions): o que sobrar fica para a próxima, sem perda. */
export const EXPIRE_REQUESTS_TIME_BUDGET_MS = 240_000;
/** Itens lidos por execução, os mais antigos primeiro. */
export const EXPIRE_REQUESTS_BATCH = 500;

const SYSTEM_ACTOR = { kind: 'system', job: 'expire_requests' } as const;

export type ClosingCommand = 'expire_requests' | 'close_ineligible_request';

/** Chave de idempotência por Request (ADR-0037 §7): job, consumidor e retry convergem num único encerramento. */
export const closingKey = (command: ClosingCommand, requestId: string) => `${command}:${requestId}`;

export interface ExpireRequestsJobDependencies {
  /** Requests pendentes que não podem mais ser aceitas, de qualquer data (recupera atrasos). */
  readonly closable: () => Promise<readonly ClosableRequest[]>;
  readonly execute: (
    command: ClosingCommand,
    request: CommandRequest,
  ) => Promise<CommandOutcome<RequestClosingResult>>;
  /** Estorno da Taxa no PSP depois do commit (TECH-080); a conciliação é a rede de segurança. */
  readonly processRefund: (refundId: string) => Promise<unknown>;
  readonly log: LogPort;
  readonly timeBudgetMs: number;
  readonly monotonicMs: () => number;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Job `expire_requests` (TECH-090; ADR-0037 §7): materializa, uma transação por Request, o encerramento das Requests
 * vencidas (`expire_requests`) e das inelegíveis com prova (`close_ineligible_request`). Idempotente e retomável — a
 * chave é por Request e a Request já encerrada é item pulado. Nunca a única proteção de prazo ou exclusividade: o
 * compromisso já não recusa nada desde o primeiro instante em que a Request não pode mais ser aceita. Falha vai só ao
 * log estruturado (ids e código, sem quantidades nem party).
 */
export async function runExpireRequests(
  deps: ExpireRequestsJobDependencies,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  const due = await deps.closable();
  const counts = { expired: 0, closed_ineligible: 0, skipped: 0, failed: 0, deferred: 0 };
  for (const [index, item] of due.entries()) {
    if (deps.monotonicMs() - started >= deps.timeBudgetMs) {
      counts.deferred = due.length - index;
      break;
    }
    const command: ClosingCommand =
      item.reason === 'expired' ? 'expire_requests' : 'close_ineligible_request';
    try {
      const outcome = await deps.execute(command, {
        actor: SYSTEM_ACTOR,
        idempotencyKey: closingKey(command, item.requestId),
        correlationId,
        input: { request_id: item.requestId },
      });
      if (outcome.status === 'committed') {
        if (outcome.replayed) counts.skipped += 1;
        else if (command === 'expire_requests') counts.expired += 1;
        else counts.closed_ineligible += 1;
        await refund(deps, outcome.result.refund_id, correlationId);
      } else if (outcome.code === 'ERR_STATE_TRANSITION' || outcome.code === 'ERR_NOT_FOUND') {
        counts.skipped += 1;
      } else {
        counts.failed += 1;
        deps.log.error('expire_requests item rejected', {
          request_id: item.requestId,
          reason: outcome.code,
          correlation_id: correlationId,
        });
      }
    } catch (error) {
      counts.failed += 1;
      deps.log.error('expire_requests item failed', {
        request_id: item.requestId,
        reason: errorName(error),
        correlation_id: correlationId,
      });
    }
  }
  if (counts.deferred > 0)
    deps.log.warn('expire_requests budget exhausted', { deferred: counts.deferred });
  return { due: due.length, ...counts };
}

/** Estorno da Taxa depois do commit; falha fica `pending` e a conciliação reprocessa (TECH-101). */
async function refund(
  deps: ExpireRequestsJobDependencies,
  refundId: string,
  correlationId: string,
) {
  try {
    await deps.processRefund(refundId);
  } catch (error) {
    deps.log.warn('expire_requests refund deferred', {
      refund_id: refundId,
      reason: errorName(error),
      correlation_id: correlationId,
    });
  }
}
