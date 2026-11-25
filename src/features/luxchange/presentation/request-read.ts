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
  compareCredits,
  sumCredits,
  withinNotice,
  type DepositBookingFacts,
} from '../domain/deposit';
import {
  requestableCapacity,
  type RequestClosureReason,
  type RequestHolding,
} from '../domain/request';
import { createPostgresRequestStore } from '../infrastructure/postgres-request-store';
import { civilDay, prlInForce, readDepositCalendar, readDepositHoldings } from './deposit-read';

/**
 * Leituras da jornada da Request (W21 E3; spec luxchange §13.5). A RLS do Titular prova a representação (delegação e
 * holding vigentes da party solicitante); depois, com a autorização em mãos, o servidor lê o que a RLS não expõe — a
 * capacidade de outra Second Home vira só "Solicitável"/"Indisponível"/"Passada" e os Créditos de cada noite solicitável,
 * nunca o motivo, o detentor ou o PRL (REQ-098, REQ-100). Leitura não vinculante: a prévia e o envio revalidam tudo.
 */
export interface RequestReadDependencies {
  readonly db?: Database;
  readonly clock?: Clock;
  /** Resumo do Titular (padrão: a leitura sob RLS do identity); injetável nos testes. */
  readonly overview?: typeof readTitularOverview;
}

const HOUR_MS = 3_600_000;
const claims = (session: VerifiedSession) => ({
  sub: session.userId,
  role: 'authenticated' as const,
});

export interface RequestPartyOption {
  readonly partyId: string;
  readonly documentType: 'cpf' | 'cnpj';
  readonly maskedDocument: string;
  readonly membershipActive: boolean;
}

export interface RequestHomeOption {
  readonly secondHomeId: string;
  readonly label: string;
  /** Menor quantidade de Créditos de uma noite solicitável ("a partir de"). */
  readonly fromCredits: string;
}

export interface RequestStart {
  readonly parties: readonly RequestPartyOption[];
  readonly homes: readonly RequestHomeOption[];
}

export type RequestNightStatus = 'requestable' | 'unavailable' | 'past';

export interface RequestNightView {
  readonly date: string;
  readonly season: SeasonTier;
  readonly status: RequestNightStatus;
  readonly credits: string | null;
  /** Unidade que entra inteira (reserva Co-Owner do detentor), como número opaco — nunca o id da reserva. */
  readonly unit: number | null;
}

export interface ComplementOptionView {
  readonly kind: 'owner_night' | 'co_owner_booking';
  /** Chave estável da unidade na tela (`${casa}:${data}` ou o id da própria reserva). */
  readonly key: string;
  readonly secondHomeId: string;
  readonly stayDate: string | null;
  readonly bookingId: string | null;
  readonly nights: readonly string[];
  readonly credits: string;
}

export interface ComplementHomeView {
  readonly holdingId: string;
  readonly secondHomeId: string;
  readonly label: string;
  readonly options: readonly ComplementOptionView[];
}

export interface RequestJourneyData {
  readonly party: RequestPartyOption;
  readonly home: {
    readonly secondHomeId: string;
    readonly label: string;
    readonly timezone: string;
  };
  readonly today: string;
  readonly nights: readonly RequestNightView[];
  /** Saldo disponível agora na Carteira da party solicitante. */
  readonly balance: string;
  readonly deadlineHours: number | null;
  readonly complement: readonly ComplementHomeView[];
  /** K4, K5 e K7 ativas (envio) e K6 (complemento) — estado de apresentação; o banco recusa o que estiver fechado. */
  readonly open: boolean;
  readonly complementOpen: boolean;
}

/** Parties que o usuário representa e que têm holding vigente (podem solicitar), com o Membership. */
async function requesterParties(
  session: VerifiedSession,
  db: Database,
  read: typeof readTitularOverview = readTitularOverview,
) {
  const overview = await read(session, { db });
  const holders = new Set(
    (await readDepositHoldings(session, { db, overview: read })).map((h) => h.partyId),
  );
  return {
    represented: new Set(overview.representations.map((party) => party.partyId)),
    parties: overview.representations
      .filter((party) => holders.has(party.partyId))
      .map((party): RequestPartyOption => ({
        partyId: party.partyId,
        documentType: party.documentType,
        maskedDocument: party.maskedDocument,
        membershipActive: party.membership?.state === 'active',
      })),
  };
}

