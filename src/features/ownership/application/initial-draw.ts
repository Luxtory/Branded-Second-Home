import { randomBytes as cryptoRandomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  Clock,
  ConsumerEventDraft,
  JsonObject,
  OutboxConsumer,
  SystemAuditRecord,
} from '@/features/platform';
import {
  DRAW_ALGORITHM,
  QUICKNET,
  SEED_BYTES,
  firstRoundAtOrAfter,
  roundTime,
} from '../domain/initial-draw';
import { drawCommitment, initialOrder } from './initial-draw-algorithm';
import { InitialDrawBeaconInvalidError, type RandomnessBeacon } from './initial-draw-ports';

/**
 * Sorteio da ordem inicial (TECH-093, spec ownership §16): três consumidores do outbox, cada um numa transação, sem
 * command nem job novo (TECH-051, TECH-090). O efeito é o agendado por `formalize_acquisition` (TECH-020).
 */
export const INITIAL_DRAW_SCHEDULED = 'ownership.initial_draw_scheduled';
export const INITIAL_DRAW_COMMITTED = 'ownership.initial_draw_committed';
export const INITIAL_DRAW_COMPLETED = 'ownership.initial_draw_completed';
export const INITIAL_DRAW_RESULT_NOTIFICATION = 'ownership.initial_draw_result';

/** Orçamentos do runbook (TECH-001), sem default: `DRAW_*`. */
export interface InitialDrawConfig {
  readonly transactionTimeoutMs: number;
  readonly beaconTimeoutMs: number;
  readonly leadSeconds: number;
}

export interface DrawSchedule {
  readonly acquisitionId: string;
  readonly secondHomeId: string;
  readonly operationId: string;
  readonly participantCount: number;
  /** Ações em ordem de `allocation_position` (TECH-093 passo 1). */
  readonly stakes: readonly { readonly id: string; readonly position: number }[];
}

export interface CommitmentDraft {
  readonly id: string;
  readonly schedule: DrawSchedule;
  readonly sourceEventId: string;
  readonly seed: Uint8Array;
  readonly commitment: Uint8Array;
  readonly targetRound: number;
  readonly targetRoundAt: Date;
  readonly commitDeadline: Date;
}

export interface RevealContext {
  readonly drawId: string;
  readonly acquisitionId: string;
  readonly secondHomeId: string;
  readonly operationId: string;
  readonly participantCount: number;
  readonly targetRound: number;
  readonly seed: Uint8Array;
  readonly participants: readonly { readonly ordinal: number; readonly stakeId: string }[];
  /** Evidência do COMMIT registrada pelo servidor (T-910): sem ela a revelação é recusada. */
  readonly commitEvidence: boolean;
  readonly revealed: boolean;
}

export interface RevealDraft {
  readonly drawId: string;
  readonly round: number;
  readonly signature: Uint8Array;
  readonly randomness: Uint8Array;
  readonly sourceEventId: string;
  readonly positions: readonly { readonly position: number; readonly stakeId: string }[];
}

export interface DrawNotificationDraft {
  readonly eventId: string;
  readonly recipientPartyId: string;
  readonly kind: string;
  readonly data: JsonObject;
  readonly at: Date;
}

/** Persistência do sorteio e efeitos de consumidor na mesma transação (implementação em `infrastructure/`). */
export interface InitialDrawStore<Tx> {
  hasDraw(tx: Tx, acquisitionId: string): Promise<boolean>;
  schedule(tx: Tx, acquisitionId: string): Promise<DrawSchedule | null>;
  /** Arma `transaction_timeout` na transação e devolve o relógio do banco logo depois (ADR-0022 §4). */
  armTransactionTimeout(tx: Tx, timeoutMs: number): Promise<Date>;
  insertCommitment(tx: Tx, draft: CommitmentDraft): Promise<void>;
  revealContext(tx: Tx, drawId: string): Promise<RevealContext | null>;
  /** T-910: grava a evidência do COMMIT do compromisso; o banco calcula o instante pelo carimbo do servidor. */
  insertCommitEvidence(tx: Tx, drawId: string): Promise<void>;
  hasCommitEvidence(tx: Tx, drawId: string): Promise<boolean>;
  insertReveal(tx: Tx, draft: RevealDraft): Promise<void>;
  /** Pessoas ou empresas titulares vigentes em `at` das Ações do sorteio. */
  recipients(tx: Tx, drawId: string, at: Date): Promise<readonly string[]>;
  audit(tx: Tx, record: SystemAuditRecord): Promise<void>;
  enqueue(tx: Tx, draft: ConsumerEventDraft): Promise<boolean>;
  notify(tx: Tx, draft: DrawNotificationDraft): Promise<boolean>;
}

