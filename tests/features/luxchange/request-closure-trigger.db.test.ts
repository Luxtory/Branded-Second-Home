import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMembershipHandlers } from '@/features/identity/presentation/membership-handlers';
import { createExpireRequestsJob } from '@/features/luxchange/jobs';
import { REQUEST_ELIGIBILITY_EVENTS } from '@/features/luxchange/application/request-consumers';
import type { JobRunner } from '@/features/platform';
import { createOutboxDispatch } from '@/features/platform/infrastructure/jobs/job-registry';
import { eventValidator } from '../../support/asyncapi';
import { activate } from '../booking/lifecycle-support';
import {
  creditsHarness,
  originate,
  secondTitular,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { staffRunner, type Staff } from '../pricing/pricing-support';
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
 * W21 E3 — encerramentos por evento (ADR-0037 §7): o gatilho do outbox só anota o evento relevante; depois da varredura
 * (transações de entrega encerradas) o job `expire_requests` encerra pelo executor as Requests que o banco diz não poderem
 * mais ser aceitas. Evento confirmado encerra; evento revertido não; disparo duplicado, falha do disparo e concorrência com
 * retirada, reenvio e cron convergem num encerramento e num estorno; Request elegível nunca é encerrada.
 */
describe('W21 E3 — encerramento da Request por evento (ADR-0037 §7)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  let app: ReturnType<typeof requestApp>;
  let admin: Staff;
  const pool = () => c.h.database.pool;
  const SOURCE = {
    OUTBOX_BATCH_SIZE: '200',
    COMMAND_MAX_ATTEMPTS: '3',
    COMMAND_LOCK_TIMEOUT_MS: '10000',
  };
  const closer = (): JobRunner =>
    createExpireRequestsJob({ log: c.h.log, source: SOURCE, database: c.h.db, gateway: f.gateway });
  const dispatch = (closeRequests: JobRunner = closer()) =>
    createOutboxDispatch({ log: c.h.log, source: SOURCE, database: c.h.db, closeRequests })({
      correlationId: randomUUID(),
    });
  const membership = (
    handler: 'suspendMembership' | 'reactivateMembership',
    partyId: string,
    basis = 'Ata W21',
  ) =>
    staffRunner(c.h).as(admin, createMembershipHandlers()[handler], { party_id: partyId, basis });
  const closings = async (requestId: string) =>
    (
      await pool().query<{ transitions: number; refunds: string[] }>(
        `SELECT (SELECT count(*)::int FROM app.luxchange_request_transition WHERE request_id = $1) AS transitions,
                (SELECT coalesce(array_agg(x.state ORDER BY x.created_at), '{}') FROM app.refund x
                   JOIN app.fee_charge f ON f.payment_id = x.payment_id
                   JOIN app.luxchange_request r ON r.operation_id = f.operation_id WHERE r.id = $1) AS refunds`,
        [requestId],
      )
    ).rows[0]!;
  /** Request de 500 Créditos (Garantia inteira) para o detentor informado, enviada pela aplicação. */
  async function sent(holder: CreditTitular, requester?: CreditTitular) {
    const r = requester ?? (await newRequester(f));
    await originate(c, '500', { titular: r });
    const { outcome } = await app.quoteAndSend(
      r,
      app.shape(r, await pricedNights(f, [5_000n], holder.homeId), [], holder),
    );
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    return { r, request: outcome.result };
  }

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
    app = requestApp(f);
    admin = { ...c.admin, role: 'admin' } as Staff;
    // Varredura inicial: os eventos das fixtures ficam entregues.
    await dispatch();
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('[TECH-091] os eventos que disparam encerramento são contratos do AsyncAPI', () => {
    for (const type of REQUEST_ELIGIBILITY_EVENTS) expect(() => eventValidator(type)).not.toThrow();
  });

  it('[ADR-0037 §7][EC-17] 1 e 6 — evento confirmado encerra depois do commit; a Request ainda elegível de outro detentor fica pendente', async () => {
    const holder = await secondTitular(c);
    const { request } = await sent(holder);
    const other = await sent(f.holder);
    expect(await membership('suspendMembership', holder.partyId)).toMatchObject({
      status: 'committed',
    });
    // O command da suspensão não encerra nada: a Request só deixa de ser aceitável.
    expect(await requestRow(pool(), request.request_id)).toMatchObject({ state: 'pending' });
    const result = await dispatch();
    expect(result).toMatchObject({ request_closures_closed_ineligible: 1 });
    expect(await requestRow(pool(), request.request_id)).toMatchObject({
      state: 'cancelled_pre_accept',
      closure_reason: 'holder_membership',
    });
    expect(await closings(request.request_id)).toEqual({ transitions: 1, refunds: ['succeeded'] });
    expect(await requestRow(pool(), other.request.request_id)).toMatchObject({ state: 'pending' });
    await membership('reactivateMembership', holder.partyId);
  });

  it('2 — evento revertido (command recusado, nada confirmado): nenhum encerramento', async () => {
    const holder = await secondTitular(c);
    const { request } = await sent(holder);
    await dispatch();
    expect(await membership('suspendMembership', holder.partyId, '')).toMatchObject({
      status: 'rejected',
    });
    expect(await dispatch()).not.toHaveProperty('request_closures_closed_ineligible');
    expect(await requestRow(pool(), request.request_id)).toMatchObject({ state: 'pending' });
    expect(await closings(request.request_id)).toEqual({ transitions: 0, refunds: [] });
  });

  it('3 — disparos duplicados e paralelos: um encerramento e um estorno', async () => {
    const holder = await secondTitular(c);
    const { request } = await sent(holder);
    await membership('suspendMembership', holder.partyId);
    await Promise.all([dispatch(), dispatch(), dispatch()]);
    await dispatch();
    expect(await closings(request.request_id)).toEqual({ transitions: 1, refunds: ['succeeded'] });
    await membership('reactivateMembership', holder.partyId);
  });

  it('4 — falha no disparo: o domínio do evento fica intacto e o job (cron) encerra depois', async () => {
    const holder = await secondTitular(c);
    const { request } = await sent(holder);
    await membership('suspendMembership', holder.partyId);
    const failing: JobRunner = async () => {
      throw new Error('closures unavailable');
    };
    expect(await dispatch(failing)).toMatchObject({ request_closures_failed: 1 });
    const state = await pool().query<{ state: string }>(
      'SELECT state FROM app.membership WHERE party_id = $1',
      [holder.partyId],
    );
    expect(state.rows[0]!.state).toBe('suspended');
    expect(await requestRow(pool(), request.request_id)).toMatchObject({ state: 'pending' });
    expect(await closer()({ correlationId: randomUUID() })).toMatchObject({ closed_ineligible: 1 });
    expect(await closings(request.request_id)).toEqual({ transitions: 1, refunds: ['succeeded'] });
    await membership('reactivateMembership', holder.partyId);
  });

  it('5 — retirada, reenvio que materializa, disparo e cron concorrentes: um encerramento e um estorno', async () => {
    const r = await newRequester(f);
    await originate(c, '300', { titular: r });
    const [offered] = await pricedNights(f, [2_000n], r.homeId);
    const unit = [{ kind: 'owner_night' as const, second_home_id: r.homeId, stay_date: offered! }];
    const first = await app.quoteAndSend(r, app.shape(r, await pricedNights(f, [5_000n]), unit));
    if (first.outcome.status !== 'committed') throw new Error('fixture');
    const old = first.outcome.result.request_id;
    await ageRequest(f, old);
    // Evento relevante pendente no outbox (um envio novo de outra party) para o disparo ter o que fazer.
    await sent(f.holder);
    const resend = app.shape(r, await pricedNights(f, [5_000n]), unit);
    const quote = await app.quote(r, resend);
    const { input } = await (async () => {
      const paid = await app.flow(r).initiatePayment({
        actorUserId: r.userId,
        payerPartyId: r.partyId,
        purpose: 'luxchange_fee',
        amountMinor: BigInt(quote.fee_amount_minor),
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      });
      return { input: app.sendInput(resend, quote, paid.id) };
    })();
    const outcomes = await Promise.allSettled([
      app.withdraw(r, old),
      app.send(r, input, undefined, 3),
      dispatch(),
      closer()({ correlationId: randomUUID() }),
    ]);
    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(await closings(old)).toEqual({
      transitions: 1,
      refunds: [expect.stringMatching(/^(pending|succeeded)$/)],
    });
    expect(await requestRow(pool(), old)).toMatchObject({
      state: 'expired',
      closure_reason: 'expired',
    });
  });
});
