import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakePaymentGateway, processRefund } from '@/features/billing';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import { WEBHOOK_SECRET } from '../features/billing/billing-support';
import { addDays, type Titular } from '../features/booking/booking-support';
import {
  activate,
  bookNow,
  connect,
  deactivate,
  openOperation,
} from '../features/booking/lifecycle-support';
import {
  TEST_VALIDITY_MONTHS,
  ageLot,
  attempt,
  creditsHarness,
  insertEntry,
  lotRow,
  monthsAgo,
  originate,
  publishValidity,
  reactivate,
  secondTitular,
  suspend,
  type CreditsHarness,
  type CreditTitular,
} from '../features/credits/credits-support';
import { asUser } from '../features/calendar/luxtory-selection-support';
import { activateMembership } from '../features/identity/membership-support';
import { publishMultiplier } from '../features/luxchange/luxchange-support';
import {
  CONSENT_VERSION,
  TEST_DEADLINE_HOURS,
  ageRequest,
  closeRequest,
  newRequester,
  pricedNights,
  publishNights,
  publishRequestPolicy,
  requestFixture,
  requestRow,
  sendRequest,
  writeClosing,
  type RequestFixture,
  type SentRequest,
} from '../features/luxchange/request-support';
import { ownerDelegation } from '../support/party-fixtures';

/**
 * W21 E1 — lastro da Request no banco (ADR-0037; REQ-062, PD-005, PD-007, PD-012; TECH-022, TECH-024, TECH-031,
 * TECH-043, TECH-044, TECH-053, TECH-070, TECH-071, TECH-072, TECH-073, TECH-082). As escritas são as do papel da aplicação
 * (`luxtory_app`) com a operação `pending` do command; o banco decide o resto. Multiplicador 10, validade de 18 meses,
 * prazo de 30 h, Fee de 12% com mínimo 9.876 (valores de teste). `app.luxchange_invariant_breaches()` e
 * `app.credit_invariant_breaches()` rodam no `drop()` de cada banco.
 */
const constraint = (name: string) => expect.objectContaining({ constraint: name });
const denied = expect.objectContaining({ code: '42501' });
const HOUR_MS = 3_600_000;

