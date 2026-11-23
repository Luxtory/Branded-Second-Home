/**
 * Estados financeiros (TECH-080; ADR-0035 §2): monotônicos. Um evento que repete, chega atrasado ou contradiz um estado
 * terminal nunca regride o estado — vira `no_change`. O banco repete a mesma regra nos gatilhos.
 */
export const PAYMENT_STATES = ['pending', 'approved', 'failed'] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const REFUND_STATES = ['pending', 'succeeded', 'failed'] as const;
export type RefundState = (typeof REFUND_STATES)[number];

/** Finalidades com consumidor (W21/W23); Luxplus e locação entram com as próprias waves. */
export const PAYMENT_PURPOSES = ['luxchange_fee'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export type Transition<S extends string> =
  { readonly kind: 'advance'; readonly to: S } | { readonly kind: 'no_change' };

const NO_CHANGE = { kind: 'no_change' } as const;

/** `pending → approved | failed`; terminais não mudam. */
export function advancePayment(
  current: PaymentState,
  incoming: PaymentState,
): Transition<PaymentState> {
  if (current !== 'pending' || incoming === 'pending') return NO_CHANGE;
  return { kind: 'advance', to: incoming };
}

/** `pending → succeeded | failed`; terminais não mudam. */
export function advanceRefund(
  current: RefundState,
  incoming: RefundState,
): Transition<RefundState> {
  if (current !== 'pending' || incoming === 'pending') return NO_CHANGE;
  return { kind: 'advance', to: incoming };
}

/** Valor ainda estornável: aprovado menos estornos não falhos (TECH-025: nenhum estorno acima do pago). */
export function refundableMinor(
  amountMinor: bigint,
  refunds: readonly { readonly state: RefundState; readonly amountMinor: bigint }[],
): bigint {
  const active = refunds
    .filter((refund) => refund.state !== 'failed')
    .reduce((sum, refund) => sum + refund.amountMinor, 0n);
  return amountMinor - active;
}
