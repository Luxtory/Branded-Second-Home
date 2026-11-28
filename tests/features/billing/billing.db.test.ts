import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createFakePaymentGateway,
  createReconcilePaymentHandler,
  handlePaymentWebhook,
  initiatePayment,
  processRefund,
  reconcilePayment,
  reverseLuxchangeFee,
  runReconciliation,
  settlementReport,
  type FakePaymentGateway,
} from '@/features/billing';
import {
  CapabilityNotActivatedError,
  type CommandHandler,
  type DatabaseTransaction,
  systemClock,
  type OperationalAlertEvent,
} from '@/features/platform';
import { attempt } from '../credits/credits-support';
import { deactivate, openOperation } from '../booking/lifecycle-support';
import {
  WEBHOOK_SECRET,
  billingHarness,
  capacityFootprint,
  executorFor,
  feeHandler,
  pay,
  reversalHandler,
  secondTitular,
  settleHandler,
  type BillingHarness,
} from './billing-support';
import { originate, systemExecutor } from '../credits/credits-support';
import {
  newRequester,
  pricedNights,
  requestFixture,
  sendRequest,
  transactionQueryable,
  writeClosing,
  type RequestFixture,
  type SentRequest,
} from '../luxchange/request-support';

/**
 * W19 — pagamentos, Fee, estornos, settlement, webhook e conciliação sobre o PostgreSQL real, com o executor real
 * (TECH-054), os privilégios reais do `luxtory_app` e os gatilhos do banco (ADR-0035). Percentual 12% (referência
 * comercial atual) e mínimo deliberadamente fora do canônico.
 */
let b: BillingHarness;
// Desde a W21 (ADR-0037 §4), o Fee de `send_request` pertence a uma Request completa (noites do snapshot); as regras de
// cálculo do Fee são exercitadas pelo Direct, que segue a mesma conferência do banco.
let f: RequestFixture;
const RATE_12 = '0.12';
const MINIMUM = 9_876n;

const fee = (prl: bigint) => {
  const percentage = (prl * 12n + 50n) / 100n; // HALF_UP de 12% para inteiros positivos
  return percentage > MINIMUM ? percentage : MINIMUM;
};

function run(
  command: 'send_request' | 'create_direct',
  input: Record<string, unknown>,
  options: { settle?: boolean; key?: string } = {},
) {
  return executorFor(b.c, b.titular)(
    feeHandler(b, command, options.settle),
    { second_home_id: b.titular.homeId, ...input },
    options.key,
  );
}

function reconcileDeps(gateway: FakePaymentGateway = b.gateway) {
  const executor = systemExecutor(b.c);
  const handler = createReconcilePaymentHandler({ store: b.store });
  return {
    store: b.store,
    gateway,
    log: b.log.logger,
    execute: (request: Parameters<typeof executor.execute>[1]) =>
      executor.execute(handler, request),
  };
}

function alerts() {
  const raised: OperationalAlertEvent[] = [];
  return {
    raised,
    alert: { raise: async (event: OperationalAlertEvent) => void raised.push(event) },
  };
}

async function paymentRow(id: string) {
  const { rows } = await b.c.h.database.pool.query<{
    state: string;
    provider_payment_id: string | null;
  }>('SELECT state, provider_payment_id FROM app.payment WHERE id = $1', [id]);
  return rows[0]!;
}

async function refundsOf(paymentId: string) {
  const { rows } = await b.c.h.database.pool.query<{
    id: string;
    state: string;
    amount_minor: string;
  }>(
    'SELECT id, state, amount_minor::text FROM app.refund WHERE payment_id = $1 ORDER BY created_at',
    [paymentId],
  );
  return rows;
}

beforeAll(async () => {
  b = await billingHarness({ rate: RATE_12, minimum: MINIMUM.toString() });
  f = await requestFixture(b.c);
}, 240_000);

afterAll(async () => {
  await b?.c.h.close();
});

