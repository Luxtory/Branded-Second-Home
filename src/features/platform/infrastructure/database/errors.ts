// SQLSTATEs que o núcleo trata (https://www.postgresql.org/docs/17/errcodes-appendix.html).
const DEADLOCK_DETECTED = '40P01';
const LOCK_NOT_AVAILABLE = '55P03'; // lock_timeout esgotado
const INTEGRITY_CONSTRAINT_CLASS = '23';

function field(error: unknown, name: 'code' | 'constraint'): string | null {
  if (error === null || typeof error !== 'object' || !(name in error)) return null;
  const value = (error as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

/** Deadlock ou espera de lock esgotada: a transação pode ser refeita com a mesma chave (TECH-053). */
export function isTransientDatabaseError(error: unknown): boolean {
  const code = field(error, 'code');
  return code === DEADLOCK_DETECTED || code === LOCK_NOT_AVAILABLE;
}

/** Nome da constraint violada, se o erro for de integridade (classe 23). */
export function violatedConstraint(error: unknown): string | null {
  return field(error, 'code')?.startsWith(INTEGRITY_CONSTRAINT_CLASS)
    ? field(error, 'constraint')
    : null;
}

// Banco inalcançável ou recusando conexões: classe 08 (connection exception), desligamento ou partida (57P01–57P03),
// excesso de conexões (53300) e falhas de rede do driver no Node.
const CONNECTION_EXCEPTION_CLASS = '08';
const UNAVAILABLE_STATES: readonly string[] = ['57P01', '57P02', '57P03', '53300'];
const NETWORK_ERRORS: readonly string[] = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
];

/** O banco não pôde atender (rede, desligamento, conexões esgotadas): a escrita falha fechada com `503`. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const code = field(error, 'code');
  if (code === null) return false;
  return (
    code.startsWith(CONNECTION_EXCEPTION_CLASS) ||
    UNAVAILABLE_STATES.includes(code) ||
    NETWORK_ERRORS.includes(code)
  );
}
