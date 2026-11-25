import { z } from 'zod';
import {
  chargeLuxchangeFee,
  lockPayments,
  quoteLuxchangeFee,
  reverseLuxchangeFee,
  type BillingStore,
} from '@/features/billing';
import type { CedableBooking, OwnUseCessionPort } from '@/features/booking';
import { holdCredits, holdCreditsReleasing, type CreditStore } from '@/features/credits';
import {
  CapabilityNotActivatedError,
  CommandRejection,
  LockSequence,
  type CommandContext,
  type CommandHandler,
} from '@/features/platform';
import {
  creditsForPrl,
  resolveEconomicTerms,
  type EconomicTerms,
  type EconomicTermsStore,
} from '@/features/pricing';
import { CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY } from './ports';
import { bookingNights, sameCredits, sumCredits, type DepositNightFacts } from '../domain/deposit';
import {
  MAX_REQUEST_NIGHTS,
  composeRequest,
  evaluateComplement,
  evaluateRequested,
  periodNights,
  requestTerms,
  type ComplementNightCredits,
  type ComplementUnit,
  type RequestComposition,
  type RequestHolding,
} from '../domain/request';
import { requestClosedEvent, requestSentEvent } from './request-events';
import {
  LUXCHANGE_EXCHANGE_CAPABILITY,
  PAYMENTS_CAPABILITY,
  type LockedRequest,
  type RequestStore,
} from './request-ports';

const CREDITS = /^(0|[1-9][0-9]{0,14})(\.[0-9]{0,11}[1-9])?$/;
const credits = z.string().regex(CREDITS);
const positiveCredits = credits.refine((value) => value !== '0');
const date = z.iso.date();
const HOUR_MS = 3_600_000;
/** Termos econômicos que o envio vincula (TECH-031; ADR-0037 §1). */
const REQUEST_PARAMETERS = [
  'credit_multiplier',
  'credit_validity_months',
  'luxchange_fee_minimum',
  'luxchange_fee_rate',
  'request_deadline_hours',
] as const;

const complementUnit = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('owner_night'), second_home_id: z.uuid(), stay_date: date }),
  z.strictObject({ kind: z.literal('co_owner_booking'), booking_id: z.uuid() }),
]);

export const sendRequestInput = z.strictObject({
  /** Party solicitante que age (escopo `party` do guard). */
  party_id: z.uuid(),
  /** Second Home solicitada e período `[checkin, checkout)` (noites contínuas, até 366). */
  second_home_id: z.uuid(),
  checkin: date,
  checkout: date,
  /** Unidades do complemento por datas (PD-012), de holdings do solicitante. */
  complement: z.array(complementUnit).max(MAX_REQUEST_NIGHTS),
  /** Pagamento aprovado da Taxa de intermediação (TECH-080, etapa 4). */
  payment_id: z.uuid(),
  accepted_policy_id: z.uuid(),
  consent_text_version: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  /** Termos revisados pelo solicitante, conferidos com o recálculo no instante transacional (ADR-0037 §3). */
  expected: z.strictObject({
    night_credits: z.array(positiveCredits).min(1).max(MAX_REQUEST_NIGHTS),
    credits_required: positiveCredits,
    complement_nights: z
      .array(
        z.strictObject({ second_home_id: z.uuid(), stay_date: date, credits: positiveCredits }),
      )
      .max(MAX_REQUEST_NIGHTS),
    complement_credits: credits,
    guarantee_credits: credits,
    fee_amount_minor: z.string().regex(/^[1-9][0-9]{0,15}$/),
    deadline_hours: z.number().int().min(1).max(9999),
    credit_validity_months: z.number().int().min(1).max(1200),
  }),
});
export type SendRequestInput = z.infer<typeof sendRequestInput>;

