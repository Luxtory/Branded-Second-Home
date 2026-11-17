import {
  cancellationTerms,
  timelyUntil,
  type BookingState,
  type CancellationClass,
  type ExceptionType,
  type Micros,
  type Modality,
} from '../domain/own-use-lifecycle';

/**
 * Prévia do cancelamento pelo Titular (W13 E4b; REQ-080, REQ-081, REQ-084; spec booking §10.3, §10.15): a mesma regra do
 * command (`cancellationTerms`), no instante do servidor, com os instantes de check-in gravados. Pura: o que a tela
 * mostra antes de confirmar; o banco recalcula tudo na escrita e recusa termos diferentes (D7).
 */
export type UseRightBucket = 'alta' | 'media' | 'leap';

export interface PreviewNight {
  readonly stayDate: string;
  readonly checkinAt: Micros;
  /** Categoria e exercício da noite (TECH-027); só usados no Co-Owner. */
  readonly bucket: UseRightBucket;
  readonly exerciseYear: number;
}

export interface PreviewBalance {
  readonly bucket: UseRightBucket;
  readonly exerciseYear: number;
  readonly granted: number;
  readonly remaining: number;
}

export interface CancellationPreviewInput {
  readonly modality: Modality;
  readonly state: BookingState;
  readonly exceptionType: ExceptionType | null;
  readonly nights: readonly PreviewNight[];
  readonly balances: readonly PreviewBalance[];
  readonly lifecycleOpen: boolean;
  readonly at: Micros;
}

export interface BalanceAfter extends PreviewBalance {
  readonly returning: number;
  readonly after: number;
}

export type PreviewKind =
  /** Pode confirmar (K2 presente, ≥ 1 noite não iniciada, não suspenso). */
  | 'actionable'
  /** Mostra as consequências, mas as ações do ciclo estão fechadas (K2 ausente). */
  | 'closed'
  /** Apuração (P-B) + Co-Owner fora do prazo: suspenso até a apuração terminar (REQ-084). */
  | 'suspended'
  /** Todas as noites já começaram. */
  | 'nothing_left'
  /** Estado sem cancelamento (cancelada, no-show, concluída). */
  | 'not_cancellable';

export interface CancellationPreview {
  readonly kind: PreviewKind;
  readonly modality: Modality;
  readonly cancellationClass: CancellationClass | null;
  readonly firstAffectedDate: string | null;
  /** Último instante dentro do prazo (Co-Owner); `null` no Owner. */
  readonly timelyUntil: Micros | null;
  readonly started: readonly PreviewNight[];
  readonly affected: readonly PreviewNight[];
  /** Noites que voltam ao saldo do Direito de Uso (Co-Owner); 0 fora do prazo; `null` no Owner. */
  readonly returning: number | null;
  /** Saldos tocados pelo cancelamento (Co-Owner), com o valor depois; vazio no Owner. */
  readonly balances: readonly BalanceAfter[];
}

const CANCELLABLE: readonly BookingState[] = ['confirmed', 'in_use', 'in_exception'];

export function cancellationPreview(input: CancellationPreviewInput): CancellationPreview {
  const nights = [...input.nights].sort((a, b) => (a.stayDate < b.stayDate ? -1 : 1));
  const terms = cancellationTerms(input.modality, nights, input.at);
  const affected = nights.filter((night) => input.at < night.checkinAt);
  const started = nights.filter((night) => input.at >= night.checkinAt);
  const coOwner = input.modality === 'co_owner';
  const returnsToBalance = coOwner && terms.cancellationClass === 'timely';
  const touched = coOwner ? balancesAfter(affected, input.balances, returnsToBalance) : [];
  return {
    kind: kindOf(input, terms.cancellationClass, terms.firstAffectedDate),
    modality: input.modality,
    cancellationClass: terms.cancellationClass,
    firstAffectedDate: terms.firstAffectedDate,
    timelyUntil: coOwner && nights[0] !== undefined ? timelyUntil(nights[0].checkinAt) : null,
    started,
    affected,
    returning: coOwner ? (returnsToBalance ? affected.length : 0) : null,
    balances: touched,
  };
}

/** Termos que a confirmação recusada levou (D7), como vieram do formulário: indício, nunca prova da condição anterior. */
export interface SubmittedTerms {
  readonly cancellationClass: CancellationClass | null;
  readonly firstAffectedDate: string | null;
}

export type TermsChange =
  /** O prazo de 15 dias terminou: a prévia do servidor já é tardia, e os termos enviados eram tempestivos. */
  | { readonly kind: 'deadline_passed'; readonly timelyUntil: Micros }
  /** A noite enviada como primeira já começou: está entre as iniciadas no instante do servidor. */
  | { readonly kind: 'night_started'; readonly stayDate: string }
  /** Nenhum evento do relógio explica a diferença: a tela só afirma a recusa e mostra as condições atuais. */
  | { readonly kind: 'unexplained' };

/**
 * Por que os termos enviados diferem dos atuais (W13 E4b; D7, spec booking §10.15). O formulário só escolhe qual fato
 * do servidor conferir — o prazo já terminado ou a noite já iniciada, no instante da prévia atual. Sem esse fato, a
 * causa não é afirmada.
 */
export function termsChange(
  submitted: SubmittedTerms | null,
  preview: CancellationPreview,
): TermsChange {
  if (submitted === null) return { kind: 'unexplained' };
  if (
    submitted.cancellationClass === 'timely' &&
    preview.cancellationClass === 'late' &&
    preview.timelyUntil !== null
  )
    return { kind: 'deadline_passed', timelyUntil: preview.timelyUntil };
  if (submitted.cancellationClass !== preview.cancellationClass) return { kind: 'unexplained' };
  const night = preview.started.find((n) => n.stayDate === submitted.firstAffectedDate);
  return night === undefined
    ? { kind: 'unexplained' }
    : { kind: 'night_started', stayDate: night.stayDate };
}

function kindOf(
  input: CancellationPreviewInput,
  cancellationClass: CancellationClass | null,
  firstAffectedDate: string | null,
): PreviewKind {
  if (!CANCELLABLE.includes(input.state)) return 'not_cancellable';
  if (firstAffectedDate === null) return 'nothing_left';
  if (input.exceptionType === 'unauthorized_booking' && cancellationClass === 'late')
    return 'suspended';
  return input.lifecycleOpen ? 'actionable' : 'closed';
}

function balancesAfter(
  affected: readonly PreviewNight[],
  balances: readonly PreviewBalance[],
  returnsToBalance: boolean,
): BalanceAfter[] {
  const keys = new Map<string, { bucket: UseRightBucket; exerciseYear: number; count: number }>();
  for (const night of affected) {
    const key = `${night.exerciseYear}:${night.bucket}`;
    const entry = keys.get(key) ?? {
      bucket: night.bucket,
      exerciseYear: night.exerciseYear,
      count: 0,
    };
    keys.set(key, { ...entry, count: entry.count + 1 });
  }
  return [...keys.values()].flatMap(({ bucket, exerciseYear, count }) => {
    const balance = balances.find((b) => b.bucket === bucket && b.exerciseYear === exerciseYear);
    if (balance === undefined) return [];
    const returning = returnsToBalance ? count : 0;
    return [{ ...balance, returning, after: balance.remaining + returning }];
  });
}
