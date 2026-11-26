import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { payRequestFee, submitRequest } from '@/features/luxchange';
import { CapabilityNotActivatedError } from '@/features/platform';
import { addDays } from '../booking/booking-support';
import { activate, bookNow, deactivate } from '../booking/lifecycle-support';
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
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { activateMembership } from '../identity/membership-support';
import { ownerDelegation } from '../../support/party-fixtures';
import { eventValidator } from '../../support/asyncapi';
import { publishMultiplier } from './luxchange-support';
import { requestApp } from './request-app-support';
import {
  ageRequest,
  newRequester,
  payFee,
  pricedNights,
  publishNights,
  requestFixture,
  requestRow,
  type RequestFixture,
} from './request-support';

/**
 * W21 E2 — `send_request`, cotação e fluxo de pagamento pelo executor real (TECH-054), com o guard do Titular (escopo
 * `party`), o Membership do identity, os privilégios do `luxtory_app` e os gatilhos da migration 72 (ADR-0037). Valores de
 * teste: multiplicador 10, validade de 18 meses, prazo de 30 h, Taxa de 12% com mínimo 9.876.
 */
describe('W21 E2 — envio da Request pela aplicação (ADR-0037 §3–§4)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let app: ReturnType<typeof requestApp>;
  const pool = () => c.h.database.pool;
  const ownerUnit = (r: CreditTitular, night: string) => ({
    kind: 'owner_night' as const,
    second_home_id: r.homeId,
    stay_date: night,
  });
  const committed = <T extends { status: string }>(outcome: T) => {
    if (outcome.status !== 'committed')
      throw new Error(`expected commit, got ${JSON.stringify(outcome)}`);
    return outcome as Extract<T, { status: 'committed' }>;
  };

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking');
    app = requestApp(f);
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('[PD-012][TECH-073][REQ-062] cotação e envio com complemento: termos iguais aos do banco, Garantia FEFO, Taxa paga, evento do AsyncAPI', async () => {
    const r = await newRequester(f);
    const [l1, l2] = [
      await originate(c, '300', { titular: r }),
      await originate(c, '500', { titular: r }),
    ];
    const nights = await pricedNights(f, [5_000n, 3_000n]);
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const request = app.shape(r, nights, [ownerUnit(r, offered!)]);
    const { quote, outcome } = await app.quoteAndSend(r, request);
    expect(quote).toMatchObject({
      night_credits: ['500', '300'],
      credits_required: '800',
      complement_nights: [{ second_home_id: r.homeId, stay_date: offered, credits: '200' }],
      complement_credits: '200',
      guarantee_credits: '600',
      complement_consumption: '200',
      complement_excess: '0',
      fee_amount_minor: '9876',
      deadline_hours: 30,
      credit_validity_months: TEST_VALIDITY_MONTHS,
    });
    const result = committed(outcome).result;
    expect(result).toMatchObject({
      credits_required: '800',
      guarantee_credits: '600',
      complement_credits: '200',
      fee_amount_minor: '9876',
      materialized: [],
      refund_ids: [],
    });
    expect(Date.parse(result.expires_at) - Date.parse(result.sent_at)).toBe(30 * 3_600_000);
    // FEFO: o lote mais antigo primeiro (300), depois 300 do seguinte.
    expect(await lotRow(pool(), l1)).toMatchObject({ held: '300', available: '0' });
    expect(await lotRow(pool(), l2)).toMatchObject({ held: '300', available: '200' });
    const row = await requestRow(pool(), result.request_id);
    expect(row).toMatchObject({
      state: 'pending',
      credits_required: '800',
      complement_credits: '200',
    });
    const consent = await pool().query<{ same: boolean }>(
      `SELECT terms = app.luxchange_request_terms(request_id) AS same FROM app.luxchange_request_consent
        WHERE request_id = $1`,
      [result.request_id],
    );
    expect(consent.rows[0]!.same).toBe(true);
    const event = await pool().query<Record<string, unknown>>(
      `SELECT id, event_type AS type, dedup_key, operation_id,
              to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at, payload
         FROM app.outbox WHERE operation_id = $1`,
      [result.operation_id],
    );
    expect(event.rows.map((e) => e.type)).toEqual(['luxchange.request_sent']);
    expect(eventValidator('luxchange.request_sent')(event.rows[0])).toBe(true);
    const audit = await pool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.audit_log WHERE operation_id = $1 AND object_type = 'luxchange_request'`,
      [result.operation_id],
    );
    expect(audit.rows[0]!.n).toBe(1);
  });

  it('[PD-012] excedente com reserva Co-Owner inteira: G = 0, sem Garantia; Co-Owner detentor só por reserva inteira', async () => {
    const scenario = await c.h.coOwnerScenario();
    const titular = scenario.titulares[0]!;
    await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
    const co: CreditTitular = { ...titular, homeId: scenario.homeId };
    const booked = f.freshNights(2);
    await publishNights(c, co.homeId, Object.fromEntries(booked.map((night) => [night, 3_000n])));
    const bookingId = await bookNow(c.h, co, co.homeId, booked[0]!, addDays(booked[1]!, 1));
    const nights = await pricedNights(f, [5_000n]);
    const { outcome } = await app.quoteAndSend(
      co,
      app.shape(co, nights, [{ kind: 'co_owner_booking', booking_id: bookingId }]),
    );
    expect(committed(outcome).result).toMatchObject({
      credits_required: '500',
      complement_credits: '600',
      guarantee_credits: '0',
      complement_consumption: '500',
      complement_excess: '100',
    });
    // W21 E3 (achado do E2E Co-Owner): Request sem Garantia (G = 0) também encerra — reserva liberada, Taxa revertida.
    const withdrawn = await app.withdraw(co, committed(outcome).result.request_id);
    expect(withdrawn).toMatchObject({
      status: 'committed',
      result: { state: 'cancelled_pre_accept', reason: 'withdrawn', guarantee_released: '0' },
    });
  });

  it('[TECH-025] mesma chave: replay sem nova Request, Garantia ou cobrança; outro conteúdo → ERR_IDEMPOTENCY_CONFLICT', async () => {
    const r = await newRequester(f);
    const lot = await originate(c, '500', { titular: r });
    const nights = await pricedNights(f, [5_000n]);
    const key = randomUUID();
    const first = await app.quoteAndSend(r, app.shape(r, nights), key);
    const replay = await app.send(r, first.input, key);
    expect(replay).toMatchObject({ status: 'committed', replayed: true });
    expect(committed(replay).result.request_id).toBe(committed(first.outcome).result.request_id);
    expect(
      await app.send(r, { ...first.input, consent_text_version: 'request-consent.v2' }, key),
    ).toMatchObject({
      status: 'rejected',
      code: 'ERR_IDEMPOTENCY_CONFLICT',
    });
    const counts = await pool().query<{ requests: number; fees: number }>(
      `SELECT (SELECT count(*)::int FROM app.luxchange_request WHERE requester_party_id = $1) AS requests,
              (SELECT count(*)::int FROM app.fee_charge WHERE payer_party_id = $1) AS fees`,
      [r.partyId],
    );
    expect(counts.rows[0]).toEqual({ requests: 1, fees: 1 });
    expect(await lotRow(pool(), lot)).toMatchObject({ held: '500', available: '0' });
  });

  it('[ADR-0037 §3][TECH-080] termos mudam entre a revisão e o envio → ERR_REQUEST_TERMS_CHANGED, nada gravado e a Taxa estornada pelo fluxo', async () => {
    const r = await newRequester(f);
    await originate(c, '500', { titular: r });
    const nights = await pricedNights(f, [5_000n]);
    const request = app.shape(r, nights);
    const paid = await payRequestFee(
      app.flow(r),
      { userId: r.userId, partyId: r.partyId },
      request,
      randomUUID(),
    );
    expect(paid).toMatchObject({ state: 'approved', amount_minor: '9876' });
    // Revisão adulterada (Créditos por noite diferentes do recálculo): recusa sem efeito.
    const input = app.sendInput(
      request,
      { ...paid.quote, night_credits: ['501'] },
      paid.payment_id,
    );
    const outcome = await submitRequest(
      app.flow(r),
      { userId: r.userId, partyId: r.partyId },
      input,
      randomUUID(),
      randomUUID(),
    );
    expect(outcome).toMatchObject({ status: 'rejected', code: 'ERR_REQUEST_TERMS_CHANGED' });
    const state = await pool().query<{ requests: number; refunds: string[] }>(
      `SELECT (SELECT count(*)::int FROM app.luxchange_request WHERE requester_party_id = $1) AS requests,
              (SELECT array_agg(state) FROM app.refund WHERE payment_id = $2) AS refunds`,
      [r.partyId, paid.payment_id],
    );
    expect(state.rows[0]).toEqual({ requests: 0, refunds: ['succeeded'] });
  });

  it('[PD-007][EC-18] PRL ou multiplicador publicados depois da cotação → ERR_REQUEST_TERMS_CHANGED; pagamento de outra party nunca é estornado pelo fluxo', async () => {
    const r = await newRequester(f);
    await originate(c, '1000', { titular: r });
    const nights = await pricedNights(f, [5_000n]);
    const request = app.shape(r, nights);
    const quote = await app.quote(r, request);
    const paymentId = await payFee(f, BigInt(quote.fee_amount_minor), r);
    await publishMultiplier(c, '20');
    try {
      expect(await app.send(r, app.sendInput(request, quote, paymentId))).toMatchObject({
        status: 'rejected',
        code: 'ERR_REQUEST_TERMS_CHANGED',
      });
    } finally {
      await publishMultiplier(c, '10');
    }
    const other = await newRequester(f);
    const theirs = await payFee(f, BigInt(quote.fee_amount_minor), other);
    const outcome = await submitRequest(
      app.flow(r),
      { userId: r.userId, partyId: r.partyId },
      app.sendInput(request, await app.quote(r, request), theirs),
      randomUUID(),
      randomUUID(),
    );
    expect(outcome).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
    const refunds = await pool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.refund WHERE payment_id = $1',
      [theirs],
    );
    expect(refunds.rows[0]!.n).toBe(0);
  });

  it('[REQ-098] recusas funcionais na ordem: permissão, Membership, capacidade, antecedência, seleção, Créditos', async () => {
    const r = await newRequester(f);
    const lot = await originate(c, '1000', { titular: r });
    const nights = await pricedNights(f, [5_000n]);
    const request = app.shape(r, nights);
    const quote = await app.quote(r, request);
    const paymentId = await payFee(f, BigInt(quote.fee_amount_minor), r);
    const input = app.sendInput(request, quote, paymentId);
    // Party que não é a da sessão.
    const other = await newRequester(f);
    expect(await app.send(other, input)).toMatchObject({
      status: 'rejected',
      code: 'ERR_PERMISSION',
    });
    // BR-211: quem age representa também o detentor.
    const holder = await secondTitular(c);
    const holderNights = await pricedNights(f, [5_000n], holder.homeId);
    await ownerDelegation(pool(), { partyId: holder.partyId, userId: r.userId });
    await expect(app.quote(r, app.shape(r, holderNights, [], holder))).rejects.toMatchObject({
      code: 'ERR_PERMISSION',
    });
    // Membership do detentor.
    await suspend(c, f.holder.partyId);
    try {
      expect(await app.send(r, input)).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
    } finally {
      await reactivate(c, f.holder.partyId);
    }
    // Capacidade solicitada ocupada pelo detentor.
    const [booked] = await pricedNights(f, [5_000n]);
    await bookNow(c.h, f.holder, f.holder.homeId, booked!, addDays(booked!, 1));
    await expect(app.quote(r, app.shape(r, [booked!]))).rejects.toMatchObject({
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
    // Antecedência do complemento no prazo; data de outra party; seleção com sobra evitável.
    // Noite a 5 dias de hoje: a antecedência de 336 h já não vale no prazo de resposta.
    const soon = addDays(new Date().toISOString().slice(0, 10), 5);
    await publishNights(c, r.homeId, { [soon]: 2_000n });
    await expect(app.quote(r, app.shape(r, nights, [ownerUnit(r, soon)]))).rejects.toMatchObject({
      code: 'ERR_MIN_NOTICE',
    });
    const [theirs] = await pricedNights(f, [2_000n], other.homeId);
    await expect(
      app.quote(r, app.shape(r, nights, [ownerUnit(other, theirs!)])),
    ).rejects.toMatchObject({
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
    const offered = await pricedNights(f, [3_000n, 3_000n], r.homeId);
    await expect(
      app.quote(
        r,
        app.shape(
          r,
          await pricedNights(f, [2_500n]),
          offered.map((night) => ownerUnit(r, night)),
        ),
      ),
    ).rejects.toMatchObject({ code: 'ERR_VALIDATION' });
    // Créditos: insuficientes; suficientes mas sem cobertura do prazo (EC-6).
    const big = await pricedNights(f, [20_000n]);
    const bigQuote = await app.quote(r, app.shape(r, big));
    expect(
      await app.send(
        r,
        app.sendInput(
          app.shape(r, big),
          bigQuote,
          await payFee(f, BigInt(bigQuote.fee_amount_minor), r),
        ),
      ),
    ).toMatchObject({ status: 'rejected', code: 'ERR_CREDITS_INSUFFICIENT' });
    await ageLot(c.h, lot, new Date(monthsAgo(TEST_VALIDITY_MONTHS).getTime() + 10 * 3_600_000));
    expect(await app.send(r, input)).toMatchObject({
      status: 'rejected',
      code: 'ERR_CREDIT_HOLD_INVALID',
    });
  });

  it('[ADR-0037 §10] chave fechada impede compromisso novo: K7, K5, K4 e, com complemento, K6 — nada é gravado', async () => {
    const r = await newRequester(f);
    await originate(c, '500', { titular: r });
    const nights = await pricedNights(f, [5_000n]);
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const plain = app.shape(r, nights);
    const quote = await app.quote(r, plain);
    const input = app.sendInput(plain, quote, await payFee(f, BigInt(quote.fee_amount_minor), r));
    try {
      for (const key of ['luxchange_exchange', 'payments', 'credits'] as const) {
        await deactivate(c.h, key);
        await expect(app.send(r, input)).rejects.toBeInstanceOf(CapabilityNotActivatedError);
        await expect(app.quote(r, plain)).rejects.toBeInstanceOf(CapabilityNotActivatedError);
        await activate(c.h, key);
      }
      await deactivate(c.h, 'luxchange_deposit');
      await expect(
        app.quote(r, app.shape(r, nights, [ownerUnit(r, offered!)])),
      ).rejects.toBeInstanceOf(CapabilityNotActivatedError);
      expect(await app.send(r, input)).toMatchObject({ status: 'committed' });
    } finally {
      await activate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
    }
  });

  it('[EC-21][TECH-053] reenvio sobre data de Request vencida e não encerrada materializa o encerramento na mesma transação; o fluxo processa o estorno', async () => {
    const r = await newRequester(f);
    await originate(c, '300', { titular: r });
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const first = committed(
      (
        await app.quoteAndSend(
          r,
          app.shape(r, await pricedNights(f, [5_000n]), [ownerUnit(r, offered!)]),
        )
      ).outcome,
    ).result;
    const request = app.shape(r, await pricedNights(f, [5_000n]), [ownerUnit(r, offered!)]);
    // Ainda aceitável: a data segue comprometida.
    await expect(app.quote(r, request)).rejects.toMatchObject({ code: 'ERR_CAPACITY_UNAVAILABLE' });
    await ageRequest(f, first.request_id);
    const paid = await payRequestFee(
      app.flow(r),
      { userId: r.userId, partyId: r.partyId },
      request,
      randomUUID(),
    );
    const outcome = await submitRequest(
      app.flow(r),
      { userId: r.userId, partyId: r.partyId },
      app.sendInput(request, paid.quote, paid.payment_id),
      randomUUID(),
      randomUUID(),
    );
    const second = committed(outcome).result;
    expect(second.materialized).toEqual([first.request_id]);
    expect(await requestRow(pool(), first.request_id)).toMatchObject({
      state: 'expired',
      closure_reason: 'expired',
    });
    const refund = await pool().query<{ state: string }>(
      'SELECT state FROM app.refund WHERE id = $1',
      [second.refund_ids[0]],
    );
    expect(refund.rows[0]!.state).toBe('succeeded');
    const events = await pool().query<{ type: string }>(
      'SELECT event_type AS type FROM app.outbox WHERE operation_id = $1 ORDER BY event_type',
      [second.operation_id],
    );
    expect(events.rows.map((e) => e.type)).toEqual([
      'luxchange.request_closed',
      'luxchange.request_sent',
    ]);
  });

  it('[CONC-15][CONC-8] envios concorrentes pelo executor (com retry): mesma data comprometida e mesmos Créditos — exatamente um confirma', async () => {
    const r = await newRequester(f);
    await originate(c, '800', { titular: r });
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const prepare = async () => {
      const request = app.shape(r, await pricedNights(f, [5_000n]), [ownerUnit(r, offered!)]);
      const quote = await app.quote(r, request);
      return app.sendInput(request, quote, await payFee(f, BigInt(quote.fee_amount_minor), r));
    };
    const [a, b] = [await prepare(), await prepare()];
    const outcomes = await Promise.all([
      app.send(r, a, undefined, 3),
      app.send(r, b, undefined, 3),
    ]);
    expect(outcomes.filter((o) => o.status === 'committed')).toHaveLength(1);
    expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });

    const s = await newRequester(f);
    const lot = await originate(c, '500', { titular: s });
    const prepareCredits = async () => {
      const request = app.shape(s, await pricedNights(f, [4_000n]));
      const quote = await app.quote(s, request);
      return app.sendInput(request, quote, await payFee(f, BigInt(quote.fee_amount_minor), s));
    };
    const [x, y] = [await prepareCredits(), await prepareCredits()];
    const spent = await Promise.all([app.send(s, x, undefined, 3), app.send(s, y, undefined, 3)]);
    expect(spent.filter((o) => o.status === 'committed')).toHaveLength(1);
    expect(spent.find((o) => o.status === 'rejected')).toMatchObject({
      code: 'ERR_CREDITS_INSUFFICIENT',
    });
    expect(await lotRow(pool(), lot)).toMatchObject({ held: '400', available: '100' });
  });
});
