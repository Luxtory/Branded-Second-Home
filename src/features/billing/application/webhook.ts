import { createHash } from 'node:crypto';
import type { Clock, LogPort } from '@/features/platform';
import type { BillingStore, PaymentGateway } from './ports';

export type WebhookOutcome =
  'not_found' | 'unauthenticated' | 'duplicate' | 'applied' | 'no_change' | 'unknown_object';

export interface WebhookDependencies<Tx> {
  readonly store: BillingStore<Tx>;
  readonly gateway: PaymentGateway | null;
  readonly clock: Clock;
  readonly log: LogPort;
}

/**
 * Webhook do PSP (TECH-081, ADR-006; ADR-0035 §6): provedor da rota = provedor configurado; autenticação do adaptador
 * antes de qualquer acesso ao banco; deduplicação por `(provider, event_id)` na transação que aplica a transição
 * monotônica. Só o hash do corpo é guardado.
 */
export async function handlePaymentWebhook<Tx>(
  deps: WebhookDependencies<Tx>,
  input: { readonly provider: string; readonly rawBody: string; readonly headers: Headers },
): Promise<WebhookOutcome> {
  if (deps.gateway === null || input.provider !== deps.gateway.provider) return 'not_found';
  const event = deps.gateway.verifyWebhook(input.rawBody, input.headers, deps.clock.now());
  if (event === null) {
    deps.log.warn('payment webhook rejected', { provider: input.provider });
    return 'unauthenticated';
  }
  const outcome = await deps.store.recordWebhook({
    provider: input.provider,
    event,
    payloadSha256: createHash('sha256').update(input.rawBody, 'utf8').digest('hex'),
  });
  deps.log.info('payment webhook', {
    provider: input.provider,
    event_type: event.type,
    outcome,
  });
  return outcome;
}
