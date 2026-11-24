import { sql } from 'kysely';
import { readAvailableCredits } from '@/features/credits';
import { readTitularOverview, type VerifiedSession } from '@/features/identity';
import {
  getDatabase,
  systemClock,
  withUserRead,
  withUserThenServerRead,
  type Clock,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  creditsForPrl,
  seasonTiers,
  type SeasonTier,
} from '@/features/pricing';
import {
  bookingNights,
  nightAvailability,
  sumCredits,
  type DepositBookingFacts,
  type DepositHolding,
  type DepositModality,
  type NightAvailability,
} from '../domain/deposit';
import { MAX_DEPOSIT_NIGHTS } from '../application/deposit-capacity';
import { createPostgresDepositStore } from '../infrastructure/postgres-deposit-store';

/**
 * Leitura da jornada do depósito (W20; spec luxchange §5.4): a holding é provada pela RLS do Titular (delegação +
 * holding vigentes); depois, com a autorização em mãos, o servidor lê custódia, ocupação, PRL e parâmetros (fatos que a
 * RLS não expõe) e devolve só o necessário à tela — a situação de cada noite e os Créditos, **nunca o PRL** (REQ-100). É
 * leitura não vinculante: o command revalida tudo no instante transacional.
 */
export interface DepositHoldingOption {
  readonly holdingId: string;
  readonly partyId: string;
  readonly secondHomeId: string;
  readonly label: string;
  readonly modality: DepositModality;
  readonly membershipActive: boolean;
}

export type DepositNightStatus = NightAvailability['kind'] | 'no_reference';

export interface DepositNightView {
  readonly date: string;
  /** Temporada de apresentação da W16 (ADR-0032 §11): Super Alta (Carnaval), Alta, Média/Baixa — só leitura. */
  readonly season: SeasonTier;
  readonly status: DepositNightStatus;
  /** Créditos da noite (texto decimal exato) quando pode ser depositada. */
  readonly credits: string | null;
  /** Co-Owner: reserva cedível a que a noite pertence. */
  readonly bookingId: string | null;
  /** Check-in oficial da noite (instante): a tela reaplica a antecedência de 336 h com o passar do tempo. */
  readonly checkinAt: string;
}

export interface DepositBookingView {
  readonly id: string;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly nights: readonly string[];
}

export interface DepositCalendarData {
  readonly holding: DepositHoldingOption;
  /** Data civil de hoje no fuso da Second Home. */
  readonly today: string;
  /** Instante do banco em que a tela foi lida: âncora do relógio da antecedência no navegador. */
  readonly at: string;
  readonly nights: readonly DepositNightView[];
  readonly bookings: readonly DepositBookingView[];
  /** Validade dos novos Créditos (parâmetro publicado), em meses; `null` = ausente. */
  readonly validityMonths: number | null;
  readonly multiplierPublished: boolean;
  /** Saldo disponível agora na Carteira da party (zero real quando não há lote). */
  readonly balance: string;
  /** K4 e K6 ativas (estado de apresentação; o banco continua recusando tudo o que estiver fechado). */
  readonly open: boolean;
}

export interface DepositReadDependencies {
  readonly db?: Database;
  readonly clock?: Clock;
}

interface HoldingRow {
  readonly id: string;
  readonly party_id: string;
  readonly second_home_id: string;
  readonly role: string;
  readonly stake_id: string | null;
  readonly label: string;
  readonly timezone: string;
}

