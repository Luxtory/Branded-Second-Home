// Superfície pública do módulo billing (TECH-011; W19, ADR-0035) para os commands consumidores (W21–W25): pagamento em
// duas fases, Luxchange Fee, reversão, apuração, estorno e conciliação. O job fica em `./jobs`.
export {
  PAYMENT_PURPOSES,
  PAYMENT_STATES,
  REFUND_STATES,
  advancePayment,
  advanceRefund,
  refundableMinor,
  type PaymentPurpose,
  type PaymentState,
  type RefundState,
} from './domain/payment';
export {
  ENABLED_SETTLEMENT_KINDS,
  SETTLEMENT_GROUPS,
  SETTLEMENT_KINDS,
  settlementGroup,
  settlementReport,
  type SettlementGroup,
  type SettlementKind,
} from './domain/settlement';
export type {
  BillingStore,
  GatewayCharge,
  GatewayEvent,
  GatewayRefund,
  PaymentGateway,
  PaymentRecord,
} from './application/ports';
export {
  MissingFeeTermsError,
  PaymentRejection,
  PaymentsUnavailableError,
} from './application/errors';
export {
  applyCharge,
  initiatePayment,
  refreshPayment,
  type PaymentRequest,
} from './application/payments';
export {
  chargeLuxchangeFee,
  quoteLuxchangeFee,
  recordFeeSettlement,
  reverseLuxchangeFee,
  type BillingContext,
  type FeeQuote,
} from './application/fee';
export { processRefund } from './application/refunds';
export { handlePaymentWebhook, type WebhookOutcome } from './application/webhook';
export {
  createReconcilePaymentHandler,
  reconcilePayment,
  runReconciliation,
} from './application/reconciliation';
export { createPostgresBillingStore } from './infrastructure/postgres-billing-store';
export { configuredPaymentGateway } from './infrastructure/payment-gateway';
export {
  FAKE_PROVIDER,
  FAKE_SIGNATURE_HEADER,
  createFakePaymentGateway,
  type FakePaymentGateway,
} from './infrastructure/fake-payment-gateway';
