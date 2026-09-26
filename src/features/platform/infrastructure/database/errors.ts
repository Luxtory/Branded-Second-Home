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