export interface InitialDrawDependencies<Tx> {
  readonly store: InitialDrawStore<Tx>;
  /** Adaptador do beacon para um orçamento total (`DRAW_BEACON_TIMEOUT_MS`). */
  readonly beacon: (budgetMs: number) => RandomnessBeacon;
  /** Lida só ao processar um evento: ausente ou inválida deixa o evento pendente. */
  readonly config: () => InitialDrawConfig;
  readonly clock: Clock;
  readonly randomBytes?: (size: number) => Uint8Array;
  readonly newId?: () => string;
}

/** Orçamento do beacon que não cabe no `transaction_timeout`: configuração recusada, evento pendente. */
export class InitialDrawConfigurationError extends Error {
  constructor() {
    super('DRAW_BEACON_TIMEOUT_MS must be lower than DRAW_TRANSACTION_TIMEOUT_MS');
    this.name = 'InitialDrawConfigurationError';
  }
}

/** Revelação sem a evidência do COMMIT do compromisso (T-910): pendente, sem consultar o beacon. */
export class InitialDrawCommitEvidenceMissingError extends Error {
  constructor(readonly drawId: string) {
    super(`Initial draw ${drawId} has no server commit evidence`);
    this.name = 'InitialDrawCommitEvidenceMissingError';
  }
}

/** Evento que não corresponde a um sorteio Co-Owner existente: nunca grava efeito. */
export class InitialDrawScheduleError extends Error {
  constructor(readonly reference: string) {
    super(`No Co-Owner initial draw for ${reference}`);
    this.name = 'InitialDrawScheduleError';
  }
}

const MS_PER_SECOND = 1_000;
const PERIOD_MS = QUICKNET.periodSeconds * MS_PER_SECOND;
const scheduledPayload = z.object({ acquisition_id: z.uuid(), second_home_id: z.uuid() });
const drawPayload = z.object({ draw_id: z.uuid(), second_home_id: z.uuid() });
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

function validConfig(config: InitialDrawConfig): InitialDrawConfig {
  if (config.beaconTimeoutMs >= config.transactionTimeoutMs)
    throw new InitialDrawConfigurationError();
  return config;
}

/** Passos 1–3: participantes congelados, seed por CSPRNG, compromisso e rodada futura. */
function commitConsumer<Tx>(deps: InitialDrawDependencies<Tx>): OutboxConsumer<Tx> {
  const randomBytes = deps.randomBytes ?? cryptoRandomBytes;
  const newId = deps.newId ?? randomUUID;
  return {
    name: 'ownership_initial_draw_commit',
    eventTypes: [INITIAL_DRAW_SCHEDULED],
    async handle(event, tx) {
      const config = validConfig(deps.config());
      const { acquisition_id } = scheduledPayload.parse(event.payload);
      if (await deps.store.hasDraw(tx, acquisition_id)) return;
      const schedule = await deps.store.schedule(tx, acquisition_id);
      if (schedule === null || schedule.operationId !== event.operationId) {
        throw new InitialDrawScheduleError(acquisition_id);
      }
      const armedAt = await deps.store.armTransactionTimeout(tx, config.transactionTimeoutMs);
      const commitDeadline = new Date(armedAt.getTime() + config.transactionTimeoutMs);
      const targetRound = firstRoundAtOrAfter(
        new Date(commitDeadline.getTime() + config.leadSeconds * MS_PER_SECOND),
      );
      const targetRoundAt = roundTime(targetRound);
      const seed = randomBytes(SEED_BYTES);
      const draft: CommitmentDraft = {
        id: newId(),
        schedule,
        sourceEventId: event.id,
        seed,
        commitment: drawCommitment(seed),
        targetRound,
        targetRoundAt,
        commitDeadline,
      };
      await deps.store.insertCommitment(tx, draft);
      await deps.store.audit(tx, {
        operationId: schedule.operationId,
        at: armedAt,
        objectType: 'initial_draw',
        objectId: draft.id,
        authorizationRef: `outbox:${event.id}`,
        before: null,
        after: {
          acquisition_id,
          algorithm: DRAW_ALGORITHM,
          beacon_chain_hash: QUICKNET.chainHash,
          participants: schedule.stakes.map((stake) => stake.id),
          commitment: hex(draft.commitment),
          target_round: targetRound,
          target_round_at: targetRoundAt.toISOString(),
          commit_deadline: commitDeadline.toISOString(),
        },
      });
      await deps.store.enqueue(tx, {
        operationId: schedule.operationId,
        type: INITIAL_DRAW_COMMITTED,
        dedupKey: `${INITIAL_DRAW_COMMITTED}:${draft.id}`,
        payload: {
          draw_id: draft.id,
          acquisition_id,
          second_home_id: schedule.secondHomeId,
          target_round: targetRound,
        },
        occurredAt: armedAt,
        availableAt: new Date(targetRoundAt.getTime() + PERIOD_MS),
      });
    },
  };
}