describe('W21 — Request no banco (ADR-0037)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let policyId: string;

  const pool = () => c.h.database.pool;
  const lots = async (titular: Titular, quantities: readonly string[]) => {
    const ids: string[] = [];
    for (const quantity of quantities) ids.push(await originate(c, quantity, { titular }));
    return ids;
  };
  const ownerNights = (r: CreditTitular, nights: readonly string[]) =>
    nights.map((night) => ({
      kind: 'owner_night' as const,
      holdingId: r.holdingId,
      homeId: r.homeId,
      nights: [night],
    }));
  async function footprint() {
    const { rows } = await pool().query<Record<string, number>>(
      `SELECT (SELECT count(*)::int FROM app.date_custody) AS custody,
              (SELECT count(*)::int FROM app.date_custody WHERE closed_at IS NOT NULL) AS closed,
              (SELECT count(*)::int FROM app.date_occupancy) AS occupancy,
              (SELECT count(*)::int FROM app.booking_state_transition) AS transitions,
              (SELECT count(*)::int FROM app.use_right_ledger) AS use_right,
              (SELECT count(*)::int FROM app.credit_lot) AS lots,
              (SELECT count(*)::int FROM app.settlement) AS settlements`,
    );
    return rows[0]!;
  }
  async function coOwner(): Promise<CreditTitular> {
    const scenario = await c.h.coOwnerScenario();
    const titular = scenario.titulares[0]!;
    await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
    return { ...titular, homeId: scenario.homeId };
  }

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking');
    const { rows } = await pool().query<{ id: string }>(
      `SELECT p.id FROM app.commercial_policy_at('luxchange_request', now()) p`,
    );
    policyId = rows[0]!.id;
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  describe('envio e composição [PD-005][PD-012][TECH-073]', () => {
    it('[PD-012][TECH-073][EC-6] complemento por datas: N, P, G, C e E do banco; Garantia FEFO; snapshot só das noites solicitadas; prazo derivado do envio; consentimento igual aos termos', async () => {
      const r = await newRequester(f);
      const [l1, l2, l3, l4] = await lots(r, ['10000', '20000', '15000', '3000']);
      const requested = await pricedNights(f, [300_000n, 250_000n]);
      const offered = await pricedNights(f, [45_000n, 45_000n], r.homeId);
      const before = await footprint();
      const started = Date.now();
      const sent = await sendRequest(f, {
        requester: r,
        nights: requested,
        complement: ownerNights(r, offered),
        holds: [
          { lotId: l1!, quantity: '10000' },
          { lotId: l2!, quantity: '20000' },
          { lotId: l3!, quantity: '15000' },
          { lotId: l4!, quantity: '1000' },
        ],
      });
      const row = await requestRow(pool(), sent.requestId);
      expect(row).toMatchObject({
        state: 'pending',
        closure_reason: null,
        credits_required: '55000',
        complement_credits: '9000',
        guarantee_credits: '46000',
        complement_consumption: '9000',
        complement_excess: '0',
      });
      // TECH-044: `sent_at` pelo relógio do banco na inserção; `expires_at = sent_at + prazo do snapshot`, exato.
      expect(row.expires_at.getTime() - row.sent_at.getTime()).toBe(Number(TEST_DEADLINE_HOURS) * HOUR_MS);
      expect(row.sent_at.getTime()).toBeGreaterThanOrEqual(started - 5_000);
      expect(row.sent_at.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);

      expect(await lotRow(pool(), l4!)).toMatchObject({ held: '1000', available: '2000' });
      for (const id of [l1, l2, l3]) expect((await lotRow(pool(), id!)).available).toBe('0');

      const snapshot = await pool().query<{ nights: string[]; keys: string[]; policy: string }>(
        `SELECT (SELECT array_agg(n.stay_date::text ORDER BY n.stay_date) FROM app.economic_snapshot_night n
                  WHERE n.operation_id = $1) AS nights,
                (SELECT array_agg(p.parameter_key ORDER BY p.parameter_key) FROM app.economic_snapshot_parameter p
                  WHERE p.operation_id = $1) AS keys,
                (SELECT p.policy_id::text FROM app.economic_snapshot_policy p WHERE p.operation_id = $1) AS policy`,
        [sent.operationId],
      );
      expect(snapshot.rows[0]).toEqual({
        nights: requested,
        keys: [
          'credit_multiplier',
          'credit_validity_months',
          'luxchange_fee_minimum',
          'luxchange_fee_rate',
          'request_deadline_hours',
        ],
        policy: policyId,
      });
      const committed = await pool().query<{ stay_date: string; credits: string; state: string; current: boolean }>(
        `SELECT c.stay_date::text, trim_scale(c.potential_credits)::text AS credits, c.state,
                c.prl_id = (SELECT v.id FROM app.prl_at(c.second_home_id, c.stay_date, now()) v) AS current
           FROM app.luxchange_request_complement_night c WHERE c.request_id = $1 ORDER BY c.stay_date`,
        [sent.requestId],
      );
      expect(committed.rows).toEqual(
        offered.map((night) => ({ stay_date: night, credits: '4500', state: 'active', current: true })),
      );
      const fee = await pool().query<{ prl: string; amount: string }>(
        `SELECT prl_total_minor::text AS prl, amount_minor::text AS amount FROM app.fee_charge WHERE operation_id = $1`,
        [sent.operationId],
      );
      expect(fee.rows[0]).toEqual({ prl: '550000', amount: '66000' });

      const consent = await pool().query<{ text_version: string; terms: Record<string, unknown> }>(
        'SELECT text_version, terms FROM app.luxchange_request_consent WHERE request_id = $1',
        [sent.requestId],
      );
      expect(consent.rows[0]).toEqual({
        text_version: CONSENT_VERSION,
        terms: {
          credits_required: '55000',
          guarantee_credits: '46000',
          complement_credits: '9000',
          complement_consumption: '9000',
          complement_excess: '0',
          fee_amount_minor: '66000',
          fee_currency: 'BRL',
          deadline_hours: TEST_DEADLINE_HOURS,
          credit_validity_months: String(TEST_VALIDITY_MONTHS),
          policy_id: policyId,
          requested_nights: [
            { date: requested[0], credits: '30000' },
            { date: requested[1], credits: '25000' },
          ],
          complement_nights: offered.map((date) => ({ second_home_id: r.homeId, date, credits: '4500' })),
        },
      });
      // Envio não toca custódia, ocupação, reserva, Direito de Uso, lote nem settlement; Créditos potenciais não são saldo.
      expect(await footprint()).toEqual(before);
    });

    it('[PD-012] excedente: reserva Co-Owner inteira cobre N → G = 0, C = N, E > 0, sem Garantia', async () => {
      const co = await coOwner();
      const offered = f.freshNights(2);
      await publishNights(c, co.homeId, { [offered[0]!]: 300_000n, [offered[1]!]: 300_000n });
      const bookingId = await bookNow(c.h, co, co.homeId, offered[0]!, addDays(offered[1]!, 1));
      const requested = await pricedNights(f, [300_000n, 250_000n]);
      const sent = await sendRequest(f, {
        requester: co,
        nights: requested,
        complement: [{ kind: 'co_owner_booking', holdingId: co.holdingId, homeId: co.homeId, bookingId, nights: offered }],
        holds: [],
      });
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({
        credits_required: '55000',
        complement_credits: '60000',
        guarantee_credits: '0',
        complement_consumption: '55000',
        complement_excess: '5000',
      });
      const { rows } = await pool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.credit_entry WHERE operation_id = $1`,
        [sent.operationId],
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('[PD-012] seleção com sobra evitável é recusada; a unidade que basta é aceita', async () => {
      const r = await newRequester(f);
      const requested = await pricedNights(f, [25_000n]);
      const offered = await pricedNights(f, [30_000n, 30_000n], r.homeId);
      await expect(
        sendRequest(f, { requester: r, nights: requested, complement: ownerNights(r, offered), holds: [] }),
      ).rejects.toEqual(constraint('luxchange_complement_selection'));
      const sent = await sendRequest(f, {
        requester: r,
        nights: requested,
        complement: ownerNights(r, offered.slice(0, 1)),
        holds: [],
      });
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({
        guarantee_credits: '0',
        complement_excess: '500',
      });
    });

    it('[PD-007][TECH-073][TECH-082] valores forjados pelo papel da aplicação: N, G, P, Créditos por noite, Garantia e PRL do Fee', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['100000']);
      const requested = await pricedNights(f, [550_000n]);
      const offered = await pricedNights(f, [45_000n], r.homeId);
      const spec = { requester: r, nights: requested, complement: ownerNights(r, offered) };
      const holds = (quantity: string) => [{ lotId: lot!, quantity }];
      for (const [tamper, held, name] of [
        [{ creditsRequired: '54999.99' }, '50499.99', 'luxchange_request_credits_required'],
        [{ guaranteeCredits: '1' }, '1', 'luxchange_request_guarantee'],
        [{ complementCredits: '4501' }, '50499', 'luxchange_request_complement_total'],
        [{ nightCredits: '4600' }, '50400', 'luxchange_complement_potential'],
        [{}, '50499.99', 'luxchange_request_guarantee_total'],
      ] as const)
        await expect(sendRequest(f, { ...spec, tamper, holds: holds(held) })).rejects.toEqual(constraint(name));
      // Fee sobre outro PRL total que não o das noites solicitadas do snapshot (vínculo PRL total ↔ noites).
      await expect(
        sendRequest(f, { ...spec, tamper: { prlTotalMinor: 549_999n }, holds: holds('50500') }),
      ).rejects.toEqual(constraint('billing_fee_request_nights'));
      expect(await lotRow(pool(), lot!)).toMatchObject({ held: '0', available: '100000' });
      await sendRequest(f, { ...spec, holds: holds('50500') });
    });

    it('[PD-012] consentimento diferente dos termos vinculados é recusado; sem consentimento não há Request; prazo fora do consentimento', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['1000']);
      const requested = await pricedNights(f, [5_000n]);
      const spec = { requester: r, nights: requested, holds: [{ lotId: lot!, quantity: '500' }] };
      for (const terms of [
        (t: Record<string, unknown>) => ({ ...t, fee_amount_minor: '9875' }),
        (t: Record<string, unknown>) => ({ ...t, deadline_hours: '24' }),
        (t: Record<string, unknown>) => ({ ...t, requested_nights: [] }),
        (t: Record<string, unknown>) => ({ ...t, expires_at: new Date().toISOString() }),
      ])
        await expect(sendRequest(f, { ...spec, tamper: { terms } })).rejects.toEqual(
          constraint('luxchange_request_consent_terms'),
        );
      await expect(sendRequest(f, { ...spec, tamper: { skip: ['consent'] } })).rejects.toEqual(
        constraint('luxchange_request_consent_terms'),
      );
      const sent = await sendRequest(f, spec);
      const { rows } = await pool().query<{ keys: string[] }>(
        `SELECT array(SELECT jsonb_object_keys(terms)) AS keys FROM app.luxchange_request_consent WHERE request_id = $1`,
        [sent.requestId],
      );
      expect(rows[0]!.keys).not.toContain('expires_at');
    });

    it('[TECH-031] snapshot vinculante: noites do snapshot = noites solicitadas, contíguas; política e parâmetros obrigatórios', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['1000']);
      const nights = await pricedNights(f, [5_000n, 5_000n, 5_000n]);
      await expect(
        sendRequest(f, { requester: r, nights: [nights[0]!, nights[2]!], holds: [{ lotId: lot!, quantity: '1000' }] }),
      ).rejects.toEqual(constraint('luxchange_request_snapshot_nights'));
      await expect(
        sendRequest(f, {
          requester: r,
          nights: [nights[0]!],
          holds: [{ lotId: lot!, quantity: '500' }],
          tamper: { skip: ['policy'] },
        }),
      ).rejects.toEqual(constraint('luxchange_request_snapshot_terms'));
      await expect(
        sendRequest(f, {
          requester: r,
          nights: [nights[0]!],
          holds: [{ lotId: lot!, quantity: '500' }],
          tamper: { skip: ['nights'] },
        }),
      ).rejects.toEqual(constraint('luxchange_request_nights_complete'));
      await expect(
        attempt(c.h.database.appUrl, 'deposit_capacity', { kind: 'titular', titular: r }, async (client, op) => {
          await client.query(`INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`, [op]);
          await client.query(`INSERT INTO app.economic_snapshot_policy (operation_id, policy_id) VALUES ($1, $2)`, [op, policyId]);
        }),
      ).rejects.toEqual(constraint('economic_snapshot_policy_mechanism'));
    });

    it('[TECH-073][BR-211] Membership, detentor e autonegociação conferidos pelo banco', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['1000']);
      const holder = await secondTitular(c);
      const nights = await pricedNights(f, [5_000n], holder.homeId);
      const spec = { requester: r, holder, nights, holds: [{ lotId: lot!, quantity: '500' }] };
      await suspend(c, holder.partyId);
      await expect(sendRequest(f, spec)).rejects.toEqual(constraint('luxchange_request_holder_ineligible'));
      await reactivate(c, holder.partyId);
      await expect(sendRequest(f, { ...spec, holder: { ...holder, holdingId: r.holdingId } })).rejects.toEqual(
        constraint('luxchange_request_holder_holding'),
      );
      await suspend(c, r.partyId);
      await expect(sendRequest(f, spec)).rejects.toEqual(constraint('credit_membership_ineligible'));
      await reactivate(c, r.partyId);
      await ownerDelegation(pool(), { partyId: holder.partyId, userId: r.userId });
      await expect(sendRequest(f, spec)).rejects.toEqual(constraint('luxchange_request_self_dealing'));
      expect(rejectionForConstraint('credit_membership_ineligible')).toBe('ERR_MEMBERSHIP_INELIGIBLE');
    });

    it('[TECH-043] antecedência do complemento medida em expires_at, não no envio', async () => {
      const r = await newRequester(f);
      const requested = await pricedNights(f, [5_000n]);
      // Noites do solicitante cuja antecedência de 336 h vale no envio e já não vale no prazo (30 h depois), e a primeira
      // que vale também no prazo.
      const { rows } = await pool().query<{ stay_date: string; at_send: boolean; at_deadline: boolean }>(
        `SELECT d.stay_date::text,
                app.luxchange_deposit_notice_met(d.checkin_at, now()) AS at_send,
                app.luxchange_deposit_notice_met(d.checkin_at, now() + make_interval(hours => $2)) AS at_deadline
           FROM app.second_home_date d
          WHERE d.second_home_id = $1 AND d.checkin_at BETWEEN now() + interval '14 days' AND now() + interval '17 days'
          ORDER BY d.stay_date`,
        [r.homeId, Number(TEST_DEADLINE_HOURS) + 1],
      );
      const late = rows.find((row) => row.at_send && !row.at_deadline)!;
      const ok = rows.find((row) => row.at_deadline)!;
      await publishNights(c, r.homeId, { [late.stay_date]: 60_000n, [ok.stay_date]: 60_000n });
      await expect(
        sendRequest(f, { requester: r, nights: requested, complement: ownerNights(r, [late.stay_date]), holds: [] }),
      ).rejects.toEqual(constraint('luxchange_complement_notice'));
      await sendRequest(f, { requester: r, nights: requested, complement: ownerNights(r, [ok.stay_date]), holds: [] });
      // Ao segundo: no limite exato vale; um segundo depois, não (função da W20 reaproveitada).
      const edge = await pool().query<{ exact: boolean; past: boolean }>(
        `SELECT app.luxchange_deposit_notice_met(t, t - interval '336 hours') AS exact,
                app.luxchange_deposit_notice_met(t, t - interval '336 hours' + interval '1 second') AS past
           FROM (SELECT now() + interval '20 days' AS t) x`,
      );
      expect(edge.rows[0]).toEqual({ exact: true, past: false });
    });
  });

  describe('Garantia [TECH-071][EC-6][INV-6]', () => {
    it('Garantia só da Request da operação e só com lote que cobre o prazo; lote que vence antes fica fora do FEFO', async () => {
      const r = await newRequester(f);
      const [short, a, b] = await lots(r, ['100', '100', '100']);
      // Lote que vence 10 h depois de agora, antes do prazo da Request (30 h).
      await ageLot(c.h, short!, new Date(monthsAgo(TEST_VALIDITY_MONTHS).getTime() + 10 * HOUR_MS));
      await expect(
        attempt(c.h.database.appUrl, 'send_request', { kind: 'titular', titular: r }, (client, op) =>
          insertEntry(client, op, { lotId: a!, movement: 'hold', from: 'available', to: 'held', quantity: '1' }),
        ),
      ).rejects.toEqual(constraint('credit_hold_request'));
      const nights = await pricedNights(f, [1_500n]);
      await expect(
        sendRequest(f, { requester: r, nights, holds: [{ lotId: short!, quantity: '100' }, { lotId: a!, quantity: '50' }] }),
      ).rejects.toEqual(constraint('credit_hold_request'));
      // FEFO: o lote que vence antes do prazo não é elegível; `a` vem antes de `b`.
      await expect(
        sendRequest(f, { requester: r, nights, holds: [{ lotId: b!, quantity: '100' }, { lotId: a!, quantity: '50' }] }),
      ).rejects.toEqual(constraint('credit_hold_fefo'));
      await sendRequest(f, { requester: r, nights, holds: [{ lotId: a!, quantity: '100' }, { lotId: b!, quantity: '50' }] });
      expect(await lotRow(pool(), short!)).toMatchObject({ held: '0', available: '100' });
    });

    it('FEFO com empate de vencimento e de originação: prevalece o id', async () => {
      const r = await newRequester(f);
      const [x, y] = await lots(r, ['10', '10']);
      const at = monthsAgo(1);
      await ageLot(c.h, x!, at);
      await ageLot(c.h, y!, at);
      const [first, second] = [x!, y!].sort();
      const nights = await pricedNights(f, [150n]);
      await expect(
        sendRequest(f, { requester: r, nights, holds: [{ lotId: second!, quantity: '10' }, { lotId: first!, quantity: '5' }] }),
      ).rejects.toEqual(constraint('credit_hold_fefo'));
      await sendRequest(f, { requester: r, nights, holds: [{ lotId: first!, quantity: '10' }, { lotId: second!, quantity: '5' }] });
    });

    it('nunca acima do disponível; Créditos potenciais nunca entram no saldo', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['10']);
      const nights = await pricedNights(f, [200n]);
      await expect(sendRequest(f, { requester: r, nights, holds: [{ lotId: lot!, quantity: '20' }] })).rejects.toEqual(
        constraint('credits_available_nonnegative'),
      );
      const offered = await pricedNights(f, [500n], r.homeId);
      // P = 50 ≥ N = 20 com uma só unidade: G = 0; nenhum lote nasce nem muda (o potencial não é saldo).
      await sendRequest(f, { requester: r, nights, complement: ownerNights(r, offered), holds: [] });
      const { rows } = await pool().query<{ lots: number; available: string }>(
        `SELECT count(*)::int AS lots, sum(available)::text AS available FROM app.credit_lot WHERE party_id = $1`,
        [r.partyId],
      );
      expect(rows[0]).toEqual({ lots: 1, available: '10' });
    });
  });
  describe('encerramento pré-aceite [PD-005][TECH-024][TECH-044][EC-7]', () => {
    /** Request com Garantia (lote de 1.000) e complemento: N = 500, P = 200, G = 300. */
    async function pending(options: { requester?: CreditTitular; holder?: CreditTitular } = {}) {
      const r = options.requester ?? (await newRequester(f));
      const holder = options.holder ?? f.holder;
      const [lot] = await lots(r, ['1000']);
      const nights = await pricedNights(f, [5_000n], holder.homeId);
      const offered = await pricedNights(f, [2_000n], r.homeId);
      const sent = await sendRequest(f, {
        requester: r,
        holder,
        nights,
        complement: ownerNights(r, offered),
        holds: [{ lotId: lot!, quantity: '300' }],
      });
      return { r, holder, lot: lot!, sent, nights, offered };
    }
    const closingRow = async (requestId: string) =>
      (
        await pool().query<{
          state: string;
          reason: string;
          evidence_kind: string;
          evidence_id: string | null;
          operation_id: string;
          closed_by: string;
          units: string[];
          nights: string[];
        }>(
          `SELECT r.state, t.reason, t.evidence_kind, t.evidence_id, t.operation_id, r.closed_by_operation AS closed_by,
                  (SELECT array_agg(DISTINCT u.state) FROM app.luxchange_request_complement_unit u
                    WHERE u.request_id = r.id) AS units,
                  (SELECT array_agg(DISTINCT n.state) FROM app.luxchange_request_complement_night n
                    WHERE n.request_id = r.id) AS nights
             FROM app.luxchange_request r JOIN app.luxchange_request_transition t ON t.id = r.last_transition_id
            WHERE r.id = $1`,
          [requestId],
        )
      ).rows[0]!;
    const refunds = async (sent: SentRequest) =>
      (
        await pool().query<{ id: string; state: string; amount: string; fee: string; reversed: boolean }>(
          `SELECT x.id, x.state, x.amount_minor::text AS amount, f.amount_minor::text AS fee,
                  EXISTS (SELECT 1 FROM app.fee_charge_reversal v WHERE v.fee_charge_id = f.id) AS reversed
             FROM app.fee_charge f JOIN app.refund x ON x.payment_id = f.payment_id
            WHERE f.operation_id = $1 ORDER BY x.created_at`,
          [sent.operationId],
        )
      ).rows;

    it('retirada antes do prazo: withdrawn; Garantia inteira liberada; Fee revertido com estorno integral; datas liberadas; nada de capacidade', async () => {
      const { r, lot, sent } = await pending();
      expect(await lotRow(pool(), lot)).toMatchObject({ held: '300', available: '700' });
      const before = await footprint();
      const op = await closeRequest(f, sent, 'withdraw_request', r);
      expect(await closingRow(sent.requestId)).toEqual({
        state: 'cancelled_pre_accept',
        reason: 'withdrawn',
        evidence_kind: 'actor',
        evidence_id: null,
        operation_id: op,
        closed_by: op,
        units: ['released'],
        nights: ['released'],
      });
      expect(await lotRow(pool(), lot)).toMatchObject({ held: '0', available: '1000' });
      const [refund] = await refunds(sent);
      expect(refund).toMatchObject({ state: 'pending', reversed: true });
      expect(refund!.amount).toBe(refund!.fee);
      expect(await footprint()).toEqual(before);
      // Um encerramento só; nenhum estorno a mais.
      const again = await closeRequest(f, sent, 'withdraw_request', r).catch((e: unknown) => e);
      expect(again).toEqual(constraint('conflict_luxchange_request_closed'));
      expect(rejectionForConstraint('conflict_luxchange_request_closed')).toBe('ERR_STATE_TRANSITION');
      expect(await refunds(sent)).toHaveLength(1);
    });

    it('[TECH-044] prazo pelo relógio do banco: expiração recusada antes do prazo; depois, retirada ou job gravam expired', async () => {
      const a = await pending();
      await expect(closeRequest(f, a.sent, 'expire_requests')).rejects.toEqual(
        constraint('luxchange_request_still_acceptable'),
      );
      await ageRequest(f, a.sent.requestId);
      await closeRequest(f, a.sent, 'withdraw_request', a.r);
      expect(await closingRow(a.sent.requestId)).toMatchObject({
        state: 'expired',
        reason: 'expired',
        evidence_kind: 'clock',
      });
      const b = await pending();
      await ageRequest(f, b.sent.requestId, 72);
      await expect(closeRequest(f, b.sent, 'close_ineligible_request')).rejects.toEqual(
        constraint('luxchange_request_closing_reason'),
      );
      await closeRequest(f, b.sent, 'expire_requests');
      expect(await closingRow(b.sent.requestId)).toMatchObject({ state: 'expired', reason: 'expired' });
      expect(await lotRow(pool(), b.lot)).toMatchObject({ held: '0', available: '1000' });
    });

    it('[EC-7][EC-17][TECH-024] inelegibilidade provada desde o envio encerra: Membership do detentor e do solicitante; capacidade usada pelo detentor', async () => {
      const holder = await secondTitular(c);
      const a = await pending({ holder });
      await expect(closeRequest(f, a.sent, 'close_ineligible_request')).rejects.toEqual(
        constraint('luxchange_request_still_acceptable'),
      );
      await suspend(c, holder.partyId);
      await reactivate(c, holder.partyId);
      const suspension = await pool().query<{ operation_id: string }>(
        `SELECT operation_id FROM app.membership_transition WHERE party_id = $1 AND to_state <> 'active'
          ORDER BY recorded_at DESC LIMIT 1`,
        [holder.partyId],
      );
      // A reativação não devolve a Request: a prova é o histórico desde o envio.
      await closeRequest(f, a.sent, 'close_ineligible_request');
      expect(await closingRow(a.sent.requestId)).toMatchObject({
        state: 'cancelled_pre_accept',
        reason: 'holder_membership',
        evidence_kind: 'membership_transition',
        evidence_id: suspension.rows[0]!.operation_id,
      });
      const b = await pending({ holder });
      await suspend(c, b.r.partyId);
      await closeRequest(f, b.sent, 'close_ineligible_request');
      expect(await closingRow(b.sent.requestId)).toMatchObject({ reason: 'requester_membership' });
      await reactivate(c, b.r.partyId);
      // TECH-024: a Request pendente não bloqueia a capacidade solicitada; usá-la torna a Request inelegível.
      const d = await pending({ holder });
      await bookNow(c.h, holder, holder.homeId, d.nights[0]!, addDays(d.nights[0]!, 1));
      await closeRequest(f, d.sent, 'close_ineligible_request');
      expect(await closingRow(d.sent.requestId)).toMatchObject({
        reason: 'capacity_unavailable',
        evidence_kind: 'occupancy',
      });
    });

    it('encerramento incompleto não confirma; só o solicitante retira; liberação e reversão fora do encerramento são recusadas', async () => {
      const { r, holder, sent } = await pending();
      const close = async (actor: Parameters<typeof openOperation>[2], command: string, skip?: readonly ('release' | 'fee')[]) => {
        const client = await connect(c.h.database.appUrl);
        try {
          await client.query('BEGIN');
          const op = await openOperation(client, command, actor);
          await writeClosing(client, op, sent, { skip });
          await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
          await client.query('COMMIT');
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
          await client.end();
        }
      };
      const requester = { kind: 'titular' as const, titular: r };
      await expect(close(requester, 'withdraw_request', ['release'])).rejects.toEqual(
        constraint('luxchange_request_closing_guarantee'),
      );
      await expect(close(requester, 'withdraw_request', ['fee'])).rejects.toEqual(
        constraint('luxchange_request_closing_fee'),
      );
      await expect(close({ kind: 'titular', titular: holder }, 'withdraw_request')).rejects.toEqual(
        constraint('luxchange_request_closing_binding'),
      );
      await expect(close(requester, 'accept_request')).rejects.toEqual(constraint('luxchange_request_closing_binding'));
      const [hold] = sent.holdIds;
      await expect(
        attempt(c.h.database.appUrl, 'withdraw_request', requester, async (client, op) => {
          const lot = await client.query<{ lot_id: string }>('SELECT lot_id FROM app.credit_entry WHERE id = $1', [hold]);
          await insertEntry(client, op, {
            lotId: lot.rows[0]!.lot_id,
            movement: 'release',
            from: 'held',
            to: 'available',
            quantity: '300',
            parent: hold,
          });
        }),
      ).rejects.toEqual(constraint('credit_entry_mechanism'));
      await expect(
        attempt(c.h.database.appUrl, 'withdraw_request', requester, (client, op) =>
          client.query(`INSERT INTO app.fee_charge_reversal (fee_charge_id, operation_id) VALUES ($1, $2)`, [
            sent.feeChargeId,
            op,
          ]),
        ),
      ).rejects.toEqual(constraint('billing_fee_reversal_origin'));
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending' });
    });

    it('[TECH-072] Garantia em lote vencido durante a pendência volta como expired no encerramento', async () => {
      const { lot, sent } = await pending();
      await ageLot(c.h, lot, monthsAgo(TEST_VALIDITY_MONTHS, 1));
      await ageRequest(f, sent.requestId);
      const client = await connect(c.h.database.appUrl);
      try {
        await client.query('BEGIN');
        const op = await openOperation(client, 'expire_requests', { kind: 'system' });
        await client.query(
          `INSERT INTO app.luxchange_request_transition (id, request_id, operation_id, reason) VALUES ($1, $2, $3, 'expired')`,
          [randomUUID(), sent.requestId, op],
        );
        await expect(
          insertEntry(client, op, {
            lotId: lot,
            movement: 'release',
            from: 'held',
            to: 'available',
            quantity: '300',
            parent: sent.holdIds[0]!,
          }),
        ).rejects.toEqual(constraint('credit_entry_validity_bucket'));
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
      await closeRequest(f, sent, 'expire_requests');
      expect(await lotRow(pool(), lot)).toMatchObject({ held: '0', expired: '300', available: '700' });
    });

    it('fatos e estado da Request não mudam fora do encerramento (privilégio, guarda e só-inserção)', async () => {
      const { sent } = await pending();
      const app = await connect(c.h.database.appUrl);
      try {
        await expect(
          app.query(`UPDATE app.luxchange_request SET state = 'expired' WHERE id = $1`, [sent.requestId]),
        ).rejects.toEqual(denied);
        await expect(
          app.query(`UPDATE app.luxchange_request SET last_transition_id = $2 WHERE id = $1`, [
            sent.requestId,
            randomUUID(),
          ]),
        ).rejects.toEqual(constraint('luxchange_request_projection'));
        for (const table of ['luxchange_request_consent', 'luxchange_request_night', 'economic_snapshot_policy'])
          await expect(app.query(`DELETE FROM app.${table}`)).rejects.toEqual(denied);
      } finally {
        await app.end();
      }
      for (const statement of [
        `UPDATE app.luxchange_request SET credits_required = 1 WHERE id = $1`,
        `UPDATE app.luxchange_request_consent SET terms = '{}' WHERE request_id = $1`,
        `UPDATE app.luxchange_request_complement_unit SET state = 'released' WHERE request_id = $1`,
        `DELETE FROM app.luxchange_request WHERE id = $1`,
      ])
        await expect(pool().query(statement, [sent.requestId])).rejects.toThrow();
      expect(await requestRow(pool(), sent.requestId)).toMatchObject({ state: 'pending', credits_required: '500' });
    });

    it('[ADR-0037 §10] chaves fechadas: compromisso novo recusado; encerramentos, estornos e conciliação concluem', async () => {
      const a = await pending();
      const b = await pending();
      const r = await newRequester(f);
      const [lot] = await lots(r, ['1000']);
      const nights = await pricedNights(f, [5_000n]);
      const offered = await pricedNights(f, [2_000n], r.homeId);
      const plain = { requester: r, nights, holds: [{ lotId: lot!, quantity: '500' }] };
      try {
        for (const [key, name] of [
          ['luxchange_exchange', 'luxchange_exchange_not_activated'],
          ['payments', 'payments_not_activated'],
          ['credits', 'credit_capability_not_activated'],
        ] as const) {
          await deactivate(c.h, key);
          await expect(sendRequest(f, plain)).rejects.toEqual(constraint(name));
          await activate(c.h, key);
        }
        await deactivate(c.h, 'luxchange_deposit');
        await expect(
          sendRequest(f, { ...plain, complement: ownerNights(r, offered), holds: [{ lotId: lot!, quantity: '300' }] }),
        ).rejects.toEqual(constraint('luxchange_deposit_not_activated'));
        await sendRequest(f, plain);

        await deactivate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
        await closeRequest(f, a.sent, 'withdraw_request', a.r);
        await ageRequest(f, b.sent.requestId);
        await closeRequest(f, b.sent, 'expire_requests');
        const [refund] = await refunds(a.sent);
        const failing = createFakePaymentGateway({ webhookSecret: WEBHOOK_SECRET, refundStatus: () => 'failed' });
        expect(await processRefund({ store: f.store, gateway: failing, log: f.log.logger }, refund!.id)).toBe('failed');
        // Recuperação: a conciliação abre novo estorno do pagamento e o PSP conclui — sem a K5.
        const client = await connect(c.h.database.appUrl);
        let retry = '';
        try {
          await client.query('BEGIN');
          const op = await openOperation(client, 'reconciliation', { kind: 'system' });
          retry = randomUUID();
          await client.query(
            `INSERT INTO app.refund (id, payment_id, operation_id, amount_minor, currency, state)
             SELECT $1, f.payment_id, $2, f.amount_minor, f.currency, 'pending' FROM app.fee_charge f WHERE f.id = $3`,
            [retry, op, a.sent.feeChargeId],
          );
          await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
          await client.query('COMMIT');
        } finally {
          await client.end();
        }
        expect(await processRefund({ store: f.store, gateway: f.gateway, log: f.log.logger }, retry)).toBe('succeeded');
        expect((await refunds(a.sent)).map((row) => row.state)).toEqual(['failed', 'succeeded']);
        expect((await requestRow(pool(), b.sent.requestId)).state).toBe('expired');
      } finally {
        await activate(c.h, 'credits', 'payments', 'luxchange_exchange', 'luxchange_deposit');
      }
    });
  });

  describe('leitura sob RLS [TECH-052][REQ-062]', () => {
    it('o solicitante lê as próprias Requests e os termos; o detentor só a visão restrita; terceiros nada', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['1000']);
      const nights = await pricedNights(f, [5_000n]);
      const offered = await pricedNights(f, [2_000n], r.homeId);
      const sent = await sendRequest(f, {
        requester: r,
        nights,
        complement: ownerNights(r, offered),
        holds: [{ lotId: lot!, quantity: '300' }],
      });
      const url = c.h.database.url;
      const own = async (userId: string) =>
        asUser<{ id: string; n: number; c: number; u: number; k: number }>(
          url,
          userId,
          `SELECT r.id,
                  (SELECT count(*)::int FROM app.luxchange_request_night n WHERE n.request_id = r.id) AS n,
                  (SELECT count(*)::int FROM app.luxchange_request_complement_night x WHERE x.request_id = r.id) AS c,
                  (SELECT count(*)::int FROM app.luxchange_request_complement_unit u WHERE u.request_id = r.id) AS u,
                  (SELECT count(*)::int FROM app.luxchange_request_consent k WHERE k.request_id = r.id) AS k
             FROM app.luxchange_request r WHERE r.id = $1`,
          [sent.requestId],
        );
      expect(await own(r.userId)).toEqual([{ id: sent.requestId, n: 1, c: 1, u: 1, k: 1 }]);
      expect(await own(f.holder.userId)).toEqual([]);
      const received = (userId: string) =>
        asUser<Record<string, unknown>>(url, userId, 'SELECT * FROM app.luxchange_request_received WHERE id = $1', [
          sent.requestId,
        ]);
      const [view] = await received(f.holder.userId);
      expect(Object.keys(view!).sort()).toEqual(
        ['checkin', 'checkout', 'closed_at', 'closure_reason', 'expires_at', 'holder_party_id', 'id', 'second_home_id', 'sent_at', 'state',
          'holder_credits', 'credit_validity_months', 'credit_expires_at'].sort(),
      );
      expect(await received(r.userId)).toEqual([]);
      const stranger = await secondTitular(c);
      expect(await own(stranger.userId)).toEqual([]);
      expect(await received(stranger.userId)).toEqual([]);
      await expect(asUser(url, r.userId, 'SELECT * FROM app.economic_snapshot_policy')).rejects.toEqual(denied);
      await expect(
        asUser(url, r.userId, 'SELECT 1 FROM app.luxchange_request_transition LIMIT 1'),
      ).resolves.toEqual([]);
    });
  });

  describe('termos do aceite gravados no envio [ADR-0037 §9][PD-007]', () => {
    it('recompõem os efeitos do aceite nos três cenários; cedente pela fórmula do PRL, não pela igualdade com o débito', async () => {
      const scenarios = [
        { prl: [2_000n], expected: { g: '300', p: '200', c: '200', e: '0' } },
        { prl: [3_000n, 3_000n], expected: { g: '0', p: '600', c: '500', e: '100' } },
        { prl: [], expected: { g: '500', p: '0', c: '0', e: '0' } },
      ];
      for (const { prl, expected } of scenarios) {
        const r = await newRequester(f);
        const [lot] = await lots(r, ['1000']);
        const nights = await pricedNights(f, [5_000n]);
        const offered = prl.length === 0 ? [] : await pricedNights(f, prl, r.homeId);
        const sent = await sendRequest(f, {
          requester: r,
          nights,
          complement: ownerNights(r, offered),
          holds: expected.g === '0' ? [] : [{ lotId: lot!, quantity: expected.g }],
        });
        const { rows } = await pool().query<Record<string, string | boolean>>(
          `SELECT trim_scale(r.credits_required)::text AS n, trim_scale(r.guarantee_credits)::text AS g,
                  trim_scale(r.complement_credits)::text AS p, trim_scale(r.complement_consumption)::text AS c,
                  trim_scale(r.complement_excess)::text AS e,
                  (SELECT trim_scale(coalesce(sum(x.quantity), 0))::text FROM app.credit_entry x
                    WHERE x.operation_id = r.operation_id AND x.movement = 'hold') AS held,
                  (SELECT trim_scale(coalesce(sum(n.potential_credits), 0))::text
                     FROM app.luxchange_request_complement_night n WHERE n.request_id = r.id) AS requester_lot,
                  app.luxchange_deposit_quantity_matches(r.operation_id, r.credits_required) AS cedente,
                  app.luxchange_deposit_quantity_matches(r.operation_id, r.credits_required + 0.01) AS cedente_off,
                  app.luxchange_snapshot_parameter(r.operation_id, 'credit_multiplier') AS multiplier,
                  app.luxchange_snapshot_parameter(r.operation_id, 'credit_validity_months') AS validity,
                  (SELECT count(*)::text FROM app.luxchange_request_night n JOIN app.date_custody d ON d.id = n.custody_id
                    WHERE n.request_id = r.id AND d.closed_at IS NULL) AS custody
             FROM app.luxchange_request r WHERE r.id = $1`,
          [sent.requestId],
        );
        const row = rows[0]!;
        expect(row).toMatchObject({
          n: '500',
          ...expected,
          held: expected.g,
          requester_lot: expected.p,
          cedente: true,
          cedente_off: false,
          multiplier: '10',
          validity: String(TEST_VALIDITY_MONTHS),
          custody: '1',
        });
        // Débito do solicitante no aceite: toda a Garantia + C do lote do complemento = N; sobra E no lote do complemento.
        expect(Number(row.g) + Number(row.c)).toBe(Number(row.n));
        expect(Number(row.requester_lot) - Number(row.c)).toBe(Number(row.e));
      }
    });

    it('[PD-007][EC-9][EC-18] PRL, multiplicador, validade e política publicados depois do envio não alteram a Request', async () => {
      const r = await newRequester(f);
      const [lot] = await lots(r, ['1000']);
      const nights = await pricedNights(f, [5_000n]);
      const offered = await pricedNights(f, [2_000n], r.homeId);
      const sent = await sendRequest(f, {
        requester: r,
        nights,
        complement: ownerNights(r, offered),
        holds: [{ lotId: lot!, quantity: '300' }],
      });
      const terms = async () =>
        (await pool().query<{ t: unknown }>('SELECT app.luxchange_request_terms($1) AS t', [sent.requestId])).rows[0]!.t;
      const before = { terms: await terms(), row: await requestRow(pool(), sent.requestId) };
      await publishMultiplier(c, '20');
      await publishValidity(c.h, c.admin, 6);
      await publishRequestPolicy(c);
      const superAdmin = await (await import('../features/pricing/pricing-support')).addStaff(c.h, 'super_admin');
      const run = (await import('../features/pricing/pricing-support')).staffRunner(c.h);
      const { createPrlHandlers } = await import('@/features/pricing/prl');
      for (const [home, night] of [
        [f.holder.homeId, nights[0]!],
        [r.homeId, offered[0]!],
      ] as const) {
        const outcome = await run.as(superAdmin, createPrlHandlers().changePublishedPrl, {
          second_home_id: home,
          nights: [{ stay_date: night, amount_minor: '9999' }],
          effective_from: null,
          basis: 'Ata Luxtory W21 (teste)',
        });
        expect(outcome.status).toBe('committed');
      }
      expect(await terms()).toEqual(before.terms);
      expect(await requestRow(pool(), sent.requestId)).toEqual(before.row);
      const consent = await pool().query<{ terms: unknown }>(
        'SELECT terms FROM app.luxchange_request_consent WHERE request_id = $1',
        [sent.requestId],
      );
      expect(consent.rows[0]!.terms).toEqual(before.terms);
      const { rows } = await pool().query('SELECT * FROM app.luxchange_invariant_breaches()');
      expect(rows).toEqual([]);
      await closeRequest(f, sent, 'withdraw_request', r);
    });
  });
});
