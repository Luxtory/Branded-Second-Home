import {
  claimPublicAttempt,
  findPublicAttempt,
  violatedConstraint,
  type Database,
} from '@/features/platform';
import type { InterestStore, InterestWrite, NewInterest } from '../application/ports';

/** Gatilho da migration que revalida, na inserção, a modalidade oferecida pela Edition (F2a). */
const MODALITY_OFFERED_CONSTRAINT = 'interest_modality_offered';

/**
 * Interesse com idempotência pública (ADR-0017), como `luxtory_app`: a reserva da chave e a inserção rodam numa só
 * transação `READ COMMITTED` — corrida com a mesma chave grava uma única linha; um rollback libera a chave.
 */
export function createPostgresInterestStore(db: Database): InterestStore {
  return {
    priorAttempt: (attempt) => findPublicAttempt(db, attempt),

    async register(interest: NewInterest, attempt): Promise<InterestWrite> {
      try {
        return await db.transaction().execute(async (tx) => {
          const claim = await claimPublicAttempt(tx, attempt, interest.createdAt);
          if (claim !== 'claimed') return claim;
          await tx
            .insertInto('app.interest')
            .values({
              id: interest.id,
              concept_id: interest.conceptId,
              edition_id: interest.editionId,
              modality: interest.modality,
              region: interest.region,
              approx_days: interest.approxDays,
              origin: interest.origin,
              partner_ref: interest.partnerRef,
              created_at: interest.createdAt,
            })
            .execute();
          return 'registered';
        });
      } catch (error) {
        if (violatedConstraint(error) === MODALITY_OFFERED_CONSTRAINT)
          return 'modality_not_offered';
        throw error;
      }
    },
  };
}
