import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import type { BookingState } from '../domain/own-use-lifecycle';
import { bookingTarget } from './lifecycle-inputs';
import { nowMicros, reject } from './own-use-closing';
import type { BookingLifecycleStore } from './own-use-lifecycle-ports';

export const nominateGuestInput = z.strictObject({
  ...bookingTarget,
  /** Versão de `guest_rules` exibida ao Titular e aceita por ele (D4). */
  guest_rules_id: z.uuid(),
});

export type NominateGuestInput = z.infer<typeof nominateGuestInput>;

export type NominateGuestResult = {
  readonly nomination_id: string;
  readonly booking_id: string;
  readonly guest_rules_id: string;
};

export interface GuestNominationStore<Tx> {
  /** Trava compartilhada do escopo das regras (`app.parameter:guest_rules:<Second Home>`); a publicação toma a exclusiva. */
  lockRulesShared(tx: Tx, secondHomeId: string): Promise<void>;
  /** Id da versão de `guest_rules` vigente no instante, ou `null` (parâmetro ausente). */
  rulesInForce(tx: Tx, secondHomeId: string, at: Date): Promise<string | null>;
  declared(tx: Tx, bookingId: string, rulesId: string): Promise<boolean>;
  insert(
    tx: Tx,
    draft: {
      readonly id: string;
      readonly bookingId: string;
      readonly secondHomeId: string;
      readonly rulesId: string;
      readonly partyId: string;
      readonly operationId: string;
    },
  ): Promise<void>;
}

export interface NominateGuestDependencies<Tx> {
  readonly store: Pick<
    BookingLifecycleStore<Tx>,
    'findBooking' | 'lockRepresentation' | 'lockBooking' | 'period'
  >;
  readonly nominations: GuestNominationStore<Tx>;
}

const DECLARABLE: readonly BookingState[] = ['confirmed', 'in_use'];

/**
 * `nominate_guest` (REQ-092; BR-330 a BR-332; TECH-051; ADR-0030 §4; spec booking §11): o Titular declara que
 * convidados poderão usar a própria reserva sob a versão vigente de `guest_rules`. Só a declaração e a versão aceita
 * (P-6): sem dado, identificação ou quantidade de convidados; sem efeito sobre Direito de Uso, custódia, ocupação ou
 * valores. Travas: representação → reserva → regras (compartilhada). O banco revalida tudo no gatilho.
 */
export function createNominateGuestHandler<Tx>(
  deps: NominateGuestDependencies<Tx>,
): CommandHandler<NominateGuestInput, NominateGuestResult, Tx> {
  return {
    command: 'nominate_guest',
    input: nominateGuestInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { actor, input, tx, locks } = context;
      if (actor.kind !== 'user' || actor.actingPartyId === null) throw reject('ERR_PERMISSION');
      const representation = await deps.store.lockRepresentation(tx, {
        userId: actor.userId,
        partyId: actor.actingPartyId,
        secondHomeId: input.second_home_id,
        at: context.now,
      });
      const target = await deps.store.findBooking(tx, input.booking_id);
      if (
        representation === null ||
        target === null ||
        target.secondHomeId !== input.second_home_id ||
        target.holdingId !== representation.holdingId
      )
        throw reject('ERR_PERMISSION');
      for (const key of locks.claim('booking', [target.id])) await deps.store.lockBooking(tx, key);
      for (const [, home] of locks.claim('parameter', [
        ['guest_rules', target.secondHomeId] as const,
      ]))
        await deps.nominations.lockRulesShared(tx, home);
      const booking = await deps.store.findBooking(tx, target.id);
      if (booking === null || !DECLARABLE.includes(booking.state))
        throw reject('ERR_STATE_TRANSITION');
      const period = await deps.store.period(tx, booking.id);
      if (nowMicros(context) >= period.checkoutAt) throw reject('ERR_STATE_TRANSITION');
      const rules = await deps.nominations.rulesInForce(tx, booking.secondHomeId, context.now);
      if (rules === null) throw reject('ERR_PARAMETER_MISSING');
      if (rules !== input.guest_rules_id) throw reject('ERR_GUEST_RULES_CHANGED');
      if (await deps.nominations.declared(tx, booking.id, rules))
        throw reject('ERR_STATE_TRANSITION');
      const id = randomUUID();
      await deps.nominations.insert(tx, {
        id,
        bookingId: booking.id,
        secondHomeId: booking.secondHomeId,
        rulesId: rules,
        partyId: actor.actingPartyId,
        operationId: context.operationId,
      });
      context.audit({
        objectType: 'guest_nomination',
        objectId: id,
        before: null,
        after: { booking_id: booking.id, guest_rules_id: rules, party_id: actor.actingPartyId },
      });
      return { nomination_id: id, booking_id: booking.id, guest_rules_id: rules };
    },
  };
}