interface HoldingRow {
  readonly id: string;
  readonly party_id: string;
  readonly second_home_id: string;
  readonly role: string;
  readonly stake_id: string | null;
}

const toHolding = (row: HoldingRow): RequestHolding => ({
  id: row.id,
  partyId: row.party_id,
  secondHomeId: row.second_home_id,
  modality: row.role === 'owner' ? 'owner' : 'co_owner',
  stakeId: row.stake_id,
});

/**
 * Capacidade solicitável de uma Second Home no instante do banco (servidor): detentores vigentes com Membership ativo
 * que quem lê não representa; noites sem PRL publicado ficam indisponíveis.
 */
async function targetNights(
  tx: DatabaseTransaction,
  home: { readonly id: string; readonly timezone: string },
  excluded: ReadonlySet<string>,
  now: Date,
): Promise<{ readonly today: string; readonly nights: RequestNightView[] }> {
  const store = createPostgresRequestStore();
  const today = civilDay(home.timezone, now);
  const { rows: dates } = await sql<{ stay_date: string; season: string }>`
    SELECT stay_date::text AS stay_date, season FROM app.second_home_date
     WHERE second_home_id = ${home.id}::uuid AND stay_date >= ${today}::date ORDER BY stay_date`.execute(
    tx,
  );
  if (dates.length === 0) return { today, nights: [] };
  const days = dates.map((row) => row.stay_date);
  const at = new Date(await store.databaseInstant(tx));
  const { rows: holders } = await sql<HoldingRow>`
    SELECT h.id, h.party_id, h.second_home_id, h.role, h.stake_id FROM app.holding h
     WHERE h.second_home_id = ${home.id}::uuid AND h.valid_from <= ${at}
       AND (h.valid_until IS NULL OR ${at} < h.valid_until)
       AND EXISTS (SELECT 1 FROM app.membership m WHERE m.party_id = h.party_id AND m.state = 'active')`.execute(
    tx,
  );
  const eligible = holders.filter((row) => !excluded.has(row.party_id)).map(toHolding);
  const ownerRow = holders.find((row) => row.role === 'owner');
  const owner = eligible.find((holding) => holding.modality === 'owner') ?? null;
  const [facts, bookings, committed, prl, parameters] = await Promise.all([
    store.nightFacts(tx, home.id, days),
    ownerRow !== undefined ? Promise.resolve([]) : confirmedBookings(tx, home.id, today),
    store.committed(
      tx,
      days.map((stayDate) => ({ secondHomeId: home.id, stayDate })),
      [],
    ),
    prlInForce(tx, home.id, days),
    createPostgresEconomicTermsStore().parametersAt(tx, ['credit_multiplier'], at.toISOString()),
  ]);
  const capacity =
    ownerRow !== undefined && owner === null
      ? new Map<string, string | null>()
      : requestableCapacity({
          owner,
          holdings: new Map(
            eligible
              .filter((holding) => holding.modality === 'co_owner')
              .map((holding) => [holding.id, holding]),
          ),
          nights: facts,
          bookings,
          committed: new Set(
            [...committed.nights].map((key) => key.slice(key.lastIndexOf(':') + 1)),
          ),
          nowMs: at.getTime(),
        });
  const multiplier = parameters.get('credit_multiplier')?.value ?? null;
  const units = new Map<string, number>();
  const tierOf = seasonTiers();
  const checkin = new Map(facts.map((fact) => [fact.stayDate, Date.parse(fact.checkinAt)]));
  return {
    today,
    nights: dates.map((row): RequestNightView => {
      const price = prl.prices.get(row.stay_date);
      const booking = capacity.get(row.stay_date);
      const requestable = booking !== undefined && price !== undefined && multiplier !== null;
      if (requestable && booking !== null && !units.has(booking))
        units.set(booking, units.size + 1);
      const started = (checkin.get(row.stay_date) ?? 0) <= at.getTime();
      return {
        date: row.stay_date,
        season: tierOf(row.stay_date, row.season === 'alta' ? 'alta' : 'media'),
        status: requestable ? 'requestable' : started ? 'past' : 'unavailable',
        credits: requestable ? creditsForPrl(BigInt(price), 'BRL', multiplier) : null,
        unit: requestable && booking !== null ? units.get(booking)! : null,
      };
    }),
  };
}

