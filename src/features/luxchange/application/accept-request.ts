import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  lockPayments,
  recordFeeSettlement,
  reverseLuxchangeFee,
  type BillingStore,
} from '@/features/billing';
import {
  isCreditQuantity,
  settleRequestCredits,
  type RequestAcceptanceCreditStore,
} from '@/features/credits';
import type { OwnUseCessionPort } from '@/features/booking';
import type { LuxchangeCessionInventory } from '@/features/inventory';
import {
  CapabilityNotActivatedError,
  CommandRejection,
  type CommandHandler,
} from '@/features/platform';
import type { RequestAcceptanceStore } from './request-acceptance-ports';
import { requestAcceptedEvent, requestClosedEvent } from './request-events';
import { LUXCHANGE_EXCHANGE_CAPABILITY, PAYMENTS_CAPABILITY } from './request-ports';
import { CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY } from './ports';

export const acceptRequestInput = z.strictObject({
  party_id: z.uuid(),
  request_id: z.uuid(),
  expected_credits: z.string().refine(isCreditQuantity),
});
export type AcceptRequestInput = z.infer<typeof acceptRequestInput>;

export type AcceptRequestResult = {
  readonly receipt: {
    readonly request_id: string;
    readonly state: 'accepted';
    readonly booking_id: string;
    readonly nights: readonly string[];
    readonly holder_lot: {
      readonly lot_id: string;
      readonly credits: string;
      readonly originated_at: string;
      readonly expires_at: string;
    };
  };
  /** Server-side only. Send only receipt to the holder and process refunds after a fresh commit. */
  readonly refund_ids: readonly string[];
};

export interface AcceptRequestDependencies<Tx> {
  readonly store: RequestAcceptanceStore<Tx>;
  readonly bookings: OwnUseCessionPort<Tx>;
  readonly inventory: LuxchangeCessionInventory<Tx>;
  readonly credits: RequestAcceptanceCreditStore<Tx>;
  readonly billing: BillingStore<Tx>;
}

