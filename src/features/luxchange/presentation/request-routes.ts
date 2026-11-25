import { after } from 'next/server';
import { PaymentRejection, PaymentsUnavailableError } from '@/features/billing';
import {
  createTitularCommandRoute,
  createTitularSessionRoute,
  type TitularCommandRouteOptions,
} from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import {
  CommandRejection,
  errorResponse,
  getDatabase,
  idempotencyKey,
  withRoute,
  type Clock,
  type Database,
  type EnvSource,
  type LogPort,
} from '@/features/platform';
import type { RequestClosingResult } from '../application/close-request';
import {
  payRequestFee,
  processRequestRefunds,
  recoverRequestPayment,
  type RequestFlowDependencies,
} from '../application/request-flow';
import { sendRequestInput, type SendRequestResult } from '../application/send-request';
import {
  createSendRequestProductionHandler,
  createWithdrawRequestProductionHandler,
} from './request-handlers';
import { productionRequestFlow } from './request-production';
import {
  productionRequestQuota,
  type RequestQuota,
  type RequestQuotaDecision,
} from './request-quota';

/** Corpo efetivo até 64 KiB: 366 noites e as unidades do complemento cabem com folga (STRIDE T-2008). */
const MAX_BODY_BYTES = 65_536;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestShape = sendRequestInput.pick({
  party_id: true,
  second_home_id: true,
  checkin: true,
  checkout: true,
  complement: true,
});

export interface RequestRouteDependencies {
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly database?: () => Database;
  /** Fluxo de pagamento, recuperação e estornos; padrão: o de produção. */
  readonly flow?: (db: Database, log: LogPort) => Omit<RequestFlowDependencies, 'send'>;
  /** Agendamento depois da resposta; padrão: `after()` do Next. */
  readonly afterResponse?: (task: () => Promise<void>) => void;
  readonly afterCommit?: TitularCommandRouteOptions<unknown, never>['afterCommit'];
  /** Limite das superfícies (TECH-100); padrão: o limitador de produção. */
  readonly quota?: RequestQuota;
}

const resolved = (deps: RequestRouteDependencies) => ({
  database: deps.database ?? (() => getDatabase(deps.source)),
  flow: deps.flow ?? ((db: Database, log: LogPort) => productionRequestFlow(db, log, deps.source)),
  afterResponse: deps.afterResponse ?? ((task: () => Promise<void>) => after(task)),
  quota: deps.quota ?? productionRequestQuota(),
});

/** Desfecho do limitador → resposta (`null` = segue): 429 com `retry-after`, 409 sem limites, 503 sem resposta segura. */
export function quotaRefusal(
  decision: RequestQuotaDecision,
  correlationId: string,
): Response | null {
  if (decision.status === 'allowed') return null;
  if (decision.status === 'parameter_missing')
    return errorResponse('ERR_PARAMETER_MISSING', correlationId);
  if (decision.status === 'unavailable') return errorResponse('ERR_UNAVAILABLE', correlationId);
  const limited = errorResponse('ERR_RATE_LIMITED', correlationId);
  limited.headers.set('retry-after', String(decision.retryAfterSeconds));
  return limited;
}

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Recusa funcional da prévia ou do pagamento → schema `Error`; o resto segue (falha técnica ou 503 do utilitário). */
function refusal(error: unknown, correlationId: string): Response {
  if (error instanceof CommandRejection || error instanceof PaymentRejection)
    return errorResponse(error.code, correlationId);
  if (error instanceof PaymentsUnavailableError)
    return errorResponse('ERR_UNAVAILABLE', correlationId);
  throw error;
}

/** `POST /v1/luxchange/requests/preview` (OpenAPI `previewRequest`): a prévia do servidor, sem escrita. */
export function createRequestPreviewRoute(deps: RequestRouteDependencies = {}) {
  const { database, flow, quota } = resolved(deps);
  return createTitularSessionRoute({
    maxBodyBytes: MAX_BODY_BYTES,
    ...(deps.source === undefined ? {} : { source: deps.source }),
    ...(deps.clock === undefined ? {} : { clock: deps.clock }),
    async run({ session, body, correlationId, log }) {
      const parsed = requestShape.safeParse(body);
      if (!parsed.success) return errorResponse('ERR_VALIDATION', correlationId);
      const refused = quotaRefusal(await quota('read', session.userId), correlationId);
      if (refused !== null) return refused;
      try {
        const viewer = { userId: session.userId, partyId: parsed.data.party_id };
        return json(await flow(database(), log).quote(viewer, parsed.data), HTTP_OK);
      } catch (error) {
        return refusal(error, correlationId);
      }
    },
  });
}

