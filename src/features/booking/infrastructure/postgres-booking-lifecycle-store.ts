import { sql } from 'kysely';
import { holdingParty } from '@/features/ownership';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import { OWN_USE_LIFECYCLE_CAPABILITY } from '../application/own-use-closing';
import type {
  BookingLifecycleStore,
  LifecycleBooking,
} from '../application/own-use-lifecycle-ports';
import type { BookingState, CancellationClass, ExceptionType } from '../domain/own-use-lifecycle';
import { microsFromText } from './lifecycle-instants';
import { createPostgresBookingStore } from './postgres-booking-store';

class UnexpectedLifecycleValueError extends Error {
  constructor(field: string, value: unknown) {
    super(`Unexpected ${field}: ${String(value)}`);
    this.name = 'UnexpectedLifecycleValueError';
  }
}

const STATES: readonly BookingState[] = [
  'confirmed',
  'in_use',
  'completed',
  'cancelled',
  'no_show',
  'in_exception',
];

function stateOf(value: string): BookingState {
  const state = STATES.find((candidate) => candidate === value);
  if (state === undefined) throw new UnexpectedLifecycleValueError('booking state', value);
  return state;
}

function classOf(value: string | null): CancellationClass | null {
  if (value === null || value === 'timely' || value === 'late') return value;
  throw new UnexpectedLifecycleValueError('cancellation class', value);
}

function exceptionTypeOf(value: string): ExceptionType {
  if (value === 'operational' || value === 'unauthorized_booking') return value;
  throw new UnexpectedLifecycleValueError('exception type', value);
}

/** Instante em µs exatos (`extract` devolve `numeric` no PostgreSQL 17): nunca via `Date` (D10). */
const micros = (column: string) =>
  sql<string>`(extract(epoch FROM ${sql.ref(column)}) * 1000000)::bigint::text`;

/**
 * Ciclo da reserva por SQL direto do servidor (W13; ADR-002 do `03`, ADR-0027). O banco carimba instantes e recalcula
 * classe e primeira noite afetada na transição; os valores de instante enviados não prevalecem. As travas usam as
 * mesmas chaves dos gatilhos, uma instrução por chave.
 */
