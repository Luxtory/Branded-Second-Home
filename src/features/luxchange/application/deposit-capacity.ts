import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CedableBooking, OwnUseCessionPort } from '@/features/booking';
import {
  isCreditQuantity,
  originateCreditLot,
  type CreditStore,
  type SnapshotRecorder,
} from '@/features/credits';
import type { LuxchangeCessionInventory } from '@/features/inventory';
import {
  CapabilityNotActivatedError,
  CommandRejection,
  type CommandHandler,
  type RejectionCode,
} from '@/features/platform';
import { creditsForPrl, resolveEconomicTerms, type EconomicTermsStore } from '@/features/pricing';
import { bookingNights, evaluateDeposit, sameCredits } from '../domain/deposit';
import { creditsOriginatedEvent } from './deposit-events';
import { CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY, type DepositStore } from './ports';

/** Limite de noites de um depósito: o mesmo do PRL (TECH-033; ADR-0032 §1). */
export const MAX_DEPOSIT_NIGHTS = 366;
/** Validade revisada: meses inteiros, limite técnico (o valor vem do parâmetro publicado). */
const MAX_VALIDITY_MONTHS = 1200;

const ascending = (dates: readonly string[]) =>
  dates.every((date, index) => index === 0 || dates[index - 1]! < date);

export const depositCapacityInput = z.strictObject({
  second_home_id: z.uuid(),
  /** Datas civis distintas, em ordem crescente, consecutivas ou não (ADR-0036 §2, §4). */
  nights: z.array(z.iso.date()).min(1).max(MAX_DEPOSIT_NIGHTS).refine(ascending),
  /** Termos revisados pelo Titular (ADR-0036 §8): conferidos com o recálculo no instante transacional. */
  expected_credits: z.string().refine(isCreditQuantity),
  expected_validity_months: z.number().int().min(1).max(MAX_VALIDITY_MONTHS),
});
export type DepositCapacityInput = z.infer<typeof depositCapacityInput>;

export type DepositCapacityResult = {
  readonly operation_id: string;
  readonly lot_id: string;
  readonly second_home_id: string;
  readonly nights: readonly string[];
  readonly credits: string;
  readonly validity_months: number;
  readonly originated_at: string;
  readonly expires_at: string;
  readonly ceded_bookings: readonly string[];
};

export interface DepositDependencies<Tx> {
  readonly store: DepositStore<Tx>;
  readonly bookings: OwnUseCessionPort<Tx>;
  readonly inventory: LuxchangeCessionInventory<Tx>;
  readonly terms: EconomicTermsStore<Tx>;
  readonly credits: CreditStore<Tx>;
  readonly snapshots: SnapshotRecorder<Tx>;
  readonly newId?: () => string;
}

/** Escrita aceita pelo banco que não encontrou o estado travado e conferido: bug, nunca recusa funcional. */
export class DepositWriteError extends Error {
  constructor(what: string) {
    super(`Deposit write found no active row: ${what}`);
    this.name = 'DepositWriteError';
  }
}

const reject = (code: RejectionCode) => new CommandRejection(code);

/**
 * `deposit_capacity` (REQ-051, REQ-060; BR-151, BR-200–BR-203; TECH-022, TECH-023, TECH-043, TECH-051, TECH-053,
 * TECH-054; ADR-0036): o Titular cede capacidade elegível ao Inventário Luxtory e recebe Créditos = Σ PRL das noites ×
 * multiplicador, no mesmo commit. Ordem: K6/K4 → Membership (classe 3) → representação → Ação (4) → noites (5) → reservas
 * → parâmetros e PRL (instante único) → termos revisados → snapshot + lote → cessão das reservas → liberações `ceded` →
 * custódias → outbox → auditoria. O banco confere cada escrita e a completude no COMMIT; aqui as recusas saem cedo e na
 * ordem do REQ-098. Sem Fee, sem restituição do Direito de Uso.
 */
