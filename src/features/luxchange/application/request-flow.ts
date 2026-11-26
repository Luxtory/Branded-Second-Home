import type { PaymentRecord, PaymentRequest } from '@/features/billing';
import type { CommandOutcome, LogPort } from '@/features/platform';
import type {
  RequestQuote,
  RequestShape,
  SendRequestInput,
  SendRequestResult,
} from './send-request';

/** Quem age no fluxo (sessão verificada e party representada; o executor e o banco revalidam). */
export interface RequestViewer {
  readonly userId: string;
  readonly partyId: string;
}

export interface RequestFlowDependencies {
  /** Prévia no servidor (mesmas regras do envio, sem escrita). */
  readonly quote: (viewer: RequestViewer, input: RequestShape) => Promise<RequestQuote>;
  /** `initiatePayment` do billing (TECH-080 etapas 1–3), com o gateway configurado. */
  readonly initiatePayment: (request: PaymentRequest) => Promise<PaymentRecord>;
  readonly findPayment: (paymentId: string) => Promise<PaymentRecord | null>;
  /** `send_request` pelo executor (TECH-054), com a chave de idempotência da revisão. */
  readonly send: (
    viewer: RequestViewer,
    input: SendRequestInput,
    idempotencyKey: string,
    correlationId: string,
  ) => Promise<CommandOutcome<SendRequestResult>>;
  /** `reconcilePayment` do billing: estorno imediato de pagamento aprovado sem desfecho (TECH-080 etapa 6). */
  readonly reconcile: (paymentId: string, correlationId: string) => Promise<unknown>;
  readonly processRefund: (refundId: string) => Promise<unknown>;
  readonly log: LogPort;
}

export type RequestFeePayment = {
  readonly payment_id: string;
  readonly state: PaymentRecord['state'];
  readonly amount_minor: string;
  readonly currency: string;
  readonly quote: RequestQuote;
};

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Pagamento da Taxa de intermediação antes do envio (spec luxchange §13.4; ADR-0037 §3 item 4): o servidor refaz a prévia
 * (pré-validação: elegibilidade, termos e Taxa) e cobra exatamente a Taxa da prévia, com a chave da revisão. Só com o
 * pagamento `approved` o envio prossegue; pendente → "Pagamento em processamento". A mesma chave nunca cobra duas vezes.
 */
export async function payRequestFee(
  deps: RequestFlowDependencies,
  viewer: RequestViewer,
  input: RequestShape,
  idempotencyKey: string,
): Promise<RequestFeePayment> {
  const quote = await deps.quote(viewer, input);
  const payment = await deps.initiatePayment({
    actorUserId: viewer.userId,
    payerPartyId: viewer.partyId,
    purpose: 'luxchange_fee',
    amountMinor: BigInt(quote.fee_amount_minor),
    currency: quote.fee_currency,
    idempotencyKey,
  });
  return {
    payment_id: payment.id,
    state: payment.state,
    amount_minor: payment.amountMinor.toString(),
    currency: payment.currency,
    quote,
  };
}

/**
 * Envio com recuperação financeira (ADR-0037 §3 itens 5–6; TECH-080): executa `send_request`; confirmado, processa os
 * estornos das Taxas das Requests encerradas no reenvio. Recusado ou com falha depois de pagamento aprovado da própria
 * party, o pagamento fica sem desfecho e o fluxo dispara `reconcilePayment` logo em seguida — o job `reconciliation` é a
 * rede de segurança. Pagamento de outra party nunca é estornado por este fluxo.
 */
export async function submitRequest(
  deps: RequestFlowDependencies,
  viewer: RequestViewer,
  input: SendRequestInput,
  idempotencyKey: string,
  correlationId: string,
): Promise<CommandOutcome<SendRequestResult>> {
  let outcome: CommandOutcome<SendRequestResult>;
  try {
    outcome = await deps.send(viewer, input, idempotencyKey, correlationId);
  } catch (error) {
    await recoverRequestPayment(deps, viewer, input.payment_id, correlationId);
    throw error;
  }
  if (outcome.status === 'committed') {
    await processRequestRefunds(deps, outcome.result.refund_ids, correlationId);
    return outcome;
  }
  await recoverRequestPayment(deps, viewer, input.payment_id, correlationId);
  return outcome;
}

/**
 * Recuperação de pagamento aprovado sem Request confirmada (TECH-080 etapa 6): só pagamento aprovado da própria party; a
 * conciliação revalida o vínculo sob a trava do pagamento (Fee vinculado e não revertido → nada a estornar). Falha só vira
 * log: o job `reconciliation` é a rede de segurança.
 */
export async function recoverRequestPayment(
  deps: Pick<RequestFlowDependencies, 'findPayment' | 'reconcile' | 'log'>,
  viewer: RequestViewer,
  paymentId: string,
  correlationId: string,
) {
  try {
    const payment = await deps.findPayment(paymentId);
    if (payment === null || payment.payerPartyId !== viewer.partyId || payment.state !== 'approved')
      return;
    await deps.reconcile(paymentId, correlationId);
  } catch (error) {
    deps.log.warn('send_request payment recovery deferred', {
      payment_id: paymentId,
      reason: errorName(error),
      correlation_id: correlationId,
    });
  }
}

/** Estornos `pending` depois do commit (TECH-080); falha fica `pending` e a conciliação reprocessa (TECH-101). */
export async function processRequestRefunds(
  deps: Pick<RequestFlowDependencies, 'processRefund' | 'log'>,
  refundIds: readonly string[],
  correlationId: string,
) {
  for (const refundId of refundIds)
    try {
      await deps.processRefund(refundId);
    } catch (error) {
      deps.log.warn('request refund deferred', {
        refund_id: refundId,
        reason: errorName(error),
        correlation_id: correlationId,
      });
    }
}