export type SendRequestResult = {
  readonly request_id: string;
  readonly operation_id: string;
  readonly second_home_id: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly sent_at: string;
  readonly expires_at: string;
  readonly credits_required: string;
  readonly guarantee_credits: string;
  readonly complement_credits: string;
  readonly complement_consumption: string;
  readonly complement_excess: string;
  readonly fee_amount_minor: string;
  readonly fee_charge_id: string;
  /** Requests anteriores do solicitante encerradas nesta transação (EC-21) e os estornos `pending` das Taxas delas. */
  readonly materialized: readonly string[];
  readonly refund_ids: readonly string[];
};

export interface SendRequestDependencies<Tx> {
  readonly store: RequestStore<Tx>;
  readonly bookings: Pick<OwnUseCessionPort<Tx>, 'lock' | 'find'>;
  readonly terms: EconomicTermsStore<Tx>;
  readonly credits: CreditStore<Tx>;
  readonly billing: BillingStore<Tx>;
  readonly snapshots: {
    record(tx: Tx, operationId: string, terms: EconomicTerms): Promise<void>;
    recordPolicy(tx: Tx, operationId: string, terms: EconomicTerms): Promise<void>;
  };
}

const reject = (code: ConstructorParameters<typeof CommandRejection>[0]) =>
  new CommandRejection(code);
const nightKey = (secondHomeId: string, stayDate: string) => `${secondHomeId}:${stayDate}`;

/**
 * `send_request` (REQ-062; PD-005, PD-007, PD-012; TECH-022–024, TECH-031, TECH-043, TECH-051, TECH-053, TECH-054,
 * TECH-071, TECH-073, TECH-080, TECH-082; ADR-0037 §3–§4): o solicitante pede noites contínuas de outro Titular, com
 * Créditos em Garantia (FEFO) e, se quiser, datas próprias comprometidas sob a condição do aceite; a Taxa de
 * intermediação já está paga. Ordem: chaves → Requests a materializar (1) → Memberships (3) → representação → Ações (4) →
 * noites (5) → reservas → política, parâmetros e PRL (instante único) → termos revisados → encerramentos materializados,
 * snapshot, Request, noites, complemento, consentimento → Garantia (7) → Fee (8) → outbox → auditoria. O banco confere
 * cada escrita e a completude no COMMIT; aqui as recusas saem cedo e na ordem do REQ-098.
 */
export function createSendRequestHandler<Tx>(
  deps: SendRequestDependencies<Tx>,
): CommandHandler<SendRequestInput, SendRequestResult, Tx> {
  return {
    command: 'send_request',
    input: sendRequestInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'party', id: input.party_id }),
    async execute(context) {
      const { input, tx, actor } = context;
      await requireCapabilities(deps.store, tx, input.complement.length > 0);
      if (actor.kind !== 'user' || actor.actingPartyId !== input.party_id)
        throw reject('ERR_PERMISSION');
      const decided = await decide(
        deps,
        {
          tx,
          locks: context.locks,
          now: context.now,
          userId: actor.userId,
          requireEligibleMembership: (parties) => context.requireEligibleMembership(parties),
        },
        input,
        input.accepted_policy_id,
      );
      if (!reviewedMatches(input.expected, decided)) throw reject('ERR_REQUEST_TERMS_CHANGED');
      return write(context, deps, decided);
    },
  };
}

/** O que o pedido define (envio e prévia): party, Second Home, período e unidades do complemento. */
export type RequestShape = Pick<
  SendRequestInput,
  'party_id' | 'second_home_id' | 'checkin' | 'checkout' | 'complement'
>;

interface DecisionContext<Tx> {
  readonly tx: Tx;
  readonly locks: LockSequence;
  readonly now: Date;
  readonly userId: string;
  /**
   * Envio: trava e confere o Membership (classe 3) pelo executor, e todas as travas da ordem total são tomadas. Ausente =
   * prévia: só leitura (sem travas de linha, de noite ou de reserva; nada é materializado).
   */
  readonly requireEligibleMembership?: (partyIds: readonly string[]) => Promise<void>;
}

/**
 * Decisão do envio e da prévia (mesmas regras; ADR-0037 §3 itens 1 e 5): detentor, unidades, travas (só no envio),
 * fatos relidos, elegibilidade, termos num instante único, composição e antecedência do complemento. `acceptedPolicyId`
 * `null` (prévia) = a política vigente no instante, para apresentação.
 */
