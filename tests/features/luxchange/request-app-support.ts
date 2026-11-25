import { randomUUID } from 'node:crypto';
import {
  createReconcilePaymentHandler,
  initiatePayment,
  processRefund,
  reconcilePayment,
} from '@/features/billing';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { postgresMembershipGate } from '@/features/identity/infrastructure/postgres-membership';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import {
  createSendRequestProductionHandler,
  createSystemClosingProductionHandler,
  createWithdrawRequestProductionHandler,
  quoteRequest,
  requestDependencies,
  type RequestFlowDependencies,
  type RequestQuote,
  type RequestShape,
  type SendRequestInput,
} from '@/features/luxchange';
import { createHoldingDirectory } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { addDays } from '../booking/booking-support';
import { systemExecutor, type CreditTitular } from '../credits/credits-support';
import { CONSENT_VERSION, type RequestFixture } from './request-support';

/**
 * W21 E2 — fixtures da aplicação da Request: cotação numa transação de leitura, envio montado a partir da cotação (os
 * termos revisados), executor real (TECH-054) com o guard do Titular (escopo `party`), o Membership do identity e os
 * privilégios reais do `luxtory_app`; fluxo de pagamento com o fake da fixture.
 */
export function requestApp(f: RequestFixture) {
  const db = f.c.h.db;
  const deps = requestDependencies(db);

  function executorFor(titular: CreditTitular, maxAttempts = 1) {
    const guard = createAuthorizationGuard({
      session: { userId: titular.userId, assurance: 'aal1' },
      staff: createPostgresStaffDirectory(() => db),
      grants: createPostgresGrantDirectory(() => db),
      delegations: createPostgresDelegationDirectory(() => db),
      holdings: createHoldingDirectory(() => db),
      clock: systemClock,
    });
    const executor = createCommandExecutor({
      store: createPostgresCommandStore(db),
      guard,
      clock: systemClock,
      limits: { maxAttempts, lockTimeoutMs: 10_000 },
      log: f.c.h.log,
      registry: commandRegistry,
      membership: postgresMembershipGate,
    });
    return <I, R extends JsonValue>(
      handler: CommandHandler<I, R, DatabaseTransaction>,
      input: unknown,
      key: string = randomUUID(),
    ) =>
      executor.execute(handler, {
        actor: {
          kind: 'user',
          userId: titular.userId,
          actingPartyId: titular.partyId,
          role: 'titular',
        },
        idempotencyKey: key,
        correlationId: randomUUID(),
        input,
      });
  }

  const shape = (
    requester: CreditTitular,
    nights: readonly string[],
    complement: RequestShape['complement'] = [],
    holder = f.holder,
  ): RequestShape => ({
    party_id: requester.partyId,
    second_home_id: holder.homeId,
    checkin: nights[0]!,
    checkout: addDays(nights.at(-1)!, 1),
    complement: [...complement],
  });

  const quote = (titular: CreditTitular, request: RequestShape) =>
    db
      .transaction()
      .execute((tx) =>
        quoteRequest(deps, tx, { userId: titular.userId, now: new Date() }, request),
      );

  const sendInput = (
    request: RequestShape,
    q: RequestQuote,
    paymentId: string,
  ): SendRequestInput => ({
    ...request,
    payment_id: paymentId,
    accepted_policy_id: q.policy_id,
    consent_text_version: CONSENT_VERSION,
    expected: {
      night_credits: [...q.night_credits],
      credits_required: q.credits_required,
      complement_nights: [...q.complement_nights],
      complement_credits: q.complement_credits,
      guarantee_credits: q.guarantee_credits,
      fee_amount_minor: q.fee_amount_minor,
      deadline_hours: q.deadline_hours,
      credit_validity_months: q.credit_validity_months,
    },
  });

  const sendHandler = createSendRequestProductionHandler(db);
  const withdrawHandler = createWithdrawRequestProductionHandler(db);
  const send = (titular: CreditTitular, input: SendRequestInput, key?: string, maxAttempts = 1) =>
    executorFor(titular, maxAttempts)(sendHandler, input, key);
  const withdraw = (titular: CreditTitular, requestId: string, key?: string) =>
    executorFor(titular)(
      withdrawHandler,
      { party_id: titular.partyId, request_id: requestId },
      key,
    );

  /** Cotação → pagamento aprovado da Taxa cotada → envio; devolve tudo o que o teste precisa conferir. */
  async function quoteAndSend(titular: CreditTitular, request: RequestShape, key?: string) {
    const q = await quote(titular, request);
    const payment = await initiatePayment(
      { store: f.store, gateway: f.gateway, log: f.log.logger },
      {
        actorUserId: titular.userId,
        payerPartyId: titular.partyId,
        purpose: 'luxchange_fee',
        amountMinor: BigInt(q.fee_amount_minor),
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    );
    const input = sendInput(request, q, payment.id);
    return { quote: q, paymentId: payment.id, input, outcome: await send(titular, input, key) };
  }

  /** Dependências do fluxo (pagamento da Taxa e envio com recuperação), com o PSP fake da fixture. */
  function flow(titular: CreditTitular): RequestFlowDependencies {
    const system = systemExecutor(f.c);
    const reconcileHandler = createReconcilePaymentHandler({ store: f.store });
    const refundDeps = { store: f.store, gateway: f.gateway, log: f.log.logger };
    return {
      quote: (viewer, request) =>
        db
          .transaction()
          .execute((tx) =>
            quoteRequest(deps, tx, { userId: viewer.userId, now: new Date() }, request),
          ),
      initiatePayment: (request) => initiatePayment(refundDeps, request),
      findPayment: (id) => f.store.findPayment(id),
      send: (_viewer, input, key) => send(titular, input, key),
      reconcile: (paymentId, correlationId) =>
        reconcilePayment(
          {
            ...refundDeps,
            execute: (request) => system.execute(reconcileHandler, request),
          },
          paymentId,
          correlationId,
        ),
      processRefund: (refundId) => processRefund(refundDeps, refundId),
      log: f.log.logger,
    };
  }

  const systemClosing = (command: 'expire_requests' | 'close_ineligible_request') =>
    createSystemClosingProductionHandler(command, db);

  return {
    deps,
    executorFor,
    shape,
    quote,
    sendInput,
    send,
    withdraw,
    quoteAndSend,
    flow,
    systemClosing,
  };
}
