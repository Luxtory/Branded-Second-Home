// Superfície pública do módulo platform (TECH-011) para os outros slices. O shell (`src/app/`) importa os
// módulos de `presentation/` diretamente.
export type { Clock } from './application/clock';
export { systemClock } from './infrastructure/system-clock';
export { loadEnv, EnvValidationError, type Env, type EnvSource } from './infrastructure/env';
export { createLogger, rootLogger, type Logger, type LogFields } from './infrastructure/logger';
export { withRoute, type RouteContext } from './presentation/route';
export { CORRELATION_HEADER } from './presentation/correlation';

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
  OutboxEventDraft,
} from './application/commands/ports';
export { commandRegistry, type CommandSpec, type Module } from './application/commands/registry';
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
export { createPostgresCommandStore } from './infrastructure/commands/postgres-command-store';
export { recordNotification } from './infrastructure/notifications/notification-repository';
export { errorResponse } from './presentation/errors';
export { scheduleOutboxDispatch } from './presentation/outbox-dispatch';
