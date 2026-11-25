import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processRefund } from '@/features/billing';
import { createLuxchangeConsumers } from '@/features/luxchange/jobs';
import { runExpireRequests } from '@/features/luxchange/application/expire-requests';
import { closableRequests } from '@/features/luxchange/infrastructure/postgres-request-store';
import { systemClock, type DatabaseTransaction } from '@/features/platform';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { activate, deactivate } from '../booking/lifecycle-support';
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
});
