/** Códigos mínimos do TECH-056, na ordem do `03`. */
export const TECH_056_ERROR_CODES = [
  'ERR_PERMISSION',
  'ERR_MEMBERSHIP_INELIGIBLE',
  'ERR_WINDOW_NOT_OPEN',
  'ERR_CAPACITY_UNAVAILABLE',
  'ERR_BOOKING_CONFLICT',
  'ERR_USE_RIGHT_BALANCE',
  'ERR_STAY_LENGTH',
  'ERR_MIN_NOTICE',
  'ERR_CREDITS_INSUFFICIENT',
  'ERR_CREDIT_HOLD_INVALID',
  'ERR_PRL_MISSING',
  'ERR_POLICY_MISSING',
  'ERR_PARAMETER_MISSING',
  'ERR_PAYMENT_FAILED',
  'ERR_STATE_TRANSITION',
  'ERR_IDEMPOTENCY_CONFLICT',
  'ERR_CONCURRENT_CONFIRMATION',
  'ERR_COMPLIANCE_SUSPENDED',
  'ERR_DELINQUENCY_RESTRICTED',
] as const;

/** Códigos gerais da plataforma, além do mínimo do TECH-056 (enum `ErrorCode` do OpenAPI). */
export const PLATFORM_ERROR_CODES = [
  'ERR_INTERNAL',
  'ERR_VALIDATION',
  'ERR_UNAUTHENTICATED',
  'ERR_NOT_FOUND',
  'ERR_UNAVAILABLE',
] as const;

export const ERROR_CODES = [...TECH_056_ERROR_CODES, ...PLATFORM_ERROR_CODES] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
/**
 * Recusa funcional de um command: um código do TECH-056; `ERR_NOT_FOUND`, quando o objeto referenciado não existe
 * (ADR-0010 §10); ou `ERR_VALIDATION`, quando o conteúdo só pode ser validado dentro do command (ex.: o arquivo de uma
 * imagem, ADR-0015).
 */
export type RejectionCode =
  (typeof TECH_056_ERROR_CODES)[number] | 'ERR_NOT_FOUND' | 'ERR_VALIDATION';

/**
 * Causas funcionais do REQ-098 e os códigos do TECH-056 que as comunicam. Os códigos técnicos pertencem ao `03`; a
 * mensagem de cada um vem da camada i18n.
 */
export const REQ_098_CAUSES = {
  permission: ['ERR_PERMISSION'],
  // Prazos do TECH-043 (ex.: depósito até 14 dias antes) decidem se a capacidade é elegível.
  capacityEligibilityOrAvailability: ['ERR_CAPACITY_UNAVAILABLE', 'ERR_MIN_NOTICE'],
  windowNotOpen: ['ERR_WINDOW_NOT_OPEN'],
  balanceOrSeasonalLimit: ['ERR_USE_RIGHT_BALANCE'],
  // Permanência do TECH-045: reservas adjacentes somam.
  lengthOrAdjacency: ['ERR_STAY_LENGTH'],
  membership: ['ERR_MEMBERSHIP_INELIGIBLE'],
  creditsOrHold: ['ERR_CREDITS_INSUFFICIENT', 'ERR_CREDIT_HOLD_INVALID'],
  payment: ['ERR_PAYMENT_FAILED'],
  missingPolicyOrParameter: ['ERR_POLICY_MISSING', 'ERR_PARAMETER_MISSING', 'ERR_PRL_MISSING'],
  confirmedBookingConflict: ['ERR_BOOKING_CONFLICT', 'ERR_CONCURRENT_CONFIRMATION'],
} as const satisfies Record<string, readonly RejectionCode[]>;

/**
 * Violação de constraint → código (TECH-056), pelo prefixo do nome da constraint: ocupação, custódia (TECH-023),
 * saldo de Direito de Uso e Créditos. Constraint sem prefixo conhecido não é recusa funcional.
 */
const CONSTRAINT_PREFIXES: readonly (readonly [string, RejectionCode])[] = [
  ['occupancy_', 'ERR_BOOKING_CONFLICT'],
  ['custody_', 'ERR_CAPACITY_UNAVAILABLE'],
  ['balance_', 'ERR_USE_RIGHT_BALANCE'],
  ['credits_', 'ERR_CREDITS_INSUFFICIENT'],
];

export function rejectionForConstraint(constraint: string): RejectionCode | null {
  return CONSTRAINT_PREFIXES.find(([prefix]) => constraint.startsWith(prefix))?.[1] ?? null;
}

/** Recusa funcional lançada por um handler dentro da transação: o executor faz ROLLBACK e grava a recusa. */
export class CommandRejection extends Error {
  constructor(readonly code: RejectionCode) {
    super(code);
    this.name = 'CommandRejection';
  }
}
