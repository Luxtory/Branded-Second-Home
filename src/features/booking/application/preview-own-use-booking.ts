import {
  addCivilDays,
  longestStayThrough,
  MAX_STAY_NIGHTS,
  STAY_NEIGHBORHOOD_DAYS,
  stayNights,
} from '../domain/own-use-stay';
import type {
  BookingStore,
  OwnUseFacts,
  OwnUseInventoryPort,
  OwnUseRightsPort,
  SealedOwnUseNight,
  UseRightBucket,
} from './create-own-use-booking';

/** Holding já autorizada pela leitura do Titular sob RLS (delegação ativa + holding vigente). */
export interface PreviewHolding {
  readonly holdingId: string;
  readonly secondHomeId: string;
  readonly role: 'owner' | 'co_owner';
  readonly stakeId: string | null;
}

/** Motivo de um período impossível, com os dados para o Titular saber o que fazer (nunca quem ocupa a noite). */
export type OwnUsePreviewIssue =
  | { readonly code: 'order' }
  | { readonly code: 'outside'; readonly dates: readonly string[] }
  | { readonly code: 'started'; readonly dates: readonly string[] }
  | { readonly code: 'own_booking'; readonly dates: readonly string[] }
  | { readonly code: 'unavailable'; readonly dates: readonly string[] }
  | { readonly code: 'window'; readonly exerciseYear: number; readonly opensAt: string | null }
  | { readonly code: 'leap_not_attributed'; readonly date: string }
  | {
      readonly code: 'balance';
      readonly exerciseYear: number;
      readonly bucket: UseRightBucket;
      readonly needed: number;
      readonly remaining: number;
    }
  | { readonly code: 'stay_length'; readonly stay: number; readonly adjacent: boolean };

export interface OwnUsePreviewUsage {
  readonly exerciseYear: number;
  readonly bucket: UseRightBucket;
  readonly nights: number;
  readonly remaining: number;
}

/** Prévia: o servidor confere as mesmas regras do command, sem travas nem escrita — a confirmação revalida tudo. */
export interface OwnUsePreview {
  readonly ok: boolean;
  readonly nights: readonly string[];
  readonly usage: readonly OwnUsePreviewUsage[];
  readonly stay: number;
  readonly issues: readonly OwnUsePreviewIssue[];
}

/** Noites ocupadas por reservas de uso próprio da holding (Owner e Co-Owner: a reserva é da holding que a abriu). */
export interface HoldingNightsPort<Tx> {
  holdingOwnUseNights(
    tx: Tx,
    holdingId: string,
    from: string,
    to: string,
  ): Promise<readonly string[]>;
}

export interface PreviewOwnUseDependencies<Tx> {
  readonly store: Pick<BookingStore<Tx>, 'sealedNights' | 'ownUseNights'> & HoldingNightsPort<Tx>;
  readonly inventory: Pick<OwnUseInventoryPort<Tx>, 'nightStates'>;
  readonly rights: Pick<OwnUseRightsPort<Tx>, 'remaining'>;
  readonly findFacts: (tx: Tx, secondHomeId: string) => Promise<OwnUseFacts | null>;
  readonly windowOpensAt: (
    facts: OwnUseFacts,
    stakeId: string,
    exerciseYear: number,
    isLeapDay: boolean,
  ) => Date | null;
}

const bucketOf = (night: SealedOwnUseNight): UseRightBucket =>
  night.isLeapDay ? 'leap' : night.season;
const keyOf = (exerciseYear: number, bucket: UseRightBucket) => `${exerciseYear}:${bucket}`;

function usageOf(nights: readonly SealedOwnUseNight[]) {
  const usage = new Map<string, { exerciseYear: number; bucket: UseRightBucket; nights: number }>();
  for (const night of nights) {
    const bucket = bucketOf(night);
    const key = keyOf(night.exerciseYear, bucket);
    const entry = usage.get(key) ?? { exerciseYear: night.exerciseYear, bucket, nights: 0 };
    usage.set(key, { ...entry, nights: entry.nights + 1 });
  }
  return [...usage.values()];
}

/** Noites ocupadas pela própria Ação, ocupadas por outros e sem custódia elegível (TECH-021, TECH-023, INV-1). */
async function availabilityIssues<Tx>(
  deps: PreviewOwnUseDependencies<Tx>,
  tx: Tx,
  holding: PreviewHolding,
  nights: readonly string[],
): Promise<OwnUsePreviewIssue[]> {
  const states = await deps.inventory.nightStates(tx, holding.secondHomeId, nights);
  // Reserva da própria holding (Owner e Co-Owner): motivo funcional específico; de outra holding, só indisponível.
  const own = new Set(
    await deps.store.holdingOwnUseNights(
      tx,
      holding.holdingId,
      nights[0]!,
      addCivilDays(nights.at(-1)!, 1),
    ),
  );
  const root = holding.role === 'owner' ? 'owner' : 'spe_pool';
  const mine = nights.filter((night) => own.has(night));
  const blocked = nights.filter((night) => {
    if (own.has(night)) return false;
    const state = states.find((candidate) => candidate.stayDate === night);
    return state === undefined || state.occupied || state.holderKind !== root;
  });
  const issues: OwnUsePreviewIssue[] = [];
  if (mine.length > 0) issues.push({ code: 'own_booking', dates: mine });
  if (blocked.length > 0) issues.push({ code: 'unavailable', dates: blocked });
  return issues;
}

