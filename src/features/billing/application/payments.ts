import { createHash, randomUUID } from 'node:crypto';
import type { LogPort } from '@/features/platform';
import { advancePayment, type PaymentPurpose } from '../domain/payment';
import {
  PaymentRejection,
  PaymentsUnavailableError,
  ProviderReferenceMismatchError,
} from './errors';
import type {
  BillingStore,
  GatewayCharge,
  PaymentGateway,
  PaymentRecord,
  PaymentUpdate,
} from './ports';

/** `Idempotency-Key` (TECH-056) e limite de valor do banco (`bigint` com até 15 dígitos, TECH-033). */
const IDEMPOTENCY_KEY = /^[!-~]{1,255}$/;
const MAX_AMOUNT_MINOR = 999_999_999_999_999n;

export interface PaymentRequest {
  readonly actorUserId: string;
  readonly payerPartyId: string;
  readonly purpose: PaymentPurpose;
  readonly amountMinor: bigint;
  readonly currency: 'BRL';
  readonly idempotencyKey: string;
}

export interface PaymentDependencies<Tx> {
  readonly store: BillingStore<Tx>;
  readonly gateway: PaymentGateway | null;
  readonly log: LogPort;
  readonly newId?: () => string;
}

/** Hash do que define o pagamento: a mesma chave com outro conteúdo é conflito (ADR-006). */
function paymentHash(request: PaymentRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        request.purpose,
        request.payerPartyId,
        request.amountMinor.toString(),
        request.currency,
      ]),
    )
    .digest('hex');
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * Etapas 1–3 do TECH-080 (ADR-0035 §1): grava `payment(pending)` antes de qualquer chamada ao PSP e só então cobra, com
 * a chave de idempotência do provedor igual ao id local. Repetição com a mesma chave devolve o mesmo pagamento (e repete
 * a cobrança idempotente enquanto pendente). Sem resposta do PSP, o pagamento segue `pending`: webhook ou conciliação
 * resolvem. Nada aqui reserva capacidade (ADR-008): o vínculo é do command de domínio.
 */
export async function initiatePayment<Tx>(
  deps: PaymentDependencies<Tx>,
  request: PaymentRequest,
): Promise<PaymentRecord> {
  if (deps.gateway === null) throw new PaymentsUnavailableError();
  if (
    !IDEMPOTENCY_KEY.test(request.idempotencyKey) ||
    request.amountMinor < 1n ||
    request.amountMinor > MAX_AMOUNT_MINOR
  )
    throw new PaymentRejection('ERR_VALIDATION');
  const requestHash = paymentHash(request);
  const payment = await deps.store.openPayment({
    id: (deps.newId ?? randomUUID)(),
    payerPartyId: request.payerPartyId,
    createdByUserId: request.actorUserId,
    purpose: request.purpose,
    amountMinor: request.amountMinor,
    currency: request.currency,
    provider: deps.gateway.provider,
    idempotencyKey: request.idempotencyKey,
    requestHash,
  });
  if (payment.requestHash !== requestHash) throw new PaymentRejection('ERR_IDEMPOTENCY_CONFLICT');
  if (payment.state !== 'pending') return payment;
  return chargeAtProvider(deps, deps.gateway, payment);
}

async function chargeAtProvider<Tx>(
  deps: PaymentDependencies<Tx>,
  gateway: PaymentGateway,
  payment: PaymentRecord,
): Promise<PaymentRecord> {
  let charge: GatewayCharge;
  try {
    charge = await gateway.createCharge({
      idempotencyKey: payment.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    });
  } catch (error) {
    deps.log.warn('payment charge unconfirmed', {
      payment_id: payment.id,
      reason: errorName(error),
    });
    return payment;
  }
  return applyCharge(deps.store, payment.id, charge);
}

/**
 * Confirmação financeira (TECH-080 etapa 3): grava a referência do provedor uma vez e avança o estado só para frente.
 * Resposta repetida, atrasada ou contraditória com um estado terminal é no-op.
 */
export async function applyCharge<Tx>(
  store: BillingStore<Tx>,
  paymentId: string,
  charge: GatewayCharge,
): Promise<PaymentRecord> {
  await store.updatePayment(paymentId, (current) => {
    const update: { -readonly [K in keyof PaymentUpdate]: PaymentUpdate[K] } = {};
    if (current.providerPaymentId === null) update.providerPaymentId = charge.providerPaymentId;
    else if (current.providerPaymentId !== charge.providerPaymentId)
      throw new ProviderReferenceMismatchError(paymentId);
    const transition = advancePayment(current.state, charge.status);
    if (transition.kind === 'advance') update.state = transition.to;
    return Object.keys(update).length === 0 ? null : update;
  });
  const updated = await store.findPayment(paymentId);
  if (updated === null) throw new Error(`Payment vanished after its transition: ${paymentId}`);
  return updated;
}

/** Repete a cobrança idempotente (sem referência ainda) ou consulta o PSP, e aplica o status (conciliação). */
export async function refreshPayment<Tx>(
  deps: PaymentDependencies<Tx> & { readonly gateway: PaymentGateway },
  paymentId: string,
): Promise<PaymentRecord | null> {
  const payment = await deps.store.findPayment(paymentId);
  if (payment === null || payment.state !== 'pending') return payment;
  if (payment.providerPaymentId === null) return chargeAtProvider(deps, deps.gateway, payment);
  return applyCharge(
    deps.store,
    payment.id,
    await deps.gateway.getCharge(payment.providerPaymentId),
  );
}
