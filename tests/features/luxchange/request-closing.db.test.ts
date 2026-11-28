import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processRefund } from '@/features/billing';
import { createReconciliationJob } from '@/features/billing/jobs';
import { createRejectRequestProductionHandler } from '@/features/luxchange';
import { createLuxchangeConsumers } from '@/features/luxchange/jobs';
import { runExpireRequests } from '@/features/luxchange/application/expire-requests';
import { processRequestRefunds } from '@/features/luxchange/application/request-flow';
import { closableRequests } from '@/features/luxchange/infrastructure/postgres-request-store';
import { systemClock, type DatabaseTransaction } from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { activate, deactivate } from '../booking/lifecycle-support';
import { revokeDelegation, secondRepresentative } from '../booking/booking-support';
import {
  TEST_VALIDITY_MONTHS,
  ageLot,
  creditsHarness,
  lotRow,
  monthsAgo,
  originate,
  reactivate,
  secondTitular,
  suspend,
  systemExecutor,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { eventValidator } from '../../support/asyncapi';
import { ownerDelegation } from '../../support/party-fixtures';
import { activeCustody } from './luxchange-support';
import { requestApp } from './request-app-support';
import {
  ageRequest,
  newRequester,
  pricedNights,
  requestFixture,
  requestRow,
  type RequestFixture,
} from './request-support';

/**
 * W21 E2 — encerramentos pela aplicação (ADR-0037 §7, §10; TECH-024, TECH-044, TECH-080, TECH-090, TECH-091): retirada
 * pelo solicitante, job `expire_requests` (vencidas e inelegíveis) idempotente e retomável, estorno da Taxa no PSP depois
 * do commit, chaves fechadas sem bloquear encerramentos, e as notificações do envio e do encerramento.
 */
describe('W21 E2 — encerramento da Request pela aplicação (ADR-0037 §7)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let app: ReturnType<typeof requestApp>;
  const pool = () => c.h.database.pool;

  /** Request de 500 Créditos (300 em Garantia num lote novo, 200 de uma noite Owner comprometida), enviada pela aplicação. */
  async function sent(requester?: CreditTitular, holder = f.holder) {
    const r = requester ?? (await newRequester(f));
    const lot = await originate(c, '300', { titular: r });
    const nights = await pricedNights(f, [5_000n], holder.homeId);
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const { outcome } = await app.quoteAndSend(
      r,
      app.shape(
        r,
        nights,
        [{ kind: 'owner_night', second_home_id: r.homeId, stay_date: offered! }],
        holder,
      ),
    );
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    return { r, lot, request: outcome.result };
  }
  const refundOf = async (operationId: string) =>
    (
      await pool().query<{ id: string; state: string; amount: string; fee: string }>(
        `SELECT x.id, x.state, x.amount_minor::text AS amount, f.amount_minor::text AS fee
           FROM app.refund x JOIN app.fee_charge f ON f.payment_id = x.payment_id
          WHERE x.operation_id = $1`,
        [operationId],
      )
    ).rows;
  const job = (correlationId = randomUUID()) => {
    const system = systemExecutor(c);
    return runExpireRequests(
      {
        closable: () => closableRequests(c.h.db, 500),
        execute: (command, request) => system.execute(app.systemClosing(command), request),
        processRefund: (refundId) =>
          processRefund({ store: f.store, gateway: f.gateway, log: f.log.logger }, refundId),
        log: f.log.logger,
        timeBudgetMs: 60_000,
        monotonicMs: () => performance.now(),
      },
      { correlationId },
    );
  };

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
    app = requestApp(f);
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('[PD-005][PD-006] retirada pelo solicitante: Garantia e datas liberadas, Taxa estornada integralmente; replay e nova tentativa sem efeito', async () => {
    const { r, lot, request } = await sent();
    const key = randomUUID();
    const outcome = await app.withdraw(r, request.request_id, key);
    expect(outcome).toMatchObject({
      status: 'committed',
      result: { state: 'cancelled_pre_accept', reason: 'withdrawn', guarantee_released: '300' },
    });
    if (outcome.status !== 'committed') return;
    expect(await lotRow(pool(), lot)).toMatchObject({ held: '0', available: '300' });
    const [refund] = await refundOf(outcome.result.operation_id);
    expect(refund).toMatchObject({ state: 'pending' });
    expect(refund!.amount).toBe(refund!.fee);
    expect(
      await processRefund(
        { store: f.store, gateway: f.gateway, log: f.log.logger },
        outcome.result.refund_id,
      ),
    ).toBe('succeeded');
    expect(await app.withdraw(r, request.request_id, key)).toMatchObject({
      status: 'committed',
      replayed: true,
    });
    expect(await app.withdraw(r, request.request_id)).toMatchObject({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
    });
    const event = await pool().query<Record<string, unknown>>(
      `SELECT id, event_type AS type, dedup_key, operation_id,
              to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at, payload
         FROM app.outbox WHERE operation_id = $1`,
      [outcome.result.operation_id],
    );
    expect(eventValidator('luxchange.request_closed')(event.rows[0])).toBe(true);
  });

  /**
   * Request com G = 0 (W21 C3): a noite Owner oferecida (200 Créditos potenciais) cobre os 150 necessários, sem Créditos
   * na Carteira — nenhuma Garantia é retida.
   */
  async function sentZero(holder = f.holder) {
    const r = await newRequester(f);
    const nights = await pricedNights(f, [1_500n], holder.homeId);
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const { outcome } = await app.quoteAndSend(
      r,
      app.shape(
        r,
        nights,
        [{ kind: 'owner_night', second_home_id: r.homeId, stay_date: offered! }],
        holder,
      ),
    );
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    expect(outcome.result).toMatchObject({ guarantee_credits: '0', complement_excess: '50' });
    return { r, offered: offered!, request: outcome.result };
  }
  /** Datas liberadas, Taxa revertida com estorno integral, um encerramento, nenhuma quebra de invariante. */
  async function expectClosedWithoutGuarantee(requestId: string, home: string, night: string) {
    const { rows } = await pool().query<{
      transitions: number;
      active: number;
      effective: boolean;
      reversals: number;
      refunds: number;
      full: boolean;
      luxchange: number;
      credits: number;
    }>(
      `SELECT (SELECT count(*)::int FROM app.luxchange_request_transition WHERE request_id = $1) AS transitions,
              (SELECT count(*)::int FROM app.luxchange_request_complement_night
                WHERE request_id = $1 AND state = 'active') AS active,
              app.luxchange_complement_effective($2::uuid, $3::date) IS NOT NULL AS effective,
              (SELECT count(*)::int FROM app.fee_charge_reversal v JOIN app.fee_charge f ON f.id = v.fee_charge_id
                 JOIN app.luxchange_request r ON r.operation_id = f.operation_id WHERE r.id = $1) AS reversals,
              (SELECT count(*)::int FROM app.refund x JOIN app.fee_charge f ON f.payment_id = x.payment_id
                 JOIN app.luxchange_request r ON r.operation_id = f.operation_id WHERE r.id = $1) AS refunds,
              (SELECT bool_and(x.amount_minor = f.amount_minor) FROM app.refund x
                 JOIN app.fee_charge f ON f.payment_id = x.payment_id
                 JOIN app.luxchange_request r ON r.operation_id = f.operation_id WHERE r.id = $1) AS full,
              (SELECT count(*)::int FROM app.luxchange_invariant_breaches()) AS luxchange,
              (SELECT count(*)::int FROM app.credit_invariant_breaches()) AS credits`,
      [requestId, home, night],
    );
    expect(rows[0]).toEqual({
      transitions: 1,
      active: 0,
      effective: false,
      reversals: 1,
      refunds: 1,
      full: true,
      luxchange: 0,
      credits: 0,
    });
  }

  it('[PD-012][PD-005] G = 0 — retirada: datas liberadas, Taxa estornada integralmente; replay sem efeito, nova tentativa recusada', async () => {
    const { r, offered, request } = await sentZero();
    const key = randomUUID();
    const outcome = await app.withdraw(r, request.request_id, key);
    expect(outcome).toMatchObject({
      status: 'committed',
      result: { state: 'cancelled_pre_accept', reason: 'withdrawn', guarantee_released: '0' },
    });
    expect(await app.withdraw(r, request.request_id, key)).toMatchObject({ replayed: true });
    expect(await app.withdraw(r, request.request_id)).toMatchObject({
      code: 'ERR_STATE_TRANSITION',
    });
    await expectClosedWithoutGuarantee(request.request_id, r.homeId, offered);
  });

  it('[PD-012][PD-007] G = 0 — expiração pelo job: encerra por prazo com as datas liberadas e a Taxa estornada', async () => {
    const { r, offered, request } = await sentZero();
    await ageRequest(f, request.request_id);
    expect((await job()).failed).toBe(0);
    expect(await requestRow(pool(), request.request_id)).toMatchObject({
      state: 'expired',
      closure_reason: 'expired',
    });
    await expectClosedWithoutGuarantee(request.request_id, r.homeId, offered);
  });

  it('[PD-012][EC-17] G = 0 — perda de elegibilidade do detentor: o job encerra; datas liberadas e Taxa estornada', async () => {
    const holder = await secondTitular(c);
    const { r, offered, request } = await sentZero(holder);
    await suspend(c, holder.partyId);
    try {
      expect((await job()).failed).toBe(0);
      expect(await requestRow(pool(), request.request_id)).toMatchObject({
        state: 'cancelled_pre_accept',
        closure_reason: 'holder_membership',
      });
      await expectClosedWithoutGuarantee(request.request_id, r.homeId, offered);
    } finally {
      await reactivate(c, holder.partyId);
    }
  });

  it('[PD-012][CONC-12] G = 0 — retirada e job concorrentes sobre a Request vencida: um encerramento e um estorno', async () => {
    const { r, offered, request } = await sentZero();
    await ageRequest(f, request.request_id);
    const settled = await Promise.allSettled([app.withdraw(r, request.request_id), job()]);
    expect(settled.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(await requestRow(pool(), request.request_id)).toMatchObject({ state: 'expired' });
    await expectClosedWithoutGuarantee(request.request_id, r.homeId, offered);
  });

  it('[TECH-051] só o solicitante retira: o detentor (outra party) não encontra a Request; Request alheia não vaza', async () => {
    const { request } = await sent();
    expect(await app.withdraw(f.holder, request.request_id)).toMatchObject({
      status: 'rejected',
      code: 'ERR_NOT_FOUND',
    });
    expect(await app.withdraw(f.holder, randomUUID())).toMatchObject({
      status: 'rejected',
      code: 'ERR_NOT_FOUND',
    });
    expect(await requestRow(pool(), request.request_id)).toMatchObject({ state: 'pending' });
  });

  it('[TECH-044][TECH-072] retirada depois do prazo grava expired; Garantia de lote vencido volta como expired', async () => {
    const { r, lot, request } = await sent();
    await ageRequest(f, request.request_id);
    await ageLot(c.h, lot, monthsAgo(TEST_VALIDITY_MONTHS, 1));
    expect(await app.withdraw(r, request.request_id)).toMatchObject({
      status: 'committed',
      result: { state: 'expired', reason: 'expired' },
    });
    expect(await lotRow(pool(), lot)).toMatchObject({ held: '0', expired: '300' });
  });

  it('[TECH-090][EC-7][EC-17] job expire_requests: vencidas e inelegíveis encerradas uma vez, estorno processado; replay e execuções paralelas sem efeito novo', async () => {
    const expired = await sent();
    await ageRequest(f, expired.request.request_id);
    const holder = await secondTitular(c);
    const ineligible = await sent(undefined, holder);
    await suspend(c, holder.partyId);
    await reactivate(c, holder.partyId);
    const acceptable = await sent();

    const [first, second] = await Promise.all([job(), job()]);
    const total = (key: string) => Number(first[key] ?? 0) + Number(second[key] ?? 0);
    expect(total('expired')).toBe(1);
    expect(total('closed_ineligible')).toBe(1);
    expect(await requestRow(pool(), expired.request.request_id)).toMatchObject({
      state: 'expired',
      closure_reason: 'expired',
    });
    expect(await requestRow(pool(), ineligible.request.request_id)).toMatchObject({
      state: 'cancelled_pre_accept',
      closure_reason: 'holder_membership',
    });
    expect(await requestRow(pool(), acceptable.request.request_id)).toMatchObject({
      state: 'pending',
    });
    const refunds = await pool().query<{ request_id: string; refunds: number; states: string[] }>(
      `SELECT r.id AS request_id, count(x.id)::int AS refunds, array_agg(x.state) AS states
         FROM app.luxchange_request r JOIN app.fee_charge f ON f.operation_id = r.operation_id
         JOIN app.refund x ON x.payment_id = f.payment_id
        WHERE r.id = ANY ($1::uuid[]) GROUP BY r.id`,
      [[expired.request.request_id, ineligible.request.request_id]],
    );
    expect(refunds.rows.map((row) => [row.refunds, row.states])).toEqual([
      [1, ['succeeded']],
      [1, ['succeeded']],
    ]);
    // Nada mais a encerrar: a execução seguinte só lê.
    expect(await job()).toMatchObject({ expired: 0, closed_ineligible: 0, failed: 0 });
  });

  it('[ADR-0037 §10] com K4, K5, K6 e K7 fechadas, retirada e job encerram e estornam; o envio novo é recusado', async () => {
    const a = await sent();
    const b = await sent();
    await ageRequest(f, b.request.request_id);
    await deactivate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
    try {
      expect(await app.withdraw(a.r, a.request.request_id)).toMatchObject({ status: 'committed' });
      expect(await job()).toMatchObject({ expired: 1, failed: 0 });
      expect(await requestRow(pool(), b.request.request_id)).toMatchObject({ state: 'expired' });
      await expect(sent()).rejects.toThrow();
    } finally {
      await activate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
    }
  });

  it('[REQ-097][TECH-091] notificações: solicitante (enviada, encerrada com motivo) e solicitado (recebida, encerrada sem motivo); sem duplicata na reentrega', async () => {
    const { r, request } = await sent();
    const withdrawn = await app.withdraw(r, request.request_id);
    expect(withdrawn.status).toBe('committed');
    const sweep = () =>
      dispatchOutbox({
        store: createPostgresOutboxStore(c.h.db),
        consumers: new ConsumerRegistry<DatabaseTransaction>([
          ...createLuxchangeConsumers({ clock: systemClock }),
        ]),
        clock: systemClock,
        batchSize: 50,
        log: c.h.log,
      });
    await sweep();
    await sweep();
    const { rows } = await pool().query<{
      party: string;
      kind: string;
      data: Record<string, unknown>;
    }>(
      `SELECT recipient_party_id AS party, kind, data FROM app.notification
        WHERE data->>'request_id' = $1 ORDER BY kind, recipient_party_id`,
      [request.request_id],
    );
    expect(rows.map((row) => [row.kind, row.party])).toEqual(
      [
        ['luxchange.request_closed', r.partyId],
        ['luxchange.request_received', f.holder.partyId],
        ['luxchange.request_received_closed', f.holder.partyId],
        ['luxchange.request_sent', r.partyId],
      ].sort(),
    );
    const byKind = new Map(rows.map((row) => [row.kind, row.data]));
    expect(byKind.get('luxchange.request_closed')).toMatchObject({
      reason: 'withdrawn',
      guarantee_released: '300',
    });
    // O solicitado nunca vê o motivo, Créditos nem complemento do solicitante.
    for (const kind of ['luxchange.request_received', 'luxchange.request_received_closed'])
      expect(Object.keys(byKind.get(kind)!).sort()).not.toEqual(
        expect.arrayContaining([
          'reason',
          'credits_required',
          'guarantee_credits',
          'complement_credits',
        ]),
      );
    expect(Object.keys(byKind.get('luxchange.request_received_closed')!)).not.toContain('reason');
    expect(Object.keys(byKind.get('luxchange.request_received')!)).not.toContain(
      'credits_required',
    );
  });

  describe('W22 E2 — reject_request pelo detentor (ADR-0037 §14.6)', () => {
    const handler = () => createRejectRequestProductionHandler(c.h.db);
    const reject = (titular: CreditTitular, requestId: string, key?: string) =>
      app.executorFor(titular)(
        handler(),
        { party_id: titular.partyId, request_id: requestId },
        key,
      );

    it('[REQ-061][PD-006][REQ-097] recusa sem Membership e capabilities, com replay, outbox e estorno após o COMMIT', async () => {
      const { r, lot, request } = await sent();
      const id = request.request_id;
      const destination = await activeCustody(pool(), f.holder.homeId, [request.checkin]);
      const calls = f.gateway.calls.refunds;
      const key = randomUUID();
      await suspend(c, f.holder.partyId);
      await deactivate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
      try {
        const committed = await reject(f.holder, id, key);
        expect(committed).toMatchObject({
          status: 'committed',
          replayed: false,
          result: {
            state: 'declined',
            reason: 'declined',
            guarantee_released: '300',
          },
        });
        if (committed.status !== 'committed') throw new Error('Expected a committed rejection');
        const { operation_id: op, refund_id: refundId } = committed.result;
        expect(f.gateway.calls.refunds).toBe(calls);
        expect(await reject(f.holder, id, key)).toEqual({ ...committed, replayed: true });
        expect(await reject(f.holder, randomUUID(), key)).toMatchObject({
          code: 'ERR_IDEMPOTENCY_CONFLICT',
        });
        expect(await reject(f.holder, id)).toMatchObject({ code: 'ERR_STATE_TRANSITION' });
        expect(await requestRow(pool(), id)).toMatchObject({
          state: 'declined',
          closure_reason: 'declined',
        });
        expect(await lotRow(pool(), lot)).toMatchObject({ held: '0', available: '300' });
        expect(await activeCustody(pool(), f.holder.homeId, [request.checkin])).toEqual(
          destination,
        );

        expect(
          (
            await pool().query(
              `SELECT (SELECT count(*)::int FROM app.luxchange_request_transition WHERE request_id = $1) AS transitions,
                  (SELECT count(*)::int FROM app.luxchange_request_complement_unit WHERE request_id = $1 AND state = 'released') AS units,
                  (SELECT count(*)::int FROM app.luxchange_request_complement_night WHERE request_id = $1 AND state = 'released') AS nights,
                  (SELECT count(*)::int FROM app.fee_charge_reversal WHERE operation_id = $2) AS reversals,
                  (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation = $2 OR closed_by_operation = $2) AS custodies,
                  (SELECT count(*)::int FROM app.booking WHERE opened_by_operation = $2) AS bookings,
                  (SELECT count(*)::int FROM app.booking_state_transition WHERE operation_id = $2) AS booking_transitions,
                  (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation = $2 OR released_by_operation = $2) AS occupancies,
                  (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id = $2) AS use_right,
                  (SELECT count(*)::int FROM app.luxchange_invariant_breaches()) AS luxchange,
                  (SELECT count(*)::int FROM app.credit_invariant_breaches()) AS credits`,
              [id, op],
            )
          ).rows,
        ).toEqual([
          {
            transitions: 1,
            units: 1,
            nights: 1,
            reversals: 1,
            custodies: 0,
            bookings: 0,
            booking_transitions: 0,
            occupancies: 0,
            use_right: 0,
            luxchange: 0,
            credits: 0,
          },
        ]);
        const refunds = await refundOf(op);
        expect(refunds).toHaveLength(1);
        expect(refunds[0]).toMatchObject({ id: refundId, state: 'pending' });
        expect(refunds[0]!.amount).toBe(refunds[0]!.fee);
        expect(await f.store.pendingRefunds()).toContain(refundId);
        expect(
          (await pool().query(`SELECT command, state FROM app.operation WHERE id = $1`, [op])).rows,
        ).toEqual([{ command: 'reject_request', state: 'committed' }]);
        const audit = await pool().query(
          'SELECT before, after FROM app.audit_log WHERE operation_id = $1',
          [op],
        );
        expect(audit.rows).toEqual([
          {
            before: { state: 'pending' },
            after: expect.objectContaining({
              act: 'reject_request',
              state: 'declined',
              reason: 'declined',
              guarantee_released: '300',
              refund_id: refundId,
            }),
          },
        ]);
        const event = await pool().query<{ id: string }>(
          `SELECT id, event_type AS type, dedup_key, operation_id,
                  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at, payload
             FROM app.outbox WHERE operation_id = $1`,
          [op],
        );
        expect(event.rows).toEqual([
          expect.objectContaining({
            type: 'luxchange.request_closed',
            dedup_key: `luxchange.request_closed:${id}`,
            payload: expect.objectContaining({
              state: 'declined',
              reason: 'declined',
              guarantee_released: '300',
            }),
          }),
        ]);
        expect(eventValidator('luxchange.request_closed')(event.rows[0])).toBe(true);
        const sweep = () =>
          dispatchOutbox({
            store: createPostgresOutboxStore(c.h.db),
            consumers: new ConsumerRegistry<DatabaseTransaction>(
              createLuxchangeConsumers({ clock: systemClock }),
            ),
            clock: systemClock,
            batchSize: 50,
            log: c.h.log,
          });
        expect((await sweep()).failed).toBe(0);
        expect((await sweep()).failed).toBe(0);
        const notifications = await pool().query(
          `SELECT recipient_party_id AS party, kind, data FROM app.notification
            WHERE event_id = $1 ORDER BY kind`,
          [event.rows[0]!.id],
        );
        const data = {
          request_id: id,
          second_home_id: f.holder.homeId,
          checkin: request.checkin,
          checkout: request.checkout,
          state: 'declined',
          closed_at: expect.any(String),
        };
        expect(notifications.rows).toEqual([
          {
            party: r.partyId,
            kind: 'luxchange.request_closed',
            data: { ...data, reason: 'declined', guarantee_released: '300' },
          },
          { party: f.holder.partyId, kind: 'luxchange.request_received_closed', data },
        ]);
        const flow = app.flow(f.holder);
        await processRequestRefunds(flow, [refundId], randomUUID());
        await processRequestRefunds(flow, [refundId], randomUUID());
        expect(f.gateway.calls.refunds).toBe(calls + 1);
        expect(await refundOf(op)).toEqual([
          expect.objectContaining({ id: refundId, state: 'succeeded' }),
        ]);
      } finally {
        await activate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
        await reactivate(c, f.holder.partyId);
      }
    });

    it.each(['declined', 'expired'] as const)(
      '[PD-012][REQ-096] G = 0, estado %s decidido pelo banco, sem movimento no ledger',
      async (state) => {
        const { r, offered, request } = await sentZero();
        const id = request.request_id;
        if (state === 'expired') await ageRequest(f, id);
        const result = await reject(f.holder, id);
        expect(result).toMatchObject({
          status: 'committed',
          result: { state, reason: state, guarantee_released: '0' },
        });
        expect(
          (
            await pool().query('SELECT 1 FROM app.credit_entry WHERE operation_id = $1', [
              result.operationId,
            ])
          ).rows,
        ).toEqual([]);
        expect(
          (
            await pool().query('SELECT after FROM app.audit_log WHERE operation_id = $1', [
              result.operationId,
            ])
          ).rows,
        ).toEqual([
          { after: expect.objectContaining({ act: 'reject_request', state, reason: state }) },
        ]);
        await expectClosedWithoutGuarantee(id, r.homeId, offered);
        if (state === 'expired') {
          if (result.status !== 'committed') throw new Error('Expected a committed rejection');
          const reconcile = createReconciliationJob({
            database: c.h.db,
            gateway: f.gateway,
            log: f.log.logger,
            source: {
              PAYMENT_OUTCOME_GRACE_SECONDS: '3600',
              COMMAND_MAX_ATTEMPTS: '1',
              COMMAND_LOCK_TIMEOUT_MS: '10000',
            },
          });
          expect(await reconcile({ correlationId: randomUUID() })).toMatchObject({ failed: 0 });
          expect(await f.store.findRefund(result.result.refund_id)).toMatchObject({
            state: 'succeeded',
          });
        }
      },
    );

    it('[REQ-061][TECH-051] Request alheia equivale a inexistente, e a chave é obrigatória', async () => {
      const { r, request } = await sentZero();
      const id = request.request_id;
      const outsider = await newRequester(f);
      for (const actor of [r, outsider]) {
        expect(await reject(actor, id)).toMatchObject({ code: 'ERR_NOT_FOUND' });
        expect(await reject(actor, randomUUID())).toMatchObject({ code: 'ERR_NOT_FOUND' });
      }
      expect(await reject(f.holder, id, '')).toMatchObject({
        code: 'ERR_VALIDATION',
        operationId: null,
      });
      expect(await requestRow(pool(), id)).toMatchObject({ state: 'pending' });
      await app.withdraw(r, id);
    });

    it('[TECH-050] revogação depois do guard é revalidada dentro da transação', async () => {
      const { r, request } = await sentZero();
      const representative = { ...f.holder, ...(await secondRepresentative(c.h, f.holder)) };
      const inner = handler();
      const revoked = await app.executorFor(representative)(
        {
          ...inner,
          async execute(context) {
            await revokeDelegation(c.h, representative.userId);
            return inner.execute(context);
          },
        },
        { party_id: representative.partyId, request_id: request.request_id },
      );
      expect(revoked).toMatchObject({ code: 'ERR_PERMISSION', operationId: expect.any(String) });
      expect(await reject(representative, request.request_id)).toMatchObject({
        code: 'ERR_PERMISSION',
        operationId: null,
      });
      expect(await requestRow(pool(), request.request_id)).toMatchObject({ state: 'pending' });
      await app.withdraw(r, request.request_id);
    });

    it('[REQ-061][BR-211] com a holding de origem encerrada, o detentor registrado ainda recusa mesmo representando ambas as parties', async () => {
      const holder = await secondTitular(c);
      const { r, offered, request } = await sentZero(holder);
      const id = request.request_id;
      await ownerDelegation(pool(), { partyId: r.partyId, userId: holder.userId });
      // Model the end of the original holding on transfer, as the W13 read tests do before W28.
      const client = await pool().connect();
      try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE app.holding DISABLE TRIGGER holding_no_change');
        await client.query('UPDATE app.holding SET valid_until = clock_timestamp() WHERE id = $1', [
          holder.holdingId,
        ]);
        await client.query('ALTER TABLE app.holding ENABLE TRIGGER holding_no_change');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      expect(await closableRequests(c.h.db, 500)).toContainEqual({
        requestId: id,
        reason: 'capacity_unavailable',
      });
      expect(await reject(holder, id)).toMatchObject({
        status: 'committed',
        result: { state: 'declined' },
      });
      await expectClosedWithoutGuarantee(id, r.homeId, offered);
    });
  });
});
