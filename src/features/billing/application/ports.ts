import type { PaymentPurpose, PaymentState, RefundState } from '../domain/payment';
import type { SettlementKind, SettlementTotal } from '../domain/settlement';

/**
 * Port do PSP (TECH-081; ADR-0035 §7). Criação, consulta, estorno/void e verificação de webhook, sempre com chave de
 * idempotência do lado do provedor; a confirmação financeira é o status `approved` devolvido pela criação, pela consulta
 * ou por webhook autenticado. O fornecedor é decisão de contratação: nenhum adaptador real existe até lá.
 */
export interface PaymentGateway {
  /** Nome do adaptador, igual ao segmento `{provider}` do webhook e à coluna `payment.provider`. */
  readonly provider: string;
  createCharge(input: {
    readonly idempotencyKey: string;
    readonly amountMinor: bigint;
    readonly currency: string;
  }): Promise<GatewayCharge>;
  getCharge(providerPaymentId: string): Promise<GatewayCharge>;
  /** Estorno ou void, conforme o estado do pagamento no provedor; idempotente pela chave. */
  refund(input: {
    readonly idempotencyKey: string;
    readonly providerPaymentId: string;
    readonly amountMinor: bigint;
    readonly currency: string;
  }): Promise<GatewayRefund>;
  /**
   * Autentica o corpo bruto (assinatura + tolerância de tempo do protocolo do provedor) e devolve o evento; inválido →
   * `null`. Nunca acessa o banco.
   */
  verifyWebhook(rawBody: string, headers: Headers, now: Date): GatewayEvent | null;
}

export interface GatewayCharge {
  readonly providerPaymentId: string;
  readonly status: PaymentState;
}

export interface GatewayRefund {
  readonly providerRefundId: string | null;
  readonly status: RefundState;
}

export type GatewayEvent =
  | {
      readonly eventId: string;
      readonly type: 'payment.approved' | 'payment.failed';
      readonly providerPaymentId: string;
    }
  | {
      readonly eventId: string;
      readonly type: 'refund.succeeded' | 'refund.failed';
      /** Chave de idempotência enviada no estorno: o `refund.id` local. */
      readonly refundId: string;
      readonly providerRefundId: string | null;
    };

export interface PaymentRecord {
  readonly id: string;
  readonly payerPartyId: string;
  readonly createdByUserId: string;
  readonly purpose: PaymentPurpose;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly provider: string;
  readonly providerPaymentId: string | null;
  readonly requestHash: string;
  readonly state: PaymentState;
}

export interface RefundRecord {
  readonly id: string;
  readonly paymentId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly state: RefundState;
  readonly provider: string;
  readonly providerPaymentId: string;
}

/** Pagamento travado na transação do command, com o que já o vincula (classe 8 da TECH-053). */
export interface LockedPayment extends PaymentRecord {
  readonly feeCharge: {
    readonly id: string;
    readonly reversed: boolean;
    readonly settled: boolean;
  } | null;
  readonly refunds: readonly { readonly state: RefundState; readonly amountMinor: bigint }[];
}

export interface FeeChargeRecord {
  readonly id: string;
  readonly paymentId: string;
  readonly operationId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
}

export interface PaymentDraft {
  readonly id: string;
  readonly payerPartyId: string;
  readonly createdByUserId: string;
  readonly purpose: PaymentPurpose;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly provider: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export interface ReconciliationSummary {
  readonly pendingPayments: number;
  readonly approvedWithoutOutcome: number;
  readonly pendingRefunds: number;
  readonly failedRefundsWithoutRetry: number;
}

/** Persistência do billing. Métodos com `tx` rodam na transação do command; os demais abrem a própria. */
export interface BillingStore<Tx> {
  /** Insere ou devolve o pagamento da mesma chave do mesmo usuário (ADR-006). */
  openPayment(draft: PaymentDraft): Promise<PaymentRecord>;
  findPayment(id: string): Promise<PaymentRecord | null>;
  /**
   * Transição monotônica numa transação própria: trava a linha, `decide` escolhe a mudança; `null` = nada a fazer.
   */
  updatePayment(
    id: string,
    decide: (current: PaymentRecord) => PaymentUpdate | null,
  ): Promise<{ readonly before: PaymentRecord; readonly changed: boolean } | null>;
  findRefund(id: string): Promise<RefundRecord | null>;
  updateRefund(
    id: string,
    decide: (current: RefundRecord) => RefundUpdate | null,
  ): Promise<{ readonly before: RefundRecord; readonly changed: boolean } | null>;
  /**
   * Webhook numa transação: deduplica por `(provider, event_id)`, aplica `apply` e grava o inbox com o resultado.
   * Evento já registrado → `duplicate` sem efeito.
   */
  recordWebhook(input: {
    readonly provider: string;
    readonly event: GatewayEvent;
    readonly payloadSha256: string;
  }): Promise<'applied' | 'no_change' | 'unknown_object' | 'duplicate'>;

  lockPayment(tx: Tx, id: string): Promise<LockedPayment | null>;
  insertFeeCharge(
    tx: Tx,
    row: {
      readonly operationId: string;
      readonly paymentId: string;
      readonly payerPartyId: string;
      readonly prlTotalMinor: bigint;
      readonly amountMinor: bigint;
      readonly currency: string;
    },
  ): Promise<string>;
  findFeeCharge(tx: Tx, id: string): Promise<FeeChargeRecord | null>;
  insertFeeReversal(tx: Tx, feeChargeId: string, operationId: string): Promise<void>;
  insertRefund(
    tx: Tx,
    row: {
      readonly paymentId: string;
      readonly operationId: string;
      readonly amountMinor: bigint;
      readonly currency: string;
    },
  ): Promise<string>;
  insertSettlement(
    tx: Tx,
    row: {
      readonly operationId: string;
      readonly kind: SettlementKind;
      readonly beneficiaryPartyId: string | null;
      readonly amountMinor: bigint;
      readonly currency: string;
      readonly feeChargeId: string | null;
    },
  ): Promise<string>;

  /** Conciliação: ids em ordem de criação. */
  stalePendingPayments(graceSeconds: number): Promise<readonly string[]>;
  paymentsNeedingRefund(graceSeconds: number): Promise<readonly string[]>;
  pendingRefunds(): Promise<readonly string[]>;
  settlementTotals(): Promise<readonly SettlementTotal[]>;
  reconciliationSummary(graceSeconds: number | null): Promise<ReconciliationSummary>;
}

export interface PaymentUpdate {
  readonly state?: PaymentState;
  readonly providerPaymentId?: string;
}

export interface RefundUpdate {
  readonly state?: RefundState;
  readonly providerRefundId?: string;
}
