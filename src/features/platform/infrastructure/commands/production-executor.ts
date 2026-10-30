import { createCommandExecutor, type CommandExecutor } from '../../application/commands/executor';
import type { CommandGuard } from '../../application/commands/ports';
import type { Clock } from '../../application/clock';
import type { LogPort } from '../../application/log';
import { getDatabase, type Database, type DatabaseTransaction } from '../database/connection';
import { loadRuntimeConfig, type EnvSource } from '../env';
import { systemClock } from '../system-clock';
import { createPostgresCommandStore } from './postgres-command-store';

export interface ProductionExecutorDependencies {
  readonly guard: CommandGuard;
  readonly log: LogPort;
  readonly source?: EnvSource;
  /** Banco da aplicação; padrão: `getDatabase(source)`. */
  readonly database?: Database;
  /** Relógio injetável (TECH-110); padrão: o do sistema. */
  readonly clock?: Clock;
}

/**
 * Executor de commands com as dependências de produção: banco da aplicação (ADR-0006), relógio do sistema e os limites
 * do runbook (TECH-001, sem default). Configuração ausente → erro que nomeia a chave.
 */
export function createProductionExecutor({
  guard,
  log,
  source,
  database,
  clock = systemClock,
}: ProductionExecutorDependencies): CommandExecutor<DatabaseTransaction> {
  const limits = loadRuntimeConfig(['COMMAND_MAX_ATTEMPTS', 'COMMAND_LOCK_TIMEOUT_MS'], source);
  return createCommandExecutor({
    store: createPostgresCommandStore(database ?? getDatabase(source)),
    guard,
    clock,
    limits: {
      maxAttempts: limits.COMMAND_MAX_ATTEMPTS,
      lockTimeoutMs: limits.COMMAND_LOCK_TIMEOUT_MS,
    },
    log,
  });
}
