import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CommandRejection, type CommandHandler, type RejectionCode } from '@/features/platform';
import {
  addCivilDays,
  longestStayThrough,
  MAX_STAY_NIGHTS,
  STAY_NEIGHBORHOOD_DAYS,
  stayNights,
} from '../domain/own-use-stay';

/** Evento da confirmação (AsyncAPI): só ids e datas, com a party que reservou fixada no COMMIT (REQ-097, D6). */
export const OWN_USE_BOOKING_CONFIRMED = 'booking.own_use_confirmed';

const civilDate = z.iso.date().refine((value) => value >= '0001-01-01');

export const createOwnUseBookingInput = z.strictObject({
  second_home_id: z.uuid(),
  checkin_date: civilDate,
  checkout_date: civilDate,
});
export type CreateOwnUseBookingInput = z.infer<typeof createOwnUseBookingInput>;

export type CreateOwnUseBookingResult = {
  readonly booking_id: string;
  readonly second_home_id: string;
  readonly checkin_date: string;
  readonly checkout_date: string;
  readonly nights: number;
  readonly confirmed_at: string;
  /** Noites consumidas por categoria (Co-Owner); `null` no Owner, que não consome Direito de Uso (REQ-037). */
  readonly consumed: {
    readonly alta: number;
    readonly media: number;
    readonly leap: number;
  } | null;
};

/**
 * A reserva está fechada no banco (`app.capability_activation` sem a linha): funcionalidade intencionalmente fechada até a
 * autorização do fundador depois da W13, não falha nem recusa funcional. Lançada dentro da transação — o executor desfaz
 * tudo sem gravar recusa — e tratada por quem chama (ADR-0026).
 */
export class OwnUseBookingNotActivatedError extends Error {
  constructor() {
    super('Own use booking is not activated');
    this.name = 'OwnUseBookingNotActivatedError';
  }
}

/** Holding vigente da party representada, revalidada e travada na transação (ADR-0021, ADR-0026). */
export interface Representation {
  readonly holdingId: string;
  readonly role: 'owner' | 'co_owner';
  readonly stakeId: string | null;
}

export interface SealedOwnUseNight {
  readonly stayDate: string;
  readonly exerciseYear: number;
  readonly season: 'alta' | 'media';
  readonly isLeapDay: boolean;
  readonly checkInAt: Date;
}

export type UseRightBucket = 'alta' | 'media' | 'leap';

export interface NightState {
  readonly stayDate: string;
  readonly custodyId: string;
  readonly holderKind: string;
  readonly basis: string | null;
  readonly stakeId: string | null;
  readonly occupied: boolean;
}

/** Fatos da formalização e do sorteio (superfície pública do ownership). */
export interface OwnUseFacts {
  readonly acquisitionId: string;
  readonly operationStartDate: string;
  readonly formalizedAt: Date;
  readonly timezone: string;
  readonly drawn: readonly { readonly stakeId: string; readonly position: number }[] | null;
}

export interface BookingStore<Tx> {
  isActivated(tx: Tx): Promise<boolean>;
  /** Delegação ativa travada em modo compartilhado + holding vigente da party na Second Home, no instante. */
  lockRepresentation(
    tx: Tx,
    input: { userId: string; partyId: string; secondHomeId: string; at: Date },
  ): Promise<Representation | null>;
  /** TECH-053 classe 4 (consultiva: `stake` não tem UPDATE para a aplicação). */
  lockStake(tx: Tx, stakeId: string): Promise<void>;
  /** TECH-053 classe 5, em ordem crescente (consultiva: `second_home_date` é imutável). */
  lockNights(tx: Tx, secondHomeId: string, stayDates: readonly string[]): Promise<void>;
  sealedNights(
    tx: Tx,
    secondHomeId: string,
    checkinDate: string,
    checkoutDate: string,
  ): Promise<readonly SealedOwnUseNight[]>;
  /** Noites com ocupação `own_use` ativa da Ação no intervalo `[from, to)`. */
  ownUseNights(tx: Tx, stakeId: string, from: string, to: string): Promise<readonly string[]>;
  insertBooking(
    tx: Tx,
    booking: {
      id: string;
      secondHomeId: string;
      holdingId: string;
      stakeId: string | null;
      checkinDate: string;
      checkoutDate: string;
      operationId: string;
    },
  ): Promise<Date>;
}

export interface OwnUseInventoryPort<Tx> {
  nightStates(
    tx: Tx,
    secondHomeId: string,
    stayDates: readonly string[],
  ): Promise<readonly NightState[]>;
  reserveRight(
    tx: Tx,
    transition: {
      secondHomeId: string;
      stayDate: string;
      parentCustodyId: string;
      stakeId: string;
      operationId: string;
    },
  ): Promise<string | null>;
  occupy(
    tx: Tx,
    occupancies: readonly {
      secondHomeId: string;
      stayDate: string;
      bookingId: string;
      custodyId: string;
      stakeId: string | null;
      operationId: string;
    }[],
  ): Promise<void>;
}

