import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConfigurationMissingError,
  systemClock,
  type DatabaseTransaction,
} from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { initialOrder } from '@/features/ownership/application/initial-draw-algorithm';
import {
  InitialDrawConfigurationError,
  initialDrawConsumers,
  type InitialDrawConfig,
  type InitialDrawStore,
} from '@/features/ownership/application/initial-draw';
import type { RandomnessBeacon } from '@/features/ownership/application/initial-draw-ports';
import { QUICKNET, roundTime } from '@/features/ownership/domain/initial-draw';
import { postgresInitialDrawStore } from '@/features/ownership/infrastructure/postgres-initial-draw-store';
import { acquisitionHarness, type AcquisitionHarness } from './acquisition-support';
import {
  formalizedCoOwner,
  testBeacon,
  waitUntil,
  type FormalizedCoOwner,
} from './initial-draw-support';

const CONFIG: InitialDrawConfig = {
  transactionTimeoutMs: 1_000,
  beaconTimeoutMs: 500,
  leadSeconds: 1,
};
const PERIOD_MS = QUICKNET.periodSeconds * 1_000;

describe('W9 consumidores do sorteio no PostgreSQL real [TECH-093]', () => {
  let h: AcquisitionHarness;
  let draw: FormalizedCoOwner;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    h = await acquisitionHarness();
    draw = await formalizedCoOwner(h, 4);
  });
  afterEach(async () => h.close());

  function consumers(
    beacon: RandomnessBeacon,
    options: {
      config?: () => InitialDrawConfig;
      store?: InitialDrawStore<DatabaseTransaction>;
    } = {},
  ) {
    return initialDrawConsumers<DatabaseTransaction>({
      store: options.store ?? postgresInitialDrawStore,
      beacon: () => beacon,
      config: options.config ?? (() => CONFIG),
      clock: h.clock,
    });
  }
  const sweep = (list: ReturnType<typeof consumers>) =>
    dispatchOutbox({
      store: createPostgresOutboxStore(h.db),
      consumers: new ConsumerRegistry(list),
      clock: systemClock,
      batchSize: 10,
      log,
    });
  const rows = async (query: string, params: unknown[] = []) =>
    (await h.database.pool.query(query, params)).rows;
  const count = async (table: string) =>
    Number((await rows(`SELECT count(*) FROM app.${table}`))[0].count);
  const committed = async () =>
    (await rows('SELECT id, target_round, commit_deadline FROM app.initial_draw'))[0] as
      { id: string; target_round: string; commit_deadline: Date } | undefined;
  const pendingReveal = async () =>
    (
      await rows(
        "SELECT attempts, last_error, delivered_at, available_at FROM app.outbox WHERE event_type = 'ownership.initial_draw_committed'",
      )
    )[0] as {
      attempts: number;
      last_error: string | null;
      delivered_at: Date | null;
      available_at: Date;
    };
  const afterRound = async () => {
    const target = Number((await committed())!.target_round);
    await waitUntil(new Date(roundTime(target).getTime() + PERIOD_MS));
    return target;
  };

  it('[TECH-093] conclui o sorteio agendado pela formalização: compromisso, revelação fy-v1 e notificação', async () => {
    const { beacon, state } = testBeacon();
    const list = consumers(beacon);

    // Varredura 1: compromisso; a revelação fica agendada para depois da rodada e não ocupa o lote.
    expect(await sweep(list)).toEqual({ delivered: 1, failed: 0 });
    const commitment = await committed();
    expect(commitment).toBeDefined();
    expect(await count('initial_draw_reveal')).toBe(0);
    const scheduled = await pendingReveal();
    expect(scheduled.attempts).toBe(0);
    expect(scheduled.available_at.getTime()).toBe(
      roundTime(Number(commitment!.target_round)).getTime() + PERIOD_MS,
    );
    expect(state.calls).toBe(0);
    expect(await sweep(list)).toEqual({ delivered: 0, failed: 0 });

    // Varredura 2, depois da rodada: revelação e notificação.
    await afterRound();
    expect(await sweep(list)).toEqual({ delivered: 2, failed: 0 });
    const [seed] = await rows('SELECT seed FROM app.initial_draw_seed');
    const [reveal] = await rows('SELECT beacon_randomness FROM app.initial_draw_reveal');
    const positions = await rows(
      'SELECT p.position, a.ordinal FROM app.initial_draw_position p JOIN app.initial_draw_participant a USING (draw_id, stake_id) ORDER BY p.position',
    );
    expect(positions.map((p) => p.ordinal)).toEqual(
      initialOrder(seed.seed, reveal.beacon_randomness, 4),
    );
    const notifications = await rows(
      "SELECT recipient_party_id, data FROM app.notification WHERE kind = 'ownership.initial_draw_result'",
    );
    expect(notifications).toHaveLength(4);
    expect(notifications[0].data).toEqual({ draw_id: commitment!.id, second_home_id: draw.homeId });

    // Auditoria system na operação da formalização; seed só no registro da revelação; eventos sem seed.
    const audits = await rows(
      "SELECT role, operation_id, after FROM app.audit_log WHERE object_type = 'initial_draw' ORDER BY id",
    );
    expect(audits.map((a) => [a.role, a.operation_id])).toEqual([
      ['system', draw.operationId],
      ['system', draw.operationId],
    ]);
    expect(audits[0].after).not.toHaveProperty('seed');
    expect(audits[1].after).toHaveProperty('seed');
    const payloads = await rows(
      "SELECT payload::text AS p FROM app.outbox WHERE event_type LIKE 'ownership.initial\\_draw\\_%'",
    );
    for (const { p } of payloads) expect(p).not.toContain(Buffer.from(seed.seed).toString('hex'));
  });

  it('[TECH-110][TECH-093] beacon fora do ar deixa o sorteio pendente, sem resultado parcial', async () => {
    const { beacon, state } = testBeacon();
    const list = consumers(beacon);
    await sweep(list);
    await afterRound();

    for (const [mode, error] of [
      ['unavailable', 'InitialDrawBeaconUnavailableError'],
      ['invalid', 'InitialDrawBeaconInvalidError'],
    ] as const) {
      state.mode = mode;
      expect(await sweep(list)).toEqual({ delivered: 0, failed: 1 });
      expect(await count('initial_draw_reveal')).toBe(0);
      expect(await count('initial_draw_position')).toBe(0);
      expect(await count('notification')).toBe(0);
      expect((await pendingReveal()).last_error).toBe(error);
      expect((await pendingReveal()).delivered_at).toBeNull();
    }

    // Falha no meio da revelação (depois de gravar a revelação, antes das posições): nada fica.
    state.mode = 'ok';
    const failing: InitialDrawStore<DatabaseTransaction> = {
      ...postgresInitialDrawStore,
      async insertReveal(tx, reveal) {
        await postgresInitialDrawStore.insertReveal(tx, { ...reveal, positions: [] });
        throw new Error('injected failure after the reveal row');
      },
    };
    expect(await sweep(consumers(beacon, { store: failing }))).toEqual({ delivered: 0, failed: 1 });
    expect(await count('initial_draw_reveal')).toBe(0);

    // Beacon de volta: conclui exatamente uma vez.
    expect(await sweep(list)).toEqual({ delivered: 2, failed: 0 });
    expect(await count('initial_draw_reveal')).toBe(1);
    expect(await count('initial_draw_position')).toBe(4);
    expect(await count('notification')).toBe(4);
    expect((await pendingReveal()).attempts).toBe(4);
    expect(await sweep(list)).toEqual({ delivered: 0, failed: 0 });
  });

  it('[CONC-12] varreduras paralelas concluem o sorteio uma única vez', async () => {
    const { beacon } = testBeacon();
    const list = consumers(beacon);
    await Promise.all([sweep(list), sweep(list)]);
    expect(await count('initial_draw')).toBe(1);
    await afterRound();
    await Promise.all([sweep(list), sweep(list), sweep(list)]);
    expect(await count('initial_draw_reveal')).toBe(1);
    expect(await count('initial_draw_position')).toBe(4);
    expect(await count('notification')).toBe(4);
    expect(
      Number(
        (
          await rows(
            "SELECT count(*) FROM app.outbox WHERE event_type = 'ownership.initial_draw_completed'",
          )
        )[0].count,
      ),
    ).toBe(1);
  });

  it('[TECH-093] novo evento de agendamento da mesma aquisição não cria segundo compromisso', async () => {
    const { beacon } = testBeacon();
    const list = consumers(beacon);
    await sweep(list);
    const first = await committed();
    await h.database.pool.query(
      `INSERT INTO app.outbox (id, operation_id, event_type, dedup_key, payload, occurred_at)
       VALUES ($1, $2, 'ownership.initial_draw_scheduled', $3, $4, now())`,
      [
        randomUUID(),
        draw.operationId,
        `duplicate:${randomUUID()}`,
        JSON.stringify({ acquisition_id: draw.acquisitionId, second_home_id: draw.homeId }),
      ],
    );
    expect(await sweep(list)).toEqual({ delivered: 1, failed: 0 });
    expect(await count('initial_draw')).toBe(1);
    expect((await committed())!.id).toBe(first!.id);
  });

  it('[TECH-001] configuração ausente ou inválida mantém o evento agendado pendente sem compromisso', async () => {
    const { beacon } = testBeacon();
    const missing = () => {
      throw new ConfigurationMissingError(['DRAW_TRANSACTION_TIMEOUT_MS']);
    };
    expect(await sweep(consumers(beacon, { config: missing }))).toEqual({
      delivered: 0,
      failed: 1,
    });
    const invalid = () => ({ ...CONFIG, beaconTimeoutMs: CONFIG.transactionTimeoutMs });
    expect(await sweep(consumers(beacon, { config: invalid }))).toEqual({
      delivered: 0,
      failed: 1,
    });
    expect(await count('initial_draw')).toBe(0);
    expect(
      (
        await rows(
          "SELECT last_error FROM app.outbox WHERE event_type = 'ownership.initial_draw_scheduled'",
        )
      )[0].last_error,
    ).toBe(new InitialDrawConfigurationError().name);
    expect(await sweep(consumers(beacon))).toEqual({ delivered: 1, failed: 0 });
    expect(await count('initial_draw')).toBe(1);
  });

  it('[TECH-093] compromisso atrasado além do prazo é desfeito e refeito com outra seed e outra rodada futura', async () => {
    const { beacon } = testBeacon();
    const slow: InitialDrawStore<DatabaseTransaction> = {
      ...postgresInitialDrawStore,
      async insertCommitment(tx, commitment) {
        await postgresInitialDrawStore.insertCommitment(tx, commitment);
        await new Promise((resolve) => setTimeout(resolve, CONFIG.transactionTimeoutMs + 300));
      },
    };
    expect(await sweep(consumers(beacon, { store: slow }))).toEqual({ delivered: 0, failed: 1 });
    expect(await count('initial_draw')).toBe(0);
    expect(await count('initial_draw_seed')).toBe(0);
    expect(await sweep(consumers(beacon))).toEqual({ delivered: 1, failed: 0 });
    const done = await committed();
    expect(done!.commit_deadline.getTime()).toBeLessThan(
      roundTime(Number(done!.target_round)).getTime(),
    );
  });

  it('[TECH-093] Owner não agenda sorteio', async () => {
    const { home } = await h.root();
    await h.run(h.handlers.formalizeAcquisition, await h.owner(home.id));
    const { beacon } = testBeacon();
    await sweep(consumers(beacon));
    expect(
      Number(
        (
          await rows('SELECT count(*) FROM app.initial_draw WHERE second_home_id = $1', [home.id])
        )[0].count,
      ),
    ).toBe(0);
  });
});
