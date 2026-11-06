import { sql } from 'kysely';
import type { ExercisedAdminSession } from '@/features/admin';
import {
  getDatabase,
  recordAdminRead,
  systemClock,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  adminActAvailability,
  requestablePurposes,
  type ActAvailability,
  type AdminFacts,
} from '../application/own-use-admin-availability';
import type { AuthorizationPurpose } from '../application/own-use-lifecycle-ports';
import {
  isoFromMicros,
  type BookingState,
  type CancellationClass,
  type ExceptionType,
  type Modality,
} from '../domain/own-use-lifecycle';
import { createPostgresBookingLifecycleStore } from '../infrastructure/postgres-booking-lifecycle-store';

/**
 * Leituras do Admin do ciclo da reserva (W13 E4b; spec booking §10.9, §10.15): auditadas (`admin_read`, só ids — TECH-092)
 * na mesma transação das leituras, com o papel exercido explícito. Reaproveitam as consultas do store da E2 (reserva,
 * período, exceção aberta, fatos da solicitação, autorização viva) — a mesma regra que os commands usam.
 */
const store = createPostgresBookingLifecycleStore();
const LIFECYCLE_CAPABILITY = 'own_use_lifecycle';
const PURPOSES: readonly AuthorizationPurpose[] = [
  'no_show',
  'recovery',
  'exception_cancellation',
  'invalidation',
];
const DIRECTORY_LIMIT = 50;

export type CustodyLabel =
  'reserved' | 'forfeited' | 'delinquency' | 'spe_pool' | 'owner' | 'luxtory' | 'none';
export type AuthorizationStatus = 'requested' | 'live' | 'used' | 'revoked' | 'expired';

export interface AdminNight {
  readonly date: string;
  readonly checkinAt: Date;
  /** Categoria do Direito de Uso (Co-Owner); `null` no Owner. */
  readonly bucket: 'alta' | 'media' | 'leap' | null;
  readonly custody: CustodyLabel;
  readonly occupied: boolean;
  readonly releaseReason: string | null;
}

export interface AdminAuthorization {
  readonly requestId: string;
  readonly purpose: AuthorizationPurpose;
  readonly requestedAt: Date;
  readonly status: AuthorizationStatus;
  readonly validUntil: Date | null;
  readonly availabilityAttested: boolean;
}

export interface LiveAuthorizationView {
  readonly id: string;
  readonly validUntil: Date;
  readonly scopeDates: readonly string[];
  readonly scopeCustodies: number;
  readonly expectedClass: CancellationClass | null;
}

export interface AdminBookingDetail {
  readonly id: string;
  readonly secondHomeId: string;
  readonly label: string;
  readonly timezone: string;
  readonly modality: Modality;
  readonly state: BookingState;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly confirmedAt: Date;
  readonly firstCheckinAt: Date;
  readonly checkoutAt: Date;
  readonly exception: {
    readonly id: string;
    readonly type: ExceptionType;
    readonly reason: string | null;
    readonly incidentRef: string | null;
    readonly openedAt: Date;
  } | null;
  readonly cancellationClassNow: CancellationClass | null;
  readonly recoverableFromException: boolean;
  readonly facts: AdminFacts;
  readonly acts: readonly ActAvailability[];
  readonly purposes: readonly AuthorizationPurpose[];
  readonly nights: readonly AdminNight[];
  readonly authorizations: readonly AdminAuthorization[];
  readonly live: Readonly<Record<AuthorizationPurpose, LiveAuthorizationView | null>>;
  readonly history: readonly {
    readonly from: string;
    readonly to: string;
    readonly kind: string;
    readonly at: Date;
    readonly role: string;
    readonly basis: string | null;
  }[];
}

export type DirectorySection = 'attendance' | 'exceptions' | 'recoverable' | 'upcoming';

export interface AdminDirectoryItem {
  readonly id: string;
  readonly label: string;
  readonly timezone: string;
  readonly modality: Modality;
  readonly state: BookingState;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly firstCheckinAt: Date;
  readonly checkoutAt: Date;
  readonly exceptionType: ExceptionType | null;
  readonly reason: string | null;
  readonly openedAt: Date | null;
  readonly noShowAuthorizationUntil: Date | null;
  readonly section: DirectorySection;
}

function auditRead(
  tx: DatabaseTransaction,
  session: ExercisedAdminSession,
  objectType: 'booking_directory' | 'booking',
  objectId: string,
) {
  return recordAdminRead(tx, {
    actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
    objectType,
    objectId,
    authorizationRef: session.authorizationRef,
    at: systemClock.now(),
  });
}

