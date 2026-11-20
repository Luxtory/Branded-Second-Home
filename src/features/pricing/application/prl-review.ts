import { creditsForPrl } from '../domain/economic';
import { parseMoneyInput, sumMinor } from '../domain/money';
import { MAX_PRL_NIGHTS, type PrlKind } from '../domain/prl';

/**
 * Revisão de um lote de PRL antes da confirmação (W16 E4; REQ-013, REQ-052; spec pricing §5). Pura e no servidor: a
 * tela só seleciona noites e digita valores; elegibilidade, comparação com o vigente, totais e prévia de Créditos saem
 * daqui, com as calculadoras do `pricing` (sem lógica econômica no cliente). O command e o banco revalidam tudo.
 */
export interface PrlNightState {
  readonly stayDate: string;
  readonly season: 'alta' | 'media';
  /** Valor vigente agora, em unidade mínima; `null` = sem PRL vigente. */
  readonly inForceMinor: bigint | null;
  /** A noite tem alguma versão (vigente ou agendada): decide inicial × alteração. */
  readonly hasVersion: boolean;
  /** Último início de vigência da noite (inclusive agendado). */
  readonly latestStart: Date | null;
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
  /** Vigente agora (na alteração), em unidade mínima. */
  readonly currentMinor: string | null;
  readonly proposedMinor: string;
  /** Prévia de Créditos do valor proposto (`01` §20); `null` sem multiplicador vigente. */
  readonly credits: string | null;
}

export interface PrlReview {
  readonly kind: PrlKind;
  readonly rows: readonly PrlReviewRow[];
  readonly totalProposedMinor: string;
  readonly totalCurrentMinor: string | null;
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
      state.latestStart !== null &&
      (start ?? now).getTime() <= state.latestStart.getTime()
    )
      flag('not_after_latest', night.stayDate);
    const amount = parseMoneyInput(night.amount);
    if (amount === null) {
      flag('invalid_amount', night.stayDate);
      continue;
    }
    rows.push({
      stayDate: night.stayDate,
      season: state.season,
      currentMinor:
        request.kind === 'change' && state.inForceMinor !== null
          ? state.inForceMinor.toString()
          : null,
      proposedMinor: amount.toString(),
      credits: multiplier === null ? null : creditsForPrl(amount, 'BRL', multiplier),
    });
  }
  const proposed = sumMinor(rows.map((row) => BigInt(row.proposedMinor)));
  const current =
    request.kind === 'change' ? sumMinor(rows.map((row) => BigInt(row.currentMinor ?? '0'))) : null;
  return {
    kind: request.kind,
    rows,
    totalProposedMinor: proposed.toString(),
    totalCurrentMinor: current === null ? null : current.toString(),
    totalCredits:
      multiplier === null || proposed < 1n ? null : creditsForPrl(proposed, 'BRL', multiplier),
    multiplierConfigured: multiplier !== null,
    effectiveFrom: request.effectiveFrom,
    issues: [...issues].map(([issue, nights]) => ({ issue, nights })),
  };
}
