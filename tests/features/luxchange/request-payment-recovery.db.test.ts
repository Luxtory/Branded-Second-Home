import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createReconcilePaymentHandler,
  reconcilePayment,
  runReconciliation,
} from '@/features/billing';
import { payRequestFee, submitRequest, type RequestFlowDependencies } from '@/features/luxchange';
import type { OperationalAlertEvent } from '@/features/platform';
import { waitForLockWaiter } from '../../support/platform-fixtures';
import { activate, connect } from '../booking/lifecycle-support';
import {
  creditsHarness,
  lotRow,
  originate,
  reactivate,
  suspend,
  systemExecutor,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { openDepositOperation } from './luxchange-support';
import { requestApp } from './request-app-support';
import {
  ageRequest,
  newRequester,
  payFee,
  pricedNights,
  requestFixture,
  requestRow,
  writeRequest,
  type RequestFixture,
} from './request-support';

/**
 * W21 E2 — propriedades financeiras do envio (TECH-080, TECH-082, TECH-101, TECH-110; ADR-0037 §3 item 6): resultado
 * ambíguo nunca estorna a Taxa de uma Request válida (a conciliação confere o vínculo sob a trava do pagamento, proteção
 * da W19); a mesma chave nunca cria Request, pagamento, Garantia ou estorno novos; falha depois do pagamento recupera na
 * hora, sem esperar o cron; efeito externo pós-commit que falha fica para a conciliação.
 */
describe('W21 E2 — pagamento, idempotência e recuperação do envio (TECH-080)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let app: ReturnType<typeof requestApp>;
  const pool = () => c.h.database.pool;
  const viewerOf = (r: CreditTitular) => ({ userId: r.userId, partyId: r.partyId });
  const refunds = async (paymentId: string) =>
    (
      await pool().query<{ state: string }>(
        'SELECT state FROM app.refund WHERE payment_id = $1 ORDER BY created_at',
        [paymentId],
      )
    ).rows.map((row) => row.state);
  const counts = async (partyId: string) =>
    (
      await pool().query<{ requests: number; fees: number; payments: number }>(
        `SELECT (SELECT count(*)::int FROM app.luxchange_request WHERE requester_party_id = $1) AS requests,
                (SELECT count(*)::int FROM app.fee_charge WHERE payer_party_id = $1) AS fees,
                (SELECT count(*)::int FROM app.payment WHERE payer_party_id = $1) AS payments`,
        [partyId],
      )
    ).rows[0]!;
  /** Pedido pronto para envio: lote, noite com PRL, prévia e pagamento aprovado da Taxa. */
  async function ready(r?: CreditTitular) {
    const requester = r ?? (await newRequester(f));
    const lot = await originate(c, '500', { titular: requester });
    const request = app.shape(requester, await pricedNights(f, [5_000n]));
    const paid = await payRequestFee(
      app.flow(requester),
      viewerOf(requester),
      request,
      randomUUID(),
    );
    return {
      requester,
      lot,
      request,
      paid,
      input: app.sendInput(request, paid.quote, paid.payment_id),
    };
  }

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
    app = requestApp(f);
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  describe('A — resultado ambíguo do envio', () => {
    it('[TECH-080][TECH-110] envio confirmado e resposta perdida: a recuperação não estorna a Taxa da Request válida', async () => {
      const { requester, input, paid } = await ready();
      const base = app.flow(requester);
      let committedId: string | null = null;
      const lostResponse: RequestFlowDependencies = {
        ...base,
        send: async (...args) => {
          const outcome = await base.send(...args);
          if (outcome.status === 'committed') committedId = outcome.result.request_id;
          throw new Error('connection reset after commit');
        },
      };
      await expect(
        submitRequest(lostResponse, viewerOf(requester), input, randomUUID(), randomUUID()),
      ).rejects.toThrow('connection reset after commit');
      expect(committedId).not.toBeNull();
      expect(await requestRow(pool(), committedId!)).toMatchObject({ state: 'pending' });
      // A conciliação conferiu o vínculo sob a trava do pagamento (W19): Fee vinculado e não revertido → nada a estornar.
      expect(await refunds(paid.payment_id)).toEqual([]);
      expect(await counts(requester.partyId)).toEqual({ requests: 1, fees: 1, payments: 1 });
    });

    it('[TECH-110] envio em andamento × conciliação imediata do mesmo pagamento: a conciliação espera a trava e não estorna', async () => {
      const requester = await newRequester(f);
      const lot = await originate(c, '500', { titular: requester });
      const nights = await pricedNights(f, [5_000n]);
      const paymentId = await payFee(f, 9_876n, requester);
      const client = await connect(c.h.database.appUrl);
      await client.query('BEGIN');
      const op = await openDepositOperation(client, requester, f.holder.homeId, 'send_request');
      await writeRequest(client, op, f, {
        requester,
        nights,
        paymentId,
        holds: [{ lotId: lot, quantity: '500' }],
      });
      const system = systemExecutor(c);
      const reconcile = reconcilePayment(
        {
          store: f.store,
          gateway: f.gateway,
          log: f.log.logger,
          execute: (request) =>
            system.execute(createReconcilePaymentHandler({ store: f.store }), request),
        },
        paymentId,
        randomUUID(),
      );
      await waitForLockWaiter(pool());
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
      await client.end();
      expect(await reconcile).toBeNull();
      expect(await refunds(paymentId)).toEqual([]);
      // Ordem inversa: estornado antes, o pagamento não vincula Fee algum (W19) e nenhuma Request nasce.
      const { requester: other, input, paid } = await ready();
      await reconcilePayment(
        {
          store: f.store,
          gateway: f.gateway,
          log: f.log.logger,
          execute: (request) =>
            system.execute(createReconcilePaymentHandler({ store: f.store }), request),
        },
        paid.payment_id,
        randomUUID(),
      );
      expect(await app.send(other, input)).toMatchObject({
        status: 'rejected',
        code: 'ERR_PAYMENT_FAILED',
      });
      expect(await counts(other.partyId)).toMatchObject({ requests: 0, fees: 0 });
    });
  });

  describe('B — mesma chave', () => {
    it('[TECH-025] prévia + pagamento com a mesma chave: um pagamento; envio repetido devolve o mesmo resultado mesmo com a disponibilidade alterada', async () => {
      const requester = await newRequester(f);
      const lot = await originate(c, '500', { titular: requester });
      const request = app.shape(requester, await pricedNights(f, [5_000n]));
      const payKey = randomUUID();
      const first = await payRequestFee(app.flow(requester), viewerOf(requester), request, payKey);
      const again = await payRequestFee(app.flow(requester), viewerOf(requester), request, payKey);
      expect(again.payment_id).toBe(first.payment_id);
      const input = app.sendInput(request, first.quote, first.payment_id);
      const sendKey = randomUUID();
      const sent = await submitRequest(
        app.flow(requester),
        viewerOf(requester),
        input,
        sendKey,
        randomUUID(),
      );
      expect(sent.status).toBe('committed');
      // Disponibilidade alterada depois do commit (detentor suspenso): o replay devolve o resultado gravado.
      await suspend(c, f.holder.partyId);
      try {
        const replay = await submitRequest(
          app.flow(requester),
          viewerOf(requester),
          input,
          sendKey,
          randomUUID(),
        );
        expect(replay).toMatchObject({ status: 'committed', replayed: true });
        if (sent.status === 'committed' && replay.status === 'committed')
          expect(replay.result.request_id).toBe(sent.result.request_id);
      } finally {
        await reactivate(c, f.holder.partyId);
      }
      expect(await counts(requester.partyId)).toEqual({ requests: 1, fees: 1, payments: 1 });
      expect(await lotRow(pool(), lot)).toMatchObject({ held: '500', available: '0' });
      expect(await refunds(first.payment_id)).toEqual([]);
    });

    it('[EC-21][TECH-025] reenvio que materializa encerramento, repetido com a mesma chave: nenhum estorno novo', async () => {
      const requester = await newRequester(f);
      await originate(c, '300', { titular: requester });
      const [offered] = await pricedNights(f, [2_000n], requester.homeId);
      const unit = [
        { kind: 'owner_night' as const, second_home_id: requester.homeId, stay_date: offered! },
      ];
      const old = await app.quoteAndSend(
        requester,
        app.shape(requester, await pricedNights(f, [5_000n]), unit),
      );
      if (old.outcome.status !== 'committed') throw new Error('fixture');
      await ageRequest(f, old.outcome.result.request_id);
      const request = app.shape(requester, await pricedNights(f, [5_000n]), unit);
      const paid = await payRequestFee(
        app.flow(requester),
        viewerOf(requester),
        request,
        randomUUID(),
      );
      const input = app.sendInput(request, paid.quote, paid.payment_id);
      const key = randomUUID();
      const first = await submitRequest(
        app.flow(requester),
        viewerOf(requester),
        input,
        key,
        randomUUID(),
      );
      const replay = await submitRequest(
        app.flow(requester),
        viewerOf(requester),
        input,
        key,
        randomUUID(),
      );
      expect(first.status).toBe('committed');
      expect(replay).toMatchObject({ status: 'committed', replayed: true });
      expect(await refunds(old.paymentId)).toEqual(['succeeded']);
      expect(await counts(requester.partyId)).toMatchObject({ requests: 2, fees: 2 });
    });
  });

  describe('C — falha depois do pagamento', () => {
    it('[TECH-080] envio que não confirma (falha técnica antes do commit): estorno imediato da Taxa, sem esperar o cron', async () => {
      const { requester, input, paid } = await ready();
      const failing: RequestFlowDependencies = {
        ...app.flow(requester),
        send: async () => {
          throw new Error('database unavailable');
        },
      };
      await expect(
        submitRequest(failing, viewerOf(requester), input, randomUUID(), randomUUID()),
      ).rejects.toThrow('database unavailable');
      expect(await refunds(paid.payment_id)).toEqual(['succeeded']);
      expect(await counts(requester.partyId)).toMatchObject({ requests: 0, fees: 0 });
    });
  });

  describe('D — efeitos pós-commit', () => {
    it('[TECH-101] estorno pós-commit que falha no PSP fica pending e a conciliação o conclui; o domínio já confirmado não muda', async () => {
      const requester = await newRequester(f);
      await originate(c, '300', { titular: requester });
      const [offered] = await pricedNights(f, [2_000n], requester.homeId);
      const unit = [
        { kind: 'owner_night' as const, second_home_id: requester.homeId, stay_date: offered! },
      ];
      const old = await app.quoteAndSend(
        requester,
        app.shape(requester, await pricedNights(f, [5_000n]), unit),
      );
      if (old.outcome.status !== 'committed') throw new Error('fixture');
      await ageRequest(f, old.outcome.result.request_id);
      const request = app.shape(requester, await pricedNights(f, [5_000n]), unit);
      const paid = await payRequestFee(
        app.flow(requester),
        viewerOf(requester),
        request,
        randomUUID(),
      );
      const pspDown: RequestFlowDependencies = {
        ...app.flow(requester),
        processRefund: async () => {
          throw new Error('psp timeout');
        },
      };
      const outcome = await submitRequest(
        pspDown,
        viewerOf(requester),
        app.sendInput(request, paid.quote, paid.payment_id),
        randomUUID(),
        randomUUID(),
      );
      expect(outcome.status).toBe('committed');
      expect(await refunds(old.paymentId)).toEqual(['pending']);
      const raised: OperationalAlertEvent[] = [];
      const system = systemExecutor(c);
      await runReconciliation(
        {
          store: f.store,
          // O PSP que cobrou (fake da fixture) executa o estorno pendente.
          gateway: f.gateway,
          log: f.log.logger,
          alert: { raise: async (event: OperationalAlertEvent) => void raised.push(event) },
          execute: (request) =>
            system.execute(createReconcilePaymentHandler({ store: f.store }), request),
          graceSeconds: 0,
          timeBudgetMs: 60_000,
          monotonicMs: () => 0,
        },
        { correlationId: randomUUID() },
      );
      expect(await refunds(old.paymentId)).toEqual(['succeeded']);
      expect(await requestRow(pool(), old.outcome.result.request_id)).toMatchObject({
        state: 'expired',
      });
    });
  });
});
