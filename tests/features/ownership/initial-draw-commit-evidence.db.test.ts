import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { systemClock, type DatabaseTransaction } from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { initialDrawConsumers } from '@/features/ownership/application/initial-draw';
import { QUICKNET, roundTime } from '@/features/ownership/domain/initial-draw';
import { postgresInitialDrawStore } from '@/features/ownership/infrastructure/postgres-initial-draw-store';
import { migrateUp } from '../../../scripts/lib/dbmate.mjs';
import { applySupabaseCompat, createDatabase } from '../../../scripts/lib/pg.mjs';
import { startPostgresProcess } from '../../../scripts/lib/postgres-process.mjs';
import { acquisitionHarness, type AcquisitionHarness } from './acquisition-support';
import {
  formalizedCoOwner,
  roundAtOrAfter,
  sha256,
  testBeacon,
  waitUntil,
  type FormalizedCoOwner,
} from './initial-draw-support';

// T-910 (spec ownership §16.8, ADR-0023; relatório no Security Advisory privado): a revelação exige o carimbo de COMMIT
// registrado pelo servidor, capturado numa evidência imutável que a aplicação não forja.
const CONFIG = { transactionTimeoutMs: 1_000, beaconTimeoutMs: 500, leadSeconds: 1 };
const PERIOD_MS = QUICKNET.periodSeconds * 1_000;

