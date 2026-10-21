// Superfície pública do módulo platform (TECH-011) para os outros slices. O shell (`src/app/`) importa os
// módulos de `presentation/` diretamente.
export type { Clock } from './application/clock';
export type { LogPort } from './application/log';
export { systemClock } from './infrastructure/system-clock';
export {
  loadEnv,
  loadRuntimeConfig,
  ConfigurationMissingError,
  EnvironmentRestrictionError,
  EnvValidationError,
  type Env,
  type EnvSource,
} from './infrastructure/env';
export { createLogger, rootLogger, type Logger, type LogFields } from './infrastructure/logger';
export { withRoute, type RouteContext } from './presentation/route';
export { CORRELATION_HEADER, resolveCorrelationId } from './presentation/correlation';

// W1 — núcleo de commands (TECH-054), erros (TECH-056), outbox (TECH-091) e banco (ADR-0006).
export type { JsonObject, JsonValue } from './domain/json';
export { CommandRejection, ERROR_CODES, type ErrorCode, type RejectionCode } from './domain/errors';
export {
  LockSequence,
  LockOrderViolation,
  type LockClass,
  type LockKey,
} from './domain/lock-order';
export type { Actor, UserRole } from './application/commands/actor';
export type {
  AuditRecord,
  AuthorizationDecision,
  CommandGuard,
  CommandScope,
  OutboxEventDraft,
} from './application/commands/ports';
export {
  commandRegistry,
  CommandRegistry,
  type Authority,
  type CommandSpec,
  type Module,
} from './application/commands/registry';
export {
  createCommandExecutor,
  type CommandContext,
  type CommandExecutor,
  type CommandHandler,
  type CommandOutcome,
  type CommandRequest,
} from './application/commands/executor';
export type { OutboxConsumer, OutboxEvent } from './application/outbox/consumers';
export type { JobName } from './application/jobs/names';
export {
  getDatabase,
  type Database,
  type DatabaseTransaction,
} from './infrastructure/database/connection';
export type { DB as DatabaseTables } from './infrastructure/database/schema';
export { createPostgresCommandStore } from './infrastructure/commands/postgres-command-store';
export { recordNotification } from './infrastructure/notifications/notification-repository';
export { errorResponse } from './presentation/errors';
export { scheduleOutboxDispatch } from './presentation/outbox-dispatch';

// W2 — acesso administrativo: executor de produção, leitura sob RLS, auditoria de leitura, CSRF e respostas HTTP.
export { createProductionExecutor } from './infrastructure/commands/production-executor';
export { withUserRead, type VerifiedClaims } from './infrastructure/database/user-read';
export { withPublicRead } from './infrastructure/database/public-read';
export { recordAdminRead, type AdminReadRecord } from './infrastructure/audit/admin-read';
export { isSameOrigin } from './presentation/origin';
export {
  commandResponse,
  dispatchOutboxAfterCommit,
  idempotencyKey,
} from './presentation/commands';
export { unavailableKeys } from './presentation/unavailable';
export {
  isBrandPartnersSiteOpen,
  isInterestWriteOpen,
  isPublicSiteOpen,
} from './presentation/public-site';

// BP1 — escritas públicas sem conta (TECH-057): limitador distribuído (ADR-0004) e borda HTTP.
export {
  RateLimiterUnavailableError,
  type RateLimitDecision,
  type RateLimiter,
  type RateLimitPolicies,
  type RateLimitPolicy,
} from './application/rate-limit';
export { createUpstashRateLimiter } from './infrastructure/rate-limit/upstash-rate-limiter';
export { createMemoryRateLimiter } from './infrastructure/rate-limit/memory-rate-limiter';
export { pseudonymizeNetwork } from './infrastructure/rate-limit/network-key';
export {
  BODY_NOT_TEXT,
  BODY_TOO_LARGE,
  hasAllowedOrigin,
  isJsonRequest,
  readBoundedText,
  trustedClientAddress,
} from './presentation/public-request';

// W5 — idempotência de mutações públicas não críticas (ADR-0017), fora do pipeline de commands críticos.
// W6 — hash chaveado com esquema por registro (ADR-0018).
export {
  isPublicIdempotencyKey,
  keyedPublicAttempt,
  priorAttempt,
  publicAttempt,
  PublicAttemptUnverifiableError,
  type PriorAttempt,
  type PublicAttempt,
  type PublicAttemptClaim,
  type PublicHashKey,
  type PublicHashScheme,
  type StoredPublicHash,
} from './application/public-idempotency';
export {
  claimPublicAttempt,
  findPublicAttempt,
  PublicIdempotencyError,
} from './infrastructure/idempotency/public-idempotency';
export { isDatabaseUnavailable, violatedConstraint } from './infrastructure/database/errors';
