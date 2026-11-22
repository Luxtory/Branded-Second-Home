import { z } from 'zod';
import type { CommandHandler, CommandOutcome, CommandRequest, LogPort } from '@/features/platform';
import { expireLot, type LedgerDependencies } from './credit-ledger';

export const expireCreditLotInput = z.strictObject({ lot_id: z.uuid() });
export type ExpireCreditLotInput = z.infer<typeof expireCreditLotInput>;

export type ExpireCreditLotResult = {
  readonly lot_id: string;
  readonly entry_id: string;
  readonly quantity: string;
};

/**
 * `expire_credit_lots` (TECH-072, TECH-090; ADR-0033 §5): registra `available → expired` de todo o saldo disponível de
 * um lote cujo `expires_at` já passou no relógio do banco. Nunca toca em `expires_at`; nada a expirar →
 * `ERR_STATE_TRANSITION`. O registro nunca é o que torna o saldo inutilizável: o banco recusa uso depois do vencimento
 * com ou sem ele.
 */
export function createExpireCreditLotHandler<Tx>(
  deps: LedgerDependencies<Tx>,
): CommandHandler<ExpireCreditLotInput, ExpireCreditLotResult, Tx> {
  return {
    command: 'expire_credit_lots',
    input: expireCreditLotInput,
    async execute({ input, tx, locks, operationId, audit }) {
      const movement = await expireLot({ tx, locks, operationId }, deps, { lotId: input.lot_id });
      audit({
        objectType: 'credit_lot',
        objectId: movement.lotId,
        before: null,
        after: { movement: 'expire', entry_id: movement.entryId, quantity: movement.quantity },
      });
      return { lot_id: movement.lotId, entry_id: movement.entryId, quantity: movement.quantity };
    },
  };
}

/** Orçamento de uma execução, abaixo dos 300 s da função (o mesmo dos jobs do calendário). */
export const EXPIRE_CREDIT_LOTS_TIME_BUDGET_MS = 240_000;

const SYSTEM_ACTOR = { kind: 'system', job: 'expire_credit_lots' } as const;

export interface ExpireCreditLotsJobDependencies {
  /** Lotes com saldo disponível e `expires_at` já passado no relógio do banco, de qualquer data (recupera atrasos). */
  readonly dueLots: () => Promise<readonly string[]>;
  readonly execute: (request: CommandRequest) => Promise<CommandOutcome<ExpireCreditLotResult>>;
  readonly log: LogPort;
  readonly timeBudgetMs: number;
  readonly monotonicMs: () => number;
}

export const expireCreditLotKey = (lotId: string, correlationId: string) =>
  `expire_credit_lots:${lotId}:${correlationId}`;

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Job `expire_credit_lots` (TECH-090): idempotente e retomável — uma transação por lote, chave por execução; lote já
 * materializado é no-op. Falha só vai ao log estruturado (sem quantidades nem party): a validade não depende do job.
 */
export async function runExpireCreditLots(
  deps: ExpireCreditLotsJobDependencies,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  const due = await deps.dueLots();
  const counts = { expired: 0, skipped: 0, failed: 0, deferred: 0 };
  for (const [index, lotId] of due.entries()) {
    if (deps.monotonicMs() - started >= deps.timeBudgetMs) {
      counts.deferred = due.length - index;
      break;
    }
    try {
      const outcome = await deps.execute({
        actor: SYSTEM_ACTOR,
        idempotencyKey: expireCreditLotKey(lotId, correlationId),
        correlationId,
        input: { lot_id: lotId },
      });
      if (outcome.status === 'committed' && !outcome.replayed) counts.expired += 1;
      else if (outcome.status === 'committed' || outcome.code === 'ERR_STATE_TRANSITION')
        counts.skipped += 1;
      else {
        counts.failed += 1;
        deps.log.error('expire_credit_lots item rejected', {
          lot_id: lotId,
          reason: outcome.code,
          correlation_id: correlationId,
        });
      }
    } catch (error) {
      counts.failed += 1;
      deps.log.error('expire_credit_lots item failed', {
        lot_id: lotId,
        reason: errorName(error),
        correlation_id: correlationId,
      });
    }
  }
  if (counts.deferred > 0)
    deps.log.warn('expire_credit_lots budget exhausted', { deferred: counts.deferred });
  return { due: due.length, ...counts };
}