export interface OwnUseRightsPort<Tx> {
  remaining(
    tx: Tx,
    stakeId: string,
    keys: readonly { exerciseYear: number; bucket: UseRightBucket }[],
  ): Promise<ReadonlyMap<string, number>>;
  consume(
    tx: Tx,
    entry: {
      secondHomeId: string;
      acquisitionId: string;
      stakeId: string;
      stayDate: string;
      exerciseYear: number;
      bucket: UseRightBucket;
      operationId: string;
    },
  ): Promise<void>;
}

export interface CreateOwnUseBookingDependencies<Tx> {
  readonly store: BookingStore<Tx>;
  readonly inventory: OwnUseInventoryPort<Tx>;
  readonly rights: OwnUseRightsPort<Tx>;
  readonly findFacts: (tx: Tx, secondHomeId: string) => Promise<OwnUseFacts | null>;
  /** TECH-042: abertura da janela da Ação no exercício (`null` = sem janela). */
  readonly windowOpensAt: (
    facts: OwnUseFacts,
    stakeId: string,
    exerciseYear: number,
    isLeapDay: boolean,
  ) => Date | null;
  readonly newId?: () => string;
}

const bucketOf = (night: SealedOwnUseNight): UseRightBucket =>
  night.isLeapDay ? 'leap' : night.season;
const keyOf = (exerciseYear: number, bucket: UseRightBucket) => `${exerciseYear}:${bucket}`;
const reject = (code: RejectionCode) => new CommandRejection(code);

/** Consumo por exercício e bucket (validação noite a noite, REQ-034, EC-1, EC-4). */
function consumptionByBucket(nights: readonly SealedOwnUseNight[]) {
  const needed = new Map<
    string,
    { exerciseYear: number; bucket: UseRightBucket; nights: number }
  >();
  for (const night of nights) {
    const bucket = bucketOf(night);
    const key = keyOf(night.exerciseYear, bucket);
    const entry = needed.get(key) ?? { exerciseYear: night.exerciseYear, bucket, nights: 0 };
    needed.set(key, { ...entry, nights: entry.nights + 1 });
  }
  return [...needed.values()];
}

/**
 * Noites livres e elegíveis (TECH-021, TECH-023): noite ocupada → conflito com reserva confirmada (INV-1); custódia
 * diferente de `owner` (Owner) ou de `spe_pool` (Co-Owner) → capacidade indisponível. Uma `reserved_right` devolvida
 * fica fechada até a wave que produzir esse estado (D4).
 */
function assertNightsAvailable(
  states: readonly NightState[],
  nights: readonly string[],
  role: Representation['role'],
) {
  if (states.length !== nights.length) throw reject('ERR_CAPACITY_UNAVAILABLE');
  if (states.some((state) => state.occupied)) throw reject('ERR_BOOKING_CONFLICT');
  const root = role === 'owner' ? 'owner' : 'spe_pool';
  if (states.some((state) => state.holderKind !== root)) throw reject('ERR_CAPACITY_UNAVAILABLE');
}

/**
 * `create_own_use_booking` (REQ-034, REQ-035, REQ-037, PD-002, INV-1; TECH-023, TECH-043, TECH-045, TECH-051,
 * TECH-053, TECH-054; spec booking). Revalida tudo depois das travas, na ordem das recusas da spec; o banco confere de
 * novo cada escrita no próprio instante (ADR-0026). Co-Owner: `spe_pool → reserved_right` + consumo + ocupação, noite a
 * noite em ordem crescente. Owner: ocupação sobre `owner`, sem janela, rotação, saldo nem limite de permanência.
 */
