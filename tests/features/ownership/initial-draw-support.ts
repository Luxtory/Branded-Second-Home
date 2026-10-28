import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import { QUICKNET, roundTime } from '@/features/ownership/domain/initial-draw';
import type { AcquisitionHarness } from './acquisition-support';

export interface FormalizedCoOwner {
  readonly homeId: string;
  readonly acquisitionId: string;
  readonly operationId: string;
  readonly scheduledEventId: string;
  /** Ações em ordem de `allocation_position`. */
  readonly stakes: readonly { readonly id: string; readonly position: number }[];
}

/** Formaliza uma Second Home Co-Owner pelo command da W8 e devolve o que o sorteio usa. */
export async function formalizedCoOwner(h: AcquisitionHarness, n = 2): Promise<FormalizedCoOwner> {
  const { home } = await h.root();
  const outcome = await h.run(h.handlers.formalizeAcquisition, await h.coOwner(home.id, n));
  if (outcome.status !== 'committed') throw new Error(`formalization ${outcome.status}`);
  const acquisition = await h.db
    .selectFrom('app.acquisition')
    .select(['id', 'operation_id'])
    .where('second_home_id', '=', home.id)
    .executeTakeFirstOrThrow();
  const event = await h.db
    .selectFrom('app.outbox')
    .select('id')
    .where('dedup_key', '=', `ownership.initial_draw_scheduled:${acquisition.id}`)
    .executeTakeFirstOrThrow();
  const stakes = await h.db
    .selectFrom('app.stake')
    .select(['id', 'allocation_position as position'])
    .where('acquisition_id', '=', acquisition.id)
    .orderBy('allocation_position')
    .execute();
  return {
    homeId: home.id,
    acquisitionId: acquisition.id,
    operationId: acquisition.operation_id,
    scheduledEventId: event.id,
    stakes,
  };
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();

/** Primeira rodada publicada a partir de `at` (mesma regra do domínio). */
export function roundAtOrAfter(at: Date): number {
  const elapsed = at.getTime() - QUICKNET.genesisTimeSeconds * 1_000;
  return Math.ceil(elapsed / (QUICKNET.periodSeconds * 1_000)) + 1;
}

export interface CommitmentRows {
  readonly drawId: string;
  readonly seed: Buffer;
  readonly round: number;
  readonly deadline: Date;
}

export interface CommitmentOptions {
  readonly deadlineMs?: number;
  /** `transaction_timeout` armado; por padrão o mesmo valor do prazo, como o consumidor faz. */
  readonly timeoutMs?: number;
  readonly leadMs?: number;
  readonly armTimeout?: boolean;
  readonly participants?: readonly { readonly id: string; readonly position: number }[];
  readonly seed?: Buffer;
  readonly commitment?: Buffer;
  readonly participantCount?: number;
  readonly recordedAt?: Date;
  readonly roundOverride?: (round: number) => { round: number; at: Date };
}

/** Insere um compromisso diretamente, como o consumidor de commit faria, para testar as regras do banco. */
export async function insertCommitment(
  tx: DatabaseTransaction,
  draw: FormalizedCoOwner,
  options: CommitmentOptions = {},
): Promise<CommitmentRows> {
  const deadlineMs = options.deadlineMs ?? 1_000;
  if (options.armTimeout ?? true) {
    const timeout = `${options.timeoutMs ?? deadlineMs}ms`;
    await sql`SELECT set_config('transaction_timeout', ${timeout}, true)`.execute(tx);
  }
  const { rows } = await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx);
  const now = rows[0]!.now;
  const deadline = new Date(now.getTime() + deadlineMs);
  const natural = roundAtOrAfter(new Date(deadline.getTime() + (options.leadMs ?? 1_000)));
  const { round, at } = options.roundOverride?.(natural) ?? {
    round: natural,
    at: roundTime(natural),
  };
  const seed = options.seed ?? randomBytes(32);
  const drawId = randomUUID();
  await tx
    .insertInto('app.initial_draw')
    .values({
      id: drawId,
      acquisition_id: draw.acquisitionId,
      second_home_id: draw.homeId,
      operation_id: draw.operationId,
      source_event_id: draw.scheduledEventId,
      algorithm: 'fy-v1',
      beacon_chain_hash: QUICKNET.chainHash,
      participant_count: options.participantCount ?? draw.stakes.length,
      commitment: options.commitment ?? sha256(seed),
      target_round: String(round),
      target_round_at: at,
      ...(options.recordedAt === undefined ? {} : { recorded_at: options.recordedAt }),
      commit_deadline: deadline,
    })
    .execute();
  for (const stake of options.participants ?? draw.stakes) {
    await tx
      .insertInto('app.initial_draw_participant')
      .values({
        draw_id: drawId,
        acquisition_id: draw.acquisitionId,
        second_home_id: draw.homeId,
        ordinal: stake.position,
        stake_id: stake.id,
      })
      .execute();
  }
  await tx.insertInto('app.initial_draw_seed').values({ draw_id: drawId, seed }).execute();
  return { drawId, seed, round, deadline };
}

/** Espera o relógio real passar de `at` (o banco confere a revelação com `clock_timestamp()`). */
export async function waitUntil(at: Date): Promise<void> {
  const wait = at.getTime() - Date.now() + 50;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}
