import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import { createLuxchangeConsumers } from '@/features/luxchange/jobs';
import { createOwnUseCessionPort } from '@/features/booking';
import { createPostgresCreditStore } from '@/features/credits';
import { createLuxchangeCessionInventory } from '@/features/inventory';
import { createDepositCapacityHandler } from '@/features/luxchange';
import { createPostgresDepositStore } from '@/features/luxchange/infrastructure/postgres-deposit-store';
import {
  CapabilityNotActivatedError,
  systemClock,
  type CommandHandler,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  postgresEconomicSnapshotRecorder,
} from '@/features/pricing';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { eventValidator } from '../../support/asyncapi';
import { addDays } from '../booking/booking-support';
import { activate, asOperation, deactivate, openException } from '../booking/lifecycle-support';
import {
  suspend,
  reactivate,
  secondTitular,
  TEST_VALIDITY_MONTHS,
} from '../credits/credits-support';
import {
  activeCustody,
  book,
  changePrl,
  coOwnerTitular,
  depositDate,
  depositHarness,
  depositRunner,
  economicFacts,
  expectedCredits,
  publishMultiplier,
  publishPrl,
  type CreditTitular,
  type DepositHarness,
} from './luxchange-support';

/**
 * W20 E2 — `deposit_capacity` pelo executor real (TECH-054), com o guard do Titular, a verificação de Membership e os
 * privilégios do `luxtory_app` (ADR-0036; REQ-051, REQ-060, BR-201, TECH-043, TECH-025). Valores de PRL deliberadamente
 * quebrados para provar a exatidão; multiplicador de referência 10.
 */
