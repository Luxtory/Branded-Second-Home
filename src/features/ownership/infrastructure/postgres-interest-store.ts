import { claimPublicAttempt, findPublicAttempt, type Database } from '@/features/platform';
import type { InterestStore, InterestWrite, NewInterest } from '../application/ports';

/**
 * Interesse com idempotência pública (ADR-0017), como `luxtory_app`: a reserva da chave e a inserção rodam numa só
 * transação `READ COMMITTED` — corrida com a mesma chave grava uma única linha; um rollback libera a chave.
 */
export function createPostgresInterestStore(db: Database): InterestStore {
  return {
    priorAttempt: (attempt) => findPublicAttempt(db, attempt),

    register: (interest: NewInterest, attempt): Promise<InterestWrite> =>
      db.transaction().execute(async (tx) => {
        const claim = await claimPublicAttempt(tx, attempt, interest.createdAt);
        if (claim !== 'claimed') return claim;
        await tx
          .insertInto('app.interest')
          .values({
            id: interest.id,
            home_edition_id: interest.homeEditionId,
            modality: interest.modality,
            desired_location: interest.desiredLocation,
            approx_days: interest.approxDays,
            origin: interest.origin,
            partner_ref: interest.partnerRef,
            created_at: interest.createdAt,
          })
          .execute();
        return 'registered';
      }),
  };
}