const modalityOf = (modality: string): Modality => (modality === 'owner' ? 'owner' : 'co_owner');
const custodyOf = (holder: string | null, basis: string | null): CustodyLabel => {
  if (holder === 'use_right')
    return basis === 'forfeited_right'
      ? 'forfeited'
      : basis === 'delinquency'
        ? 'delinquency'
        : 'reserved';
  if (holder === 'spe_pool' || holder === 'owner' || holder === 'luxtory') return holder;
  return 'none';
};

/** Fila do Admin: comparecimento a verificar, exceções, capacidade recuperável e próximas (por Second Home opcional). */
export function readAdminBookingDirectory(
  session: ExercisedAdminSession,
  filter: { readonly secondHomeId: string | null },
  db: Database = getDatabase(),
): Promise<{
  readonly items: readonly AdminDirectoryItem[];
  readonly homes: readonly { id: string; label: string }[];
}> {
  return db.transaction().execute(async (tx) => {
    await auditRead(tx, session, 'booking_directory', filter.secondHomeId ?? 'list');
    let query = tx
      .selectFrom('app.booking as b')
      .innerJoin('app.second_home as s', 's.id', 'b.second_home_id')
      .innerJoin('app.acquisition as a', 'a.second_home_id', 'b.second_home_id')
      .innerJoin('app.second_home_date as d', (join) =>
        join
          .onRef('d.second_home_id', '=', 'b.second_home_id')
          .onRef('d.stay_date', '=', 'b.checkin_date'),
      )
      .select([
        'b.id',
        's.label',
        's.timezone',
        'a.modality',
        'b.state',
        sql<string>`b.checkin_date::text`.as('checkin_date'),
        sql<string>`b.checkout_date::text`.as('checkout_date'),
        'd.checkin_at',
        sql<Date>`(SELECT i.checkout_at FROM app.booking_period_instants(b.id) i)`.as(
          'checkout_at',
        ),
        sql<boolean>`clock_timestamp() >= d.checkin_at`.as('started'),
        sql<boolean>`clock_timestamp() < (SELECT i.checkout_at FROM app.booking_period_instants(b.id) i)`.as(
          'before_checkout',
        ),
      ])
      .where('b.channel', '=', 'own_use')
      .where(
        sql<boolean>`b.state IN ('confirmed', 'in_use', 'in_exception') OR (b.state IN ('cancelled', 'no_show') AND b.checkout_date > current_date)`,
      )
      .orderBy('b.checkin_date')
      .limit(DIRECTORY_LIMIT * 4);
    if (filter.secondHomeId !== null)
      query = query.where('b.second_home_id', '=', filter.secondHomeId);
    const [rows, homes] = await Promise.all([
      query.execute(),
      tx.selectFrom('app.second_home').select(['id', 'label']).orderBy('label').execute(),
    ]);
    const ids = rows.map((row) => row.id);
    const [exceptions, noShow] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            tx
              .selectFrom('app.booking_exception as x')
              .select(['x.booking_id', 'x.exception_type', 'x.reason', 'x.opened_at'])
              .where('x.booking_id', 'in', ids)
              .where(
                sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = x.id)`,
              )
              .execute(),
            tx
              .selectFrom('app.booking_authorization as z')
              .select(['z.booking_id', 'z.valid_until'])
              .where('z.booking_id', 'in', ids)
              .where('z.purpose', '=', 'no_show')
              .where(sql<boolean>`clock_timestamp() < z.valid_until`)
              .where(
                sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_authorization_use u WHERE u.authorization_id = z.id)`,
              )
              .where(
                sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_authorization_revocation v WHERE v.authorization_id = z.id)`,
              )
              .execute(),
          ]);
    const exceptionOf = new Map(exceptions.map((x) => [x.booking_id, x]));
    const noShowOf = new Map(noShow.map((z) => [z.booking_id, new Date(z.valid_until)]));
    const items: AdminDirectoryItem[] = [];
    for (const row of rows) {
      const state = row.state as BookingState;
      let section: DirectorySection | null = null;
      if (state === 'in_exception') section = 'exceptions';
      else if ((state === 'confirmed' || state === 'in_use') && row.started && row.before_checkout)
        section = 'attendance';
      else if (state === 'confirmed' && !row.started) section = 'upcoming';
      else if (state === 'cancelled' || state === 'no_show') {
        const booking = await store.findBooking(tx, row.id);
        if (
          booking !== null &&
          (await store.requestFacts(tx, booking)).recoverableCustodyIds.length > 0
        )
          section = 'recoverable';
      }
      if (section === null) continue;
      const exception = exceptionOf.get(row.id);
      items.push({
        id: row.id,
        label: row.label,
        timezone: row.timezone,
        modality: modalityOf(row.modality),
        state,
        checkinDate: row.checkin_date,
        checkoutDate: row.checkout_date,
        firstCheckinAt: new Date(row.checkin_at),
        checkoutAt: new Date(row.checkout_at),
        exceptionType: (exception?.exception_type as ExceptionType | undefined) ?? null,
        reason: exception?.reason ?? null,
        openedAt: exception === undefined ? null : new Date(exception.opened_at),
        noShowAuthorizationUntil: noShowOf.get(row.id) ?? null,
        section,
      });
    }
    return { items: items.slice(0, DIRECTORY_LIMIT * 4), homes };
  });
}

/** Detalhe auditado: noites com custódia e ocupação, exceção, autorizações, histórico e atos disponíveis. */
export function readAdminBooking(
  session: ExercisedAdminSession,
  bookingId: string,
  db: Database = getDatabase(),
): Promise<AdminBookingDetail | null> {
  return db.transaction().execute(async (tx) => {
    await auditRead(tx, session, 'booking', bookingId);
    const booking = await store.findBooking(tx, bookingId);
    if (booking === null) return null;
    const meta = await tx
      .selectFrom('app.booking as b')
      .innerJoin('app.second_home as s', 's.id', 'b.second_home_id')
      .innerJoin('app.acquisition as a', 'a.second_home_id', 'b.second_home_id')
      .select(['s.label', 's.timezone', 'a.modality', 'b.confirmed_at'])
      .where('b.id', '=', bookingId)
      .executeTakeFirstOrThrow();
    const [period, open, facts, activation] = await Promise.all([
      store.period(tx, bookingId),
      store.openException(tx, bookingId),
      store.requestFacts(tx, booking),
      tx
        .selectFrom('app.capability_activation')
        .select('capability')
        .where('capability', '=', LIFECYCLE_CAPABILITY)
        .executeTakeFirst(),
    ]);
    const [exception, nights, requests, history, nowRow, live] = await Promise.all([
      open === null
        ? Promise.resolve(undefined)
        : tx
            .selectFrom('app.booking_exception')
            .select(['id', 'exception_type', 'reason', 'incident_ref', 'opened_at'])
            .where('id', '=', open.id)
            .executeTakeFirst(),
      tx
        .selectFrom('app.second_home_date as d')
        .leftJoin('app.date_custody as c', (join) =>
          join
            .onRef('c.second_home_id', '=', 'd.second_home_id')
            .onRef('c.stay_date', '=', 'd.stay_date')
            .on('c.closed_at', 'is', null),
        )
        .leftJoin('app.date_occupancy as o', (join) =>
          join
            .onRef('o.second_home_id', '=', 'd.second_home_id')
            .onRef('o.stay_date', '=', 'd.stay_date')
            .on('o.booking_id', '=', bookingId),
        )
        .select([
          sql<string>`d.stay_date::text`.as('date'),
          'd.checkin_at',
          'd.season',
          'd.is_leap_day',
          'c.holder_kind',
          'c.basis',
          'o.id as occupancy_id',
          'o.released_at',
          'o.release_reason',
        ])
        .where('d.second_home_id', '=', booking.secondHomeId)
        .where(
          sql<boolean>`d.stay_date >= ${booking.checkinDate}::date AND d.stay_date < ${booking.checkoutDate}::date`,
        )
        .orderBy('d.stay_date')
        .execute(),
      tx
        .selectFrom('app.booking_authorization_request as r')
        .leftJoin('app.booking_authorization as z', 'z.request_id', 'r.id')
        .select([
          'r.id',
          'r.purpose',
          'r.requested_at',
          'r.availability_attested',
          'z.valid_until',
          sql<boolean>`EXISTS (SELECT 1 FROM app.booking_authorization_use u WHERE u.authorization_id = z.id)`.as(
            'used',
          ),
          sql<boolean>`EXISTS (SELECT 1 FROM app.booking_authorization_revocation v WHERE v.authorization_id = z.id)`.as(
            'revoked',
          ),
          sql<boolean>`z.valid_until IS NOT NULL AND clock_timestamp() >= z.valid_until`.as(
            'expired',
          ),
        ])
        .where('r.booking_id', '=', bookingId)
        .orderBy('r.requested_at', 'desc')
        .execute(),
      tx
        .selectFrom('app.booking_state_transition as t')
        .innerJoin('app.operation as p', 'p.id', 't.operation_id')
        .select(['t.from_state', 't.to_state', 't.kind', 't.recorded_at', 't.basis', 'p.role'])
        .where('t.booking_id', '=', bookingId)
        .orderBy('t.recorded_at', 'desc')
        .execute(),
      sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx),
      Promise.all(
        PURPOSES.map(async (purpose) => {
          const exceptionId =
            purpose === 'exception_cancellation' || purpose === 'invalidation'
              ? (open?.id ?? null)
              : null;
          if (
            (purpose === 'exception_cancellation' || purpose === 'invalidation') &&
            exceptionId === null
          )
            return [purpose, null] as const;
          const auth = await store.liveAuthorization(tx, { bookingId, purpose, exceptionId });
          if (auth === null) return [purpose, null] as const;
          const until = await tx
            .selectFrom('app.booking_authorization')
            .select('valid_until')
            .where('id', '=', auth.id)
            .executeTakeFirstOrThrow();
          return [
            purpose,
            {
              id: auth.id,
              validUntil: new Date(until.valid_until),
              scopeDates: auth.scopeDates,
              scopeCustodies: auth.scopeCustodyIds.length,
              expectedClass: auth.expectedClass,
            },
          ] as const;
        }),
      ),
    ]);
    const now = new Date(nowRow.rows[0]!.now);
    const checkoutAt = new Date(isoFromMicros(period.checkoutAt));
    const firstCheckinAt = new Date(isoFromMicros(period.nights[0]!.checkinAt));
    const adminFacts: AdminFacts = {
      state: booking.state,
      modality: booking.stakeId === null ? 'owner' : 'co_owner',
      exceptionType: open?.type ?? null,
      lifecycleOpen: activation !== undefined,
      beforeCheckout: now.getTime() < checkoutAt.getTime(),
      noShowWindowOpen: facts.noShowWindowOpen,
      unstartedDates: facts.unstartedDates,
      recoverableCustodies: facts.recoverableCustodyIds.length,
    };
    return {
      id: booking.id,
      secondHomeId: booking.secondHomeId,
      label: meta.label,
      timezone: meta.timezone,
      modality: modalityOf(meta.modality),
      state: booking.state,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      confirmedAt: new Date(meta.confirmed_at),
      firstCheckinAt,
      checkoutAt,
      exception:
        exception === undefined
          ? null
          : {
              id: exception.id,
              type: exception.exception_type as ExceptionType,
              reason: exception.reason,
              incidentRef: exception.incident_ref,
              openedAt: new Date(exception.opened_at),
            },
      cancellationClassNow: facts.cancellationClass,
      recoverableFromException: facts.recoverableFromException,
      facts: adminFacts,
      acts: adminActAvailability(adminFacts),
      purposes: adminFacts.lifecycleOpen ? requestablePurposes(adminFacts) : [],
      nights: nights.map((night) => ({
        date: night.date,
        checkinAt: new Date(night.checkin_at),
        bucket:
          booking.stakeId === null
            ? null
            : night.is_leap_day === true
              ? 'leap'
              : night.season === 'alta'
                ? 'alta'
                : 'media',
        custody: custodyOf(night.holder_kind, night.basis),
        occupied: night.occupancy_id !== null && night.released_at === null,
        releaseReason: night.release_reason,
      })),
      authorizations: requests.map((request) => ({
        requestId: request.id,
        purpose: request.purpose as AuthorizationPurpose,
        requestedAt: new Date(request.requested_at),
        availabilityAttested: request.availability_attested,
        validUntil: request.valid_until === null ? null : new Date(request.valid_until),
        status:
          request.valid_until === null
            ? 'requested'
            : request.used
              ? 'used'
              : request.revoked
                ? 'revoked'
                : request.expired
                  ? 'expired'
                  : 'live',
      })),
      live: Object.fromEntries(live) as Record<AuthorizationPurpose, LiveAuthorizationView | null>,
      history: history.map((row) => ({
        from: row.from_state,
        to: row.to_state,
        kind: row.kind,
        at: new Date(row.recorded_at),
        role: row.role,
        basis: row.basis,
      })),
    };
  });
}
