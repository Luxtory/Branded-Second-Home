import { CommandRejection, type LockSequence } from '@/features/platform';
import { luxchangeFee, type EconomicTerms } from '@/features/pricing';
import { MissingFeeTermsError } from './errors';
import type { BillingStore, LockedPayment } from './ports';

/** Contexto da transação do command consumidor (TECH-054): só a classe 8 (`payment`) é travada aqui. */
export interface BillingContext<Tx> {
  readonly tx: Tx;
  readonly locks: LockSequence;
  readonly operationId: string;
}

export interface FeeDependencies<Tx> {
  readonly store: BillingStore<Tx>;
}

export interface FeeQuote {
  readonly prlTotalMinor: bigint;
  readonly amountMinor: bigint;
  readonly currency: 'BRL';
}

/**
 * Luxchange Fee dos termos resolvidos (`01` §24, BR-230–232, TECH-031/033): `luxchangeFee` do pricing sobre o PRL total
 * do período, o percentual e o mínimo vigentes registrados no snapshot. Nenhum valor padrão: termos incompletos são erro
 * de programação do consumidor (a ausência de versão já virou `ERR_PARAMETER_MISSING` no resolvedor).
 */
export function quoteLuxchangeFee(terms: EconomicTerms): FeeQuote {
  const rate = terms.parameters.luxchange_fee_rate;
  const minimum = terms.parameters.luxchange_fee_minimum;
  if (terms.prlTotal === null) throw new MissingFeeTermsError('the PRL total of the period');
  if (rate === undefined) throw new MissingFeeTermsError('luxchange_fee_rate');
  if (minimum === undefined || minimum.currency !== terms.prlTotal.currency)
    throw new MissingFeeTermsError('luxchange_fee_minimum in the PRL currency');
  const prlTotalMinor = BigInt(terms.prlTotal.amountMinor);
  return {
    prlTotalMinor,
    amountMinor: luxchangeFee(prlTotalMinor, rate.value, BigInt(minimum.value)),
    currency: terms.prlTotal.currency,
  };
}

// Pagamentos já travados por sequência de travas (uma por transação de command): vincular e apurar o mesmo Fee na mesma
// operação (Direct, W23) re-trava a mesma linha — seguro no PostgreSQL e sem nova entrada na ordem da TECH-053.
const lockedPayments = new WeakMap<LockSequence, Set<string>>();

async function lock<Tx>(
  context: BillingContext<Tx>,
  deps: FeeDependencies<Tx>,
  paymentId: string,
): Promise<LockedPayment> {
  const held = lockedPayments.get(context.locks) ?? new Set<string>();
  if (!held.has(paymentId)) {
    context.locks.claim('payment', [paymentId]);
    held.add(paymentId);
    lockedPayments.set(context.locks, held);
  }
  const payment = await deps.store.lockPayment(context.tx, paymentId);
  if (payment === null) throw new CommandRejection('ERR_NOT_FOUND');
  return payment;
}

/**
 * Etapa 4 do TECH-080 para o Fee (TECH-082): dentro da transação de `send_request` ou `create_direct`, depois do
 * snapshot, vincula o pagamento aprovado da party que age ao Fee da operação. Pagamento de outra party →
 * `ERR_PERMISSION`; não aprovado, de outra finalidade, já vinculado, em estorno ou com valor diferente do Fee calculado
 * agora → `ERR_PAYMENT_FAILED` (o pagamento fica sem desfecho e a conciliação o estorna). O banco confere de novo.
 */
export async function chargeLuxchangeFee<Tx>(
  context: BillingContext<Tx>,
  deps: FeeDependencies<Tx>,
  input: {
    readonly paymentId: string;
    readonly payerPartyId: string;
    readonly terms: EconomicTerms;
  },
): Promise<{ readonly feeChargeId: string; readonly amountMinor: bigint }> {
  const fee = quoteLuxchangeFee(input.terms);
  const payment = await lock(context, deps, input.paymentId);
  if (payment.payerPartyId !== input.payerPartyId) throw new CommandRejection('ERR_PERMISSION');
  if (
    payment.state !== 'approved' ||
    payment.purpose !== 'luxchange_fee' ||
    payment.feeCharge !== null ||
    payment.refunds.length > 0 ||
    payment.amountMinor !== fee.amountMinor ||
    payment.currency !== fee.currency
  )
    throw new CommandRejection('ERR_PAYMENT_FAILED');
  const feeChargeId = await deps.store.insertFeeCharge(context.tx, {
    operationId: context.operationId,
    paymentId: payment.id,
    payerPartyId: input.payerPartyId,
    prlTotalMinor: fee.prlTotalMinor,
    amountMinor: fee.amountMinor,
    currency: fee.currency,
  });
  return { feeChargeId, amountMinor: fee.amountMinor };
}

async function lockFee<Tx>(
  context: BillingContext<Tx>,
  deps: FeeDependencies<Tx>,
  feeChargeId: string,
) {
  const fee = await deps.store.findFeeCharge(context.tx, feeChargeId);
  if (fee === null) throw new CommandRejection('ERR_NOT_FOUND');
  const payment = await lock(context, deps, fee.paymentId);
  if (payment.feeCharge?.reversed === true || payment.feeCharge?.settled === true)
    throw new CommandRejection('ERR_STATE_TRANSITION');
  return fee;
}

/**
 * Reversão integral do Fee (PD-006, TECH-082) no desfecho pré-aceite da Request: registra a reversão e o estorno
 * `pending` do valor cobrado na mesma transação. Depois do commit, quem chama dispara `processRefund(refundId)`; a
 * conciliação é a rede de segurança. Nunca toca Créditos.
 */
export async function reverseLuxchangeFee<Tx>(
  context: BillingContext<Tx>,
  deps: FeeDependencies<Tx>,
  input: { readonly feeChargeId: string },
): Promise<{ readonly refundId: string }> {
  const fee = await lockFee(context, deps, input.feeChargeId);
  await deps.store.insertFeeReversal(context.tx, fee.id, context.operationId);
  const refundId = await deps.store.insertRefund(context.tx, {
    paymentId: fee.paymentId,
    operationId: context.operationId,
    amountMinor: fee.amountMinor,
    currency: fee.currency,
  });
  return { refundId };
}

/**
 * Apuração do Fee como receita Luxtory (TECH-083) quando a operação se torna definitiva: aceite da Request (W22) ou
 * confirmação do Direct (W23). Uma por Fee; Fee revertido não é apurado.
 */
export async function recordFeeSettlement<Tx>(
  context: BillingContext<Tx>,
  deps: FeeDependencies<Tx>,
  input: { readonly feeChargeId: string },
): Promise<{ readonly settlementId: string }> {
  const fee = await lockFee(context, deps, input.feeChargeId);
  const settlementId = await deps.store.insertSettlement(context.tx, {
    operationId: context.operationId,
    kind: 'luxchange_fee',
    beneficiaryPartyId: null,
    amountMinor: fee.amountMinor,
    currency: fee.currency,
    feeChargeId: fee.id,
  });
  return { settlementId };
}
