// Disposable local/CI E2E fixture only (W9, spec ownership §16): never reads DATABASE_URL or contacts a deployment.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { initialOrder } from '../../src/features/ownership/application/initial-draw-algorithm';
import { roundTime } from '../../src/features/ownership/domain/initial-draw';
import {
  E2E_ACQUISITION_DATABASE_FILE,
  validateE2eAcquisitionDatabase,
} from './e2e-acquisition-database.mjs';

interface FixtureFile {
  readonly ownerUrl: string;
  readonly cronSecret: string;
}
interface RecordedRound {
  readonly round: number;
  readonly randomness: string;
  readonly signature: string;
}

const MINUTE_MS = 60_000;
const PERIOD_MS = 3_000;

function fixtureFile(): FixtureFile {
  if (process.env.VERCEL || process.env.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  return JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8')) as FixtureFile;
}

/** Segredo do job `outbox` do servidor de E2E desta execução. */
export function e2eCronSecret(): string {
  return fixtureFile().cronSecret;
}

/**
 * Estado concluído para a interface: liga ao compromisso gravado pelo consumidor real uma rodada quicknet real gravada
 * (`tests/fixtures/drand-quicknet-rounds.json`), com instantes coerentes, e grava o resultado `fy-v1` da seed do
 * próprio compromisso. Só no banco descartável do E2E, como superusuário em modo `replica` (sem gatilhos). A revelação
 * real pelos consumidores é provada nos testes `db`.
 */
export async function completeE2eInitialDraw(secondHomeId: string): Promise<void> {
  const url = validateE2eAcquisitionDatabase(fixtureFile().ownerUrl);
  const [recorded] = (
    JSON.parse(readFileSync('tests/fixtures/drand-quicknet-rounds.json', 'utf8')) as {
      rounds: RecordedRound[];
    }
  ).rounds;
  if (recorded === undefined) throw new Error('Missing recorded quicknet round');
  const roundAt = roundTime(recorded.round).getTime();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const { rows } = await client.query<{ id: string; participant_count: number; seed: Buffer }>(
      `SELECT d.id, d.participant_count, s.seed FROM app.initial_draw d
       JOIN app.initial_draw_seed s ON s.draw_id = d.id WHERE d.second_home_id = $1`,
      [secondHomeId],
    );
    const draw = rows[0];
    if (draw === undefined) throw new Error('No committed draw for the E2E Second Home');
    await client.query(
      `UPDATE app.initial_draw SET target_round = $2, target_round_at = $3, recorded_at = $4, commit_deadline = $5
       WHERE id = $1`,
      [
        draw.id,
        recorded.round,
        new Date(roundAt),
        new Date(roundAt - 10 * MINUTE_MS),
        new Date(roundAt - 5 * MINUTE_MS),
      ],
    );
    const event = await client.query<{ id: string }>(
      `UPDATE app.outbox SET delivered_at = now()
       WHERE event_type = 'ownership.initial_draw_committed' AND payload->>'draw_id' = $1 RETURNING id`,
      [draw.id],
    );
    const randomness = Buffer.from(recorded.randomness, 'hex');
    await client.query(`INSERT INTO app.initial_draw_reveal VALUES ($1, $2, $3, $4, $5, $6)`, [
      draw.id,
      recorded.round,
      Buffer.from(recorded.signature, 'hex'),
      randomness,
      new Date(roundAt + PERIOD_MS),
      event.rows[0]!.id,
    ]);
    const participants = await client.query<{ ordinal: number; stake_id: string }>(
      'SELECT ordinal, stake_id FROM app.initial_draw_participant WHERE draw_id = $1',
      [draw.id],
    );
    const stakeOf = new Map(participants.rows.map((row) => [row.ordinal, row.stake_id]));
    for (const [index, ordinal] of initialOrder(
      draw.seed,
      randomness,
      draw.participant_count,
    ).entries()) {
      await client.query('INSERT INTO app.initial_draw_position VALUES ($1, $2, $3)', [
        draw.id,
        index + 1,
        stakeOf.get(ordinal),
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