async function decide<Tx>(
  deps: SendRequestDependencies<Tx>,
  ctx: DecisionContext<Tx>,
  input: RequestShape,
  acceptedPolicyId: string | null,
): Promise<Decided> {
  const { tx, locks, now } = ctx;
  const sending = ctx.requireEligibleMembership !== undefined;
  const requester = input.party_id;
  const nights = periodNights(input.checkin, input.checkout);
  if (nights === null) throw reject('ERR_VALIDATION');

  // Leituras antes das travas só para saber o que travar; tudo é relido e decidido depois delas.
  const holder = await requestedHolder(deps, tx, input.second_home_id, nights, now);
  if (holder.partyId === requester) throw reject('ERR_PERMISSION');
  const holdings = await deps.store.currentHoldings(tx, requester, now);
  if (holdings.length === 0) throw reject('ERR_PERMISSION');
  const units = await resolveUnits(deps, tx, input.complement, holdings);
  const unitNights = units.flatMap((unit) =>
    unit.nights.map((stayDate) => ({ secondHomeId: unit.secondHomeId, stayDate })),
  );
  const unitBookings = units.flatMap((unit) => (unit.bookingId === null ? [] : [unit.bookingId]));

  let materializing: readonly LockedRequest[] = [];
  if (sending) {
    // Classe 1: Requests do solicitante com compromisso ativo sobre as unidades — encerradas aqui se não puderem mais
    // ser aceitas; se alguma ainda puder, a unidade segue comprometida (ADR-0037 §4, §6).
    const blocking = await deps.store.blockingRequests(tx, requester, unitNights, unitBookings);
    const locked = await deps.store.lockRequests(tx, locks.claim('luxchange_request', blocking));
    materializing = locked.filter((request) => request.state === 'pending');
    if (materializing.some((request) => request.closureReason === null))
      throw reject('ERR_CAPACITY_UNAVAILABLE');
    await ctx.requireEligibleMembership!([requester, holder.partyId]);
    if (!(await deps.store.lockDelegation(tx, ctx.userId, requester, now)))
      throw reject('ERR_PERMISSION');
  } else {
    if (!(await deps.store.membershipsEligible(tx, [requester, holder.partyId])))
      throw reject('ERR_MEMBERSHIP_INELIGIBLE');
    if (!(await deps.store.represents(tx, ctx.userId, requester, now)))
      throw reject('ERR_PERMISSION');
  }
  if (await deps.store.represents(tx, ctx.userId, holder.partyId, now))
    throw reject('ERR_PERMISSION');

  if (sending) {
    const stakes = [holder, ...units.map((unit) => unit.holding)].flatMap((holding) =>
      holding.modality === 'co_owner' && holding.stakeId !== null ? [holding.stakeId] : [],
    );
    for (const stake of locks.claim('stake', stakes)) await deps.store.lockStake(tx, stake);
    const nightKeys = locks.claim('second_home_date', [
      ...nights.map((night) => [input.second_home_id, night] as const),
      ...unitNights.map((night) => [night.secondHomeId, night.stayDate] as const),
    ]);
    for (const [home, night] of nightKeys) await deps.store.lockNight(tx, home, night);
  }

  const requestedFacts = await deps.store.nightFacts(tx, input.second_home_id, nights);
  const holderBookings = requestedFacts.flatMap((night) =>
    holder.modality === 'co_owner' && night.occupancy !== null ? [night.occupancy.bookingId] : [],
  );
  const bookingKeys = sending
    ? locks.claim('booking', [...holderBookings, ...unitBookings])
    : [...new Set([...holderBookings, ...unitBookings])];
  if (sending) for (const booking of bookingKeys) await deps.bookings.lock(tx, booking);
  const bookings = await deps.bookings.find(tx, bookingKeys);
  const unitFacts = await complementFacts(deps.store, tx, units);
  const committed = await deps.store.committed(
    tx,
    [
      ...nights.map((stayDate) => ({ secondHomeId: input.second_home_id, stayDate })),
      ...unitNights,
    ],
    unitBookings,
  );
  const nowMs = Date.parse(await deps.store.databaseInstant(tx));
  const requested = evaluateRequested({
    holder,
    selected: nights,
    nights: requestedFacts,
    bookings,
    committed: new Set(
      nights.filter((night) => committed.nights.has(nightKey(input.second_home_id, night))),
    ),
    nowMs,
  });
  if (!requested.ok) throw reject(requested.code);

  const terms = await resolveEconomicTerms(tx, locks, deps.terms, {
    parameters: REQUEST_PARAMETERS,
    nights: { secondHomeId: input.second_home_id, dates: nights },
    ...(units.length === 0 ? {} : { otherNights: groupByHome(units) }),
    ...(acceptedPolicyId === null
      ? {}
      : { policy: { mechanism: 'luxchange_request' as const, acceptedPolicyId } }),
  });
  const policy =
    terms.policy ?? (await deps.terms.policyAt(tx, 'luxchange_request', terms.resolvedAt));
  if (policy === null) throw reject('ERR_POLICY_MISSING');
  const priced = priceRequest(terms, nights, units);
  if (priced.composition === null) throw reject('ERR_VALIDATION');
  const fee = quoteLuxchangeFee(terms);
  const deadlineHours = Number(terms.parameters.request_deadline_hours!.value);
  const validityMonths = Number(terms.parameters.credit_validity_months!.value);
  const complement = evaluateComplement({
    units,
    nights: unitFacts,
    bookings,
    committed: new Set([...committed.nights, ...committed.bookings]),
    // Antecedência no instante máximo de aceite (TECH-043); o banco confere com o `expires_at` gravado.
    expiresAtMs: Date.parse(terms.resolvedAt) + deadlineHours * HOUR_MS,
  });
  if (!complement.ok) throw reject(complement.code);
  return {
    holder,
    nights,
    bookingByNight: requested.bookingByNight,
    units,
    terms,
    policyId: policy.policyId,
    composition: priced.composition,
    nightCredits: priced.nightCredits,
    complementNights: priced.complementNights,
    unitNights: priced.unitNights,
    unitCredits: priced.unitCredits,
    feeAmountMinor: fee.amountMinor,
    feeCurrency: fee.currency,
    deadlineHours,
    validityMonths,
    materializing,
  };
}

