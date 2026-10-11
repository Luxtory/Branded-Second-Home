import type { ErrorCode } from '../domain/errors';
import { messages } from './i18n/pt-br';

/** Status HTTP de cada código (TECH-056). Recusas funcionais sem conflito de estado são 422. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  ERR_PERMISSION: 403,
  ERR_MEMBERSHIP_INELIGIBLE: 422,
  ERR_WINDOW_NOT_OPEN: 422,
  ERR_CAPACITY_UNAVAILABLE: 422,
  ERR_BOOKING_CONFLICT: 409,
  ERR_USE_RIGHT_BALANCE: 422,
  ERR_STAY_LENGTH: 422,
  ERR_MIN_NOTICE: 422,
  ERR_CREDITS_INSUFFICIENT: 422,
  ERR_CREDIT_HOLD_INVALID: 422,
  ERR_PRL_MISSING: 422,
  ERR_POLICY_MISSING: 422,
  ERR_PARAMETER_MISSING: 422,
  ERR_PAYMENT_FAILED: 422,
  ERR_STATE_TRANSITION: 409,
  ERR_IDEMPOTENCY_CONFLICT: 409,
  ERR_CONCURRENT_CONFIRMATION: 409,
  ERR_COMPLIANCE_SUSPENDED: 422,
  ERR_DELINQUENCY_RESTRICTED: 422,
  ERR_INTERNAL: 500,
  ERR_VALIDATION: 400,
  ERR_UNAUTHENTICATED: 401,
  ERR_NOT_FOUND: 404,
  ERR_UNAVAILABLE: 503,
  ERR_PAYLOAD_TOO_LARGE: 413,
  ERR_UNSUPPORTED_MEDIA_TYPE: 415,
  ERR_RATE_LIMITED: 429,
};

/** Resposta no schema `Error` do OpenAPI, com a causa funcional em pt-BR (REQ-098). */
export function errorResponse(code: ErrorCode, correlationId: string): Response {
  return Response.json(
    { code, message: messages.errors[code], correlation_id: correlationId },
    { status: ERROR_STATUS[code] },
  );
}
