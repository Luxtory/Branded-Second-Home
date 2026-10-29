import { sql } from 'kysely';
import {
  enqueueOutboxEvent,
  recordNotification,
  recordSystemAudit,
  type DatabaseTransaction,
} from '@/features/platform';
import type { InitialDrawStore } from '../application/initial-draw';
import { DRAW_ALGORITHM, QUICKNET } from '../domain/initial-draw';

/**
 * Sorteio no PostgreSQL (migration `ownership_initial_draw`): só inserção; os instantes `recorded_at`/`revealed_at`
 * são carimbados pelo banco e as regras de anterioridade, revelação e permutação são impostas por gatilhos.
 */
export const postgresInitialDrawStore: InitialDrawStore<DatabaseTransaction> = {
  async hasDraw(tx, acquisitionId) {
    const row = await tx
      .selectFrom('app.initial_draw')
      .select('id')
      .where('acquisition_id', '=', acquisitionId)
      .executeTakeFirst();
    return row !== undefined;
  },

  async schedule(tx, acquisitionId) {
    const acquisition = await tx
      .selectFrom('app.acquisition')
      .select(['id', 'second_home_id', 'operation_id', 'modality', 'configuration_id'])
      .where('id', '=', acquisitionId)
      .executeTakeFirst();
    if (acquisition?.modality !== 'co_owner' || acquisition.configuration_id === null) return null;
    const stakes = await tx
      .selectFrom('app.stake')
      .select(['id', 'allocation_position as position'])
      .where('acquisition_id', '=', acquisitionId)
      .orderBy('allocation_position')
      .execute();
    return {
      acquisitionId,
      secondHomeId: acquisition.second_home_id,
      operationId: acquisition.operation_id,
      participantCount: acquisition.configuration_id,
      stakes,
    };
  },

  async armTransactionTimeout(tx, timeoutMs) {
    await sql`SELECT set_config('transaction_timeout', ${`${timeoutMs}ms`}, true)`.execute(tx);
    const { rows } = await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx);
    return rows[0]!.now;
  },

  async insertCommitment(tx, draft) {
    const { schedule } = draft;
    await tx
      .insertInto('app.initial_draw')
      .values({
        id: draft.id,
        acquisition_id: schedule.acquisitionId,
        second_home_id: schedule.secondHomeId,
        operation_id: schedule.operationId,
        source_event_id: draft.sourceEventId,
        algorithm: DRAW_ALGORITHM,
        beacon_chain_hash: QUICKNET.chainHash,
        participant_count: schedule.participantCount,
        commitment: Buffer.from(draft.commitment),
        target_round: String(draft.targetRound),
        target_round_at: draft.targetRoundAt,
        commit_deadline: draft.commitDeadline,
      })
      .execute();
    await tx
      .insertInto('app.initial_draw_participant')
      .values(
        schedule.stakes.map((stake) => ({
          draw_id: draft.id,
          acquisition_id: schedule.acquisitionId,
          second_home_id: schedule.secondHomeId,
          ordinal: stake.position,
          stake_id: stake.id,
        })),
      )
      .execute();
    await tx
      .insertInto('app.initial_draw_seed')
      .values({ draw_id: draft.id, seed: Buffer.from(draft.seed) })
      .execute();
  },

  async revealContext(tx, drawId) {
    const draw = await tx
      .selectFrom('app.initial_draw as d')
      .innerJoin('app.initial_draw_seed as s', 's.draw_id', 'd.id')
      .leftJoin('app.initial_draw_reveal as r', 'r.draw_id', 'd.id')
      .leftJoin('app.initial_draw_commit_evidence as e', 'e.draw_id', 'd.id')
      .select([
        'd.acquisition_id',
        'd.second_home_id',
        'd.operation_id',
        'd.participant_count',
        'd.target_round',
        's.seed',
        'r.draw_id as revealed',
        'e.draw_id as evidence',
      ])
      .where('d.id', '=', drawId)
      .executeTakeFirst();
    if (draw === undefined) return null;
    const participants = await tx
      .selectFrom('app.initial_draw_participant')
      .select(['ordinal', 'stake_id as stakeId'])
      .where('draw_id', '=', drawId)
      .orderBy('ordinal')
      .execute();
    return {
      drawId,
      acquisitionId: draw.acquisition_id,
      secondHomeId: draw.second_home_id,
      operationId: draw.operation_id,
      participantCount: draw.participant_count,
      targetRound: Number(draw.target_round),
      seed: draw.seed,
      participants,
      commitEvidence: draw.evidence !== null,
      revealed: draw.revealed !== null,
    };
  },

  async insertCommitEvidence(tx, drawId) {
    // `committed_at` é sobrescrito pelo gatilho com o carimbo do servidor; o valor enviado nunca prevalece.
    await tx
      .insertInto('app.initial_draw_commit_evidence')
      .values({ draw_id: drawId, committed_at: new Date(0) })
      .execute();
  },

  async hasCommitEvidence(tx, drawId) {
    const row = await tx
      .selectFrom('app.initial_draw_commit_evidence')
      .select('draw_id')
      .where('draw_id', '=', drawId)
      .executeTakeFirst();
    return row !== undefined;
  },

  async insertReveal(tx, draft) {
    await tx
      .insertInto('app.initial_draw_reveal')
      .values({
        draw_id: draft.drawId,
        beacon_round: String(draft.round),
        beacon_signature: Buffer.from(draft.signature),
        beacon_randomness: Buffer.from(draft.randomness),
        source_event_id: draft.sourceEventId,
      })
      .execute();
    if (draft.positions.length === 0) return;
    await tx
      .insertInto('app.initial_draw_position')
      .values(
        draft.positions.map((p) => ({
          draw_id: draft.drawId,
          position: p.position,
          stake_id: p.stakeId,
        })),
      )
      .execute();
  },

  async recipients(tx, drawId, at) {
    const rows = await tx
      .selectFrom('app.holding as h')
      .innerJoin('app.initial_draw_participant as p', 'p.stake_id', 'h.stake_id')
      .select('h.party_id')
      .distinct()
      .where('p.draw_id', '=', drawId)
      .where('h.valid_from', '<=', at)
      .where((eb) => eb.or([eb('h.valid_until', 'is', null), eb('h.valid_until', '>', at)]))
      .orderBy('h.party_id')
      .execute();
    return rows.map((row) => row.party_id);
  },

  audit: recordSystemAudit,
  enqueue: enqueueOutboxEvent,
  notify: recordNotification,
};