async function confirmedBookings(
  tx: DatabaseTransaction,
  homeId: string,
  today: string,
): Promise<DepositBookingFacts[]> {
  const rows = await tx
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
    .where('second_home_id', '=', homeId)
    .where('channel', '=', 'own_use')
    .where('state', '=', 'confirmed')
    .where(sql<boolean>`checkout_date > ${today}::date`)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    holdingId: row.holding_id!,
    stakeId: row.stake_id,
    channel: row.channel,
    state: row.state,
    checkinDate: row.checkin_date,
    checkoutDate: row.checkout_date,
  }));
}

const minCredits = (values: readonly string[]) =>
  values.reduce((min, value) => (compareCredits(value, min) < 0 ? value : min));

/**
 * Início da jornada (spec §13.5 item 1): parties que podem solicitar e as Second Homes com alguma noite solicitável,
 * "a partir de" a menor quantidade de Créditos por noite. Sem party elegível → nenhuma Second Home é calculada.
 */
export async function readRequestStart(
  session: VerifiedSession,
  deps: RequestReadDependencies = {},
): Promise<RequestStart> {
  const db = deps.db ?? getDatabase();
  const now = (deps.clock ?? systemClock).now();
  const { represented, parties } = await requesterParties(session, db, deps.overview);
  // STRIDE T-2111: a capacidade alheia só é lida para quem pode solicitar (Membership ativo).
  if (!parties.some((party) => party.membershipActive)) return { parties, homes: [] };
  const homes = await withUserThenServerRead(
    db,
    claims(session),
    async () => true,
    async (tx) => {
      const rows = await tx
        .selectFrom('app.second_home')
        .select(['id', 'label', 'timezone'])
        .orderBy('label')
        .orderBy('id')
        .execute();
      const options: RequestHomeOption[] = [];
      for (const row of rows) {
        const { nights } = await targetNights(tx, row, represented, now);
        const credits = nights.flatMap((night) => (night.credits === null ? [] : [night.credits]));
        if (credits.length > 0)
          options.push({
            secondHomeId: row.id,
            label: row.label,
            fromCredits: minCredits(credits),
          });
      }
      return options;
    },
  );
  return { parties, homes: homes ?? [] };
}

/**
 * Jornada para uma Second Home (`null` = party não representada ou sem holding vigente: sem oráculo). Inclui o saldo
 * disponível, o prazo de resposta publicado e as unidades próprias que podem complementar — elegíveis como no depósito,
 * com 336 h de antecedência no fim do prazo e sem compromisso efetivo de outra Request.
 */
export async function readRequestJourney(
  session: VerifiedSession,
  partyId: string,
  secondHomeId: string,
  deps: RequestReadDependencies = {},
): Promise<RequestJourneyData | null> {
  const db = deps.db ?? getDatabase();
  const now = (deps.clock ?? systemClock).now();
  const { represented, parties } = await requesterParties(session, db, deps.overview);
  const party = parties.find((option) => option.partyId === partyId);
  if (party === undefined) return null;
  const read = await withUserThenServerRead(
    db,
    claims(session),
    async () => true,
    async (tx) => {
      const home = await tx
        .selectFrom('app.second_home')
        .select(['id', 'label', 'timezone'])
        .where('id', '=', secondHomeId)
        .executeTakeFirst();
      if (home === undefined) return null;
      const store = createPostgresRequestStore();
      // STRIDE T-2111: sem Membership ativo, nenhuma noite da capacidade alheia (a tela explica o porquê).
      const target = party.membershipActive
        ? await targetNights(tx, home, represented, now)
        : { today: civilDay(home.timezone, now), nights: [] };
      const at = await store.databaseInstant(tx);
      const parameters = await createPostgresEconomicTermsStore().parametersAt(
        tx,
        ['request_deadline_hours'],
        at,
      );
      const deadline = parameters.get('request_deadline_hours')?.value ?? null;
      return {
        home: { secondHomeId: home.id, label: home.label, timezone: home.timezone },
        target,
        at,
        deadlineHours: deadline === null ? null : Number(deadline),
        capabilities: await store.capabilities(tx),
      };
    },
  );
  if (read === null) return null;
  const complement =
    read.deadlineHours === null
      ? []
      : await complementOptions(
          session,
          partyId,
          Date.parse(read.at) + read.deadlineHours * HOUR_MS,
          { db, clock: deps.clock, overview: deps.overview },
        );
  return {
    party,
    home: read.home,
    today: read.target.today,
    nights: read.target.nights,
    balance: party.membershipActive
      ? await readAvailableCredits(session, partyId, true, { db, clock: deps.clock })
      : '0',
    deadlineHours: read.deadlineHours,
    complement,
    open: read.capabilities.credits && read.capabilities.payments && read.capabilities.exchange,
    complementOpen: read.capabilities.deposit,
  };
}

