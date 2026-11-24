import { sql } from 'kysely';
import {
  getDatabase,
  withUserThenServerRead,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  bookingSection,
  displayState,
  type BookingSection,
  type DisplayState,
} from '../application/own-use-booking-sections';
import {
  cancellationPreview,
  type CancellationPreview,
  type PreviewBalance,
  type PreviewNight,
  type UseRightBucket,
} from '../application/own-use-cancellation-preview';
import {
  microsFromMillis,
  type BookingState,
  type CancellationClass,
  type ExceptionType,
  type Modality,
  type TransitionKind,
} from '../domain/own-use-lifecycle';

/**
 * Leituras do ciclo da reserva na Área do Titular (W13 E4b; spec booking §10.15). A RLS da W12 prova a reserva — só a
 * holding vigente que o usuário representa (TECH-052) — e, no mesmo instantâneo (`repeatable read`, só leitura), o
 * servidor lê os campos fora do `GRANT` de coluna: exceção aberta, classificação, instante do cancelamento e noites com
 * `checkin_at`. Retorno mínimo para a tela: nunca `incident_ref`, base registrada, autorização ou custódia.
 */
const LIFECYCLE_CAPABILITY = 'own_use_lifecycle';
const micros = (column: string) =>
  sql<string>`(extract(epoch FROM ${sql.ref(column)}) * 1000000)::bigint::text`;

export interface TitularBookingItem {
  readonly id: string;
  readonly label: string;
  readonly timezone: string;
  readonly modality: Modality;
  readonly channel: string;
  readonly state: BookingState;
  readonly display: DisplayState;
  readonly section: BookingSection;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly confirmedAt: Date;
}

export interface TitularBookingDetail extends TitularBookingItem {
  readonly secondHomeId: string;
  /** Party da holding vigente — o `party_id` do command do Titular. */
  readonly partyId: string;
  readonly exception: {
    readonly type: ExceptionType;
    readonly reason: string | null;
    readonly openedAt: Date;
  } | null;
  readonly cancellationClass: CancellationClass | null;
  readonly cancelledAt: Date | null;
  /** Operação do depósito Luxchange que cedeu a reserva (W20); `null` fora da cessão. */
  readonly depositOperationId: string | null;
  /** Noites liberadas pelo fechamento (cancelamento, no-show ou invalidação); 0 enquanto ativa. */
  readonly releasedNights: number;
  readonly nights: readonly PreviewNight[];
  readonly balances: readonly PreviewBalance[];
  readonly lifecycleOpen: boolean;
}

export interface TitularCancellation {
  readonly booking: TitularBookingDetail;
  readonly preview: CancellationPreview;
}

const modalityOf = (modality: string): Modality => (modality === 'owner' ? 'owner' : 'co_owner');
const bucketOf = (season: string, leap: boolean): UseRightBucket =>
  leap ? 'leap' : season === 'alta' ? 'alta' : 'media';

/** Reservas visíveis (RLS) e, no servidor, só o que separa seção e situação. */
async function visibleBookings(tx: DatabaseTransaction) {
  return tx
    .selectFrom('app.booking as b')
    .innerJoin('app.second_home as s', 's.id', 'b.second_home_id')
    .innerJoin('app.acquisition as a', 'a.second_home_id', 'b.second_home_id')
    .select([
      'b.id',
      's.label',
      's.timezone',
      'a.modality',
      'b.channel',
      'b.state',
      sql<string>`b.checkin_date::text`.as('checkinDate'),
      sql<string>`b.checkout_date::text`.as('checkoutDate'),
      'b.confirmed_at as confirmedAt',
    ])
    .orderBy('b.checkin_date', 'desc')
    .execute();
}

