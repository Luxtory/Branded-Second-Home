import type { LogPort } from '@/features/platform';
import { advanceRefund, type RefundState } from '../domain/payment';
import type { BillingStore, GatewayRefund, PaymentGateway, RefundUpdate } from './ports';

export interface RefundDependencies<Tx> {
  readonly store: BillingStore<Tx>;
  readonly gateway: PaymentGateway;
  readonly log: LogPort;
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/** Resultado do estorno no provedor: referência uma vez, estado só para frente (ADR-0035 §2). */
export async function applyRefundResult<Tx>(
  store: BillingStore<Tx>,
  refundId: string,
  result: GatewayRefund,
): Promise<RefundState | null> {
  const outcome = await store.updateRefund(refundId, (current) => {
    const update: { -readonly [K in keyof RefundUpdate]: RefundUpdate[K] } = {};
    const transition = advanceRefund(current.state, result.status);
    if (transition.kind === 'advance') update.state = transition.to;
    if (result.providerRefundId !== null && transition.kind === 'advance')
      update.providerRefundId = result.providerRefundId;
    return Object.keys(update).length === 0 ? null : update;
  });
  if (outcome === null) return null;
  return (await store.findRefund(refundId))?.state ?? null;
}

/**
 * Etapa 6 do TECH-080: executa no PSP um estorno já registrado (`pending`), com a chave de idempotência igual ao id
 * local — repetições (fluxo + job, jobs paralelos) produzem um único estorno no provedor. Sem resposta, segue `pending`
 * para a próxima conciliação.
 */
export async function processRefund<Tx>(
  deps: RefundDependencies<Tx>,
  refundId: string,
): Promise<RefundState | null> {
  const refund = await deps.store.findRefund(refundId);
  if (refund === null || refund.state !== 'pending') return refund?.state ?? null;
  let result: GatewayRefund;
  try {
    result = await deps.gateway.refund({
      idempotencyKey: refund.id,
      providerPaymentId: refund.providerPaymentId,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
    });
  } catch (error) {
    deps.log.warn('refund unconfirmed', { refund_id: refund.id, reason: errorName(error) });
    return 'pending';
  }
  return applyRefundResult(deps.store, refund.id, result);
}
