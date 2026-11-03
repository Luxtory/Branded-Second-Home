import { sql } from 'kysely';
import { createUseWindowResolver } from '@/features/calendar/booking';
import { findUseRightFacts } from '@/features/ownership';
import { createPostgresBookingStore } from '../infrastructure/postgres-booking-store';
import {
  getDatabase,
  withUserThenServerRead,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';

/** Situação de uma noite para o Titular: fato do servidor, nunca decisão do navegador (`03` §13). */
export type CalendarNightStatus =
  'available' | 'unavailable' | 'mine' | 'started' | 'closed' | 'leap-other';

export interface CalendarNight {
  readonly date: string;
  readonly exerciseYear: number;
  readonly season: 'alta' | 'media';
  readonly isLeapDay: boolean;
  readonly status: CalendarNightStatus;
}

/** Reserva da holding representada, com canal e estado persistidos (spec booking §7). */
export interface HoldingBooking {
  readonly id: string;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly channel: string;
  readonly state: string;
}

export interface UseRightBalanceView {
  readonly exerciseYear: number;
  readonly bucket: 'alta' | 'media' | 'leap';
  readonly granted: number;
  readonly remaining: number;
}

export interface UseWindowView {
  readonly exerciseYear: number;
  readonly isLeapDay: boolean;
  readonly opensAt: string | null;
  /** Dia civil da abertura no fuso da Second Home (TECH-042). */
  readonly opensOn: string | null;
  readonly open: boolean;
}

export interface OwnUseCalendarData {
  readonly holdingId: string;
  /** Party representada (a confirmação a envia ao guard do Titular, que a revalida). */
  readonly partyId: string;
  readonly secondHomeId: string;
  readonly secondHomeLabel: string;
  readonly role: 'owner' | 'co_owner';
  /** Data civil de hoje no fuso da Second Home (TECH-042). */
  readonly today: string;
  readonly nights: readonly CalendarNight[];
  readonly bookings: readonly HoldingBooking[];
  readonly balances: readonly UseRightBalanceView[];
  readonly windows: readonly UseWindowView[];
  /** Novas reservas habilitadas (ativação privilegiada, ADR-0026); `false` = consulta sem confirmação. */
  readonly bookingOpen: boolean;
}

const bookingStore = createPostgresBookingStore();

/** Estados em que a reserva ocupa a noite; cancelada sai da indicação ativa (fica no histórico) — W13. */
const ACTIVE_BOOKING_STATES = new Set(['confirmed', 'in_use']);

const civilToday = (timezone: string, now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/** Holding vigente que o usuário representa (RLS da W8: delegação ativa + holding vigente), ou `null`. */
export async function readRepresentedHolding(tx: DatabaseTransaction, holdingId: string) {
  return (
    (await tx
      .selectFrom('app.holding as h')
      .innerJoin('app.second_home as s', 's.id', 'h.second_home_id')
      .select([
        'h.id',
        'h.second_home_id',
        'h.party_id',
        'h.role',
        'h.stake_id',
        's.label',
        's.timezone',
      ])
      .where('h.id', '=', holdingId)
      .executeTakeFirst()) ?? null
  );
}

async function userFacts(tx: DatabaseTransaction, secondHomeId: string, stakeId: string | null) {
  const [dates, custodies, occupied, bookings, balances] = await Promise.all([
    tx
      .selectFrom('app.second_home_date')
      .select([
        sql<string>`stay_date::text`.as('date'),
        'exercise_year',
        'season',
        'is_leap_day',
        'checkin_at',
      ])
      .where('second_home_id', '=', secondHomeId)
      .orderBy('stay_date')
      .execute(),
    tx
      .selectFrom('app.date_custody')
      .select([sql<string>`stay_date::text`.as('date'), 'holder_kind'])
      .where('second_home_id', '=', secondHomeId)
      .where('closed_at', 'is', null)
      .execute(),
    tx
      .selectFrom('app.date_occupancy')
      .select(sql<string>`stay_date::text`.as('date'))
      .where('second_home_id', '=', secondHomeId)
      .where('released_at', 'is', null)
      .execute(),
    tx
      .selectFrom('app.booking')
      .select([
        'id',
        sql<string>`checkin_date::text`.as('checkinDate'),
        sql<string>`checkout_date::text`.as('checkoutDate'),
        'channel',
        'state',
      ])
      .where('second_home_id', '=', secondHomeId)
      .orderBy('checkin_date')
      .execute(),
    stakeId === null
      ? Promise.resolve([])
      : tx
          .selectFrom('app.use_right_balance')
          .select(['exercise_year', 'bucket', 'granted', 'remaining'])
          .where('stake_id', '=', stakeId)
          .execute(),
  ]);
  // Colunas geradas no banco (exercício, 29/02) chegam anuláveis no codegen; toda noite selada as tem (W10).
  const nights = dates.map((row) => ({
    date: row.date,
    exercise_year: Number(row.exercise_year),
    season: row.season,
    is_leap_day: row.is_leap_day === true,
    checkin_at: row.checkin_at,
  }));
  return { dates: nights, custodies, occupied, bookings, balances };
}

/**
 * Calendário de uso próprio de uma holding (W12, spec booking §6–§7): lido sob a RLS do Titular — noites seladas,
 * custódia aberta e ocupação ativa só como fato (sem dizer de quem), reservas e saldos da própria holding. A janela da
 * Ação vem da mesma função de domínio do command, com os fatos da formalização lidos pelo servidor depois de a RLS
 * provar a representação. `null` = holding que o usuário não representa (sem oráculo).
 */
export async function readOwnUseCalendar(
  userId: string,
  holdingId: string,
  now: Date = new Date(),
  db: Database = getDatabase(),
): Promise<OwnUseCalendarData | null> {
  const result = await withUserThenServerRead(
    db,
    { sub: userId, role: 'authenticated' },
    async (tx) => {
      const holding = await readRepresentedHolding(tx, holdingId);
      if (holding === null) return null;
      return { holding, ...(await userFacts(tx, holding.second_home_id, holding.stake_id)) };
    },
    async (tx, read) => ({
      read,
      // Estado de apresentação da ativação privilegiada (ADR-0026): o banco continua recusando toda escrita fechada.
      bookingOpen: await bookingStore.isActivated(tx),
      windows:
        read.holding.stake_id === null
          ? []
          : await windowsOf(
              tx,
              read.holding.timezone,
              read.holding.second_home_id,
              read.holding.stake_id,
              read.dates,
              now,
            ),
    }),
  );
  if (result === null) return null;
  const { read, windows, bookingOpen } = result;
  const { holding } = read;
  const role = holding.role === 'owner' ? 'owner' : 'co_owner';
  const balances = read.balances.map((row) => ({
    exerciseYear: row.exercise_year,
    bucket: row.bucket as UseRightBalanceView['bucket'],
    granted: Number(row.granted),
    remaining: Number(row.remaining),
  }));
  const bookings = read.bookings.map((row) => ({ ...row }));
  const nights = statusOfNights({ role, read, bookings, balances, windows, now });
  return {
    holdingId: holding.id,
    partyId: holding.party_id,
    secondHomeId: holding.second_home_id,
    secondHomeLabel: holding.label,
    role,
    today: civilToday(holding.timezone, now),
    nights,
    bookings,
    balances,
    windows,
    bookingOpen,
  };
}

async function windowsOf(
  db: Database | DatabaseTransaction,
  timezone: string,
  secondHomeId: string,
  stakeId: string,
  dates: readonly { exercise_year: number; is_leap_day: boolean }[],
  now: Date,
): Promise<UseWindowView[]> {
  const facts = await findUseRightFacts(db, secondHomeId);
  const opensAt = createUseWindowResolver();
  const keys = new Map(dates.map((date) => [`${date.exercise_year}:${date.is_leap_day}`, date]));
  return [...keys.values()].map((date) => {
    const at =
      facts === null ? null : opensAt(facts, stakeId, date.exercise_year, date.is_leap_day);
    return {
      exerciseYear: date.exercise_year,
      isLeapDay: date.is_leap_day,
      opensAt: at?.toISOString() ?? null,
      opensOn: at === null ? null : civilToday(timezone, at),
      open: at !== null && at.getTime() <= now.getTime(),
    };
  });
}

function statusOfNights(input: {
  role: 'owner' | 'co_owner';
  read: Awaited<ReturnType<typeof userFacts>>;
  bookings: readonly HoldingBooking[];
  balances: readonly UseRightBalanceView[];
  windows: readonly UseWindowView[];
  now: Date;
}): CalendarNight[] {
  const { role, read, now } = input;
  const root = role === 'owner' ? 'owner' : 'spe_pool';
  const eligible = new Set(
    read.custodies.filter((row) => row.holder_kind === root).map((row) => row.date),
  );
  const occupied = new Set(read.occupied.map((row) => row.date));
  const active = input.bookings.filter((booking) => ACTIVE_BOOKING_STATES.has(booking.state));
  const window = new Map(
    input.windows.map((entry) => [`${entry.exerciseYear}:${entry.isLeapDay}`, entry.open]),
  );
  const leapAttributed = new Set(
    input.balances
      .filter((row) => row.bucket === 'leap' && row.remaining > 0)
      .map((row) => row.exerciseYear),
  );
  return read.dates.map((row) => {
    const mine = active.some(
      (booking) => row.date >= booking.checkinDate && row.date < booking.checkoutDate,
    );
    let status: CalendarNightStatus = 'available';
    if (new Date(row.checkin_at).getTime() <= now.getTime()) status = 'started';
    else if (mine) status = 'mine';
    else if (occupied.has(row.date) || !eligible.has(row.date)) status = 'unavailable';
    else if (role === 'co_owner' && window.get(`${row.exercise_year}:${row.is_leap_day}`) !== true)
      status = 'closed';
    else if (role === 'co_owner' && row.is_leap_day && !leapAttributed.has(row.exercise_year))
      status = 'leap-other';
    return {
      date: row.date,
      exerciseYear: row.exercise_year,
      season: row.season === 'alta' ? 'alta' : 'media',
      isLeapDay: row.is_leap_day,
      status,
    };
  });
}