async function serverFacts(tx: DatabaseTransaction, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, ServerFacts>();
  const [rows, exceptions] = await Promise.all([
    tx
      .selectFrom('app.booking as b')
      .innerJoin('app.second_home_date as d', (join) =>
        join
          .onRef('d.second_home_id', '=', 'b.second_home_id')
          .onRef('d.stay_date', '=', 'b.checkin_date'),
      )
      .leftJoin('app.booking_state_transition as t', 't.id', 'b.last_transition_id')
      .select([
        'b.id',
        'b.cancellation_class',
        'd.checkin_at',
        't.kind as last_kind',
        't.operation_id as last_operation',
      ])
      .where('b.id', 'in', ids)
      .execute(),
    openExceptions(tx, ids),
  ]);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        cancellationClass: (row.cancellation_class as CancellationClass | null) ?? null,
        lastKind: (row.last_kind as TransitionKind | null) ?? null,
        lastOperationId: row.last_operation ?? null,
        firstCheckinAt: new Date(row.checkin_at),
        exception: exceptions.get(row.id) ?? null,
      },
    ]),
  );
}

interface ServerFacts {
  readonly cancellationClass: CancellationClass | null;
  readonly lastKind: TransitionKind | null;
  readonly lastOperationId: string | null;
  readonly firstCheckinAt: Date;
  readonly exception: TitularBookingDetail['exception'];
}