describe('W20 — depósito Luxchange pelo command (REQ-051, REQ-060)', () => {
  let d: DepositHarness;
  let owner: CreditTitular;
  let run: ReturnType<typeof depositRunner>;

  /**
   * Termos que o Titular revisou: os mesmos que o servidor calcula para as noites e o PRL publicado — Créditos de cada
   * data (padrão: uma noite com o total), o total e a validade.
   */
  const input = (
    homeId: string,
    nights: readonly string[],
    totalMinor: bigint,
    nightMinor: readonly bigint[] = [totalMinor],
  ) => ({
    second_home_id: homeId,
    nights,
    expected_night_credits: nightMinor.map((minor) => expectedCredits(minor)),
    expected_credits: expectedCredits(totalMinor),
    expected_validity_months: TEST_VALIDITY_MONTHS,
  });

  beforeAll(async () => {
    d = await depositHarness();
    owner = d.c.titular;
    run = depositRunner(d, owner);
    // Noites 0..12: PRL publicado (a 5 e a 6 ficam sem PRL de propósito para provar que não entram no total).
    const nights: Record<string, string> = {};
    for (let offset = 0; offset <= 12; offset += 1)
      if (offset !== 5 && offset !== 6)
        nights[depositDate(offset)] = String(123_456 + offset * 1_011);
    await publishPrl(d, owner.homeId, nights);
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  const prlOf = (offset: number) => BigInt(123_456 + offset * 1_011);

  it('[REQ-060][BR-201][REQ-052] Owner: noites livres não consecutivas viram Créditos exatos e Inventário no mesmo commit', async () => {
    const nights = [depositDate(4), depositDate(7)];
    const total = prlOf(4) + prlOf(7);
    const outcome = await run(input(owner.homeId, nights, total, [prlOf(4), prlOf(7)]));
    expect(outcome).toMatchObject({ status: 'committed', replayed: false });
    if (outcome.status !== 'committed') return;
    const result = outcome.result;
    expect(result.credits).toBe(expectedCredits(total));
    expect(result.nights).toEqual(nights);
    expect(result.validity_months).toBe(TEST_VALIDITY_MONTHS);
    expect(result.ceded_bookings).toEqual([]);

    // Custódias: as duas noites no Inventário Luxtory por cessão, com a referência do depósito; as intermediárias
    // (inclusive as sem PRL) continuam do Owner e fora do cálculo.
    const custody = await activeCustody(d.c.h.database.pool, owner.homeId, [
      depositDate(4),
      depositDate(5),
      depositDate(6),
      depositDate(7),
    ]);
    expect(custody.map((row) => [row.stay_date, row.holder_kind, row.inventory_origin])).toEqual([
      [depositDate(4), 'luxtory', 'luxchange_cession'],
      [depositDate(5), 'owner', null],
      [depositDate(6), 'owner', null],
      [depositDate(7), 'luxtory', 'luxchange_cession'],
    ]);
    expect(custody[0]!.authorization_ref).toBe(`deposit_capacity:${outcome.operationId}`);

    // Snapshot: versão do PRL de cada noite, multiplicador e validade usados; lote com instante e validade do snapshot.
    const { rows } = await d.c.h.database.pool.query<{
      nights: string[];
      keys: string[];
      quantity: string;
      same_instant: boolean;
      party: string;
    }>(
      `SELECT (SELECT array_agg(n.stay_date::text ORDER BY n.stay_date) FROM app.economic_snapshot_night n
                WHERE n.operation_id = l.origin_operation_id) AS nights,
              (SELECT array_agg(p.parameter_key ORDER BY p.parameter_key) FROM app.economic_snapshot_parameter p
                WHERE p.operation_id = l.origin_operation_id) AS keys,
              l.quantity::text AS quantity, l.originated_at = s.resolved_at AS same_instant, l.party_id AS party
         FROM app.credit_lot l JOIN app.economic_snapshot s ON s.operation_id = l.origin_operation_id
        WHERE l.id = $1`,
      [result.lot_id],
    );
    expect(rows[0]).toEqual({
      nights,
      keys: ['credit_multiplier', 'credit_validity_months'],
      quantity: expectedCredits(total),
      same_instant: true,
      party: owner.partyId,
    });

    // Evento do outbox conforme o AsyncAPI; nenhuma quantia monetária no payload.
    const events = await d.c.h.database.pool.query<{
      type: string;
      payload: Record<string, unknown>;
    }>(`SELECT event_type AS type, payload FROM app.outbox WHERE operation_id = $1`, [
      outcome.operationId,
    ]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]!.payload).toMatchObject({
      lot_id: result.lot_id,
      recipient_party_id: owner.partyId,
      nights: 2,
      first_night: nights[0],
      last_night: nights[1],
      credits: expectedCredits(total),
    });
    expect(JSON.stringify(events.rows[0]!.payload)).not.toContain(String(prlOf(4)));
  });

  it('[REQ-052] noite sem PRL no conjunto pedido → ERR_PRL_MISSING; nada é gravado', async () => {
    const before = await economicFacts(d.c.h.database.pool);
    expect(await run(input(owner.homeId, [depositDate(5)], 1n))).toMatchObject({
      status: 'rejected',
      code: 'ERR_PRL_MISSING',
    });
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
  });

  it('[ADR-0036 §8] termos diferentes dos revisados → ERR_DEPOSIT_TERMS_CHANGED; nada é originado', async () => {
    const before = await economicFacts(d.c.h.database.pool);
    const nights = [depositDate(8)];
    // Total diferente com a noite certa, noite diferente com o total certo: os dois são termos não revisados.
    for (const [total, night] of [
      [prlOf(8) + 1n, prlOf(8)],
      [prlOf(8), prlOf(8) + 1n],
    ] as const)
      expect(await run(input(owner.homeId, nights, total, [night]))).toMatchObject({
        status: 'rejected',
        code: 'ERR_DEPOSIT_TERMS_CHANGED',
      });
    expect(
      await run({ ...input(owner.homeId, nights, prlOf(8)), expected_validity_months: 24 }),
    ).toMatchObject({ status: 'rejected', code: 'ERR_DEPOSIT_TERMS_CHANGED' });
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
  });

  it('[TECH-025][ADR-006] replay devolve o mesmo resultado; mesma chave com outro payload → ERR_IDEMPOTENCY_CONFLICT', async () => {
    const key = randomUUID();
    const body = input(owner.homeId, [depositDate(9)], prlOf(9));
    const first = await run(body, { key });
    const second = await run(body, { key });
    expect(first).toMatchObject({ status: 'committed', replayed: false });
    expect(second).toMatchObject({ status: 'committed', replayed: true });
    if (first.status === 'committed' && second.status === 'committed')
      expect(second.result).toEqual(first.result);
    expect(await run(input(owner.homeId, [depositDate(10)], prlOf(10)), { key })).toMatchObject({
      status: 'rejected',
      code: 'ERR_IDEMPOTENCY_CONFLICT',
    });
    const { rows } = await d.c.h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.economic_snapshot_night WHERE stay_date = $1`,
      [depositDate(9)],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('[INV-2][TECH-025] noite já depositada (outra chave, duplo clique) → ERR_CAPACITY_UNAVAILABLE', async () => {
    expect(await run(input(owner.homeId, [depositDate(4)], prlOf(4)))).toMatchObject({
      status: 'rejected',
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
  });

  it('[TECH-043] a menos de 14 dias do check-in → ERR_MIN_NOTICE; com folga, deposita', async () => {
    // Datas pelo relógio real (o banco decide pelo próprio relógio): 13 dias nunca bastam, 16 sempre bastam, em qualquer
    // hora do dia e com a diferença de fuso entre UTC e a Second Home.
    const today = new Date().toISOString().slice(0, 10);
    const [close, far] = [addDays(today, 13), addDays(today, 16)];
    await publishPrl(d, owner.homeId, { [close]: '50000', [far]: '60000' });
    expect(await run(input(owner.homeId, [close], 50_000n))).toMatchObject({
      status: 'rejected',
      code: 'ERR_MIN_NOTICE',
    });
    expect(await run(input(owner.homeId, [far], 60_000n))).toMatchObject({ status: 'committed' });
  });

  it('[REQ-051] Owner com reserva de uso próprio na noite → ERR_CAPACITY_UNAVAILABLE (cancelar antes, TECH-023)', async () => {
    await d.c.h.database.pool.query(
      `INSERT INTO app.capability_activation VALUES ('own_use_booking', now(), 'test:activation')
       ON CONFLICT (capability) DO NOTHING`,
    );
    await book(d, owner, depositDate(11), 1);
    expect(await run(input(owner.homeId, [depositDate(11)], prlOf(11)))).toMatchObject({
      status: 'rejected',
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
  });

  it('[REQ-051][TECH-050] Second Home de outra party → ERR_PERMISSION', async () => {
    const other = await secondTitular(d.c);
    expect(
      await depositRunner(d, other)(input(owner.homeId, [depositDate(12)], prlOf(12))),
    ).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
  });

  it('[REQ-051][BR-146] sem Membership elegível → ERR_MEMBERSHIP_INELIGIBLE; reativado, deposita', async () => {
    await suspend(d.c, owner.partyId);
    try {
      expect(await run(input(owner.homeId, [depositDate(12)], prlOf(12)))).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
    } finally {
      await reactivate(d.c, owner.partyId);
    }
    expect(await run(input(owner.homeId, [depositDate(12)], prlOf(12)))).toMatchObject({
      status: 'committed',
    });
  });

  it('[ADR-0036 §7] sem a K6 (ou sem a K4) a funcionalidade está fechada: nada é gravado', async () => {
    const before = await economicFacts(d.c.h.database.pool);
    await deactivate(d.c.h, 'luxchange_deposit');
    try {
      await expect(run(input(owner.homeId, [depositDate(0)], prlOf(0)))).rejects.toBeInstanceOf(
        CapabilityNotActivatedError,
      );
    } finally {
      await d.c.h.database.pool.query(
        `INSERT INTO app.capability_activation VALUES ('luxchange_deposit', now(), 'test:activation')`,
      );
    }
    await deactivate(d.c.h, 'credits');
    try {
      await expect(run(input(owner.homeId, [depositDate(0)], prlOf(0)))).rejects.toBeInstanceOf(
        CapabilityNotActivatedError,
      );
    } finally {
      await d.c.h.database.pool.query(
        `INSERT INTO app.capability_activation VALUES ('credits', now(), 'test:activation')`,
      );
    }
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
  });

  it('[BR-200][TECH-043] bordas da antecedência: 335h59 recusa; 336h e 336h01 depositam — no banco e no command', async () => {
    // Predicado do banco (chamado com clock_timestamp() nas regras de escrita), nas três bordas do critério de aceite.
    const { rows } = await d.c.h.database.pool.query<Record<string, boolean>>(
      `SELECT app.luxchange_deposit_notice_met(c, c - interval '335 hours 59 minutes') AS h335m59,
              app.luxchange_deposit_notice_met(c, c - interval '336 hours') AS h336,
              app.luxchange_deposit_notice_met(c, c - interval '336 hours 1 minute') AS h336m01
         FROM (SELECT timestamptz '2026-11-15 15:00:00-03' AS c) AS x`,
    );
    expect(rows[0]).toEqual({ h335m59: false, h336: true, h336m01: true });
    // Command (o mesmo da API): instante do banco injetado na leitura do handler; a escrita segue conferida pelo relógio
    // real do banco (noites distantes, então só a borda injetada decide).
    const nights = [depositDate(15), depositDate(16), depositDate(17)] as const;
    await publishPrl(d, owner.homeId, Object.fromEntries(nights.map((night) => [night, '70000'])));
    const checkin = async (night: string) =>
      (
        await d.c.h.database.pool.query<{ at: string }>(
          `SELECT checkin_at::text AS at FROM app.second_home_date WHERE second_home_id = $1 AND stay_date = $2`,
          [owner.homeId, night],
        )
      ).rows[0]!.at;
    const at = (base: string, beforeMs: number) =>
      createDepositCapacityHandler<DatabaseTransaction>({
        store: {
          ...createPostgresDepositStore(),
          databaseInstant: async () => new Date(Date.parse(base) - beforeMs).toISOString(),
        },
        bookings: createOwnUseCessionPort(),
        inventory: createLuxchangeCessionInventory(),
        terms: createPostgresEconomicTermsStore(),
        credits: createPostgresCreditStore(),
        snapshots: postgresEconomicSnapshotRecorder,
      }) as unknown as CommandHandler<unknown, never, DatabaseTransaction>;
    const HOUR = 3_600_000;
    const MINUTE = 60_000;
    for (const [night, before, expected] of [
      [nights[0], 336 * HOUR - MINUTE, { status: 'rejected', code: 'ERR_MIN_NOTICE' }],
      [nights[1], 336 * HOUR, { status: 'committed' }],
      [nights[2], 336 * HOUR + MINUTE, { status: 'committed' }],
    ] as const)
      expect(
        await run(input(owner.homeId, [night], 70_000n), {
          handler: at(await checkin(night), before),
        }),
        night,
      ).toMatchObject(expected);
  });

  it('[ADR-0036 §8][REQ-052] termos revisados por noite: valores trocados com a mesma soma são recusados; versões novas com os mesmos valores confirmam', async () => {
    const [a, b] = [depositDate(13), depositDate(14)];
    await publishPrl(d, owner.homeId, { [a]: '40000', [b]: '60000' });
    // A revisão mostrou 4.000 e 6.000 (total 10.000). O Super Admin altera para 4.500 e 5.500: a soma não muda.
    const reviewed = input(owner.homeId, [a, b], 100_000n, [40_000n, 60_000n]);
    expect((await changePrl(d, owner.homeId, { [a]: '45000', [b]: '55000' })).status).toBe(
      'committed',
    );
    const before = await economicFacts(d.c.h.database.pool);
    expect(await run(reviewed)).toMatchObject({
      status: 'rejected',
      code: 'ERR_DEPOSIT_TERMS_CHANGED',
    });
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
    // O contrato é o valor apresentado, não a versão: um multiplicador republicado com o mesmo valor (versão nova) e os
    // valores por noite revisados de novo confirmam, e o snapshot registra as versões efetivamente usadas.
    const multiplierId = await publishMultiplier(d.c, '10');
    const outcome = await run(input(owner.homeId, [a, b], 100_000n, [45_000n, 55_000n]));
    expect(outcome).toMatchObject({ status: 'committed' });
    const { rows } = await d.c.h.database.pool.query<{ amount: string; multiplier: string }>(
      `SELECT l.amount_minor::text AS amount, sp.parameter_id::text AS multiplier
         FROM app.economic_snapshot_night n JOIN app.prl l ON l.id = n.prl_id
         JOIN app.economic_snapshot_parameter sp
           ON sp.operation_id = n.operation_id AND sp.parameter_key = 'credit_multiplier'
        WHERE n.operation_id = $1 ORDER BY n.stay_date`,
      [outcome.operationId],
    );
    expect(rows).toEqual([
      { amount: '45000', multiplier: multiplierId },
      { amount: '55000', multiplier: multiplierId },
    ]);
  });

  it('[REQ-097][TECH-091] uma notificação por depósito, sem duplicata na reentrega; recusas não notificam', async () => {
    const sweep = () =>
      dispatchOutbox({
        store: createPostgresOutboxStore(d.c.h.db),
        consumers: new ConsumerRegistry<DatabaseTransaction>([
          ...createLuxchangeConsumers({ clock: systemClock }),
        ]),
        clock: systemClock,
        batchSize: 50,
        log: d.c.h.log,
      });
    const outcome = await run(input(owner.homeId, [depositDate(1)], prlOf(1)));
    expect(outcome.status).toBe('committed');
    await sweep();
    await sweep();
    const { rows } = await d.c.h.database.pool.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM app.notification n JOIN app.outbox o ON o.id = n.event_id
        WHERE n.kind = 'luxchange.deposit_completed' AND o.operation_id = $1`,
      [outcome.operationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toMatchObject({
      second_home_id: owner.homeId,
      operation_id: outcome.operationId,
      nights: 1,
      first_night: depositDate(1),
      credits: expectedCredits(prlOf(1)),
    });
    const all = await d.c.h.database.pool.query<{ n: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM app.notification WHERE kind = 'luxchange.deposit_completed') AS n,
              (SELECT count(*)::int FROM app.outbox WHERE event_type = 'luxchange.credits_originated') AS events`,
    );
    expect(all.rows[0]!.n).toBe(all.rows[0]!.events);
    // Contrato do AsyncAPI.
    const event = await d.c.h.database.pool.query<Record<string, unknown>>(
      `SELECT id, event_type AS type, dedup_key, operation_id, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
              AS occurred_at, payload FROM app.outbox WHERE operation_id = $1`,
      [outcome.operationId],
    );
    expect(eventValidator('luxchange.credits_originated')(event.rows[0])).toBe(true);
  });
});

describe('W20 — depósito do Co-Owner: reserva inteira, Direito de Uso consumido (REQ-060, TECH-023)', () => {
  let d: DepositHarness;
  let co: CreditTitular;
  let run: ReturnType<typeof depositRunner>;
  const PRL = '98765';

  const input = (nights: readonly string[]) => ({
    second_home_id: co.homeId,
    nights,
    expected_night_credits: nights.map(() => expectedCredits(BigInt(PRL))),
    expected_credits: expectedCredits(BigInt(PRL) * BigInt(nights.length)),
    expected_validity_months: TEST_VALIDITY_MONTHS,
  });
  const span = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => depositDate(from + index));

  beforeAll(async () => {
    d = await depositHarness();
    co = await coOwnerTitular(d);
    run = depositRunner(d, co);
    await publishPrl(d, co.homeId, Object.fromEntries(span(0, 20).map((night) => [night, PRL])));
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  const balance = async () => {
    const { rows } = await d.c.h.database.pool.query<{
      remaining: number;
      consumes: number;
      restores: number;
    }>(
      `SELECT (SELECT sum(remaining)::int FROM app.use_right_balance WHERE stake_id = $1) AS remaining,
              (SELECT count(*)::int FROM app.use_right_ledger WHERE stake_id = $1 AND movement = 'consume') AS consumes,
              (SELECT count(*)::int FROM app.use_right_ledger WHERE stake_id = $1 AND movement = 'restore') AS restores`,
      [co.stakeId],
    );
    return rows[0]!;
  };

  it('[REQ-060][TECH-023] reserva cedida inteira: cancelled por cessão, ocupação ceded, Inventário e Créditos; o dia segue consumido', async () => {
    const bookingId = await book(d, co, depositDate(0), 3);
    const before = await balance();
    const outcome = await run(input(span(0, 3)));
    expect(outcome).toMatchObject({ status: 'committed' });
    if (outcome.status !== 'committed') return;
    expect(outcome.result.ceded_bookings).toEqual([bookingId]);
    expect(await balance()).toEqual(before);

    const { rows } = await d.c.h.database.pool.query<{
      state: string;
      kind: string;
      cancellation_class: string | null;
      first_affected_date: string;
      released: string[];
    }>(
      `SELECT b.state, t.kind, t.cancellation_class, t.first_affected_date::text,
              (SELECT array_agg(o.release_reason ORDER BY o.stay_date) FROM app.date_occupancy o
                WHERE o.booking_id = b.id) AS released
         FROM app.booking b JOIN app.booking_state_transition t ON t.id = b.last_transition_id WHERE b.id = $1`,
      [bookingId],
    );
    expect(rows[0]).toEqual({
      state: 'cancelled',
      kind: 'cession',
      cancellation_class: null,
      first_affected_date: depositDate(0),
      released: ['ceded', 'ceded', 'ceded'],
    });
    const custody = await activeCustody(d.c.h.database.pool, co.homeId, span(0, 3));
    expect(custody.every((row) => row.inventory_origin === 'luxchange_cession')).toBe(true);
  });

  it('[REQ-051][ADR-0036 §2] parte de uma reserva de várias noites → ERR_CAPACITY_UNAVAILABLE; nada muda', async () => {
    const bookingId = await book(d, co, depositDate(5), 3);
    const before = await economicFacts(d.c.h.database.pool);
    expect(await run(input(span(5, 2)))).toMatchObject({
      status: 'rejected',
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
    const { rows } = await d.c.h.database.pool.query<{ state: string }>(
      'SELECT state FROM app.booking WHERE id = $1',
      [bookingId],
    );
    expect(rows[0]!.state).toBe('confirmed');
  });

  it('[REQ-060][BR-151] data não reservada (capacidade da SPE) → ERR_CAPACITY_UNAVAILABLE', async () => {
    expect(await run(input([depositDate(15)]))).toMatchObject({
      status: 'rejected',
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
  });

  it('[REQ-060] duas reservas da mesma holding num só depósito (datas não consecutivas)', async () => {
    const first = await book(d, co, depositDate(10), 1);
    const second = await book(d, co, depositDate(12), 2);
    const nights = [depositDate(10), depositDate(12), depositDate(13)];
    const outcome = await run(input(nights));
    expect(outcome).toMatchObject({ status: 'committed' });
    if (outcome.status === 'committed')
      expect(outcome.result.ceded_bookings).toEqual([first, second].sort());
    expect(
      (await activeCustody(d.c.h.database.pool, co.homeId, [depositDate(11)]))[0]!.holder_kind,
    ).toBe('spe_pool');
  });

  it('[REQ-060][TECH-055] só reserva confirmada: em exceção ou já cancelada → recusada; atravessando o mês → cedida inteira', async () => {
    await activate(d.c.h, 'own_use_lifecycle');
    // Em exceção operacional (Admin): a cessão só parte de `confirmed`.
    const inException = await book(d, co, depositDate(30), 1);
    await asOperation(
      d.c.h.database.appUrl,
      'open_exception',
      { kind: 'admin', admin: d.c.admin },
      (client, op) => openException(client, op, inException, 'operational'),
    );
    // Cancelada no prazo pelo Titular: as noites voltaram à SPE (não são mais Direito de Uso reservado).
    const cancelled = await book(d, co, depositDate(32), 1);
    expect(
      await depositRunner(d, co)(
        {
          second_home_id: co.homeId,
          booking_id: cancelled,
          expected_cancellation_class: 'timely',
          expected_first_affected_date: depositDate(32),
        },
        { handler: createOwnUseLifecycleHandlers().cancelOwnUseBooking },
      ),
    ).toMatchObject({ status: 'committed' });
    await publishPrl(d, co.homeId, { [depositDate(30)]: PRL, [depositDate(32)]: PRL });
    for (const night of [depositDate(30), depositDate(32)])
      expect(await run(input([night]))).toMatchObject({
        status: 'rejected',
        code: 'ERR_CAPACITY_UNAVAILABLE',
      });
    // Reserva que atravessa o fim do mês: as duas noites, em meses diferentes, cedidas juntas.
    let last = depositDate(34);
    while (addDays(last, 1).slice(8) !== '01') last = addDays(last, 1);
    await publishPrl(d, co.homeId, { [last]: PRL, [addDays(last, 1)]: PRL });
    const across = await book(d, co, last, 2);
    const outcome = await run(input([last, addDays(last, 1)]));
    expect(outcome).toMatchObject({ status: 'committed' });
    if (outcome.status === 'committed') expect(outcome.result.ceded_bookings).toEqual([across]);
  });

  it('[REQ-051][BR-147] Membership suspenso: depósito recusado, mas o uso próprio segue reservando e cancelando', async () => {
    await suspend(d.c, co.partyId);
    try {
      const bookingId = await book(d, co, depositDate(17), 1);
      expect(await run(input([depositDate(17)]))).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
      await d.c.h.database.pool.query(
        `INSERT INTO app.capability_activation VALUES ('own_use_lifecycle', now(), 'test:activation')
         ON CONFLICT (capability) DO NOTHING`,
      );
      const cancelled = await depositRunner(d, co)(
        {
          second_home_id: co.homeId,
          booking_id: bookingId,
          expected_cancellation_class: 'timely',
          expected_first_affected_date: depositDate(17),
        },
        { handler: createOwnUseLifecycleHandlers().cancelOwnUseBooking },
      );
      expect(cancelled).toMatchObject({ status: 'committed' });
    } finally {
      await reactivate(d.c, co.partyId);
    }
  });
});