export type RequestQuote = {
  readonly second_home_id: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly night_credits: readonly string[];
  readonly complement_nights: readonly {
    readonly second_home_id: string;
    readonly stay_date: string;
    readonly credits: string;
  }[];
  readonly credits_required: string;
  readonly complement_credits: string;
  readonly guarantee_credits: string;
  readonly complement_consumption: string;
  readonly complement_excess: string;
  readonly fee_amount_minor: string;
  readonly fee_currency: 'BRL';
  readonly deadline_hours: number;
  readonly credit_validity_months: number;
  readonly policy_id: string;
  readonly resolved_at: string;
};

/**
 * Prévia (ADR-0037 §3 item 1; leitura do servidor): as mesmas regras do envio, sem travas nem escrita, com a política
 * vigente para apresentação. Os valores voltam no formato dos termos revisados (`expected` do envio); o envio recalcula
 * tudo no instante transacional e recusa com `ERR_REQUEST_TERMS_CHANGED` se algo mudou. Chaves fechadas → indisponível.
 */
export async function quoteRequest<Tx>(
  deps: SendRequestDependencies<Tx>,
  tx: Tx,
  viewer: { readonly userId: string; readonly now: Date },
  input: RequestShape,
): Promise<RequestQuote> {
  await requireCapabilities(deps.store, tx, input.complement.length > 0);
  const decided = await decide(
    deps,
    { tx, locks: new LockSequence(), now: viewer.now, userId: viewer.userId },
    input,
    null,
  );
  return {
    second_home_id: input.second_home_id,
    checkin: input.checkin,
    checkout: input.checkout,
    night_credits: decided.nightCredits,
    complement_nights: decided.complementNights.map((night) => ({
      second_home_id: night.secondHomeId,
      stay_date: night.stayDate,
      credits: night.credits,
    })),
    credits_required: decided.composition.creditsRequired,
    complement_credits: decided.composition.complementCredits,
    guarantee_credits: decided.composition.guaranteeCredits,
    complement_consumption: decided.composition.complementConsumption,
    complement_excess: decided.composition.complementExcess,
    fee_amount_minor: decided.feeAmountMinor.toString(),
    fee_currency: decided.feeCurrency,
    deadline_hours: decided.deadlineHours,
    credit_validity_months: decided.validityMonths,
    policy_id: decided.policyId,
    resolved_at: decided.terms.resolvedAt,
  };
}