/**
 * T-910 (ADR-0023): evidência do COMMIT do compromisso, registrada pelo servidor na primeira entrega do evento de
 * revelação — antes da revelação e mesmo com o beacon fora do ar —, para não depender da retenção dos carimbos.
 */
function commitEvidenceConsumer<Tx>(deps: InitialDrawDependencies<Tx>): OutboxConsumer<Tx> {
  return {
    name: 'ownership_initial_draw_commit_evidence',
    eventTypes: [INITIAL_DRAW_COMMITTED],
    async handle(event, tx) {
      const { draw_id } = drawPayload.parse(event.payload);
      if (await deps.store.hasCommitEvidence(tx, draw_id)) return;
      await deps.store.insertCommitEvidence(tx, draw_id);
    },
  };
}

/** Passos 4–7: rodada verificada, `fy-v1`, resultado por Ação e publicação. */
function revealConsumer<Tx>(deps: InitialDrawDependencies<Tx>): OutboxConsumer<Tx> {
  let cached: { readonly budgetMs: number; readonly beacon: RandomnessBeacon } | undefined;
  const beaconFor = (budgetMs: number) => {
    if (cached?.budgetMs !== budgetMs) cached = { budgetMs, beacon: deps.beacon(budgetMs) };
    return cached.beacon;
  };
  return {
    name: 'ownership_initial_draw_reveal',
    eventTypes: [INITIAL_DRAW_COMMITTED],
    async handle(event, tx) {
      const config = validConfig(deps.config());
      const { draw_id } = drawPayload.parse(event.payload);
      const context = await deps.store.revealContext(tx, draw_id);
      if (context === null) throw new InitialDrawScheduleError(draw_id);
      if (context.revealed) return;
      if (!context.commitEvidence) throw new InitialDrawCommitEvidenceMissingError(draw_id);
      await deps.store.armTransactionTimeout(tx, config.transactionTimeoutMs);
      const verified = await beaconFor(config.beaconTimeoutMs).verifiedRound(context.targetRound);
      if (verified.round !== context.targetRound) {
        throw new InitialDrawBeaconInvalidError(context.targetRound);
      }
      const stakeByOrdinal = new Map(context.participants.map((p) => [p.ordinal, p.stakeId]));
      const positions = initialOrder(
        context.seed,
        verified.randomness,
        context.participantCount,
      ).map((ordinal, index) => ({ position: index + 1, stakeId: stakeByOrdinal.get(ordinal)! }));
      await deps.store.insertReveal(tx, {
        drawId: draw_id,
        round: verified.round,
        signature: verified.signature,
        randomness: verified.randomness,
        sourceEventId: event.id,
        positions,
      });
      const at = deps.clock.now();
      await deps.store.audit(tx, {
        operationId: context.operationId,
        at,
        objectType: 'initial_draw',
        objectId: draw_id,
        authorizationRef: `outbox:${event.id}`,
        before: null,
        after: {
          seed: hex(context.seed),
          beacon_round: verified.round,
          beacon_randomness: hex(verified.randomness),
          beacon_signature: hex(verified.signature),
          positions: positions.map((p) => ({ position: p.position, stake_id: p.stakeId })),
        },
      });
      await deps.store.enqueue(tx, {
        operationId: context.operationId,
        type: INITIAL_DRAW_COMPLETED,
        dedupKey: `${INITIAL_DRAW_COMPLETED}:${draw_id}`,
        payload: {
          draw_id,
          acquisition_id: context.acquisitionId,
          second_home_id: context.secondHomeId,
        },
        occurredAt: at,
      });
    },
  };
}

/** Notificação do resultado (REQ-097, TECH-091) às pessoas ou empresas titulares vigentes, só com ids. */
function notificationConsumer<Tx>(deps: InitialDrawDependencies<Tx>): OutboxConsumer<Tx> {
  return {
    name: 'ownership_initial_draw_notification',
    eventTypes: [INITIAL_DRAW_COMPLETED],
    async handle(event, tx) {
      const { draw_id, second_home_id } = drawPayload.parse(event.payload);
      const at = deps.clock.now();
      for (const recipientPartyId of await deps.store.recipients(tx, draw_id, at)) {
        await deps.store.notify(tx, {
          eventId: event.id,
          recipientPartyId,
          kind: INITIAL_DRAW_RESULT_NOTIFICATION,
          data: { draw_id, second_home_id },
          at,
        });
      }
    },
  };
}

export function initialDrawConsumers<Tx>(
  deps: InitialDrawDependencies<Tx>,
): readonly OutboxConsumer<Tx>[] {
  // A evidência precede a revelação na mesma entrega (ordem do registro).
  return [
    commitConsumer(deps),
    commitEvidenceConsumer(deps),
    revealConsumer(deps),
    notificationConsumer(deps),
  ];
}