export function createPostgresBookingLifecycleStore(): BookingLifecycleStore<DatabaseTransaction> {
  const creation = createPostgresBookingStore();
  return {
    async lifecycleActivated(tx) {
      const row = await tx
        .selectFrom('app.capability_activation')
        .select('capability')
        .where('capability', '=', OWN_USE_LIFECYCLE_CAPABILITY)
        .executeTakeFirst();
      return row !== undefined;
    },
    async findBooking(tx, bookingId) {
      const row = await tx
        .selectFrom('app.booking')
        .select([
          'id',
          'second_home_id',
          'holding_id',
          'stake_id',
          sql<string>`checkin_date::text`.as('checkin_date'),
          sql<string>`checkout_date::text`.as('checkout_date'),
          'state',
          'last_transition_id',
          'opened_by_operation',
        ])
        .where('id', '=', bookingId)
        .where('channel', '=', 'own_use')
        .executeTakeFirst();
      return row === undefined ? null : toBooking(row);
    },
    async period(tx, bookingId) {
      const nights = await tx
        .selectFrom('app.booking as b')
        .innerJoin('app.second_home_date as d', 'd.second_home_id', 'b.second_home_id')
        .select([
          sql<string>`d.stay_date::text`.as('stay_date'),
          micros('d.checkin_at').as('checkin_us'),
        ])
        .where('b.id', '=', bookingId)
        .where(sql<boolean>`d.stay_date >= b.checkin_date AND d.stay_date < b.checkout_date`)
        .orderBy('d.stay_date')
        .execute();
      const { rows } = await sql<{ checkout_us: string }>`
        SELECT (extract(epoch FROM i.checkout_at) * 1000000)::bigint::text AS checkout_us
          FROM app.booking_period_instants(${bookingId}::uuid) AS i`.execute(tx);
      return {
        nights: nights.map((night) => ({
          stayDate: night.stay_date,
          checkinAt: microsFromText(night.checkin_us),
        })),
        checkoutAt: microsFromText(rows[0]!.checkout_us),
      };
    },
    async openException(tx, bookingId) {
      const row = await tx
        .selectFrom('app.booking_exception as x')
        .select(['x.id', 'x.exception_type'])
        .where('x.booking_id', '=', bookingId)
        .where(
          sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = x.id)`,
        )
        .executeTakeFirst();
      return row === undefined ? null : { id: row.id, type: exceptionTypeOf(row.exception_type) };
    },
    lockRepresentation: creation.lockRepresentation,
    lockStake: creation.lockStake,
    lockNights: creation.lockNights,
    async lockBooking(tx, bookingId) {
      await lockAdvisoryKeys(tx, [`app.booking:${bookingId.toLowerCase()}`]);
    },
    holdingParty: (tx, holdingId) => holdingParty(tx, holdingId),
    async insertTransition(tx, draft) {
      const row = await tx
        .insertInto('app.booking_state_transition')
        .values({
          id: draft.id,
          booking_id: draft.booking.id,
          previous_transition_id: draft.booking.lastTransitionId,
          from_state: draft.booking.state,
          to_state: draft.toState,
          kind: draft.kind,
          operation_id: draft.operationId,
          // Carimbados pelo gatilho: instante do banco, classe e primeira noite afetada calculadas (T3, D7).
          recorded_at: sql<Date>`now()`,
          cancellation_class: draft.expectedClass,
          first_affected_date: draft.expectedFirstAffectedDate,
          basis: draft.basis,
        })
        .returning([
          'id',
          'cancellation_class',
          micros('recorded_at').as('recorded_us'),
          sql<string | null>`first_affected_date::text`.as('first_affected'),
        ])
        .executeTakeFirstOrThrow();
      return {
        id: row.id,
        recordedAt: microsFromText(row.recorded_us),
        cancellationClass: classOf(row.cancellation_class),
        firstAffectedDate: row.first_affected,
      };
    },
    async insertException(tx, exception) {
      await tx
        .insertInto('app.booking_exception')
        .values({
          id: exception.id,
          booking_id: exception.bookingId,
          exception_type: exception.type,
          reason: exception.reason,
          incident_ref: exception.incidentRef,
          opened_by_transition_id: exception.openedByTransitionId,
          opened_at: sql<Date>`now()`,
        })
        .execute();
    },
    async insertResolution(tx, resolution) {
      await tx
        .insertInto('app.booking_exception_resolution')
        .values({
          exception_id: resolution.exceptionId,
          booking_id: resolution.bookingId,
          transition_id: resolution.transitionId,
          outcome: resolution.outcome,
          resolution_source: resolution.source,
          resolved_at: sql<Date>`now()`,
        })
        .execute();
    },
    async liveAuthorization(tx, query) {
      const row = await tx
        .selectFrom('app.booking_authorization as a')
        .select([
          'a.id',
          sql<string[]>`a.scope_dates::text[]`.as('scope_dates'),
          sql<string[]>`a.scope_custody_ids::text[]`.as('scope_custody_ids'),
          'a.expected_cancellation_class',
        ])
        .where('a.booking_id', '=', query.bookingId)
        .where('a.purpose', '=', query.purpose)
        .where(
          query.exceptionId === null
            ? sql<boolean>`a.exception_id IS NULL`
            : sql<boolean>`a.exception_id = ${query.exceptionId}::uuid`,
        )
        .where(sql<boolean>`clock_timestamp() < a.valid_until`)
        .where(
          sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_authorization_use u WHERE u.authorization_id = a.id)`,
        )
        .where(
          sql<boolean>`NOT EXISTS (SELECT 1 FROM app.booking_authorization_revocation v WHERE v.authorization_id = a.id)`,
        )
        .orderBy('a.authorized_at', 'desc')
        .executeTakeFirst();
      return row === undefined
        ? null
        : {
            id: row.id,
            scopeDates: row.scope_dates,
            scopeCustodyIds: row.scope_custody_ids,
            expectedClass: classOf(row.expected_cancellation_class),
          };
    },
    async useAuthorization(tx, use) {
      const row = await tx
        .insertInto('app.booking_authorization_use')
        .values({
          authorization_id: use.authorizationId,
          booking_id: use.bookingId,
          operation_id: use.operationId,
          // Carimbado pelo gatilho (instante do banco).
          used_at: sql<Date>`now()`,
        })
        .returning(micros('used_at').as('used_us'))
        .executeTakeFirstOrThrow();
      return microsFromText(row.used_us);
    },
    async requestFacts(tx, booking) {
      // As mesmas funções e a mesma linhagem de `app.authorize_booking_action`, no instante do banco. Origem P-A (A3,
      // spec booking §10.13): a transição que abriu a `forfeited_right` resolveu uma exceção operacional — Admin ou
      // Titular. Só recusa cedo; a garantia é da função do banco.
      const { rows } = await sql<{
        window_open: boolean;
        unstarted: string[];
        cancellation_class: string | null;
        recoverable: string[];
        from_exception: boolean;
      }>`
        SELECT app.booking_no_show_window_open(i.first_checkin_at, i.checkout_at, clock_timestamp()) AS window_open,
               app.booking_unstarted_nights(b.id, clock_timestamp())::text[] AS unstarted,
               CASE WHEN b.stake_id IS NULL THEN NULL
                    WHEN app.own_use_cancellation_timely(i.first_checkin_at, clock_timestamp()) THEN 'timely'
                    ELSE 'late' END AS cancellation_class,
               coalesce(r.ids, '{}') AS recoverable,
               coalesce(r.from_exception, false) AS from_exception
          FROM app.booking b
          CROSS JOIN app.booking_period_instants(b.id) AS i
          LEFT JOIN LATERAL (
            SELECT array_agg(f.id::text ORDER BY f.id) AS ids,
                   bool_or(EXISTS (SELECT 1 FROM app.booking_exception_resolution z
                                     JOIN app.booking_exception x ON x.id = z.exception_id
                                    WHERE z.transition_id = t.id AND x.exception_type = 'operational')) AS from_exception
              FROM app.date_custody f
              JOIN app.date_custody p ON p.id = f.parent_custody_id
              JOIN app.second_home_date d ON d.second_home_id = f.second_home_id AND d.stay_date = f.stay_date
              JOIN app.booking_state_transition t ON t.operation_id = f.opened_by_operation AND t.booking_id = b.id
             WHERE f.second_home_id = b.second_home_id AND f.stay_date >= b.checkin_date
               AND f.stay_date < b.checkout_date AND f.closed_at IS NULL AND f.holder_kind = 'use_right'
               AND f.basis = 'forfeited_right' AND f.stake_id = b.stake_id AND p.basis = 'reserved_right'
               AND p.opened_by_operation = b.opened_by_operation AND clock_timestamp() < d.checkin_at
          ) AS r ON true
         WHERE b.id = ${booking.id}::uuid`.execute(tx);
      const row = rows[0]!;
      return {
        noShowWindowOpen: row.window_open,
        unstartedDates: row.unstarted,
        cancellationClass: classOf(row.cancellation_class),
        recoverableCustodyIds: row.recoverable,
        recoverableFromException: row.from_exception,
      };
    },
    async insertRequest(tx, request) {
      await tx
        .insertInto('app.booking_authorization_request')
        .values({
          id: request.id,
          booking_id: request.bookingId,
          purpose: request.purpose,
          exception_id: request.exceptionId,
          expected_dates: sql<string[]>`${[...request.expectedDates]}::date[]`,
          expected_custody_ids: sql<string[]>`${[...request.expectedCustodyIds]}::uuid[]`,
          expected_cancellation_class: request.expectedClass,
          availability_attested: request.availabilityAttested,
          basis: request.basis,
          requested_by_operation: request.operationId,
          // Carimbado pelo gatilho (instante do banco).
          requested_at: sql<Date>`now()`,
        })
        .execute();
    },
    async recoverableNights(tx, custodyIds) {
      if (custodyIds.length === 0) return [];
      const rows = await tx
        .selectFrom('app.date_custody as f')
        .innerJoin('app.second_home_date as d', (join) =>
          join
            .onRef('d.second_home_id', '=', 'f.second_home_id')
            .onRef('d.stay_date', '=', 'f.stay_date'),
        )
        .select([
          'f.id',
          sql<string>`f.stay_date::text`.as('stay_date'),
          micros('d.checkin_at').as('checkin_us'),
        ])
        .where(sql<boolean>`f.id = ANY(${[...custodyIds]}::uuid[])`)
        .where('f.closed_at', 'is', null)
        .where('f.basis', '=', 'forfeited_right')
        .orderBy('f.stay_date')
        .execute();
      return rows.map((row) => ({
        custodyId: row.id,
        stayDate: row.stay_date,
        checkinAt: microsFromText(row.checkin_us),
      }));
    },
  };
}

function toBooking(row: {
  id: string;
  second_home_id: string;
  holding_id: string;
  stake_id: string | null;
  checkin_date: string;
  checkout_date: string;
  state: string;
  last_transition_id: string | null;
  opened_by_operation: string;
}): LifecycleBooking {
  return {
    id: row.id,
    secondHomeId: row.second_home_id,
    holdingId: row.holding_id,
    stakeId: row.stake_id,
    checkinDate: row.checkin_date,
    checkoutDate: row.checkout_date,
    state: stateOf(row.state),
    lastTransitionId: row.last_transition_id,
    openedByOperation: row.opened_by_operation,
  };
}