describe('pagamento em duas fases (TECH-080, TECH-081, ADR-008)', () => {
  it('[TECH-080][ADR-008] pending antes do PSP, aprovado depois; idempotente pela chave; sem tocar capacidade nem Créditos', async () => {
    const before = await capacityFootprint(b);
    const key = randomUUID();
    const payment = await pay(b, 60_000n, b.titular, key);
    expect(payment).toMatchObject({ state: 'approved', amountMinor: 60_000n, provider: 'fake' });
    expect(payment.providerPaymentId).toMatch(/^fake_pay_/);
    const replay = await pay(b, 60_000n, b.titular, key);
    expect(replay.id).toBe(payment.id);
    await expect(pay(b, 60_001n, b.titular, key)).rejects.toMatchObject({
      code: 'ERR_IDEMPOTENCY_CONFLICT',
    });
    expect(await capacityFootprint(b)).toEqual(before);
  });

  it('[TECH-081] PSP sem resposta deixa o pagamento pending; recusado vira failed (terminal)', async () => {
    let down = true;
    const flaky = createFakePaymentGateway({
      webhookSecret: WEBHOOK_SECRET,
      unreachable: () => down,
    });
    const deps = { store: b.store, gateway: flaky, log: b.log.logger };
    const request = {
      actorUserId: b.titular.userId,
      payerPartyId: b.titular.partyId,
      purpose: 'luxchange_fee' as const,
      amountMinor: 12_345n,
      currency: 'BRL' as const,
      idempotencyKey: randomUUID(),
    };
    expect((await initiatePayment(deps, request)).state).toBe('pending');
    down = false;
    expect((await initiatePayment(deps, request)).state).toBe('approved');
    const declining = createFakePaymentGateway({
      webhookSecret: WEBHOOK_SECRET,
      chargeStatus: () => 'failed',
    });
    const failed = await initiatePayment(
      { ...deps, gateway: declining },
      { ...request, idempotencyKey: randomUUID() },
    );
    expect(failed.state).toBe('failed');
  });

  it('[TECH-052] só quem representa a party paga por ela; estado nunca regride nem pelo SQL direto', async () => {
    const other = await secondTitular(b.c);
    await expect(
      initiatePayment(
        { store: b.store, gateway: b.gateway, log: b.log.logger },
        {
          actorUserId: b.titular.userId,
          payerPartyId: other.partyId,
          purpose: 'luxchange_fee',
          amountMinor: 10_000n,
          currency: 'BRL',
          idempotencyKey: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ constraint: 'permission_representation' });
    const payment = await pay(b, 10_000n);
    const app = b.c.h.db;
    for (const [set, constraint] of [
      [`state = 'pending'`, 'billing_payment_state_regression'],
      [`state = 'failed'`, 'billing_payment_state_regression'],
      [`amount_minor = 1`, null],
      [`provider_payment_id = 'other'`, 'billing_payment_reference_once'],
    ] as const) {
      const query = app.executeQuery({
        sql: `UPDATE app.payment SET ${set} WHERE id = $1`,
        parameters: [payment.id],
        query: { kind: 'RawNode' } as never,
        queryId: { queryId: randomUUID() },
      } as never);
      await expect(query).rejects.toMatchObject(constraint === null ? {} : { constraint });
    }
    expect((await paymentRow(payment.id)).state).toBe('approved');
  });

  it('[ADR-0035 §8] K5 fechada: nenhum pagamento é gravado', async () => {
    await deactivate(b.c.h, 'payments');
    try {
      await expect(pay(b, 10_000n)).rejects.toBeInstanceOf(CapabilityNotActivatedError);
    } finally {
      await b.c.h.database.pool.query(
        `INSERT INTO app.capability_activation VALUES ('payments', now(), 'test:activation')`,
      );
    }
  });
});

describe('Luxchange Fee por operação (TECH-082, BR-230, TECH-025)', () => {
  it('[BR-230][TECH-082] 12% do PRL total do período, conferido pelo banco com o snapshot; um Fee por operação e por pagamento', async () => {
    const prl = 500_000n;
    const payment = await pay(b, fee(prl));
    const outcome = await run('create_direct', {
      payment_id: payment.id,
      prl_total_minor: prl.toString(),
    });
    expect(outcome).toMatchObject({ status: 'committed', result: { amount_minor: '60000' } });
    const again = await run('create_direct', {
      payment_id: payment.id,
      prl_total_minor: prl.toString(),
    });
    expect(again).toMatchObject({ status: 'rejected', code: 'ERR_PAYMENT_FAILED' });
  });

  it('[BR-230] mínimo por operação quando 12% fica abaixo dele', async () => {
    const payment = await pay(b, MINIMUM);
    const outcome = await run('create_direct', {
      payment_id: payment.id,
      prl_total_minor: '40000',
    });
    expect(outcome).toMatchObject({
      status: 'committed',
      result: { amount_minor: MINIMUM.toString() },
    });
  });

  it('[TECH-080] valor diferente do Fee calculado agora, pagamento de outra party ou não aprovado → recusa sem efeito', async () => {
    const wrong = await pay(b, fee(500_000n) + 1n);
    expect(
      await run('create_direct', { payment_id: wrong.id, prl_total_minor: '500000' }),
    ).toMatchObject({
      status: 'rejected',
      code: 'ERR_PAYMENT_FAILED',
    });
    const other = await secondTitular(b.c);
    const theirs = await pay(b, fee(500_000n), other);
    expect(
      await run('create_direct', { payment_id: theirs.id, prl_total_minor: '500000' }),
    ).toMatchObject({
      status: 'rejected',
      code: 'ERR_PERMISSION',
    });
    const declining = createFakePaymentGateway({
      webhookSecret: WEBHOOK_SECRET,
      chargeStatus: () => 'failed',
    });
    const failed = await initiatePayment(
      { store: b.store, gateway: declining, log: b.log.logger },
      {
        actorUserId: b.titular.userId,
        payerPartyId: b.titular.partyId,
        purpose: 'luxchange_fee',
        amountMinor: fee(500_000n),
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    );
    expect(
      await run('create_direct', { payment_id: failed.id, prl_total_minor: '500000' }),
    ).toMatchObject({
      status: 'rejected',
      code: 'ERR_PAYMENT_FAILED',
    });
  });

  it('[TECH-082] o banco recalcula o Fee: valor forjado pelo papel da aplicação é recusado; HALF_UP igual ao domínio', async () => {
    for (const [prl, expected] of [
      [12_345n, 9_876n],
      [123_456n, 14_815n],
      [123_454n, 14_814n],
    ] as const) {
      expect(fee(prl)).toBe(expected);
    }
    const payment = await pay(b, fee(123_456n));
    await expect(
      attempt(
        b.c.h.database.appUrl,
        'send_request',
        { kind: 'titular', titular: b.titular },
        async (client, op) => {
          await client.query(
            `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
            [op],
          );
          await client.query(
            `INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
           SELECT $1, k, (SELECT v.id FROM app.parameter_at(k, NULL, s.resolved_at) v)
             FROM app.economic_snapshot s, unnest(ARRAY['luxchange_fee_rate', 'luxchange_fee_minimum']) k
            WHERE s.operation_id = $1`,
            [op],
          );
          await client.query(
            `INSERT INTO app.fee_charge (id, operation_id, payment_id, payer_party_id, prl_total_minor, amount_minor, currency)
           VALUES ($1, $2, $3, $4, 100000, $5, 'BRL')`,
            [randomUUID(), op, payment.id, b.titular.partyId, fee(123_456n).toString()],
          );
        },
      ),
    ).rejects.toMatchObject({ constraint: 'payment_fee_amount_mismatch' });
  });

  it('[TECH-082] só Request e Direct cobram Fee; sem snapshot do percentual e do mínimo não há Fee', async () => {
    const payment = await pay(b, MINIMUM);
    await expect(
      attempt(
        b.c.h.database.appUrl,
        'deposit_capacity',
        { kind: 'titular', titular: b.titular },
        (client, op) =>
          client.query(
            `INSERT INTO app.fee_charge (id, operation_id, payment_id, payer_party_id, prl_total_minor, amount_minor, currency)
           VALUES ($1, $2, $3, $4, 1000, $5, 'BRL')`,
            [randomUUID(), op, payment.id, b.titular.partyId, MINIMUM.toString()],
          ),
      ),
    ).rejects.toMatchObject({ constraint: 'billing_fee_charge_origin' });
    await expect(
      attempt(
        b.c.h.database.appUrl,
        'send_request',
        { kind: 'titular', titular: b.titular },
        (client, op) =>
          client.query(
            `INSERT INTO app.fee_charge (id, operation_id, payment_id, payer_party_id, prl_total_minor, amount_minor, currency)
           VALUES ($1, $2, $3, $4, 1000, $5, 'BRL')`,
            [randomUUID(), op, payment.id, b.titular.partyId, MINIMUM.toString()],
          ),
      ),
    ).rejects.toMatchObject({ constraint: 'billing_fee_snapshot_missing' });
  });
});

describe('reversão, apuração e estorno (PD-006, TECH-082, TECH-083)', () => {
  /** Request enviada (W21) com PRL total de 500.000: Fee de 12% pago e vinculado; Garantia de 50.000 Créditos. */
  async function chargedRequest() {
    const requester = await newRequester(f);
    const lot = await originate(b.c, '50000', { titular: requester });
    const nights = await pricedNights(f, [500_000n]);
    const sent = await sendRequest(f, {
      requester,
      nights,
      holds: [{ lotId: lot, quantity: '50000' }],
    });
    return { payment: { id: sent.paymentId }, feeChargeId: sent.feeChargeId!, sent, requester };
  }
  /** Retirada (W21): encerramento da Request + `reverseLuxchangeFee` do slice billing (estorno integral). */
  function withdrawal(
    sent: SentRequest,
  ): CommandHandler<{ second_home_id: string }, { refund_id: string }, DatabaseTransaction> {
    return {
      command: 'withdraw_request',
      input: z.strictObject({ second_home_id: z.uuid() }),
      secondHomeId: (value) => value.second_home_id,
      scope: (value) => ({ type: 'second_home', id: value.second_home_id }),
      async execute({ tx, locks, operationId, audit }) {
        audit({
          objectType: 'billing_test',
          objectId: 'withdraw_request',
          before: null,
          after: null,
        });
        await writeClosing(transactionQueryable(tx), operationId, sent, { skip: ['fee'] });
        const { refundId } = await reverseLuxchangeFee(
          { tx, locks, operationId },
          { store: b.store },
          { feeChargeId: sent.feeChargeId! },
        );
        return { refund_id: refundId };
      },
    };
  }
  const withdraw = (charged: Awaited<ReturnType<typeof chargedRequest>>) =>
    executorFor(b.c, charged.requester, { requestGuard: true })(withdrawal(charged.sent), {
      second_home_id: charged.requester.homeId,
    });
  const requester = <R extends Record<string, string>>(
    handler: CommandHandler<
      { second_home_id: string; fee_charge_id: string },
      R,
      DatabaseTransaction
    >,
    feeChargeId: string,
  ) =>
    executorFor(b.c, f.holder, { requestGuard: true })(handler, {
      second_home_id: f.holder.homeId,
      fee_charge_id: feeChargeId,
    });

  it('[PD-006][TECH-082] desfecho pré-aceite reverte integralmente: estorno do valor cobrado, sem Crédito; uma vez só', async () => {
    const charged = await chargedRequest();
    const { payment, feeChargeId } = charged;
    const { entries, ...credits } = await capacityFootprint(b);
    const reversed = await withdraw(charged);
    expect(reversed.status).toBe('committed');
    const [refund] = await refundsOf(payment.id);
    expect(refund).toMatchObject({ state: 'pending', amount_minor: fee(500_000n).toString() });
    // O PSP que cobrou o Fee (o fake da fixture da Request) processa o estorno.
    expect(
      await processRefund({ store: b.store, gateway: f.gateway, log: b.log.logger }, refund!.id),
    ).toBe('succeeded');
    // Sem Crédito novo e sem capacidade: só a liberação da Garantia da Request.
    const { entries: after, ...footprint } = await capacityFootprint(b);
    expect(footprint).toEqual(credits);
    expect(Number(after) - Number(entries)).toBe(charged.sent.holdIds.length);
    expect(await requester(reversalHandler(b, 'reject_request'), feeChargeId)).toMatchObject({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
    });
    expect(await requester(settleHandler(b, charged.sent), feeChargeId)).toMatchObject({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
    });
  });

  it('[TECH-083][TECH-025] aceite apura o Fee como receita Luxtory uma vez; Fee apurado não é revertido', async () => {
    const charged = await chargedRequest();
    const { feeChargeId } = charged;
    expect(await requester(settleHandler(b, charged.sent), feeChargeId)).toMatchObject({
      status: 'committed',
    });
    expect(await requester(settleHandler(b, charged.sent), feeChargeId)).toMatchObject({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
    });
    expect(await withdraw(charged)).toMatchObject({
      status: 'rejected',
      code: 'ERR_STATE_TRANSITION',
    });
  });

  it('[TECH-082] Direct paga e apura na mesma operação; Fee de Direct não tem reversão pré-aceite', async () => {
    const payment = await pay(b, fee(200_000n));
    const outcome = await run(
      'create_direct',
      { payment_id: payment.id, prl_total_minor: '200000' },
      { settle: true },
    );
    expect(outcome.status).toBe('committed');
  });

  it('[REQ-094][BR-352] categorias sem definição não são graváveis; o relatório não consolida categorias', async () => {
    await expect(
      attempt(
        b.c.h.database.appUrl,
        'accept_request',
        { kind: 'titular', titular: b.titular },
        (client, op) =>
          client.query(
            `INSERT INTO app.settlement (id, operation_id, kind, beneficiary_party_id, amount_minor, currency)
           VALUES ($1, $2, 'brand_partner_obligation', $3, 100, 'BRL')`,
            [randomUUID(), op, b.titular.partyId],
          ),
      ),
    ).rejects.toMatchObject({ constraint: 'settlement_kind_not_enabled' });
    // Mesmo o dono do schema (fora da trava de habilitação) não grava margem do Investor como receita Luxtory.
    const owner = await b.c.h.database.pool.connect();
    try {
      await owner.query('BEGIN');
      const op = await openOperation(owner, 'accept_request', {
        kind: 'titular',
        titular: b.titular,
      });
      await expect(
        owner.query(
          `INSERT INTO app.settlement (id, operation_id, kind, beneficiary_party_id, amount_minor, currency)
           VALUES ($1, $2, 'investor_margin', NULL, 100, 'BRL')`,
          [randomUUID(), op],
        ),
      ).rejects.toMatchObject({ constraint: 'settlement_beneficiary_group' });
    } finally {
      await owner.query('ROLLBACK');
      owner.release();
    }
    const report = settlementReport(await b.store.settlementTotals());
    const fee = report[0]!.lines.find((line) => line.kind === 'luxchange_fee')!;
    expect(fee.totals[0]!.entries).toBeGreaterThanOrEqual(2);
    expect(report[2]!.lines.every((line) => line.totals.length === 0)).toBe(true);
  });

  it('[TECH-025] estorno órfão só pela conciliação; pagamento vinculado só pela reversão; nunca acima do valor', async () => {
    const orphan = await pay(b, 10_000n);
    await expect(
      attempt(
        b.c.h.database.appUrl,
        'withdraw_request',
        { kind: 'titular', titular: b.titular },
        (client, op) =>
          client.query(
            `INSERT INTO app.refund (id, payment_id, operation_id, amount_minor, currency, state)
           VALUES ($1, $2, $3, 10000, 'BRL', 'pending')`,
            [randomUUID(), orphan.id, op],
          ),
      ),
    ).rejects.toMatchObject({ constraint: 'billing_refund_origin' });
    await expect(
      attempt(b.c.h.database.appUrl, 'reconciliation', { kind: 'system' }, (client, op) =>
        client.query(
          `INSERT INTO app.refund (id, payment_id, operation_id, amount_minor, currency, state)
           VALUES ($1, $2, $3, 10001, 'BRL', 'pending')`,
          [randomUUID(), orphan.id, op],
        ),
      ),
    ).rejects.toMatchObject({ constraint: 'billing_refund_exceeds_payment' });
    const { payment } = await chargedRequest();
    await expect(
      attempt(b.c.h.database.appUrl, 'reconciliation', { kind: 'system' }, (client, op) =>
        client.query(
          `INSERT INTO app.refund (id, payment_id, operation_id, amount_minor, currency, state)
           VALUES ($1, $2, $3, 100, 'BRL', 'pending')`,
          [randomUUID(), payment.id, op],
        ),
      ),
    ).rejects.toMatchObject({ constraint: 'billing_refund_bound_payment' });
  });
});

describe('webhook (ADR-006, TECH-081, TECH-110)', () => {
  const deps = () => ({
    store: b.store,
    gateway: b.gateway,
    clock: systemClock,
    log: b.log.logger,
  });
  async function deliver(event: Parameters<FakePaymentGateway['signEvent']>[0]) {
    const { body, headers } = b.gateway.signEvent(event, new Date());
    return handlePaymentWebhook(deps(), { provider: 'fake', rawBody: body, headers });
  }
  async function pendingPayment() {
    const slow = createFakePaymentGateway({
      webhookSecret: WEBHOOK_SECRET,
      chargeStatus: () => 'pending',
    });
    return initiatePayment(
      { store: b.store, gateway: slow, log: b.log.logger },
      {
        actorUserId: b.titular.userId,
        payerPartyId: b.titular.partyId,
        purpose: 'luxchange_fee',
        amountMinor: 20_000n,
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    );
  }

  it('[TECH-110] aprovado aplica; duplicado é no-op; fora de ordem não regride; objeto desconhecido é registrado', async () => {
    const payment = await pendingPayment();
    expect(payment.state).toBe('pending');
    const reference = payment.providerPaymentId!;
    expect(
      await deliver({ id: `evt-${payment.id}-1`, type: 'payment.approved', payment: reference }),
    ).toBe('applied');
    expect(
      await deliver({ id: `evt-${payment.id}-1`, type: 'payment.approved', payment: reference }),
    ).toBe('duplicate');
    expect(
      await deliver({ id: `evt-${payment.id}-2`, type: 'payment.failed', payment: reference }),
    ).toBe('no_change');
    expect((await paymentRow(payment.id)).state).toBe('approved');
    expect(
      await deliver({
        id: `evt-${payment.id}-3`,
        type: 'payment.approved',
        payment: 'fake_pay_unknown',
      }),
    ).toBe('unknown_object');
    const { rows } = await b.c.h.database.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM app.webhook_inbox WHERE event_id LIKE $1`,
      [`evt-${payment.id}-%`],
    );
    expect(rows[0]!.n).toBe('3');
  });

  it('[TECH-081] assinatura inválida ou provedor diferente: nada é lido nem gravado', async () => {
    const { body } = b.gateway.signEvent(
      { id: 'evt-forged', type: 'payment.approved', payment: 'x' },
      new Date(),
    );
    expect(
      await handlePaymentWebhook(deps(), {
        provider: 'fake',
        rawBody: body,
        headers: new Headers(),
      }),
    ).toBe('unauthenticated');
    expect(
      await handlePaymentWebhook(deps(), {
        provider: 'stripe',
        rawBody: body,
        headers: new Headers(),
      }),
    ).toBe('not_found');
  });

  it('[TECH-110] webhooks duplicados em paralelo: exatamente um aplica', async () => {
    const payment = await pendingPayment();
    const event = {
      id: `evt-par-${payment.id}`,
      type: 'payment.approved' as const,
      payment: payment.providerPaymentId!,
    };
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => deliver(event)));
    expect(outcomes.filter((outcome) => outcome === 'applied')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'duplicate')).toHaveLength(3);
  });
});

describe('conciliação e recuperação (TECH-090, TECH-101, TECH-080)', () => {
  it('[TECH-080] aprovado + falha do domínio → sem desfecho → estorno pela conciliação (fluxo imediato), uma vez', async () => {
    const payment = await pay(b, fee(500_000n));
    const failed = await run('create_direct', {
      payment_id: payment.id,
      prl_total_minor: '500000',
      fail_after_charge: true,
    });
    expect(failed).toMatchObject({ status: 'rejected', code: 'ERR_CAPACITY_UNAVAILABLE' });
    const first = await reconcilePayment(reconcileDeps(), payment.id, randomUUID());
    expect(first?.state).toBe('succeeded');
    expect(await reconcilePayment(reconcileDeps(), payment.id, randomUUID())).toBeNull();
    expect(await refundsOf(payment.id)).toHaveLength(1);
    expect(
      await run('create_direct', { payment_id: payment.id, prl_total_minor: '500000' }),
    ).toMatchObject({
      status: 'rejected',
      code: 'ERR_PAYMENT_FAILED',
    });
  });

  it('[TECH-101] queda após a aprovação: o job alerta payment_without_outcome e estorna; replay da execução é no-op', async () => {
    const payment = await pay(b, 11_111n);
    const { raised, alert } = alerts();
    const job = (correlationId: string) =>
      runReconciliation(
        { ...reconcileDeps(), alert, graceSeconds: 0, timeBudgetMs: 60_000, monotonicMs: () => 0 },
        { correlationId },
      );
    const correlationId = randomUUID();
    const counts = await job(correlationId);
    expect(counts.refunds_opened).toBeGreaterThanOrEqual(1);
    expect(
      raised.some(
        (event) =>
          event.kind === 'payment_without_outcome' && event.details.payment_id === payment.id,
      ),
    ).toBe(true);
    expect((await refundsOf(payment.id)).map((refund) => refund.state)).toEqual(['succeeded']);
    await job(correlationId);
    await job(randomUUID());
    expect(await refundsOf(payment.id)).toHaveLength(1);
  });

  it('[TECH-101] estorno que falha no PSP: alerta e nova tentativa na execução seguinte, nunca dois ativos', async () => {
    let refunds: 'failed' | 'succeeded' = 'failed';
    const gateway = createFakePaymentGateway({
      webhookSecret: WEBHOOK_SECRET,
      refundStatus: () => refunds,
    });
    const payment = await initiatePayment(
      { store: b.store, gateway, log: b.log.logger },
      {
        actorUserId: b.titular.userId,
        payerPartyId: b.titular.partyId,
        purpose: 'luxchange_fee',
        amountMinor: 13_131n,
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    );
    const { raised, alert } = alerts();
    const job = () =>
      runReconciliation(
        {
          ...reconcileDeps(gateway),
          alert,
          graceSeconds: 0,
          timeBudgetMs: 60_000,
          monotonicMs: () => 0,
        },
        { correlationId: randomUUID() },
      );
    await job();
    expect((await refundsOf(payment.id)).map((refund) => refund.state)).toEqual(['failed']);
    expect(raised.some((event) => event.details.reason === 'refund_failed')).toBe(true);
    refunds = 'succeeded';
    await job();
    expect((await refundsOf(payment.id)).map((refund) => refund.state)).toEqual([
      'failed',
      'succeeded',
    ]);
  });

  it('[TECH-101] pendente sem resposta do PSP: a conciliação repete a cobrança idempotente e confirma', async () => {
    let down = true;
    const gateway = createFakePaymentGateway({
      webhookSecret: WEBHOOK_SECRET,
      unreachable: () => down,
    });
    const payment = await initiatePayment(
      { store: b.store, gateway, log: b.log.logger },
      {
        actorUserId: b.titular.userId,
        payerPartyId: b.titular.partyId,
        purpose: 'luxchange_fee',
        amountMinor: MINIMUM,
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    );
    expect(payment.state).toBe('pending');
    down = false;
    const { alert } = alerts();
    await runReconciliation(
      {
        ...reconcileDeps(gateway),
        alert,
        graceSeconds: 0,
        timeBudgetMs: 60_000,
        monotonicMs: () => 0,
      },
      { correlationId: randomUUID() },
    );
    expect((await paymentRow(payment.id)).state).toBe('approved');
  });

  it('[TECH-110] vínculo do Fee × estorno da conciliação em paralelo: exatamente um vence', async () => {
    const payment = await pay(b, fee(300_000n));
    const [bind, refund] = await Promise.all([
      run('create_direct', { payment_id: payment.id, prl_total_minor: '300000' }),
      reconcilePayment(reconcileDeps(), payment.id, randomUUID()),
    ]);
    const bound = bind.status === 'committed';
    expect(bound).toBe(refund === null);
    expect((await refundsOf(payment.id)).length).toBe(bound ? 0 : 1);
  });

  it('[TECH-025] conciliações paralelas do mesmo pagamento: um único estorno', async () => {
    const payment = await pay(b, 14_141n);
    await Promise.all(
      Array.from({ length: 3 }, () => reconcilePayment(reconcileDeps(), payment.id, randomUUID())),
    );
    expect(await refundsOf(payment.id)).toHaveLength(1);
  });
});