/** `POST /v1/luxchange/requests/fee-payment` (OpenAPI `payRequestFee`): prévia refeita e Taxa da prévia cobrada no PSP. */
export function createRequestFeePaymentRoute(deps: RequestRouteDependencies = {}) {
  const { database, flow, quota } = resolved(deps);
  return createTitularSessionRoute({
    maxBodyBytes: MAX_BODY_BYTES,
    ...(deps.source === undefined ? {} : { source: deps.source }),
    ...(deps.clock === undefined ? {} : { clock: deps.clock }),
    async run({ request, session, body, correlationId, log }) {
      const parsed = requestShape.safeParse(body);
      if (!parsed.success) return errorResponse('ERR_VALIDATION', correlationId);
      const refused = quotaRefusal(await quota('send', session.userId), correlationId);
      if (refused !== null) return refused;
      try {
        const viewer = { userId: session.userId, partyId: parsed.data.party_id };
        const paid = await payRequestFee(
          { ...flow(database(), log), send: unsupported },
          viewer,
          parsed.data,
          idempotencyKey(request),
        );
        return json(paid, HTTP_CREATED);
      } catch (error) {
        return refusal(error, correlationId);
      }
    },
  });
}

const unsupported: RequestFlowDependencies['send'] = () => {
  throw new Error('send is not part of the fee payment route');
};

/**
 * `POST /v1/luxchange/requests` (OpenAPI `sendRequest`): o command `send_request` pelo utilitário de rota do Titular.
 * Depois da resposta: confirmado e novo → estornos das Taxas das Requests encerradas no reenvio; recusado ou com falha
 * técnica → recuperação do pagamento aprovado da própria party (a conciliação revalida o vínculo). O disparo do outbox
 * depois do commit também dispara os encerramentos por evento.
 */
export function createSendRequestRoute(deps: RequestRouteDependencies = {}) {
  const { database, flow, afterResponse } = resolved(deps);
  return createTitularCommandRoute({
    ...pick(deps),
    handler: () => createSendRequestProductionHandler(database()),
    holdings: (db) => createHoldingDirectory(db),
    includePartyId: true,
    successStatus: HTTP_CREATED,
    maxBodyBytes: MAX_BODY_BYTES,
    afterOutcome: (outcome, { input, partyId, userId, log, correlationId }) =>
      afterResponse(async () => {
        const steps = flow(database(), log);
        if (outcome?.status === 'committed') {
          if (!outcome.replayed)
            await processRequestRefunds(
              steps,
              (outcome.result as SendRequestResult).refund_ids,
              correlationId,
            );
          return;
        }
        const paymentId = (input as { payment_id?: unknown }).payment_id;
        if (typeof paymentId === 'string' && UUID.test(paymentId))
          await recoverRequestPayment(steps, { userId, partyId }, paymentId, correlationId);
      }),
  });
}

/**
 * `POST /v1/luxchange/requests/{requestId}/withdraw` (OpenAPI `withdrawRequest`): `withdraw_request` pelo utilitário de
 * rota do Titular; depois da resposta de um commit novo, o estorno da Taxa é processado no PSP.
 */
export function createWithdrawRequestRoute(deps: RequestRouteDependencies = {}) {
  const { database, flow, afterResponse } = resolved(deps);
  return createTitularCommandRoute({
    ...pick(deps),
    handler: () => createWithdrawRequestProductionHandler(database()),
    holdings: (db) => createHoldingDirectory(db),
    includePartyId: true,
    pathInput: (request) => {
      const id = /\/luxchange\/requests\/([^/]+)\/withdraw\/?$/.exec(
        new URL(request.url).pathname,
      )?.[1];
      return id !== undefined && UUID.test(id) ? { request_id: id.toLowerCase() } : null;
    },
    successStatus: HTTP_OK,
    maxBodyBytes: MAX_BODY_BYTES,
    afterOutcome: (outcome, { log, correlationId }) => {
      if (outcome?.status !== 'committed' || outcome.replayed) return;
      afterResponse(() =>
        processRequestRefunds(
          flow(database(), log),
          [(outcome.result as RequestClosingResult).refund_id],
          correlationId,
        ),
      );
    },
  });
}

const pick = (deps: RequestRouteDependencies) => ({
  ...(deps.source === undefined ? {} : { source: deps.source }),
  ...(deps.clock === undefined ? {} : { clock: deps.clock }),
  ...(deps.database === undefined ? {} : { database: deps.database }),
  ...(deps.afterCommit === undefined ? {} : { afterCommit: deps.afterCommit }),
});

export const previewRequest = withRoute(createRequestPreviewRoute());
export const payRequestFeeRoute = withRoute(createRequestFeePaymentRoute());
export const sendRequest = withRoute(createSendRequestRoute());
export const withdrawRequest = withRoute(createWithdrawRequestRoute());