async function requireCapabilities<Tx>(store: RequestStore<Tx>, tx: Tx, withComplement: boolean) {
  const active = await store.capabilities(tx);
  // Compromisso novo exige K4 (Garantia), K5 (Fee) e K7 (intercâmbio); com complemento, também a K6 (ADR-0037 §10).
  if (!active.exchange) throw new CapabilityNotActivatedError(LUXCHANGE_EXCHANGE_CAPABILITY);
  if (!active.credits) throw new CapabilityNotActivatedError(CREDITS_CAPABILITY);
  if (!active.payments) throw new CapabilityNotActivatedError(PAYMENTS_CAPABILITY);
  if (withComplement && !active.deposit)
    throw new CapabilityNotActivatedError(LUXCHANGE_DEPOSIT_CAPABILITY);
}

/** Detentor da capacidade solicitada pela primeira noite: Owner (custódia `owner`) ou a holding da reserva Co-Owner. */
async function requestedHolder<Tx>(
  deps: SendRequestDependencies<Tx>,
  tx: Tx,
  secondHomeId: string,
  nights: readonly string[],
  now: Date,
): Promise<RequestHolding> {
  const [first] = await deps.store.nightFacts(tx, secondHomeId, nights.slice(0, 1));
  let holder: RequestHolding | null = null;
  if (first?.custody?.holderKind === 'owner')
    holder = await deps.store.ownerHolding(tx, secondHomeId, now);
  else if (first?.occupancy !== null && first?.occupancy !== undefined) {
    const [booking] = await deps.bookings.find(tx, [first.occupancy.bookingId]);
    if (booking !== undefined) holder = await deps.store.holding(tx, booking.holdingId, now);
  }
  if (holder === null || holder.secondHomeId !== secondHomeId)
    throw reject('ERR_CAPACITY_UNAVAILABLE');
  return holder;
}

/** Unidades do complemento resolvidas nas holdings vigentes do solicitante (de outra party → indisponível). */
async function resolveUnits<Tx>(
  deps: SendRequestDependencies<Tx>,
  tx: Tx,
  input: SendRequestInput['complement'],
  holdings: readonly RequestHolding[],
): Promise<ComplementUnit[]> {
  const bookingIds = input.flatMap((unit) =>
    unit.kind === 'co_owner_booking' ? [unit.booking_id] : [],
  );
  const found = new Map<string, CedableBooking>(
    (await deps.bookings.find(tx, bookingIds)).map((booking) => [booking.id, booking]),
  );
  return input.map((unit): ComplementUnit => {
    if (unit.kind === 'owner_night') {
      const holding = holdings.find((candidate) => candidate.secondHomeId === unit.second_home_id);
      if (holding === undefined) throw reject('ERR_CAPACITY_UNAVAILABLE');
      return {
        kind: 'owner_night',
        holding,
        bookingId: null,
        secondHomeId: unit.second_home_id,
        nights: [unit.stay_date],
      };
    }
    const booking = found.get(unit.booking_id);
    const holding = holdings.find((candidate) => candidate.id === booking?.holdingId);
    if (booking === undefined || holding === undefined) throw reject('ERR_CAPACITY_UNAVAILABLE');
    return {
      kind: 'co_owner_booking',
      holding,
      bookingId: booking.id,
      secondHomeId: booking.secondHomeId,
      nights: bookingNights(booking),
    };
  });
}

