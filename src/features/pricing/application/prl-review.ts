import { creditsForPrl } from '../domain/economic';
import { parseMoneyInput, sumMinor } from '../domain/money';
import { MAX_PRL_NIGHTS, type PrlKind } from '../domain/prl';

/**
 * Revisão de um lote de PRL antes da confirmação (W16 E4; REQ-013, REQ-052; spec pricing §5). Pura e no servidor: a
 * tela só seleciona noites e digita valores; elegibilidade, comparação, totais e prévia de Créditos saem daqui, com as
 * calculadoras do `pricing` (sem lógica econômica no cliente). O command e o banco revalidam tudo.
 *
 * Comparação da alteração: uma versão nova só começa depois da última versão da noite (D3), então o preço que ela
 * substitui é o da **última versão** — que pode estar agendada — e não necessariamente o vigente agora. A revisão mostra
 * os três: vigente agora, agendados e o anterior à nova vigência.
 */
export interface PrlNightVersion {
  readonly amountMinor: bigint;
  readonly effectiveFrom: Date;
}

export interface PrlNightState {
  readonly stayDate: string;
  readonly season: 'alta' | 'media';
  /** Valor vigente agora, em unidade mínima; `null` = sem PRL vigente. */
  readonly inForceMinor: bigint | null;
  /** Versões com início futuro, em ordem de início. */
  readonly scheduled: readonly PrlNightVersion[];
  /** A noite tem alguma versão (vigente ou agendada): decide inicial × alteração. */
  readonly hasVersion: boolean;
  /** Última versão da noite (inclusive agendada): o preço imediatamente anterior a uma nova vigência válida. */
  readonly latest: PrlNightVersion | null;
}

export interface PrlReviewRequest {
  readonly kind: PrlKind;
  readonly nights: readonly { readonly stayDate: string; readonly amount: string }[];
  /** Instante ISO do início, ou `null` = na confirmação. */
  readonly effectiveFrom: string | null;
}

export type PrlReviewIssue =
  | 'empty'
  | 'too_many'
  | 'duplicate'
  | 'not_sealed'
  | 'already_published'
  | 'not_published'
  | 'invalid_amount'
  | 'retroactive'
  | 'not_after_latest';

export interface PrlReviewRow {
  readonly stayDate: string;
  readonly season: 'alta' | 'media';
  /** Vigente agora (na alteração), em unidade mínima; `null` = só versões agendadas. */
  readonly currentMinor: string | null;
  /** Versões agendadas (na alteração), que a nova versão sucede. */
  readonly scheduled: readonly { readonly amountMinor: string; readonly effectiveFrom: string }[];
  /** Preço imediatamente anterior à nova vigência (na alteração): o da última versão da noite. */
  readonly previousMinor: string | null;
  readonly proposedMinor: string;
  /** Prévia de Créditos do valor proposto (`01` §20); `null` sem multiplicador vigente. */
  readonly credits: string | null;
}

export interface PrlReview {
  readonly kind: PrlKind;
  readonly rows: readonly PrlReviewRow[];
  readonly totalProposedMinor: string;
  /** Soma dos preços imediatamente anteriores à nova vigência (na alteração). */
  readonly totalPreviousMinor: string | null;
  readonly totalCredits: string | null;
  readonly multiplierConfigured: boolean;
  readonly effectiveFrom: string | null;
  /** Problemas encontrados, com as noites atingidas; com qualquer um, nada é confirmado. */
  readonly issues: readonly {
    readonly issue: PrlReviewIssue;
    readonly nights: readonly string[];
  }[];
}

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function reviewPrlPublication(
  request: PrlReviewRequest,
  states: ReadonlyMap<string, PrlNightState>,
  multiplier: string | null,
  now: Date,
): PrlReview {
  const issues = new Map<PrlReviewIssue, string[]>();
  const flag = (issue: PrlReviewIssue, night = '') =>
    issues.set(issue, [...(issues.get(issue) ?? []), ...(night === '' ? [] : [night])]);
  const seen = new Set<string>();
  const rows: PrlReviewRow[] = [];
  if (request.nights.length === 0) flag('empty');
  if (request.nights.length > MAX_PRL_NIGHTS) flag('too_many');
  const start = request.effectiveFrom === null ? null : new Date(request.effectiveFrom);
  if (start !== null && start.getTime() < now.getTime()) flag('retroactive');
  for (const night of [...request.nights].sort((a, b) => a.stayDate.localeCompare(b.stayDate))) {
    if (!NIGHT.test(night.stayDate) || seen.has(night.stayDate)) {
      flag('duplicate', night.stayDate);
      continue;
    }
    seen.add(night.stayDate);
    const state = states.get(night.stayDate);
    if (state === undefined) {
      flag('not_sealed', night.stayDate);
      continue;
    }
    if (request.kind === 'initial' && state.hasVersion) flag('already_published', night.stayDate);
    if (request.kind === 'change' && !state.hasVersion) flag('not_published', night.stayDate);
    if (
      request.kind === 'change' &&
      state.latest !== null &&
      (start ?? now).getTime() <= state.latest.effectiveFrom.getTime()
    )
      flag('not_after_latest', night.stayDate);
    const amount = parseMoneyInput(night.amount);
    if (amount === null) {
      flag('invalid_amount', night.stayDate);
      continue;
    }
    const change = request.kind === 'change';
    rows.push({
      stayDate: night.stayDate,
      season: state.season,
      currentMinor: change && state.inForceMinor !== null ? state.inForceMinor.toString() : null,
      scheduled: change
        ? state.scheduled.map((version) => ({
            amountMinor: version.amountMinor.toString(),
            effectiveFrom: version.effectiveFrom.toISOString(),
          }))
        : [],
      previousMinor: change && state.latest !== null ? state.latest.amountMinor.toString() : null,
      proposedMinor: amount.toString(),
      credits: multiplier === null ? null : creditsForPrl(amount, 'BRL', multiplier),
    });
  }
  const proposed = sumMinor(rows.map((row) => BigInt(row.proposedMinor)));
  const previous =
    request.kind === 'change'
      ? sumMinor(rows.map((row) => BigInt(row.previousMinor ?? '0')))
      : null;
  return {
    kind: request.kind,
    rows,
    totalProposedMinor: proposed.toString(),
    totalPreviousMinor: previous === null ? null : previous.toString(),
    totalCredits:
      multiplier === null || proposed < 1n ? null : creditsForPrl(proposed, 'BRL', multiplier),
    multiplierConfigured: multiplier !== null,
    effectiveFrom: request.effectiveFrom,
    issues: [...issues].map(([issue, nights]) => ({ issue, nights })),
  };
}
