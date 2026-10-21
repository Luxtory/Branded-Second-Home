import { lockPublicHomeEdition } from '@/features/catalog';
import {
  claimPublicAttempt,
  findPublicAttempt,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import type { InterestStore, InterestWrite, NewInterest } from '../application/ports';

/** A Home Edition saiu do público entre a checagem e a gravação: desfaz a transação inteira, inclusive a chave. */
class HomeEditionNotPublicError extends Error {
  constructor() {
    super('home edition is no longer public; the interest transaction was rolled back');
    this.name = 'HomeEditionNotPublicError';
  }
}

async function insertRequest(tx: DatabaseTransaction, request: NewInterest): Promise<void> {
  const { id, createdAt, interest, contact, qualification } = request;
  await tx
    .insertInto('app.interest')
    .values({
      id,
      home_edition_id: interest.homeEditionId,
      modality: interest.modality,
      desired_location: interest.desiredLocation,
      approx_days: interest.approxDays,
      origin: interest.origin,
      partner_ref: interest.partnerRef,
      created_at: createdAt,
    })
    .execute();
  await tx
    .insertInto('app.interest_contact')
    .values({
      interest_id: id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      created_at: createdAt,
    })
    .execute();
  await tx
    .insertInto('app.interest_qualification')
    .values({
      interest_id: id,
      qualification_version: qualification.version,
      available_to_start_band: qualification.availableToStartBand,
      reference_fit: qualification.referenceFit,
      presented_projected_investment_id: qualification.presentedProjectedInvestmentId,
      decision_unit: qualification.decisionUnit,
      decision_horizon: qualification.decisionHorizon,
      created_at: createdAt,
    })
    .execute();
}

/**
 * Solicitação de conversa com idempotência pública (ADR-0017, ADR-0018), como `luxtory_app`, numa só transação
 * `READ COMMITTED`: reserva da chave → revalidação da Home Edition pública com trava de leitura (`02` §15, item 15) →
 * interesse, contato e pré-qualificação. Corrida com a mesma chave grava uma única solicitação; Home Edition fora do
 * público ou qualquer falha desfaz tudo, inclusive a chave.
 */
export function createPostgresInterestStore(db: Database): InterestStore {
  return {
    priorAttempt: (attempt) => findPublicAttempt(db, attempt),

    async register(request, attempt): Promise<InterestWrite> {
      try {
        return await db.transaction().execute(async (tx) => {
          const claim = await claimPublicAttempt(tx, attempt, request.createdAt);
          if (claim !== 'claimed') return claim;
          const target = await lockPublicHomeEdition(tx, request.interest.homeEditionId);
          if (target === null) throw new HomeEditionNotPublicError();
          await insertRequest(tx, request);
          return 'registered';
        });
      } catch (error) {
        if (error instanceof HomeEditionNotPublicError) return 'not_found';
        throw error;
      }
    },
  };
}