const civilDay = (timezone: string, at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

async function representedHoldings(tx: DatabaseTransaction): Promise<HoldingRow[]> {
  return tx
    .selectFrom('app.holding as h')
    .innerJoin('app.second_home as s', 's.id', 'h.second_home_id')
    .select([
      'h.id',
      'h.party_id',
      'h.second_home_id',
      'h.role',
      'h.stake_id',
      's.label',
      's.timezone',
    ])
    .orderBy('s.label')
    .orderBy('h.id')
    .execute();
}

/** Holdings vigentes que o usuário representa (RLS da W8), com o vínculo e o Membership da party. */
export async function readDepositHoldings(
  session: VerifiedSession,
  deps: DepositReadDependencies = {},
): Promise<DepositHoldingOption[]> {
  const db = deps.db ?? getDatabase();
  const overview = await readTitularOverview(session, { db });
  const active = new Set(
    overview.representations
      .filter((party) => party.membership?.state === 'active')
      .map((party) => party.partyId),
  );
  const rows = await withUserRead(db, { sub: session.userId, role: 'authenticated' }, (tx) =>
    representedHoldings(tx),
  );
  return rows.map((row) => ({
    holdingId: row.id,
    partyId: row.party_id,
    secondHomeId: row.second_home_id,
    label: row.label,
    modality: row.role === 'owner' ? 'owner' : 'co_owner',
    membershipActive: active.has(row.party_id),
  }));
}

/** PRL em vigor por noite (servidor), lido em intervalos de até 366 noites; noite sem PRL não aparece. */
async function prlInForce(
  tx: DatabaseTransaction,
  secondHomeId: string,
  dates: readonly string[],
): Promise<{ readonly at: string; readonly prices: ReadonlyMap<string, string> }> {
  const store = createPostgresEconomicTermsStore();
  const prices = new Map<string, string>();
  let at = await createPostgresDepositStore().databaseInstant(tx);
  for (let index = 0; index < dates.length; index += MAX_DEPOSIT_NIGHTS) {
    const chunk = dates.slice(index, index + MAX_DEPOSIT_NIGHTS);
    const end = new Date(Date.parse(`${chunk.at(-1)!}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const read = await store.prlPeriodInForce(tx, secondHomeId, chunk[0]!, end);
    at = read.resolvedAt;
    for (const night of read.nights)
      if (night.amountMinor !== null) prices.set(night.stayDate, night.amountMinor);
  }
  return { at, prices };
}

async function serverFacts(tx: DatabaseTransaction, holding: HoldingRow, today: string) {
  const store = createPostgresDepositStore();
  const { rows: dates } = await sql<{ stay_date: string; season: string }>`
    SELECT stay_date::text AS stay_date, season FROM app.second_home_date
     WHERE second_home_id = ${holding.second_home_id}::uuid AND stay_date >= ${today}::date
     ORDER BY stay_date`.execute(tx);
  const days = dates.map((row) => row.stay_date);
  const [facts, bookings, capabilities] = await Promise.all([
    store.nightFacts(tx, holding.second_home_id, days),
    tx
      .selectFrom('app.booking')
      .select([
        'id',
        'holding_id',
        'stake_id',
        'channel',
        'state',
        sql<string>`checkin_date::text`.as('checkin_date'),
        sql<string>`checkout_date::text`.as('checkout_date'),
      ])
      .where('holding_id', '=', holding.id)
      .where('state', '=', 'confirmed')
      .execute(),
    store.capabilities(tx),
  ]);
  const prl = days.length === 0 ? null : await prlInForce(tx, holding.second_home_id, days);
  const at = prl?.at ?? (await store.databaseInstant(tx));
  const parameters = await createPostgresEconomicTermsStore().parametersAt(
    tx,
    ['credit_multiplier', 'credit_validity_months'],
    at,
  );
  return { dates, facts, bookings, capabilities, prices: prl?.prices ?? new Map(), at, parameters };
}

/**
 * Calendário do depósito de uma holding representada (`null` = não representada: sem oráculo). Owner: cada noite livre
 * com os seus Créditos. Co-Owner: só as noites das próprias reservas confirmadas, agrupadas por reserva — a reserva só é
 * depositável inteira (ADR-0036 §2), então a pior situação de uma noite vale para a reserva toda.
 */
export async function readDepositCalendar(
  session: VerifiedSession,
  holdingId: string,
  deps: DepositReadDependencies = {},
): Promise<DepositCalendarData | null> {
  const db = deps.db ?? getDatabase();
  const now = (deps.clock ?? systemClock).now();
  const option = (await readDepositHoldings(session, { db })).find(
    (item) => item.holdingId === holdingId,
  );
  if (option === undefined) return null;
  const read = await withUserThenServerRead(
    db,
    { sub: session.userId, role: 'authenticated' },
    async (tx) => (await representedHoldings(tx)).find((row) => row.id === holdingId) ?? null,
    async (tx, holding) => {
      const today = civilDay(holding.timezone, now);
      return { today, stakeId: holding.stake_id, ...(await serverFacts(tx, holding, today)) };
    },
  );
  if (read === null) return null;
  const holding: DepositHolding = {
    id: option.holdingId,
    modality: option.modality,
    stakeId: read.stakeId,
  };
  const multiplier = read.parameters.get('credit_multiplier')?.value ?? null;
  const validity = read.parameters.get('credit_validity_months')?.value ?? null;
  const bookings: DepositBookingFacts[] = read.bookings.map((row) => ({
    id: row.id,
    holdingId: row.holding_id,
    stakeId: row.stake_id,
    channel: row.channel,
    state: row.state,
    checkinDate: row.checkin_date,
    checkoutDate: row.checkout_date,
  }));
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const facts = new Map(read.facts.map((fact) => [fact.stayDate, fact]));
  const nowMs = Date.parse(read.at);
  const tierOf = seasonTiers();
  const nights = read.dates.map((row): DepositNightView => {
    const fact = facts.get(row.stay_date)!;
    const availability = nightAvailability(holding, fact, (id) => byId.get(id), nowMs);
    const price = read.prices.get(row.stay_date);
    const eligible = availability.kind === 'eligible';
    return {
      date: row.stay_date,
      season: tierOf(row.stay_date, row.season === 'alta' ? 'alta' : 'media'),
      status: eligible && price === undefined ? 'no_reference' : availability.kind,
      credits:
        eligible && price !== undefined && multiplier !== null
          ? creditsForPrl(BigInt(price), 'BRL', multiplier)
          : null,
      bookingId: availability.kind === 'eligible' ? availability.bookingId : null,
      checkinAt: fact.checkinAt,
    };
  });
  const views = cedableBookings(bookings, nights);
  return {
    holding: option,
    today: read.today,
    at: read.at,
    nights: wholeBookings(nights, views),
    bookings: views,
    validityMonths: validity === null ? null : Number(validity),
    multiplierPublished: multiplier !== null,
    balance: option.membershipActive
      ? await readAvailableCredits(session, option.partyId, true, { db, clock: deps.clock })
      : '0',
    open: read.capabilities.credits && read.capabilities.deposit,
  };
}

function cedableBookings(
  bookings: readonly DepositBookingFacts[],
  nights: readonly DepositNightView[],
): DepositBookingView[] {
  const touched = new Set(
    nights.flatMap((night) => (night.bookingId === null ? [] : [night.bookingId])),
  );
  return bookings
    .filter((booking) => touched.has(booking.id))
    .map((booking) => ({
      id: booking.id,
      checkinDate: booking.checkinDate,
      checkoutDate: booking.checkoutDate,
      nights: bookingNights(booking),
    }));
}

/** Reserva só inteira: se uma noite não pode (sem referência, sem Créditos), nenhuma da reserva pode. */
export function wholeBookings(
  nights: readonly DepositNightView[],
  bookings: readonly DepositBookingView[],
): DepositNightView[] {
  const byDate = new Map(nights.map((night) => [night.date, night]));
  const blocked = new Map<string, DepositNightStatus>();
  for (const booking of bookings) {
    const members = booking.nights.map((date) => byDate.get(date));
    const worst = members.find((night) => night === undefined || night.status !== 'eligible');
    if (worst !== undefined) blocked.set(booking.id, worst?.status ?? 'unavailable');
    else if (members.some((night) => night!.credits === null))
      blocked.set(booking.id, 'no_reference');
  }
  return nights.map((night) => {
    const status = night.bookingId === null ? undefined : blocked.get(night.bookingId);
    return status === undefined ? night : { ...night, status, credits: null, bookingId: null };
  });
}

/** Créditos de um conjunto de noites da tela (soma exata); `null` se alguma não pode ser depositada. */
export function selectionCredits(
  data: Pick<DepositCalendarData, 'nights'>,
  dates: readonly string[],
): string | null {
  const byDate = new Map(data.nights.map((night) => [night.date, night]));
  const credits = dates.map((date) => byDate.get(date)?.credits ?? null);
  return credits.some((value) => value === null) ? null : sumCredits(credits as string[]);
}

export interface DepositResultView {
  readonly operationId: string;
  readonly lotId: string;
  readonly credits: string;
  readonly expiresAt: string;
  readonly secondHomeLabel: string;
  readonly timezone: string;
  readonly nights: readonly string[];
}

/**
 * Resultado do depósito, lido do que foi persistido (nunca recalculado na tela): o lote da operação pela RLS da Carteira
 * (party representada) e, com ele provado, as noites cedidas pela operação. `null` = não existe ou não é do usuário.
 */
export async function readDepositResult(
  session: VerifiedSession,
  operationId: string,
  deps: DepositReadDependencies = {},
): Promise<DepositResultView | null> {
  const db = deps.db ?? getDatabase();
  return withUserThenServerRead(
    db,
    { sub: session.userId, role: 'authenticated' },
    async (tx) =>
      (await tx
        .selectFrom('app.credit_lot')
        .select([
          'id',
          sql<string>`quantity::text`.as('quantity'),
          sql<string>`to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
            'expires_at',
          ),
        ])
        .where('origin_operation_id', '=', operationId)
        .where('origin_command', '=', 'deposit_capacity')
        .executeTakeFirst()) ?? null,
    async (tx, lot) => {
      const { rows } = await sql<{ stay_date: string; label: string; timezone: string }>`
        SELECT c.stay_date::text AS stay_date, s.label, s.timezone
          FROM app.date_custody c JOIN app.second_home s ON s.id = c.second_home_id
         WHERE c.opened_by_operation = ${operationId}::uuid AND c.inventory_origin = 'luxchange_cession'
         ORDER BY c.stay_date`.execute(tx);
      if (rows.length === 0) return null;
      return {
        operationId,
        lotId: lot.id,
        credits: lot.quantity.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
        expiresAt: lot.expires_at,
        secondHomeLabel: rows[0]!.label,
        timezone: rows[0]!.timezone,
        nights: rows.map((row) => row.stay_date),
      };
    },
  );
}