export function createCreateOwnUseBookingHandler<Tx>(
  deps: CreateOwnUseBookingDependencies<Tx>,
): CommandHandler<CreateOwnUseBookingInput, CreateOwnUseBookingResult, Tx> {
  const newId = deps.newId ?? randomUUID;
  return {
    command: 'create_own_use_booking',
    input: createOwnUseBookingInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx, actor, now, operationId, locks } = context;
      const homeId = input.second_home_id;
      // A ativação vem primeiro e dentro da transação: o replay de uma chave já confirmada não chega aqui (ADR-0026).
      if (!(await deps.store.isActivated(tx))) throw new OwnUseBookingNotActivatedError();
      const nights = stayNights(input.checkin_date, input.checkout_date);
      if (nights.length < 1) throw reject('ERR_STAY_LENGTH');
      if (actor.kind !== 'user' || actor.actingPartyId === null) throw reject('ERR_PERMISSION');
      const representation = await deps.store.lockRepresentation(tx, {
        userId: actor.userId,
        partyId: actor.actingPartyId,
        secondHomeId: homeId,
        at: now,
      });
      if (representation === null) throw reject('ERR_PERMISSION');
      const stakeId = representation.stakeId;
      if (representation.role === 'co_owner' && nights.length > MAX_STAY_NIGHTS)
        throw reject('ERR_STAY_LENGTH');

      if (stakeId !== null) {
        for (const key of locks.claim('stake', [stakeId])) await deps.store.lockStake(tx, key);
      }
      const nightKeys = locks.claim(
        'second_home_date',
        nights.map((night) => [homeId, night] as const),
      );
      await deps.store.lockNights(
        tx,
        homeId,
        nightKeys.map(([, night]) => night),
      );

      const sealed = await deps.store.sealedNights(
        tx,
        homeId,
        input.checkin_date,
        input.checkout_date,
      );
      // TECH-043: noite futura = `now < checkin_at`; noite não selada não existe como capacidade (P-14, D3).
      if (sealed.length !== nights.length || sealed[0]!.checkInAt.getTime() <= now.getTime())
        throw reject('ERR_CAPACITY_UNAVAILABLE');
      assertNightsAvailable(
        await deps.inventory.nightStates(tx, homeId, nights),
        nights,
        representation.role,
      );

      let acquisitionId: string | null = null;
      let needed: ReturnType<typeof consumptionByBucket> = [];
      if (stakeId !== null) {
        const facts = await deps.findFacts(tx, homeId);
        if (facts === null) throw reject('ERR_CAPACITY_UNAVAILABLE');
        acquisitionId = facts.acquisitionId;
        const windows = new Map(
          sealed.map((night) => [`${night.exerciseYear}:${night.isLeapDay}`, night]),
        );
        for (const night of windows.values()) {
          const opensAt = deps.windowOpensAt(facts, stakeId, night.exerciseYear, night.isLeapDay);
          if (opensAt === null || opensAt.getTime() > now.getTime())
            throw reject('ERR_WINDOW_NOT_OPEN');
        }
        needed = consumptionByBucket(sealed);
        const remaining = await deps.rights.remaining(tx, stakeId, needed);
        if (
          needed.some(
            (entry) => (remaining.get(keyOf(entry.exerciseYear, entry.bucket)) ?? 0) < entry.nights,
          )
        )
          throw reject('ERR_USE_RIGHT_BALANCE');
        const neighbors = await deps.store.ownUseNights(
          tx,
          stakeId,
          addCivilDays(input.checkin_date, -STAY_NEIGHBORHOOD_DAYS),
          addCivilDays(input.checkout_date, STAY_NEIGHBORHOOD_DAYS),
        );
        if (longestStayThrough(neighbors, nights) > MAX_STAY_NIGHTS)
          throw reject('ERR_STAY_LENGTH');
      }

      const bookingId = newId();
      const confirmedAt = await deps.store.insertBooking(tx, {
        id: bookingId,
        secondHomeId: homeId,
        holdingId: representation.holdingId,
        stakeId,
        checkinDate: input.checkin_date,
        checkoutDate: input.checkout_date,
        operationId,
      });
      const states = await deps.inventory.nightStates(tx, homeId, nights);
      for (const night of sealed) {
        const state = states.find((candidate) => candidate.stayDate === night.stayDate)!;
        let custodyId = state.custodyId;
        if (stakeId !== null && acquisitionId !== null) {
          // TECH-053 classe 6: custódia e saldo da mesma noite, noite a noite em ordem crescente.
          const reserved = await deps.inventory.reserveRight(tx, {
            secondHomeId: homeId,
            stayDate: night.stayDate,
            parentCustodyId: state.custodyId,
            stakeId,
            operationId,
          });
          if (reserved === null) throw reject('ERR_BOOKING_CONFLICT');
          custodyId = reserved;
          await deps.rights.consume(tx, {
            secondHomeId: homeId,
            acquisitionId,
            stakeId,
            stayDate: night.stayDate,
            exerciseYear: night.exerciseYear,
            bucket: bucketOf(night),
            operationId,
          });
        }
        await deps.inventory.occupy(tx, [
          {
            secondHomeId: homeId,
            stayDate: night.stayDate,
            bookingId,
            custodyId,
            stakeId,
            operationId,
          },
        ]);
      }

      const consumed =
        stakeId === null
          ? null
          : {
              alta: sealed.filter((night) => bucketOf(night) === 'alta').length,
              media: sealed.filter((night) => bucketOf(night) === 'media').length,
              leap: sealed.filter((night) => bucketOf(night) === 'leap').length,
            };
      const result: CreateOwnUseBookingResult = {
        booking_id: bookingId,
        second_home_id: homeId,
        checkin_date: input.checkin_date,
        checkout_date: input.checkout_date,
        nights: nights.length,
        confirmed_at: confirmedAt.toISOString(),
        consumed,
      };
      context.emit({
        type: OWN_USE_BOOKING_CONFIRMED,
        dedupKey: `${OWN_USE_BOOKING_CONFIRMED}:${bookingId}`,
        payload: {
          booking_id: bookingId,
          second_home_id: homeId,
          recipient_party_id: actor.actingPartyId,
          checkin_date: input.checkin_date,
          checkout_date: input.checkout_date,
          nights: nights.length,
        },
      });
      context.audit({
        objectType: 'booking',
        objectId: bookingId,
        before: null,
        after: {
          channel: 'own_use',
          holding_id: representation.holdingId,
          stake_id: stakeId,
          checkin_date: input.checkin_date,
          checkout_date: input.checkout_date,
          nights: nights.length,
          consumed,
        },
      });
      return result;
    },
  };
}
