import type { RejectionCode } from '@/features/platform';

/** Recusa funcional fora da transação de um command (pagamento, webhook): mesmo vocabulário do TECH-056. */
export class PaymentRejection extends Error {
  constructor(readonly code: RejectionCode) {
    super(code);
    this.name = 'PaymentRejection';
  }
}

/** Sem `PAYMENT_GATEWAY`: pagamentos indisponíveis neste ambiente (ADR-0035 §7). */
export class PaymentsUnavailableError extends Error {
  constructor() {
    super('No payment gateway is configured (TECH-081, ADR-0035 §7)');
    this.name = 'PaymentsUnavailableError';
  }
}

/** O command consumidor não resolveu os termos do Fee (PRL do período, percentual e mínimo): erro de programação. */
export class MissingFeeTermsError extends Error {
  constructor(missing: string) {
    super(`The Luxchange Fee requires ${missing} in the economic terms (TECH-031, TECH-082)`);
    this.name = 'MissingFeeTermsError';
  }
}

/** O provedor devolveu outra referência para o mesmo pagamento: nunca sobrescrita (ADR-0035 §2). */
export class ProviderReferenceMismatchError extends Error {
  constructor(readonly paymentId: string) {
    super(`Provider reference differs from the recorded one for payment ${paymentId}`);
    this.name = 'ProviderReferenceMismatchError';
  }
}
