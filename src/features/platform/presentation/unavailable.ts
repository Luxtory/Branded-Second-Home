import {
  DatabaseConfigError,
  DatabaseEnvironmentError,
} from '../infrastructure/database/connection';
import {
  ConfigurationMissingError,
  EnvironmentRestrictionError,
  EnvValidationError,
  ExternalServiceUnavailableError,
} from '../infrastructure/env';

/**
 * Configuração ausente ou inválida, ou serviço recusado no ambiente, bloqueia a função com erro explícito (TECH-001)
 * que nomeia só as chaves. `null` = outro erro, que segue como erro interno.
 */
export function unavailableKeys(error: unknown): readonly string[] | null {
  if (error instanceof ConfigurationMissingError) return error.missingKeys;
  if (error instanceof EnvValidationError) return error.invalidKeys;
  if (error instanceof DatabaseEnvironmentError) return ['VERCEL_ENV'];
  if (error instanceof EnvironmentRestrictionError) return ['VERCEL_ENV'];
  // URL presente porém malformada (ex.: sem `sslmode=verify-full`): configuração inválida, não erro interno.
  if (error instanceof DatabaseConfigError) return ['DATABASE_URL'];
  // Serviço externo fora (W7): o log nomeia o serviço, como nomeia as chaves.
  if (error instanceof ExternalServiceUnavailableError) return [error.service];
  return null;
}