/** A única exceção aberta de cada reserva (ADR-0027 §2) — tipo, motivo e abertura; nunca a referência do incidente. */
async function openExceptions(tx: DatabaseTransaction, ids: readonly string[]) {
  const rows = await tx
    .selectFrom('app.booking_exception as x')
    .select(['x.booking_id', 'x.exception_type', 'x.reason', 'x.opened_at'])
    .where('x.booking_id', 'in', ids)
    .where(
      sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = x.id)`,
    )
    .execute();
  return new Map(
    rows.map((row) => [
      row.booking_id,
      {
        type: row.exception_type as ExceptionType,
        reason: row.reason,
        openedAt: new Date(row.opened_at),
      },
    ]),
  );
}

function item(
  row: Awaited<ReturnType<typeof visibleBookings>>[number],
  facts: ServerFacts,
  now: Date,
): TitularBookingItem {
  const state = row.state as BookingState;
  return {
    id: row.id,
    label: row.label,
    timezone: row.timezone,
    modality: modalityOf(row.modality),
    channel: row.channel,
    state,
    display: displayState(state, {
      exceptionType: facts.exception?.type ?? null,
      cancellationClass: facts.cancellationClass,
      lastKind: facts.lastKind,
    }),
    section: bookingSection(state, facts.firstCheckinAt, now),
    checkinDate: row.checkinDate,
    checkoutDate: row.checkoutDate,
    confirmedAt: new Date(row.confirmedAt),
  };
}

/** `/titular/reservas`: as reservas visíveis, com seção e situação gravada. */
export async function readTitularBookingList(
  userId: string,
  now: Date = new Date(),
  db: Database = getDatabase(),
): Promise<readonly TitularBookingItem[]> {
  const result = await withUserThenServerRead(
    db,
    { sub: userId, role: 'authenticated' },
    (tx) => visibleBookings(tx),
    async (tx, rows) => {
      const facts = await serverFacts(
        tx,
        rows.map((row) => row.id),
      );
      return rows.flatMap((row) => {
        const fact = facts.get(row.id);
        return fact === undefined ? [] : [item(row, fact, now)];
      });
    },
  );
  return result ?? [];
}

/** Detalhe: reserva provada pela RLS; o resto no servidor, no mesmo instantâneo. Outra reserva → `null` (404). */
export async function readTitularBooking(
  userId: string,
  bookingId: string,
  now: Date = new Date(),
  db: Database = getDatabase(),
): Promise<TitularBookingDetail | null> {
  return withUserThenServerRead(
    db,
    { sub: userId, role: 'authenticated' },
    async (tx) => (await visibleBookings(tx)).find((row) => row.id === bookingId) ?? null,
    (tx, row) => detail(tx, row, now),
  );
}

async function detail(
  tx: DatabaseTransaction,
  row: Awaited<ReturnType<typeof visibleBookings>>[number],
  now: Date,
): Promise<TitularBookingDetail> {
  const booking = await tx
    .selectFrom('app.booking as b')
    .innerJoin('app.holding as h', 'h.id', 'b.holding_id')
    .select([
      'b.second_home_id',
      'b.stake_id',
      'b.last_transition_id',
      'b.cancellation_class',
      'h.party_id',
    ])
    .where('b.id', '=', row.id)
    .executeTakeFirstOrThrow();
  const [facts, nights, balances, cancelledAt, activation, released] = await Promise.all([
    serverFacts(tx, [row.id]),
    tx
      .selectFrom('app.second_home_date')
      .select([
        sql<string>`stay_date::text`.as('stay_date'),
        'season',
        'is_leap_day',
        'exercise_year',
        micros('checkin_at').as('checkin_us'),
      ])
      .where('second_home_id', '=', booking.second_home_id)
      .where(
        sql<boolean>`stay_date >= ${row.checkinDate}::date AND stay_date < ${row.checkoutDate}::date`,
      )
      .orderBy('stay_date')
      .execute(),
    booking.stake_id === null
      ? Promise.resolve([])
      : tx
          .selectFrom('app.use_right_balance')
          .select(['exercise_year', 'bucket', 'granted', 'remaining'])
          .where('stake_id', '=', booking.stake_id)
          .execute(),
    row.state === 'cancelled' && booking.last_transition_id !== null
      ? tx
          .selectFrom('app.booking_state_transition')
          .select('recorded_at')
          .where('id', '=', booking.last_transition_id)
          .executeTakeFirst()
      : Promise.resolve(undefined),
    tx
      .selectFrom('app.capability_activation')
      .select('capability')
      .where('capability', '=', LIFECYCLE_CAPABILITY)
      .executeTakeFirst(),
    tx
      .selectFrom('app.date_occupancy')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('booking_id', '=', row.id)
      .where('released_at', 'is not', null)
      .executeTakeFirstOrThrow(),
  ]);
  const fact = facts.get(row.id)!;
  return {
    ...item(row, fact, now),
    secondHomeId: booking.second_home_id,
    partyId: booking.party_id,
    exception: fact.exception,
    cancellationClass: fact.cancellationClass,
    cancelledAt: cancelledAt === undefined ? null : new Date(cancelledAt.recorded_at),
    depositOperationId: fact.lastKind === 'cession' ? fact.lastOperationId : null,
    releasedNights: Number(released.n),
    nights: nights.map((night) => ({
      stayDate: night.stay_date,
      checkinAt: BigInt(night.checkin_us),
      bucket: bucketOf(night.season, night.is_leap_day === true),
      // Owner: noite sem exercício do Direito de Uso (categoria e exercício só valem no Co-Owner).
      exerciseYear: night.exercise_year ?? 0,
    })),
    balances: balances.map((balance) => ({
      bucket: balance.bucket as UseRightBucket,
      exerciseYear: balance.exercise_year,
      granted: Number(balance.granted),
      remaining: Number(balance.remaining),
    })),
    lifecycleOpen: activation !== undefined,
  };
}

/** `/titular/reservas/[id]/cancelamento`: o detalhe e a prévia no instante do servidor (mesma regra do command). */
export async function readTitularCancellation(
  userId: string,
  bookingId: string,
  now: Date = new Date(),
  db: Database = getDatabase(),
): Promise<TitularCancellation | null> {
  const booking = await readTitularBooking(userId, bookingId, now, db);
  if (booking === null) return null;
  return {
    booking,
    preview: cancellationPreview({
      modality: booking.modality,
      state: booking.state,
      exceptionType: booking.exception?.type ?? null,
      nights: booking.nights,
      balances: booking.balances,
      lifecycleOpen: booking.lifecycleOpen,
      at: microsFromMillis(now.getTime()),
    }),
  };
}
