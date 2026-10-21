import {
  priorAttempt,
  type PriorAttempt,
  type PublicAttempt,
  type PublicAttemptClaim,
  type PublicHashScheme,
} from '../../application/public-idempotency';
import type { Database, DatabaseTransaction } from '../database/connection';

/** A chave sumiu entre a reserva recusada e a leitura — impossível com linhas só de inserção. */
export class PublicIdempotencyError extends Error {
  constructor(readonly surface: string) {
    super(`public idempotency key vanished after a conflicting claim (surface ${surface})`);
    this.name = 'PublicIdempotencyError';
  }
}

/**
 * Repetição ou conflito de uma chave já usada com sucesso; `null` se a chave nunca foi usada (ADR-0017). Registro com
 * esquema ou chave que a tentativa não sabe verificar → `PublicAttemptUnverifiableError` (ADR-0018).
 */
export async function findPublicAttempt(
  db: Database | DatabaseTransaction,
  attempt: PublicAttempt,
): Promise<PriorAttempt | null> {
  const row = await db
    .selectFrom('app.public_idempotency_key')
    .select(['request_hash', 'hash_scheme', 'hash_key_id'])
    .where('surface', '=', attempt.surface)
    .where('idempotency_key', '=', attempt.key)
    .executeTakeFirst();
  if (row === undefined) return null;
  return priorAttempt(
    {
      requestHash: row.request_hash,
      // O CHECK do banco garante o valor do enum.
      hashScheme: row.hash_scheme as PublicHashScheme,
      hashKeyId: row.hash_key_id,
    },
    attempt,
  );
}

/**
 * Reserva a chave dentro da transação do efeito de domínio (ADR-0017). `claimed`: a chave é nova — grave o efeito no
 * mesmo `tx`; um rollback libera a chave. Uma corrida com a mesma chave espera o índice único: confirmada a outra
 * transação, o `ON CONFLICT` não insere e a chave gravada decide repetição ou conflito.
 */
export async function claimPublicAttempt(
  tx: DatabaseTransaction,
  attempt: PublicAttempt,
  at: Date,
): Promise<PublicAttemptClaim> {
  const inserted = await tx
    .insertInto('app.public_idempotency_key')
    .values({
      surface: attempt.surface,
      idempotency_key: attempt.key,
      request_hash: attempt.requestHash,
      hash_scheme: attempt.hashScheme,
      hash_key_id: attempt.hashKeyId,
      created_at: at,
    })
    .onConflict((conflict) => conflict.columns(['surface', 'idempotency_key']).doNothing())
    .returning('surface')
    .executeTakeFirst();
  if (inserted !== undefined) return 'claimed';
  // READ COMMITTED: este novo comando já enxerga a linha confirmada que barrou a inserção.
  const prior = await findPublicAttempt(tx, attempt);
  if (prior === null) throw new PublicIdempotencyError(attempt.surface);
  return prior;
}