async function complementFacts<Tx>(
  store: RequestStore<Tx>,
  tx: Tx,
  units: readonly ComplementUnit[],
): Promise<ReadonlyMap<string, DepositNightFacts>> {
  const facts = new Map<string, DepositNightFacts>();
  for (const { secondHomeId, dates } of groupByHome(units))
    for (const night of await store.nightFacts(tx, secondHomeId, dates))
      facts.set(nightKey(secondHomeId, night.stayDate), night);
  return facts;
}

function groupByHome(units: readonly ComplementUnit[]) {
  const byHome = new Map<string, Set<string>>();
  for (const unit of units)
    for (const night of unit.nights)
      byHome.set(unit.secondHomeId, (byHome.get(unit.secondHomeId) ?? new Set()).add(night));
  return [...byHome.entries()].map(([secondHomeId, dates]) => ({
    secondHomeId,
    dates: [...dates].sort(),
  }));
}

/** Créditos de cada noite solicitada e de cada noite do complemento, pelo PRL e pelo multiplicador do instante único. */
function priceRequest(
  terms: EconomicTerms,
  nights: readonly string[],
  units: readonly ComplementUnit[],
) {
  const multiplier = terms.parameters.credit_multiplier!.value;
  const byNight = new Map(terms.nights.map((night) => [night.stayDate, night]));
  const nightCredits = nights.map((stayDate) => {
    const night = byNight.get(stayDate)!;
    return creditsForPrl(BigInt(night.amountMinor), night.currency, multiplier);
  });
  const others = new Map(
    (terms.otherNights ?? []).map((night) => [nightKey(night.secondHomeId, night.stayDate), night]),
  );
  const unitNights = units.map((unit) =>
    unit.nights.map((stayDate) => {
      const night = others.get(nightKey(unit.secondHomeId, stayDate))!;
      return {
        secondHomeId: unit.secondHomeId,
        stayDate,
        prlId: night.prlId,
        credits: creditsForPrl(BigInt(night.amountMinor), night.currency, multiplier),
      };
    }),
  );
  const unitCredits = unitNights.map((list) => sumCredits(list.map((night) => night.credits)));
  return {
    nightCredits,
    unitNights,
    unitCredits,
    complementNights: unitNights.flat() as readonly (ComplementNightCredits & { prlId: string })[],
    composition: composeRequest(nightCredits, unitCredits),
  };
}

/** Termos revisados = recalculados, com igualdade decimal exata (ADR-0037 §3). */
function reviewedMatches(
  expected: SendRequestInput['expected'],
  actual: {
    readonly nightCredits: readonly string[];
    readonly complementNights: readonly ComplementNightCredits[];
    readonly composition: RequestComposition;
    readonly feeAmountMinor: bigint;
    readonly deadlineHours: number;
    readonly validityMonths: number;
  },
): boolean {
  const order = (a: ComplementNightCredits, b: ComplementNightCredits) =>
    a.secondHomeId === b.secondHomeId
      ? a.stayDate.localeCompare(b.stayDate)
      : a.secondHomeId < b.secondHomeId
        ? -1
        : 1;
  const reviewedNights = [...expected.complement_nights]
    .map((night) => ({
      secondHomeId: night.second_home_id,
      stayDate: night.stay_date,
      credits: night.credits,
    }))
    .sort(order);
  const actualNights = [...actual.complementNights].sort(order);
  return (
    expected.night_credits.length === actual.nightCredits.length &&
    expected.night_credits.every((value, index) =>
      sameCredits(value, actual.nightCredits[index]!),
    ) &&
    reviewedNights.length === actualNights.length &&
    reviewedNights.every(
      (night, index) =>
        night.secondHomeId === actualNights[index]!.secondHomeId &&
        night.stayDate === actualNights[index]!.stayDate &&
        sameCredits(night.credits, actualNights[index]!.credits),
    ) &&
    sameCredits(expected.credits_required, actual.composition.creditsRequired) &&
    sameCredits(expected.complement_credits, actual.composition.complementCredits) &&
    sameCredits(expected.guarantee_credits, actual.composition.guaranteeCredits) &&
    expected.fee_amount_minor === actual.feeAmountMinor.toString() &&
    expected.deadline_hours === actual.deadlineHours &&
    expected.credit_validity_months === actual.validityMonths
  );
}