/** Unidades próprias para o complemento, por holding da party (a leitura do depósito + prazo + compromisso efetivo). */
async function complementOptions(
  session: VerifiedSession,
  partyId: string,
  expiresAtMs: number,
  deps: RequestReadDependencies,
): Promise<ComplementHomeView[]> {
  const db = deps.db ?? getDatabase();
  const holdings = (await readDepositHoldings(session, { db, overview: deps.overview })).filter(
    (holding) => holding.partyId === partyId,
  );
  const views: ComplementHomeView[] = [];
  for (const holding of holdings) {
    const calendar = await readDepositCalendar(session, holding.holdingId, deps);
    if (calendar === null) continue;
    const eligible = calendar.nights.filter(
      (night) =>
        night.status === 'eligible' &&
        night.credits !== null &&
        withinNotice(night.checkinAt, expiresAtMs),
    );
    // A leitura do depósito já marca as datas com compromisso efetivo (`committed`): só as elegíveis seguem.
    const credits = new Map(eligible.map((night) => [night.date, night.credits!]));
    const options: ComplementOptionView[] =
      holding.modality === 'owner'
        ? eligible.map((night) => ({
            kind: 'owner_night',
            key: `${holding.secondHomeId}:${night.date}`,
            secondHomeId: holding.secondHomeId,
            stayDate: night.date,
            bookingId: null,
            nights: [night.date],
            credits: night.credits!,
          }))
        : calendar.bookings
            .filter((booking) => booking.nights.every((date) => credits.has(date)))
            .map((booking) => ({
              kind: 'co_owner_booking',
              key: booking.id,
              secondHomeId: holding.secondHomeId,
              stayDate: null,
              bookingId: booking.id,
              nights: booking.nights,
              credits: sumCredits(booking.nights.map((date) => credits.get(date)!)),
            }));
    if (options.length > 0)
      views.push({
        holdingId: holding.holdingId,
        secondHomeId: holding.secondHomeId,
        label: holding.label,
        options,
      });
  }
  return views;
}

export type RefundState = 'pending' | 'succeeded' | 'failed';

export interface RequestSummaryView {
  readonly requestId: string;
  readonly homeLabel: string;
  readonly timezone: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly state: 'pending' | 'expired' | 'cancelled_pre_accept';
  readonly reason: RequestClosureReason | null;
  readonly expiresAt: string;
  readonly creditsRequired: string;
}

export interface ReceivedRequestView {
  readonly requestId: string;
  readonly homeLabel: string;
  readonly timezone: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly state: 'pending' | 'expired' | 'cancelled_pre_accept';
  readonly expiresAt: string;
}

export interface RequestListData {
  readonly sent: readonly RequestSummaryView[];
  readonly received: readonly ReceivedRequestView[];
}

interface RequestRow {
  readonly id: string;
  readonly requester_party_id: string;
  readonly second_home_id: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly state: 'pending' | 'expired' | 'cancelled_pre_accept';
  readonly closure_reason: RequestClosureReason | null;
  readonly sent_at: string;
  readonly expires_at: string;
  readonly closed_at: string | null;
  readonly credits_required: string;
  readonly guarantee_credits: string;
  readonly complement_credits: string;
  readonly operation_id: string;
}

const requestColumns = sql`r.id, r.requester_party_id, r.second_home_id, r.checkin::text AS checkin,
  r.checkout::text AS checkout, r.state, r.closure_reason, to_json(r.sent_at)#>>'{}' AS sent_at,
  to_json(r.expires_at)#>>'{}' AS expires_at, to_json(r.closed_at)#>>'{}' AS closed_at,
  r.credits_required::text AS credits_required, r.guarantee_credits::text AS guarantee_credits,
  r.complement_credits::text AS complement_credits, r.operation_id`;

async function homeLabels(tx: DatabaseTransaction, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, { label: string; timezone: string }>();
  const rows = await tx
    .selectFrom('app.second_home')
    .select(['id', 'label', 'timezone'])
    .where('id', 'in', [...new Set(ids)])
    .execute();
  return new Map(rows.map((row) => [row.id, { label: row.label, timezone: row.timezone }]));
}

