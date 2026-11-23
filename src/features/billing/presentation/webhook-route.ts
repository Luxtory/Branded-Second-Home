import {
  BODY_NOT_TEXT,
  BODY_TOO_LARGE,
  CapabilityNotActivatedError,
  errorResponse,
  getDatabase,
  isDatabaseUnavailable,
  isJsonRequest,
  readBoundedText,
  systemClock,
  unavailableKeys,
  withRoute,
  type Clock,
  type Database,
  type EnvSource,
  type RouteContext,
} from '@/features/platform';
import type { PaymentGateway } from '../application/ports';
import { handlePaymentWebhook } from '../application/webhook';
import { configuredPaymentGateway } from '../infrastructure/payment-gateway';
import { createPostgresBillingStore } from '../infrastructure/postgres-billing-store';

/** Limite do corpo do webhook: eventos do PSP são pequenos; nada maior chega à verificação. */
export const WEBHOOK_MAX_BYTES = 65_536;

export interface WebhookRouteParams {
  readonly params: Promise<{ provider: string }>;
}

export interface WebhookRouteDependencies {
  readonly source?: EnvSource;
  readonly clock?: Clock;
  readonly gateway?: () => PaymentGateway | null;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
}

/**
 * `POST /v1/webhooks/psp/{provider}` (OpenAPI `receivePaymentWebhook`; ADR-0035 §6). Provedor diferente do configurado
 * (ou nenhum) → 404; assinatura inválida → 401, sem tocar o banco; evento autenticado → 200 com o resultado, inclusive
 * duplicado ou sem mudança (o PSP não reenvia o que já foi registrado).
 */
export function createWebhookRoute(deps: WebhookRouteDependencies = {}) {
  return async (
    request: Request,
    { correlationId, log }: RouteContext,
    route: WebhookRouteParams,
  ) => {
    const { provider } = await route.params;
    let gateway: PaymentGateway | null;
    try {
      gateway = (deps.gateway ?? (() => configuredPaymentGateway(deps.source)))();
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys === null) throw error;
      log.error('payment webhook unavailable', { keys });
      return errorResponse('ERR_UNAVAILABLE', correlationId);
    }
    if (gateway === null || provider !== gateway.provider)
      return errorResponse('ERR_NOT_FOUND', correlationId);
    if (!isJsonRequest(request)) return errorResponse('ERR_UNSUPPORTED_MEDIA_TYPE', correlationId);
    const rawBody = await readBoundedText(request, WEBHOOK_MAX_BYTES);
    if (rawBody === BODY_TOO_LARGE) return errorResponse('ERR_PAYLOAD_TOO_LARGE', correlationId);
    if (rawBody === BODY_NOT_TEXT) return errorResponse('ERR_VALIDATION', correlationId);
    try {
      const outcome = await handlePaymentWebhook(
        {
          store: createPostgresBillingStore(deps.database ?? getDatabase(deps.source)),
          gateway,
          clock: deps.clock ?? systemClock,
          log,
        },
        { provider, rawBody, headers: request.headers },
      );
      if (outcome === 'not_found') return errorResponse('ERR_NOT_FOUND', correlationId);
      if (outcome === 'unauthenticated') return errorResponse('ERR_UNAUTHENTICATED', correlationId);
      return Response.json({ status: outcome }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      if (error instanceof CapabilityNotActivatedError || isDatabaseUnavailable(error)) {
        log.warn('payment webhook unavailable', {
          reason: error instanceof Error ? error.name : 'database',
        });
        return errorResponse('ERR_UNAVAILABLE', correlationId);
      }
      throw error;
    }
  };
}

/** POST /v1/webhooks/psp/{provider} — contrato `receivePaymentWebhook` em docs/api/openapi.yaml. */
export const receivePaymentWebhook = withRoute(createWebhookRoute());