interface Decided {
  readonly holder: RequestHolding;
  readonly nights: readonly string[];
  readonly bookingByNight: readonly (string | null)[];
  readonly units: readonly ComplementUnit[];
  readonly terms: EconomicTerms;
  readonly composition: RequestComposition;
  readonly nightCredits: readonly string[];
  readonly complementNights: readonly (ComplementNightCredits & { prlId: string })[];
  readonly unitNights: readonly (readonly (ComplementNightCredits & { prlId: string })[])[];
  readonly unitCredits: readonly string[];
  readonly feeAmountMinor: bigint;
  readonly feeCurrency: 'BRL';
  readonly policyId: string;
  readonly deadlineHours: number;
  readonly validityMonths: number;
  readonly materializing: readonly LockedRequest[];
}

/** Escritas do envio, na ordem da ADR-0037 §4, depois de todas as travas e decisões. */
async function write<Tx>(
  context: CommandContext<SendRequestInput, Tx>,
  deps: SendRequestDependencies<Tx>,
  decided: Decided,
): Promise<SendRequestResult> {
  const { input, tx, locks, operationId } = context;
  const requester = input.party_id;
  const closings = [];
  for (const request of decided.materializing)
    closings.push({
      request,
      closing: await deps.store.insertClosing(tx, request.id, operationId),
    });

  await deps.snapshots.record(tx, operationId, decided.terms);
  await deps.snapshots.recordPolicy(tx, operationId, decided.terms);
  const sent = await deps.store.insertRequest(tx, {
    operationId,
    requesterPartyId: requester,
    holder: decided.holder,
    checkin: input.checkin,
    checkout: input.checkout,
    creditsRequired: decided.composition.creditsRequired,
    guaranteeCredits: decided.composition.guaranteeCredits,
    complementCredits: decided.composition.complementCredits,
  });
  await deps.store.insertRequestNights(
    tx,
    sent.requestId,
    input.second_home_id,
    decided.nights.map((stayDate, index) => ({
      stayDate,
      bookingId: decided.bookingByNight[index]!,
    })),
  );
  await deps.store.insertComplement(
    tx,
    sent.requestId,
    decided.units.map((unit, index) => ({
      kind: unit.kind,
      holdingId: unit.holding.id,
      bookingId: unit.bookingId,
      secondHomeId: unit.secondHomeId,
      potentialCredits: decided.unitCredits[index]!,
      nights: decided.unitNights[index]!.map((night) => ({
        stayDate: night.stayDate,
        prlId: night.prlId,
        credits: night.credits,
      })),
    })),
  );
  const terms = requestTerms({
    composition: decided.composition,
    feeAmountMinor: decided.feeAmountMinor,
    feeCurrency: decided.feeCurrency,
    deadlineHours: decided.terms.parameters.request_deadline_hours!.value,
    validityMonths: decided.terms.parameters.credit_validity_months!.value,
    policyId: decided.policyId,
    requestedNights: decided.nights.map((stayDate, index) => ({
      stayDate,
      credits: decided.nightCredits[index]!,
    })),
    complementNights: decided.complementNights,
  });
  await deps.store.insertConsent(tx, sent.requestId, input.consent_text_version, terms);

  // Classe 7: Garantia em FEFO até o prazo da Request; no reenvio, liberação das Garantias materializadas na mesma trava.
  const ledger = { tx, locks, operationId };
  if (decided.materializing.length > 0)
    await holdCreditsReleasing(
      ledger,
      { store: deps.credits },
      {
        partyId: requester,
        quantity: decided.composition.guaranteeCredits,
        coverUntil: sent.expiresAt,
        releasing: decided.materializing.map((request) => request.operationId),
      },
    );
  else if (decided.composition.guaranteeCredits !== '0')
    await holdCredits(
      ledger,
      { store: deps.credits },
      {
        partyId: requester,
        quantity: decided.composition.guaranteeCredits,
        coverUntil: sent.expiresAt,
      },
    );

  // Classe 8: pagamentos travados de uma vez (Fees revertidos dos encerramentos materializados e o do envio).
  await lockPayments(ledger, { store: deps.billing }, [
    input.payment_id,
    ...decided.materializing.map((request) => request.paymentId),
  ]);
  const refundIds: string[] = [];
  for (const { request } of closings)
    refundIds.push(
      (
        await reverseLuxchangeFee(
          ledger,
          { store: deps.billing },
          { feeChargeId: request.feeChargeId },
        )
      ).refundId,
    );
  const fee = await chargeLuxchangeFee(
    ledger,
    { store: deps.billing },
    {
      paymentId: input.payment_id,
      payerPartyId: requester,
      terms: decided.terms,
    },
  );

  for (const { request, closing } of closings)
    context.emit(
      requestClosedEvent({
        request_id: request.id,
        requester_party_id: request.requesterPartyId,
        holder_party_id: request.holderPartyId,
        second_home_id: request.secondHomeId,
        checkin: request.checkin,
        checkout: request.checkout,
        state: closing.state,
        reason: closing.reason,
        guarantee_released: request.guaranteeCredits,
        closed_at: closing.closedAt,
      }),
    );
  context.emit(
    requestSentEvent({
      request_id: sent.requestId,
      requester_party_id: requester,
      holder_party_id: decided.holder.partyId,
      second_home_id: input.second_home_id,
      checkin: input.checkin,
      checkout: input.checkout,
      credits_required: decided.composition.creditsRequired,
      guarantee_credits: decided.composition.guaranteeCredits,
      complement_credits: decided.composition.complementCredits,
      complement_nights: decided.complementNights.length,
      expires_at: sent.expiresAt,
    }),
  );
  for (const { request, closing } of closings)
    context.audit({
      objectType: 'luxchange_request',
      objectId: request.id,
      before: { state: request.state },
      after: {
        act: 'close_request',
        state: closing.state,
        reason: closing.reason,
        by_request: sent.requestId,
      },
    });
  context.audit({
    objectType: 'luxchange_request',
    objectId: sent.requestId,
    before: null,
    after: {
      act: 'send_request',
      second_home_id: input.second_home_id,
      holder_holding_id: decided.holder.id,
      nights: [...decided.nights],
      credits_required: decided.composition.creditsRequired,
      guarantee_credits: decided.composition.guaranteeCredits,
      complement_credits: decided.composition.complementCredits,
      complement_units: decided.units.length,
      fee_charge_id: fee.feeChargeId,
      prl_versions: decided.terms.nights.map((night) => night.prlId),
      policy_version: decided.terms.policy!.policyId,
      resolved_at: decided.terms.resolvedAt,
      consent_text_version: input.consent_text_version,
      materialized: closings.map(({ request }) => request.id),
    },
  });
  return {
    request_id: sent.requestId,
    operation_id: operationId,
    second_home_id: input.second_home_id,
    checkin: input.checkin,
    checkout: input.checkout,
    sent_at: sent.sentAt,
    expires_at: sent.expiresAt,
    credits_required: decided.composition.creditsRequired,
    guarantee_credits: decided.composition.guaranteeCredits,
    complement_credits: decided.composition.complementCredits,
    complement_consumption: decided.composition.complementConsumption,
    complement_excess: decided.composition.complementExcess,
    fee_amount_minor: fee.amountMinor.toString(),
    fee_charge_id: fee.feeChargeId,
    materialized: closings.map(({ request }) => request.id),
    refund_ids: refundIds,
  };
}
