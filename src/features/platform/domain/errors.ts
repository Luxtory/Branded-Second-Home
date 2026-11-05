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

/**
 * Códigos gerais da plataforma, além do mínimo do TECH-056 (enum `ErrorCode` do OpenAPI). Os três últimos são da borda
 * HTTP pública do contato Brand Partners (spec catalog §14.4, TECH-057): corpo grande, tipo de conteúdo e limite.
 */
export const PLATFORM_ERROR_CODES = [
  'ERR_INTERNAL',
  'ERR_VALIDATION',
  'ERR_UNAUTHENTICATED',
  'ERR_NOT_FOUND',
  'ERR_UNAVAILABLE',
  'ERR_PAYLOAD_TOO_LARGE',
  'ERR_UNSUPPORTED_MEDIA_TYPE',
  'ERR_RATE_LIMITED',
] as const;

/**
 * Códigos de produto, fora dos mínimos do TECH-056 (que dizem "mínimos") e depois dos gerais (enum `ErrorCode` do
 * OpenAPI): `ERR_CANCELLATION_TERMS_CHANGED` — os termos esperados da prévia do cancelamento diferem dos calculados no
 * instante da escrita (W13, D7; spec booking §10.5, §10.12).
 */
export const PRODUCT_ERROR_CODES = ['ERR_CANCELLATION_TERMS_CHANGED'] as const;

export const ERROR_CODES = [
  ...TECH_056_ERROR_CODES,
  ...PLATFORM_ERROR_CODES,
  ...PRODUCT_ERROR_CODES,
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
/**
 * Recusa funcional de um command: um código do TECH-056; `ERR_NOT_FOUND`, quando o objeto referenciado não existe
 * (ADR-0010 §10); ou `ERR_VALIDATION`, quando o conteúdo só pode ser validado dentro do command (ex.: o arquivo de uma
 * imagem, ADR-0015).
 */
export type RejectionCode =
  | (typeof TECH_056_ERROR_CODES)[number]
  | (typeof PRODUCT_ERROR_CODES)[number]
  | 'ERR_NOT_FOUND'
  | 'ERR_VALIDATION';

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
  // Unicidade de estado (W7, ADR-0020 §10): documento de party já cadastrado, delegação aberta para o mesmo par.
  ['conflict_', 'ERR_STATE_TRANSITION'],
  // Reserva de uso próprio (W12, ADR-0026): janela da Ação, duração ou adjacência, representação no instante da escrita.
  ['window_', 'ERR_WINDOW_NOT_OPEN'],
  ['stay_', 'ERR_STAY_LENGTH'],
  ['permission_', 'ERR_PERMISSION'],
];

/** Índices com o nome exato do 03 §3.2 (W10), fora da convenção de prefixos. */
const CONSTRAINT_NAMES: ReadonlyMap<string, RejectionCode> = new Map([
  ['uq_occupancy_active', 'ERR_BOOKING_CONFLICT'],
  ['uq_custody_active', 'ERR_CAPACITY_UNAVAILABLE'],
  // W13 (D7): termos esperados da prévia ≠ termos calculados no instante da escrita.
  ['cancellation_terms_changed', 'ERR_CANCELLATION_TERMS_CHANGED'],
]);

export function rejectionForConstraint(constraint: string): RejectionCode | null {
  return (
    CONSTRAINT_NAMES.get(constraint) ??
    CONSTRAINT_PREFIXES.find(([prefix]) => constraint.startsWith(prefix))?.[1] ??
    null
  );
}

/**
 * Recusas por privilégio (SQLSTATE `42501`) que o banco nomeia e que são recusa funcional (W12, W13; spec booking
 * §10.12, D1): só estes nomes exatos. Todo outro `42501` — sem nome ou com nome técnico — é falha técnica.
 */
export const PRIVILEGE_REFUSALS: ReadonlyMap<string, RejectionCode> = new Map([
  ['permission_representation', 'ERR_PERMISSION'],
  ['permission_staff_role', 'ERR_PERMISSION'],
  ['permission_authorization_missing', 'ERR_PERMISSION'],
  ['permission_authorization_scope', 'ERR_PERMISSION'],
  ['permission_authorization_revoked', 'ERR_PERMISSION'],
  ['permission_authorization_used', 'ERR_PERMISSION'],
  ['permission_authorization_expired', 'ERR_PERMISSION'],
]);

/** Capabilities fechadas pela tabela de ativação privilegiada (`42501` nomeado): K1 (ADR-0026) e K2 (ADR-0027). */
export const CLOSED_CAPABILITIES: ReadonlyMap<string, string> = new Map([
  ['booking_not_activated', 'own_use_booking'],
  ['booking_lifecycle_not_activated', 'own_use_lifecycle'],
]);

/**
 * `42501` nomeados que não são recusa funcional: só falham por bug, forja ou regra ainda fechada (falha técnica). A
 * lista existe para que todo `42501` nomeado das migrations esteja classificado (teste estático).
 */
export const TECHNICAL_PRIVILEGE_ERRORS: readonly string[] = [
  'booking_channel_not_enabled',
  'booking_state_projection',
  'inventory_transition_not_enabled',
  'use_right_balance_maintenance',
  'use_right_consumption_not_enabled',
  'use_right_correction_not_enabled',
];

/**
 * Funcionalidade intencionalmente fechada (linha ausente em `app.capability_activation`): não é recusa nem falha. O
 * executor desfaz a transação sem gravar operação, recusa ou evento, e quem chama mostra o estado fechado.
 */
export class CapabilityNotActivatedError extends Error {
  constructor(readonly capability: string) {
    super(`Capability is not activated: ${capability}`);
    this.name = 'CapabilityNotActivatedError';
  }
}

/** Recusa funcional lançada por um handler dentro da transação: o executor faz ROLLBACK e grava a recusa. */
export class CommandRejection extends Error {
  constructor(readonly code: RejectionCode) {
    super(code);
    this.name = 'CommandRejection';
  }
}