/** ADR-0037 §§8–10, §14. Every fact is bound to the original Request and checked again by PostgreSQL. */
export function createAcceptRequestHandler<Tx>(
  deps: AcceptRequestDependencies<Tx>,
): CommandHandler<AcceptRequestInput, AcceptRequestResult, Tx> {
  const { store } = deps;
  return {
    command: 'accept_request',
    input: acceptRequestInput,
    scope: (input) => ({ type: 'party', id: input.party_id }),
    async execute(context) {
      const { tx, locks, actor, input, operationId } = context;
      const requestId = input.request_id.toLowerCase();
      if (actor.kind !== 'user' || actor.actingPartyId !== input.party_id)
        throw new CommandRejection('ERR_PERMISSION');

      const conflicts = await store.pendingConflicts(tx, requestId, input.party_id);
      if (conflicts === null) throw new CommandRejection('ERR_NOT_FOUND');
      const locked = await store.lockRequests(
        tx,
        locks.claim('luxchange_request', [requestId, ...conflicts]),
      );
      const request = locked.find((row) => row.id === requestId);
      if (request === undefined || request.holderPartyId !== input.party_id.toLowerCase())
        throw new CommandRejection('ERR_NOT_FOUND');
      if (
        !(await store.lockDelegation(tx, actor.userId, request.holderPartyId, context.now)) ||
        (await store.represents(tx, actor.userId, request.requesterPartyId, context.now))
      )
        throw new CommandRejection('ERR_PERMISSION');
      if (request.state !== 'pending')
        throw new CommandRejection(
          (await store.closedByCompetingAcceptance(tx, requestId))
            ? 'ERR_CONCURRENT_CONFIRMATION'
            : 'ERR_STATE_TRANSITION',
        );

      const holderCredits = input.expected_credits;
      const terms = await store.acceptanceTerms(tx, requestId, holderCredits);
      const capabilities = await store.capabilities(tx);
      if (!capabilities.credits) throw new CapabilityNotActivatedError(CREDITS_CAPABILITY);
      if (!capabilities.payments) throw new CapabilityNotActivatedError(PAYMENTS_CAPABILITY);
      if (!capabilities.exchange)
        throw new CapabilityNotActivatedError(LUXCHANGE_EXCHANGE_CAPABILITY);
      if (terms.complement !== '0' && !capabilities.deposit)
        throw new CapabilityNotActivatedError(LUXCHANGE_DEPOSIT_CAPABILITY);
      await context.requireEligibleMembership([request.holderPartyId, request.requesterPartyId]);

      const nights = await store.cessionNights(tx, requestId);
      const stakes = nights.flatMap((night) => (night.stakeId === null ? [] : [night.stakeId]));
      for (const stake of locks.claim('stake', stakes)) await store.lockStake(tx, stake);
      const nightKeys = nights.map((night) => [night.secondHomeId, night.stayDate] as const);
      for (const [home, date] of locks.claim('second_home_date', nightKeys))
        await store.lockNight(tx, home, date);
      await store.rescan(
        tx,
        requestId,
        locked.map((row) => row.id),
      );

      const bookingIds = locks.claim(
        'booking',
        nights.flatMap((night) => (night.bookingId === null ? [] : [night.bookingId])),
      );
      for (const id of bookingIds) await deps.bookings.lock(tx, id);
      locks.claim('balance_and_custody', nightKeys);
      if (
        !(await store.lockCustodies(
          tx,
          nights.map((night) => night.custodyId),
        ))
      )
        throw new CommandRejection('ERR_CAPACITY_UNAVAILABLE');
      const eligibility = await store.recordSnapshotAndRevalidate(tx, requestId, operationId);
      if (eligibility.reason === 'expired') throw new CommandRejection('ERR_STATE_TRANSITION');
      if (
        eligibility.reason === 'holder_membership' ||
        eligibility.reason === 'requester_membership'
      )
        throw new CommandRejection('ERR_MEMBERSHIP_INELIGIBLE');
      if (eligibility.reason !== null || !eligibility.capacityEligible)
        throw new CommandRejection('ERR_CAPACITY_UNAVAILABLE');
      if (!eligibility.noticeMet) throw new CommandRejection('ERR_MIN_NOTICE');
      if (!terms.holderCreditsMatch) throw new CommandRejection('ERR_REQUEST_TERMS_CHANGED');

      const bookings = await deps.bookings.find(tx, bookingIds);
      if (
        bookings.length !== bookingIds.length ||
        bookings.some((booking) => booking.state !== 'confirmed')
      )
        throw new CommandRejection('ERR_CAPACITY_UNAVAILABLE');
      const transitionId = await store.insertAcceptance(tx, requestId, operationId);
      for (const booking of bookings)
        await deps.bookings.cede(tx, { booking, id: randomUUID(), operationId });
      for (const night of nights) {
        if (
          night.bookingId !== null &&
          !(await deps.inventory.releaseCededOccupancy(tx, {
            bookingId: night.bookingId,
            stayDate: night.stayDate,
            operationId,
          }))
        )
          throw new Error('Missing occupancy on a ceded Request night');
        if (
          !(await deps.inventory.cedeNight(tx, {
            secondHomeId: night.secondHomeId,
            stayDate: night.stayDate,
            operationId,
            source:
              night.stakeId === null
                ? { kind: 'owner' }
                : { kind: 'reserved_right', stakeId: night.stakeId },
            request: {
              id: requestId,
              custodyId: night.custodyId,
              purpose: night.complement ? 'request_complement' : 'request_destination',
            },
          }))
        )
          throw new CommandRejection('ERR_CAPACITY_UNAVAILABLE');
      }

      const rivals = locked.filter((row) => row.id !== requestId && row.state === 'pending');
      const closings = [];
      for (const rival of rivals)
        closings.push({ rival, closing: await store.insertClosing(tx, rival.id, operationId) });
      // Destination occupancies take a class 6 lock on the successor custody. Complete them before the ledger.
      const bookingId = await store.openDestination(tx, requestId, operationId);
      const holderLot = await deps.credits.insertLot(tx, {
        operationId,
        partyId: request.holderPartyId,
        quantity: holderCredits,
      });
      const complementLot =
        terms.complement === '0'
          ? null
          : await deps.credits.insertLot(tx, {
              operationId,
              partyId: request.requesterPartyId,
              quantity: terms.complement,
            });
      const ledger = { tx, locks, operationId };
      const released = await settleRequestCredits(
        ledger,
        deps.credits,
        { operationId: request.operationId, guarantee: request.guaranteeCredits },
        rivals.map((row) => ({ operationId: row.operationId, guarantee: row.guaranteeCredits })),
        complementLot === null ? null : { lotId: complementLot.lotId, quantity: terms.consumption },
      );

      const billing = { store: deps.billing };
      await lockPayments(ledger, billing, [
        request.paymentId,
        ...rivals.map((row) => row.paymentId),
      ]);
      const { settlementId } = await recordFeeSettlement(ledger, billing, {
        feeChargeId: request.feeChargeId,
      });
      const refundIds: string[] = [];
      for (const { rival, closing } of closings) {
        const { refundId } = await reverseLuxchangeFee(ledger, billing, {
          feeChargeId: rival.feeChargeId,
        });
        refundIds.push(refundId);
        const guaranteeReleased = released.get(rival.operationId) ?? '0';
        context.emit(
          requestClosedEvent({
            request_id: rival.id,
            requester_party_id: rival.requesterPartyId,
            holder_party_id: rival.holderPartyId,
            second_home_id: rival.secondHomeId,
            checkin: rival.checkin,
            checkout: rival.checkout,
            state: closing.state,
            reason: closing.reason,
            guarantee_released: guaranteeReleased,
            closed_at: closing.closedAt,
          }),
        );
        context.audit({
          objectType: 'luxchange_request',
          objectId: rival.id,
          before: { state: rival.state },
          after: {
            act: 'close_request',
            state: closing.state,
            reason: closing.reason,
            winning_request_id: requestId,
            transition_id: closing.transitionId,
            guarantee_released: guaranteeReleased,
            refund_id: refundId,
          },
        });
      }
      context.emit(
        requestAcceptedEvent({
          request_id: requestId,
          requester_party_id: request.requesterPartyId,
          holder_party_id: request.holderPartyId,
          second_home_id: request.secondHomeId,
          booking_id: bookingId,
          checkin: request.checkin,
          checkout: request.checkout,
          credits_required: terms.required,
          guarantee_credits: request.guaranteeCredits,
          complement_credits: terms.complement,
          complement_consumption: terms.consumption,
          complement_excess: terms.excess,
          holder_credits: holderCredits,
          holder_credit_expires_at: holderLot.expiresAt,
          ...(complementLot === null || terms.excess === '0'
            ? {}
            : { complement_credit_expires_at: complementLot.expiresAt }),
        }),
      );
      context.audit({
        objectType: 'luxchange_request',
        objectId: requestId,
        before: { state: request.state },
        after: {
          act: 'accept_request',
          state: 'accepted',
          transition_id: transitionId,
          booking_id: bookingId,
          holder_lot_id: holderLot.lotId,
          settlement_id: settlementId,
        },
      });
      return {
        receipt: {
          request_id: requestId,
          state: 'accepted',
          booking_id: bookingId,
          nights: nights.filter((night) => !night.complement).map((night) => night.stayDate),
          holder_lot: {
            lot_id: holderLot.lotId,
            credits: holderCredits,
            originated_at: holderLot.originatedAt,
            expires_at: holderLot.expiresAt,
          },
        },
        refund_ids: refundIds,
      };
    },
  };
}