/** Minhas solicitações (RLS do solicitante) e Recebidas (visão restrita do detentor), mais recentes primeiro. */
export async function readRequestList(
  session: VerifiedSession,
  deps: RequestReadDependencies = {},
): Promise<RequestListData> {
  const db = deps.db ?? getDatabase();
  const read = await withUserThenServerRead(
    db,
    claims(session),
    async (tx) => {
      const { rows: sent } =
        await sql<RequestRow>`SELECT ${requestColumns} FROM app.luxchange_request r
         ORDER BY r.sent_at DESC, r.id`.execute(tx);
      const { rows: received } = await sql<{
        id: string;
        second_home_id: string;
        checkin: string;
        checkout: string;
        state: RequestRow['state'];
        expires_at: string;
      }>`SELECT v.id, v.second_home_id, v.checkin::text AS checkin, v.checkout::text AS checkout, v.state,
                to_json(v.expires_at)#>>'{}' AS expires_at
           FROM app.luxchange_request_received v ORDER BY v.sent_at DESC, v.id`.execute(tx);
      return { sent, received };
    },
    async (tx, rows) => ({
      ...rows,
      homes: await homeLabels(tx, [
        ...rows.sent.map((row) => row.second_home_id),
        ...rows.received.map((row) => row.second_home_id),
      ]),
    }),
  );
  if (read === null) return { sent: [], received: [] };
  const home = (id: string) => read.homes.get(id) ?? { label: '', timezone: 'America/Sao_Paulo' };
  return {
    sent: read.sent.map((row) => ({
      requestId: row.id,
      homeLabel: home(row.second_home_id).label,
      timezone: home(row.second_home_id).timezone,
      checkin: row.checkin,
      checkout: row.checkout,
      state: row.state,
      reason: row.closure_reason,
      expiresAt: row.expires_at,
      creditsRequired: row.credits_required,
    })),
    received: read.received.map((row) => ({
      requestId: row.id,
      homeLabel: home(row.second_home_id).label,
      timezone: home(row.second_home_id).timezone,
      checkin: row.checkin,
      checkout: row.checkout,
      state: row.state,
      expiresAt: row.expires_at,
    })),
  };
}

export interface RequestDetailView extends RequestSummaryView {
  readonly partyId: string;
  readonly sentAt: string;
  readonly closedAt: string | null;
  readonly guaranteeCredits: string;
  readonly complementCredits: string;
  readonly nightCredits: readonly { readonly date: string; readonly credits: string }[];
  readonly complement: readonly {
    readonly homeLabel: string;
    readonly date: string;
    readonly credits: string;
  }[];
  readonly feeAmountMinor: string;
  readonly paymentState: string;
  /** Estado real do estorno da Taxa (`null` = Taxa paga, sem estorno). */
  readonly refundState: RefundState | null;
}