export function createDepositCapacityHandler<Tx>(
  deps: DepositDependencies<Tx>,
): CommandHandler<DepositCapacityInput, DepositCapacityResult, Tx> {
  const newId = deps.newId ?? randomUUID;
  return {
    command: 'deposit_capacity',
    input: depositCapacityInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx, locks, actor, operationId } = context;
      const capabilities = await deps.store.capabilities(tx);
      if (!capabilities.deposit)
        throw new CapabilityNotActivatedError(LUXCHANGE_DEPOSIT_CAPABILITY);
      if (!capabilities.credits) throw new CapabilityNotActivatedError(CREDITS_CAPABILITY);
      if (actor.kind !== 'user' || actor.actingPartyId === null) throw reject('ERR_PERMISSION');
      const partyId = actor.actingPartyId;
      await context.requireEligibleMembership([partyId]);
      const holding = await deps.store.lockRepresentation(tx, {
        userId: actor.userId,
        partyId,
        secondHomeId: input.second_home_id,
        at: context.now,
      });
      if (holding === null) throw reject('ERR_PERMISSION');

      if (holding.stakeId !== null)
        for (const key of locks.claim('stake', [holding.stakeId]))
          await deps.store.lockStake(tx, key);
      const nightKeys = locks.claim(
        'second_home_date',
        input.nights.map((night) => [input.second_home_id, night] as const),
      );
      await deps.store.lockNights(
        tx,
        input.second_home_id,
        nightKeys.map(([, night]) => night),
      );
      const facts = await deps.store.nightFacts(tx, input.second_home_id, input.nights);
      // Co-Owner: as reservas das noites, travadas e relidas depois das travas (READ COMMITTED).
      const touched =
        holding.modality === 'co_owner'
          ? facts.flatMap((night) => (night.occupancy === null ? [] : [night.occupancy.bookingId]))
          : [];
      const bookingKeys = locks.claim('booking', touched);
      for (const key of bookingKeys) await deps.bookings.lock(tx, key);
      const bookings = await deps.bookings.find(tx, bookingKeys);
      const verdict = evaluateDeposit({
        holding,
        selected: input.nights,
        nights: facts,
        bookings,
        nowMs: Date.parse(await deps.store.databaseInstant(tx)),
      });
      if (!verdict.ok) throw reject(verdict.code);

      const terms = await resolveEconomicTerms(tx, locks, deps.terms, {
        parameters: ['credit_multiplier', 'credit_validity_months'],
        nights: { secondHomeId: input.second_home_id, dates: input.nights },
      });
      const credits = creditsForPrl(
        BigInt(terms.prlTotal!.amountMinor),
        terms.prlTotal!.currency,
        terms.parameters.credit_multiplier!.value,
      );
      const validityMonths = Number(terms.parameters.credit_validity_months!.value);
      if (
        !sameCredits(credits, input.expected_credits) ||
        validityMonths !== input.expected_validity_months
      )
        throw reject('ERR_DEPOSIT_TERMS_CHANGED');

      const lot = await originateCreditLot(
        { tx, locks, operationId },
        { store: deps.credits, snapshots: deps.snapshots },
        { partyId, quantity: credits, terms },
      );
      const ceded = await cedeBookings(deps, tx, verdict.bookings, operationId, newId);
      for (const stayDate of input.nights) {
        const moved = await deps.inventory.cedeNight(tx, {
          secondHomeId: input.second_home_id,
          stayDate,
          source:
            holding.stakeId === null
              ? { kind: 'owner' }
              : { kind: 'reserved_right', stakeId: holding.stakeId },
          operationId,
        });
        if (!moved) throw new DepositWriteError(`custody on ${stayDate}`);
      }

      context.emit(
        creditsOriginatedEvent({
          lot_id: lot.lotId,
          recipient_party_id: partyId,
          second_home_id: input.second_home_id,
          nights: input.nights.length,
          first_night: input.nights[0]!,
          last_night: input.nights.at(-1)!,
          credits: lot.quantity,
          expires_at: lot.expiresAt,
        }),
      );
      context.audit({
        objectType: 'credit_lot',
        objectId: lot.lotId,
        before: null,
        after: {
          act: 'deposit_capacity',
          second_home_id: input.second_home_id,
          holding_id: holding.id,
          nights: [...input.nights],
          credits: lot.quantity,
          prl_versions: terms.nights.map((night) => night.prlId),
          credit_multiplier_version: terms.parameters.credit_multiplier!.parameterId,
          credit_validity_version: terms.parameters.credit_validity_months!.parameterId,
          resolved_at: terms.resolvedAt,
          ceded_bookings: ceded,
        },
      });
      return {
        operation_id: operationId,
        lot_id: lot.lotId,
        second_home_id: input.second_home_id,
        nights: [...input.nights],
        credits: lot.quantity,
        validity_months: validityMonths,
        originated_at: lot.originatedAt,
        expires_at: lot.expiresAt,
        ceded_bookings: ceded,
      };
    },
  };
}

/** Cessão de cada reserva Co-Owner (ordem de id) e liberação `ceded` de todas as suas noites (ADR-0036 §1–§2). */
async function cedeBookings<Tx>(
  deps: DepositDependencies<Tx>,
  tx: Tx,
  bookings: readonly CedableBooking[],
  operationId: string,
  newId: () => string,
): Promise<string[]> {
  for (const booking of bookings) {
    await deps.bookings.cede(tx, { booking, id: newId(), operationId });
    for (const stayDate of bookingNights(booking)) {
      const released = await deps.inventory.releaseCededOccupancy(tx, {
        bookingId: booking.id,
        stayDate,
        operationId,
      });
      if (!released) throw new DepositWriteError(`occupancy of ${booking.id} on ${stayDate}`);
    }
  }
  return bookings.map((booking) => booking.id);
}