/** Janela, 29/02 atribuído, saldo por exercício e categoria e permanência com as adjacentes (só Co-Owner). */
async function rightsIssues<Tx>(
  deps: PreviewOwnUseDependencies<Tx>,
  tx: Tx,
  holding: PreviewHolding & { readonly stakeId: string },
  sealed: readonly SealedOwnUseNight[],
  now: Date,
) {
  const issues: OwnUsePreviewIssue[] = [];
  const facts = await deps.findFacts(tx, holding.secondHomeId);
  const windows = new Map(
    sealed.map((night) => [`${night.exerciseYear}:${night.isLeapDay}`, night]),
  );
  for (const night of windows.values()) {
    const opensAt =
      facts === null
        ? null
        : deps.windowOpensAt(facts, holding.stakeId, night.exerciseYear, night.isLeapDay);
    if (opensAt === null || opensAt.getTime() > now.getTime())
      issues.push({
        code: 'window',
        exerciseYear: night.exerciseYear,
        opensAt: opensAt?.toISOString() ?? null,
      });
  }
  const needed = usageOf(sealed);
  const remaining = await deps.rights.remaining(tx, holding.stakeId, needed);
  const usage = needed.map((entry) => ({
    ...entry,
    remaining: remaining.get(keyOf(entry.exerciseYear, entry.bucket)) ?? 0,
  }));
  for (const entry of usage) {
    if (entry.remaining >= entry.nights) continue;
    const leap = sealed.find(
      (night) => night.isLeapDay && night.exerciseYear === entry.exerciseYear,
    );
    issues.push(
      entry.bucket === 'leap' && leap !== undefined
        ? { code: 'leap_not_attributed', date: leap.stayDate }
        : {
            code: 'balance',
            exerciseYear: entry.exerciseYear,
            bucket: entry.bucket,
            needed: entry.nights,
            remaining: entry.remaining,
          },
    );
  }
  const nights = sealed.map((night) => night.stayDate);
  const neighbors = await deps.store.ownUseNights(
    tx,
    holding.stakeId,
    addCivilDays(nights[0]!, -STAY_NEIGHBORHOOD_DAYS),
    addCivilDays(nights.at(-1)!, STAY_NEIGHBORHOOD_DAYS + 1),
  );
  const stay = longestStayThrough(neighbors, nights);
  if (stay > MAX_STAY_NIGHTS)
    issues.push({ code: 'stay_length', stay, adjacent: stay > nights.length });
  return { issues, usage, stay };
}

/**
 * Prévia do `create_own_use_booking` (REQ-034, REQ-035, REQ-037, PD-002, TECH-042, TECH-043, TECH-045): as mesmas regras,
 * sem travas nem escrita, reunindo todos os motivos em vez de recusar no primeiro. O calendário só sugere; a confirmação
 * revalida tudo no banco (ADR-0026).
 */
export async function previewOwnUseBooking<Tx>(
  deps: PreviewOwnUseDependencies<Tx>,
  tx: Tx,
  input: {
    readonly holding: PreviewHolding;
    readonly checkinDate: string;
    readonly checkoutDate: string;
    readonly now: Date;
  },
): Promise<OwnUsePreview> {
  const { holding, now } = input;
  const nights = stayNights(input.checkinDate, input.checkoutDate);
  if (nights.length < 1)
    return { ok: false, nights, usage: [], stay: 0, issues: [{ code: 'order' }] };
  const sealed = await deps.store.sealedNights(
    tx,
    holding.secondHomeId,
    input.checkinDate,
    input.checkoutDate,
  );
  const sealedDates = new Set(sealed.map((night) => night.stayDate));
  const outside = nights.filter((night) => !sealedDates.has(night));
  if (outside.length > 0)
    return {
      ok: false,
      nights,
      usage: [],
      stay: nights.length,
      issues: [{ code: 'outside', dates: outside }],
    };
  const issues: OwnUsePreviewIssue[] = [];
  // TECH-043: noite futura = `now < checkin_at`.
  const started = sealed
    .filter((night) => night.checkInAt.getTime() <= now.getTime())
    .map((night) => night.stayDate);
  if (started.length > 0) issues.push({ code: 'started', dates: started });
  issues.push(...(await availabilityIssues(deps, tx, holding, nights)));
  if (holding.stakeId === null)
    return { ok: issues.length === 0, nights, usage: [], stay: nights.length, issues };
  const rights = await rightsIssues(
    deps,
    tx,
    { ...holding, stakeId: holding.stakeId },
    sealed,
    now,
  );
  issues.push(...rights.issues);
  return { ok: issues.length === 0, nights, usage: rights.usage, stay: rights.stay, issues };
}