/** Detalhe da Request do solicitante (`null` = de outra party ou inexistente: sem oráculo). */
export async function readRequestDetail(
  session: VerifiedSession,
  requestId: string,
  deps: RequestReadDependencies = {},
): Promise<RequestDetailView | null> {
  const db = deps.db ?? getDatabase();
  return withUserThenServerRead(
    db,
    claims(session),
    async (tx) => {
      const { rows } = await sql<RequestRow>`SELECT ${requestColumns} FROM app.luxchange_request r
         WHERE r.id = ${requestId}::uuid`.execute(tx);
      if (rows[0] === undefined) return null;
      // Créditos de cada noite: os termos apresentados e aceitos no envio (consentimento, PD-012 item 4).
      const { rows: nights } = await sql<{ date: string; credits: string }>`
        SELECT n->>'date' AS date, n->>'credits' AS credits FROM app.luxchange_request_consent c,
               jsonb_array_elements(c.terms->'requested_nights') n
         WHERE c.request_id = ${requestId}::uuid ORDER BY n->>'date'`.execute(tx);
      const { rows: complement } = await sql<{ home: string; date: string; credits: string }>`
        SELECT second_home_id::text AS home, stay_date::text AS date, potential_credits::text AS credits
          FROM app.luxchange_request_complement_night WHERE request_id = ${requestId}::uuid
         ORDER BY stay_date, second_home_id`.execute(tx);
      return { row: rows[0], nights, complement };
    },
    async (tx, { row, nights, complement }) => {
      const homes = await homeLabels(tx, [
        row.second_home_id,
        ...complement.map((night) => night.home),
      ]);
      const { rows: money } = await sql<{
        amount: string;
        payment_state: string;
        refund_state: RefundState | null;
      }>`SELECT f.amount_minor::text AS amount, p.state AS payment_state,
                (SELECT x.state FROM app.refund x WHERE x.payment_id = p.id ORDER BY x.created_at DESC LIMIT 1)
                  AS refund_state
           FROM app.fee_charge f JOIN app.payment p ON p.id = f.payment_id
          WHERE f.operation_id = ${row.operation_id}::uuid LIMIT 1`.execute(tx);
      return { row, nights, complement, homes, money: money[0] ?? null };
    },
  ).then((read) => {
    if (read === null) return null;
    const { row, homes, money } = read;
    const home = homes.get(row.second_home_id) ?? { label: '', timezone: 'America/Sao_Paulo' };
    return {
      requestId: row.id,
      partyId: row.requester_party_id,
      homeLabel: home.label,
      timezone: home.timezone,
      checkin: row.checkin,
      checkout: row.checkout,
      state: row.state,
      reason: row.closure_reason,
      expiresAt: row.expires_at,
      sentAt: row.sent_at,
      closedAt: row.closed_at,
      creditsRequired: row.credits_required,
      guaranteeCredits: row.guarantee_credits,
      complementCredits: row.complement_credits,
      nightCredits: read.nights,
      complement: read.complement.map((night) => ({
        homeLabel: homes.get(night.home)?.label ?? '',
        date: night.date,
        credits: night.credits,
      })),
      feeAmountMinor: money?.amount ?? '0',
      paymentState: money?.payment_state ?? 'pending',
      refundState: money?.refund_state ?? null,
    };
  });
}

export interface CommittedDateView {
  readonly requestId: string;
  readonly secondHomeId: string;
  readonly homeLabel: string;
  readonly date: string;
  readonly credits: string;
}

/**
 * Datas próprias comprometidas com Request pendente (Carteira, depósito, reservas; spec §13.5 item 8): Créditos
 * potenciais, nunca saldo. Só as Requests pendentes das parties representadas (RLS do solicitante).
 */
export async function readCommittedDates(
  session: VerifiedSession,
  partyId: string | null,
  deps: RequestReadDependencies = {},
): Promise<CommittedDateView[]> {
  const db = deps.db ?? getDatabase();
  const rows = await withUserRead(db, claims(session), async (tx) => {
    const { rows: found } = await sql<{
      request_id: string;
      home: string;
      date: string;
      credits: string;
    }>`SELECT c.request_id::text AS request_id, c.second_home_id::text AS home, c.stay_date::text AS date,
              c.potential_credits::text AS credits
         FROM app.luxchange_request_complement_night c
         JOIN app.luxchange_request r ON r.id = c.request_id
        WHERE r.state = 'pending' AND c.state = 'active'
          AND (${partyId}::uuid IS NULL OR r.requester_party_id = ${partyId}::uuid)
        ORDER BY c.stay_date, c.second_home_id`.execute(tx);
    return found;
  });
  if (rows.length === 0) return [];
  const homes = await withUserThenServerRead(
    db,
    claims(session),
    async () => true,
    (tx) =>
      homeLabels(
        tx,
        rows.map((row) => row.home),
      ),
  );
  return rows.map((row) => ({
    requestId: row.request_id,
    secondHomeId: row.home,
    homeLabel: homes?.get(row.home)?.label ?? '',
    date: row.date,
    credits: row.credits,
  }));
}

/** Request pendente do solicitante que compromete a reserva (`null` = nenhuma ou de party não representada). */
export async function readBookingCommitment(
  session: VerifiedSession,
  bookingId: string,
  deps: RequestReadDependencies = {},
): Promise<string | null> {
  const db = deps.db ?? getDatabase();
  return withUserRead(db, claims(session), async (tx) => {
    const { rows } = await sql<{ id: string }>`
      SELECT r.id::text AS id FROM app.luxchange_request_complement_unit u
        JOIN app.luxchange_request r ON r.id = u.request_id
       WHERE u.booking_id = ${bookingId}::uuid AND r.state = 'pending'
         AND EXISTS (SELECT 1 FROM app.luxchange_request_complement_night c
                      WHERE c.unit_id = u.id AND c.state = 'active')
       LIMIT 1`.execute(tx);
    return rows[0]?.id ?? null;
  });
}
