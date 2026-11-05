import type { CommandOutcome, CommandRequest, LogPort } from '@/features/platform';
import type { Micros } from '../domain/own-use-lifecycle';

/**
 * Peças comuns dos jobs do ciclo da reserva (W13 E3; TECH-090; spec booking §10.14): varredura pelo relógio do banco, uma
 * transação por reserva pelo executor de produção, contagens e falha por item no log estruturado. Os jobs ficam fora da
 * K2 (ADR-0027 §5) e nunca têm efeito econômico; o banco confere cada escrita (E1).
 */
export type LifecycleJob = 'advance_booking_states' | 'flag_no_show_candidates';

/** Reserva elegível numa varredura, com a folha da cadeia de transições lida junto. */
export interface BookingSweepCandidate {
  readonly bookingId: string;
  readonly secondHomeId: string;
  readonly lastTransitionId: string | null;
}

/** Escritas e leituras dos jobs dentro da transação do item. */
export interface BookingJobStore<Tx> {
  /** Instante do banco (`clock_timestamp()`) em µs: a regra do job usa o mesmo relógio do gatilho (T3). */
  databaseNow(tx: Tx): Promise<Micros>;
  isFlagged(tx: Tx, bookingId: string): Promise<boolean>;
  /** Registra a candidata a no-show; devolve o instante gravado pelo banco. */
  flag(tx: Tx, bookingId: string, operationId: string): Promise<Micros>;
}

/** Orçamento de uma execução, abaixo dos 300 s da função (o mesmo dos jobs do calendar). */
export const LIFECYCLE_JOB_TIME_BUDGET_MS = 240_000;

/**
 * Chave por estado da reserva: repetição ou execução concorrente sobre o mesmo estado é replay, sem operação nova
 * (TECH-101, "job duplicado → no-op"); toda mudança de estado grava uma transição e muda a folha, então a próxima
 * varredura usa chave nova e nenhuma recusa fica presa.
 */
export const sweepKey = (job: LifecycleJob, candidate: BookingSweepCandidate): string =>
  `${job}:${candidate.bookingId}:${candidate.lastTransitionId ?? 'root'}`;

export interface BookingSweepDependencies<R> {
  readonly job: LifecycleJob;
  readonly candidates: () => Promise<readonly BookingSweepCandidate[]>;
  readonly execute: (request: CommandRequest) => Promise<CommandOutcome<R>>;
  readonly log: LogPort;
  readonly timeBudgetMs: number;
  readonly monotonicMs: () => number;
  /** Contagens adicionais, presentes mesmo zeradas, e o quanto cada item processado soma (ex.: transições). */
  readonly extra?: {
    readonly keys: readonly string[];
    readonly of: (result: R) => Readonly<Record<string, number>>;
  };
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Varredura de um job (TECH-090): idempotente e retomável. `processed` = efeito novo; `skipped` = replay ou estado/instante
 * já mudado (`ERR_STATE_TRANSITION`); `failed` = recusa inesperada ou erro (log estruturado só com ids e códigos);
 * `deferred` = orçamento esgotado (a próxima execução continua). Sem candidata, nada é gravado.
 */
export async function runBookingSweep<R>(
  deps: BookingSweepDependencies<R>,
  { correlationId }: { readonly correlationId: string },
): Promise<Readonly<Record<string, number>>> {
  const started = deps.monotonicMs();
  const candidates = await deps.candidates();
  const counts = { processed: 0, skipped: 0, failed: 0, deferred: 0 };
  const extra: Record<string, number> = Object.fromEntries(
    (deps.extra?.keys ?? []).map((key) => [key, 0]),
  );
  for (const [index, candidate] of candidates.entries()) {
    if (deps.monotonicMs() - started >= deps.timeBudgetMs) {
      counts.deferred = candidates.length - index;
      deps.log.warn(`${deps.job} deferred`, {
        deferred: counts.deferred,
        correlation_id: correlationId,
      });
      break;
    }
    const fields = { booking_id: candidate.bookingId, correlation_id: correlationId };
    try {
      const outcome = await deps.execute({
        actor: { kind: 'system', job: deps.job },
        idempotencyKey: sweepKey(deps.job, candidate),
        correlationId,
        input: { second_home_id: candidate.secondHomeId, booking_id: candidate.bookingId },
      });
      if (outcome.status === 'committed' && !outcome.replayed) {
        counts.processed += 1;
        for (const [key, value] of Object.entries(deps.extra?.of(outcome.result) ?? {}))
          extra[key] = (extra[key] ?? 0) + value;
      } else if (outcome.status === 'committed' || outcome.code === 'ERR_STATE_TRANSITION') {
        counts.skipped += 1;
      } else {
        counts.failed += 1;
        deps.log.error(`${deps.job} item rejected`, { ...fields, reason: outcome.code });
      }
    } catch (error) {
      counts.failed += 1;
      deps.log.error(`${deps.job} item failed`, { ...fields, reason: errorName(error) });
    }
  }
  return { candidates: candidates.length, ...counts, ...extra };
}
