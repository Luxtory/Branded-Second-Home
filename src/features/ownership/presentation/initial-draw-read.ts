import type { ExercisedAdminSession } from '@/features/admin';
import {
  getDatabase,
  recordAdminRead,
  systemClock,
  withUserRead,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';

/**
 * Evidência do sorteio (PD-011, spec ownership §16.5): participantes por Ação, método, insumo de aleatoriedade e
 * resultado. Só colunas que o Titular pode ler (SELECT por coluna); nada de pessoas ou empresas, operação ou eventos.
 */
export interface DrawParticipantView {
  readonly ordinal: number;
  readonly stakeId: string;
  /** Ação representada pelo usuário (só na Área do Titular). */
  readonly mine: boolean;
}

export interface DrawPositionView extends DrawParticipantView {
  readonly position: number;
}

export interface InitialDrawEvidence {
  readonly drawId: string;
  readonly secondHomeId: string;
  readonly secondHomeLabel: string;
  readonly algorithm: string;
  readonly chainHash: string;
  readonly participantCount: number;
  readonly commitment: string;
  readonly targetRound: number;
  readonly targetRoundAt: Date;
  readonly recordedAt: Date;
  readonly commitDeadline: Date;
  readonly participants: readonly DrawParticipantView[];
  /** `null` até a revelação: a seed nunca aparece antes. */
  readonly reveal: {
    readonly seed: string;
    readonly round: number;
    readonly randomness: string;
    readonly signature: string;
    readonly revealedAt: Date;
    readonly positions: readonly DrawPositionView[];
  } | null;
}

export interface TitularDrawSummary {
  readonly drawId: string;
  readonly secondHomeId: string;
  readonly secondHomeLabel: string;
  readonly revealed: boolean;
}

interface ReadOptions {
  readonly db?: Database;
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

async function evidence(
  tx: DatabaseTransaction,
  where: { readonly drawId: string } | { readonly secondHomeId: string },
  mine: ReadonlySet<string>,
): Promise<InitialDrawEvidence | null> {
  let query = tx
    .selectFrom('app.initial_draw as d')
    .innerJoin('app.second_home as h', 'h.id', 'd.second_home_id')
    .select([
      'd.id',
      'd.second_home_id',
      'h.label',
      'd.algorithm',
      'd.beacon_chain_hash',
      'd.participant_count',
      'd.commitment',
      'd.target_round',
      'd.target_round_at',
      'd.recorded_at',
      'd.commit_deadline',
    ]);
  query =
    'drawId' in where
      ? query.where('d.id', '=', where.drawId)
      : query.where('d.second_home_id', '=', where.secondHomeId);
  const draw = await query.executeTakeFirst();
  if (draw === undefined) return null;
  const participants = (
    await tx
      .selectFrom('app.initial_draw_participant')
      .select(['ordinal', 'stake_id'])
      .where('draw_id', '=', draw.id)
      .orderBy('ordinal')
      .execute()
  ).map((p) => ({ ordinal: p.ordinal, stakeId: p.stake_id, mine: mine.has(p.stake_id) }));
  const reveal = await tx
    .selectFrom('app.initial_draw_reveal as r')
    .innerJoin('app.initial_draw_seed as s', 's.draw_id', 'r.draw_id')
    .select([
      'r.beacon_round',
      'r.beacon_randomness',
      'r.beacon_signature',
      'r.revealed_at',
      's.seed',
    ])
    .where('r.draw_id', '=', draw.id)
    .executeTakeFirst();
  const ordinalOf = new Map(participants.map((p) => [p.stakeId, p.ordinal]));
  const positions =
    reveal === undefined
      ? []
      : await tx
          .selectFrom('app.initial_draw_position')
          .select(['position', 'stake_id'])
          .where('draw_id', '=', draw.id)
          .orderBy('position')
          .execute();
  return {
    drawId: draw.id,
    secondHomeId: draw.second_home_id,
    secondHomeLabel: draw.label,
    algorithm: draw.algorithm,
    chainHash: draw.beacon_chain_hash,
    participantCount: draw.participant_count,
    commitment: hex(draw.commitment),
    targetRound: Number(draw.target_round),
    targetRoundAt: draw.target_round_at,
    recordedAt: draw.recorded_at,
    commitDeadline: draw.commit_deadline,
    participants,
    reveal:
      reveal === undefined
        ? null
        : {
            seed: hex(reveal.seed),
            round: Number(reveal.beacon_round),
            randomness: hex(reveal.beacon_randomness),
            signature: hex(reveal.beacon_signature),
            revealedAt: reveal.revealed_at,
            positions: positions.map((p) => ({
              position: p.position,
              stakeId: p.stake_id,
              ordinal: ordinalOf.get(p.stake_id)!,
              mine: mine.has(p.stake_id),
            })),
          },
  };
}

/** Admin: evidência do sorteio da Second Home, leitura auditada (TECH-092) no mesmo snapshot. */
export function readInitialDrawAdmin(
  session: ExercisedAdminSession,
  secondHomeId: string,
  options: ReadOptions = {},
): Promise<InitialDrawEvidence | null> {
  const db = options.db ?? getDatabase();
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      await recordAdminRead(tx, {
        actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
        objectType: 'initial_draw',
        objectId: secondHomeId,
        authorizationRef: session.authorizationRef,
        at: systemClock.now(),
      });
      return evidence(tx, { secondHomeId }, new Set());
    });
}

const claims = (userId: string) => ({ sub: userId, role: 'authenticated' as const });

/** Ações que o usuário representa hoje (RLS de holding por delegação vigente). */
async function ownStakes(tx: DatabaseTransaction): Promise<ReadonlySet<string>> {
  const rows = await tx
    .selectFrom('app.holding')
    .select('stake_id')
    .where('stake_id', 'is not', null)
    .execute();
  return new Set(rows.map((row) => row.stake_id!));
}

/** Titular: sorteios das Second Homes de que é titular, sob RLS. */
export function readTitularInitialDraws(
  session: { readonly userId: string },
  options: ReadOptions = {},
): Promise<readonly TitularDrawSummary[]> {
  return withUserRead(options.db ?? getDatabase(), claims(session.userId), async (tx) => {
    const rows = await tx
      .selectFrom('app.initial_draw as d')
      .innerJoin('app.second_home as h', 'h.id', 'd.second_home_id')
      .leftJoin('app.initial_draw_reveal as r', 'r.draw_id', 'd.id')
      .select(['d.id', 'd.second_home_id', 'h.label', 'r.draw_id as revealed'])
      .orderBy('h.label')
      .execute();
    return rows.map((row) => ({
      drawId: row.id,
      secondHomeId: row.second_home_id,
      secondHomeLabel: row.label,
      revealed: row.revealed !== null,
    }));
  });
}

/** Titular: evidência de um sorteio visível pela RLS; outro sorteio ou id inválido → `null`, sem oráculo. */
export function readTitularInitialDraw(
  session: { readonly userId: string },
  drawId: string,
  options: ReadOptions = {},
): Promise<InitialDrawEvidence | null> {
  return withUserRead(options.db ?? getDatabase(), claims(session.userId), async (tx) =>
    evidence(tx, { drawId }, await ownStakes(tx)),
  );
}