describe('W9/T-910 evidência do carimbo de COMMIT do servidor [TECH-093]', () => {
  let h: AcquisitionHarness;
  let draw: FormalizedCoOwner;
  const clients: pg.Client[] = [];

  beforeEach(async () => {
    h = await acquisitionHarness();
    draw = await formalizedCoOwner(h, 4);
  });
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.end().catch(() => undefined)));
    await h.close();
  });

  /** Sessão com os privilégios exatos do papel da aplicação. */
  async function asApp() {
    const client = new pg.Client({ connectionString: h.database.appUrl });
    client.on('error', () => undefined);
    await client.connect();
    clients.push(client);
    return client;
  }
  const rows = async (query: string, params: unknown[] = []) =>
    (await h.database.pool.query(query, params)).rows;
  const count = async (table: string) =>
    Number((await rows(`SELECT count(*) FROM app.${table}`))[0].count);

  /** Compromisso inserido como o consumidor faz, numa transação já aberta da sessão da aplicação. */
  async function commitment(client: pg.Client, deadlineMs: number) {
    await client.query(`SELECT set_config('transaction_timeout', $1, true)`, [`${deadlineMs}ms`]);
    const now: Date = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const deadline = new Date(now.getTime() + deadlineMs);
    const round = roundAtOrAfter(new Date(deadline.getTime() + 1_000));
    const seed = randomBytes(32);
    const id = (
      await client.query(
        `INSERT INTO app.initial_draw (id, acquisition_id, second_home_id, operation_id, source_event_id, algorithm,
           beacon_chain_hash, participant_count, commitment, target_round, target_round_at, commit_deadline)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'fy-v1', $5, 4, $6, $7, $8, $9) RETURNING id`,
        [
          draw.acquisitionId,
          draw.homeId,
          draw.operationId,
          draw.scheduledEventId,
          QUICKNET.chainHash,
          sha256(seed),
          round,
          roundTime(round),
          deadline,
        ],
      )
    ).rows[0].id as string;
    for (const stake of draw.stakes) {
      await client.query('INSERT INTO app.initial_draw_participant VALUES ($1, $2, $3, $4, $5)', [
        id,
        draw.acquisitionId,
        draw.homeId,
        stake.position,
        stake.id,
      ]);
    }
    await client.query('INSERT INTO app.initial_draw_seed VALUES ($1, $2)', [id, seed]);
    return { id, round, deadline };
  }

  const evidence = (client: pg.Client, drawId: string, claimed = new Date(0)) =>
    client.query(
      'INSERT INTO app.initial_draw_commit_evidence (draw_id, committed_at) VALUES ($1, $2)',
      [drawId, claimed],
    );

  async function revealAs(client: pg.Client, drawId: string, round: number) {
    const signature = randomBytes(48);
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO app.initial_draw_reveal (draw_id, beacon_round, beacon_signature, beacon_randomness, source_event_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [drawId, round, signature, sha256(signature), draw.scheduledEventId],
      );
      for (const [index, stake] of draw.stakes.entries()) {
        await client.query('INSERT INTO app.initial_draw_position VALUES ($1, $2, $3)', [
          drawId,
          index + 1,
          stake.id,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  function sweep(beacon = testBeacon().beacon) {
    return dispatchOutbox({
      store: createPostgresOutboxStore(h.db),
      consumers: new ConsumerRegistry(
        initialDrawConsumers<DatabaseTransaction>({
          store: postgresInitialDrawStore,
          beacon: () => beacon,
          config: () => CONFIG,
          clock: h.clock,
        }),
      ),
      clock: systemClock,
      batchSize: 10,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
  }

  it('[TECH-093] compromisso legítimo recebe o carimbo de COMMIT do servidor e a revelação é aceita', async () => {
    expect(await sweep()).toEqual({ delivered: 1, failed: 0 });
    const [committed] = await rows(
      'SELECT id, target_round, commit_deadline, recorded_at FROM app.initial_draw',
    );
    await waitUntil(new Date(roundTime(Number(committed.target_round)).getTime() + PERIOD_MS));
    expect(await sweep()).toEqual({ delivered: 2, failed: 0 });
    const [proof] = await rows(
      'SELECT committed_at FROM app.initial_draw_commit_evidence WHERE draw_id = $1',
      [committed.id],
    );
    expect(proof.committed_at.getTime()).toBeGreaterThanOrEqual(committed.recorded_at.getTime());
    expect(proof.committed_at.getTime()).toBeLessThanOrEqual(committed.commit_deadline.getTime());
    expect(await count('initial_draw_position')).toBe(4);
  });

  it('[TECH-093] T-910: COMMIT depois do prazo, com os privilégios da aplicação, não recebe evidência nem revelação', async () => {
    const client = await asApp();
    await client.query('BEGIN');
    const late = await commitment(client, 300);
    await client.query('SET CONSTRAINTS app.initial_draw_commit_constraint IMMEDIATE');
    await client.query("SELECT set_config('transaction_timeout', '0', true)");
    await waitUntil(new Date(late.deadline.getTime() + 300));
    await client.query('COMMIT');
    await expect(evidence(client, late.id)).rejects.toThrow(/committed after its deadline/);
    await waitUntil(new Date(roundTime(late.round).getTime() + 100));
    await expect(revealAs(client, late.id, late.round)).rejects.toThrow(/server commit evidence/);
    // Pelos consumidores: o evento de revelação fica pendente, sem evidência, posições ou notificação.
    await h.database.pool.query(
      `INSERT INTO app.outbox (id, operation_id, event_type, dedup_key, payload, occurred_at)
       VALUES (gen_random_uuid(), $1, 'ownership.initial_draw_committed', 'late:' || $2, $3, now())`,
      [
        draw.operationId,
        late.id,
        JSON.stringify({
          draw_id: late.id,
          acquisition_id: draw.acquisitionId,
          second_home_id: draw.homeId,
          target_round: late.round,
        }),
      ],
    );
    const outcome = await sweep();
    expect(outcome.failed).toBeGreaterThanOrEqual(1);
    expect(await count('initial_draw_commit_evidence')).toBe(0);
    expect(await count('initial_draw_reveal')).toBe(0);
    expect(await count('notification')).toBe(0);
  });

  it('[TECH-093] T-910: a aplicação não forja nem altera a evidência e não desliga o carimbo', async () => {
    const client = await asApp();
    await client.query('BEGIN');
    const honest = await commitment(client, 1_000);
    // Na mesma transação o COMMIT ainda não existe: carimbo indisponível, recusa segura.
    await client.query('SAVEPOINT same');
    await expect(evidence(client, honest.id)).rejects.toThrow(/commit timestamp is unavailable/);
    await client.query('ROLLBACK TO SAVEPOINT same');
    await client.query('COMMIT');
    await evidence(client, honest.id, new Date('2000-01-01T00:00:00Z'));
    const [proof] = await rows('SELECT committed_at FROM app.initial_draw_commit_evidence');
    expect(proof.committed_at.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
    expect(proof.committed_at.getTime()).toBeLessThanOrEqual(honest.deadline.getTime());
    await expect(
      client.query('UPDATE app.initial_draw_commit_evidence SET committed_at = now()'),
    ).rejects.toThrow();
    await expect(client.query('DELETE FROM app.initial_draw_commit_evidence')).rejects.toThrow();
    await expect(client.query('SET track_commit_timestamp = off')).rejects.toThrow();
  });

  it('[TECH-093] compromisso inserido em subtransação recebe o carimbo do COMMIT da transação', async () => {
    const client = await asApp();
    await client.query('BEGIN');
    await client.query('SAVEPOINT consumer');
    const { id } = await commitment(client, 1_000);
    await client.query('RELEASE SAVEPOINT consumer');
    await client.query('COMMIT');
    await evidence(client, id);
    expect(await count('initial_draw_commit_evidence')).toBe(1);
  });

  it('[TECH-093] VACUUM (FREEZE) das tabelas não apaga o carimbo antes da captura da evidência', async () => {
    const client = await asApp();
    await client.query('BEGIN');
    const { id } = await commitment(client, 1_000);
    await client.query('COMMIT');
    await h.database.pool.query('VACUUM (FREEZE) app.initial_draw');
    await h.database.pool.query('VACUUM (FREEZE)');
    await evidence(client, id);
    expect(await count('initial_draw_commit_evidence')).toBe(1);
  });

  it('[TECH-110][TECH-093] com o beacon fora do ar a evidência é capturada na primeira tentativa e a revelação posterior depende só dela', async () => {
    const { beacon, state } = testBeacon();
    await sweep(beacon);
    const [committed] = await rows('SELECT id, target_round FROM app.initial_draw');
    await waitUntil(new Date(roundTime(Number(committed.target_round)).getTime() + PERIOD_MS));
    state.mode = 'unavailable';
    expect(await sweep(beacon)).toEqual({ delivered: 0, failed: 1 });
    expect(await count('initial_draw_commit_evidence')).toBe(1);
    expect(await count('initial_draw_reveal')).toBe(0);
    state.mode = 'ok';
    expect(await sweep(beacon)).toEqual({ delivered: 2, failed: 0 });
    expect(await count('initial_draw_position')).toBe(4);
  });
});

describe('W9/T-910 servidor sem track_commit_timestamp: recusa segura [TECH-001]', () => {
  let server: Awaited<ReturnType<typeof startPostgresProcess>>;
  let url: string;
  beforeAll(async () => {
    server = await startPostgresProcess({ trackCommitTimestamp: false });
    url = await createDatabase(server.adminUrl, 'luxtory_commit_ts_off');
    await applySupabaseCompat(url);
    await migrateUp(url);
  }, 180_000);
  afterAll(async () => server?.stop());

  it('[TECH-001] sem o carimbo do servidor, compromisso e evidência são recusados e as migrations aplicam', async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      expect(
        (await client.query('SHOW track_commit_timestamp')).rows[0].track_commit_timestamp,
      ).toBe('off');
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE luxtory_app');
      await expect(
        client.query(
          `INSERT INTO app.initial_draw (id, acquisition_id, second_home_id, operation_id, source_event_id, algorithm,
             beacon_chain_hash, participant_count, commitment, target_round, target_round_at, commit_deadline)
           VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
             'fy-v1', $1, 4, $2, 1, to_timestamp(1692803367), now() + interval '1 minute')`,
          [QUICKNET.chainHash, randomBytes(32)],
        ),
      ).rejects.toThrow(/track_commit_timestamp/);
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE luxtory_app');
      await expect(
        client.query(
          'INSERT INTO app.initial_draw_commit_evidence (draw_id, committed_at) VALUES (gen_random_uuid(), now())',
        ),
      ).rejects.toThrow(/track_commit_timestamp/);
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});
