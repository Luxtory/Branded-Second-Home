'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { parameterInForce } from '@/features/admin/parameters';
import { executeAdminCommand, exercisedRole, getStaffAccess } from '@/features/identity';
import { getDatabase, isNonPersonalReference, type ErrorCode } from '@/features/platform';
import { createPrlHandlers, MAX_PRL_NIGHTS, reviewPrlPublication, type PrlReview } from '../prl';
import { formatInstant, formatMoney, formatNight } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import { localToInstant } from './local-instant';
import { loadPrlCalendar } from './prl-calendar-data';
import { prlPath } from './prl-paths';
import type {
  PrlFormKind,
  PrlPublicationField,
  PrlPublicationState,
  PrlReviewView,
} from './prl-state';

const handlers = createPrlHandlers();

const REJECTIONS: Partial<Record<ErrorCode, string>> = {
  ERR_STATE_TRANSITION: 'vigency',
  ERR_PERMISSION: 'permission',
  ERR_NOT_FOUND: 'not_found',
  ERR_VALIDATION: 'invalid',
  ERR_UNAVAILABLE: 'unavailable',
};

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

/** Lote enviado pela tela: `[{stay_date, amount}]` com o valor em reais como texto; qualquer outra forma → `null`. */
function parseNights(raw: string): { stayDate: string; amount: string }[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > MAX_PRL_NIGHTS) return null;
    const nights: { stayDate: string; amount: string }[] = [];
    for (const item of value) {
      if (typeof item !== 'object' || item === null) return null;
      const { stay_date: stayDate, amount } = item as Record<string, unknown>;
      if (typeof stayDate !== 'string' || typeof amount !== 'string') return null;
      nights.push({ stayDate, amount });
    }
    return nights;
  } catch {
    // Corpo fora do formato do formulário: recusa de entrada, não falha técnica.
    return null;
  }
}

const credits = (value: string) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 }).format(value as `${number}`);

function view(review: PrlReview, validity: string): PrlReviewView {
  return {
    kind: review.kind,
    lines: review.rows.map((row) => ({
      date: row.stayDate,
      night: formatNight(row.stayDate),
      season: text.seasons[row.season],
      current: row.currentMinor === null ? null : formatMoney(BigInt(row.currentMinor)),
      proposed: formatMoney(BigInt(row.proposedMinor)),
      credits: row.credits === null ? null : credits(row.credits),
    })),
    totalProposed: formatMoney(BigInt(review.totalProposedMinor)),
    totalCurrent:
      review.totalCurrentMinor === null ? null : formatMoney(BigInt(review.totalCurrentMinor)),
    totalCredits: review.totalCredits === null ? null : credits(review.totalCredits),
    multiplierConfigured: review.multiplierConfigured,
    validity,
  };
}

/**
 * Publicação de PRL em lote pela tela (W16 E4; REQ-013, REQ-052; spec pricing §5): `review` calcula no servidor a
 * revisão (elegibilidade por tipo, vigente × novo, totais, prévia de Créditos com o multiplicador vigente); `confirm`
 * refaz a revisão — nunca confia no que a tela mostrou — e só então executa o command (sessão → guard → executor);
 * `edit` volta à seleção. PRL inicial: Admin ou Super Admin; alteração: só Super Admin (BR-181).
 */
export async function prlPublicationAction(
  state: PrlPublicationState,
  form: FormData,
): Promise<PrlPublicationState> {
  const intent = field(form, 'intent');
  const kind: PrlFormKind = field(form, 'kind') === 'change' ? 'change' : 'initial';
  const homeId = field(form, 'second_home_id');
  const values = { effective_from: field(form, 'effective_from'), basis: field(form, 'basis') };
  const editing = { ...state, values, review: null, issues: [], rejection: null };
  if (intent === 'edit') return { ...editing, stage: 'edit', fieldErrors: {} };

  const access = await getStaffAccess();
  if (access.kind === 'anonymous') redirect('/entrar');
  if (access.kind === 'mfa_required') redirect('/entrar/mfa');
  if (access.kind === 'unavailable')
    return { ...editing, stage: 'edit', fieldErrors: {}, rejection: 'unavailable' };
  const allowed =
    access.kind === 'granted' &&
    (kind === 'change'
      ? exercisedRole(access, 'super_admin') !== null
      : exercisedRole(access, 'admin') !== null || exercisedRole(access, 'super_admin') !== null);
  if (!allowed) return { ...editing, stage: 'edit', fieldErrors: {}, rejection: 'permission' };
  const db = getDatabase();
  const home = await db
    .selectFrom('app.second_home')
    .select('timezone')
    .where('id', '=', homeId)
    .executeTakeFirst();
  if (home === undefined)
    return { ...editing, stage: 'edit', fieldErrors: {}, rejection: 'not_found' };

  const errors: Partial<Record<PrlPublicationField, true>> = {};
  const nights = parseNights(field(form, 'nights'));
  if (nights === null || nights.length === 0) errors.nights = true;
  const from =
    values.effective_from === '' ? null : localToInstant(values.effective_from, home.timezone);
  if (values.effective_from !== '' && from === null) errors.effective_from = true;
  if (values.basis === '' || values.basis.length > 255 || !isNonPersonalReference(values.basis))
    errors.basis = true;
  if (Object.keys(errors).length > 0 || nights === null)
    return { ...editing, stage: 'edit', fieldErrors: errors, rejection: 'invalid' };

  const now = new Date();
  const [model, multiplier] = await Promise.all([
    loadPrlCalendar(db, homeId, now, home.timezone),
    parameterInForce(db, 'credit_multiplier', null, now),
  ]);
  const review = reviewPrlPublication(
    { kind, nights, effectiveFrom: from },
    model.states,
    multiplier?.value ?? null,
    now,
  );
  if (review.issues.length > 0)
    return {
      ...editing,
      stage: 'edit',
      fieldErrors: {},
      issues: review.issues.map(({ issue, nights: affected }) => ({
        issue,
        nights: affected.map((night) =>
          /^\d{4}-\d{2}-\d{2}$/.test(night) ? formatNight(night) : night,
        ),
      })),
      rejection: 'issues',
    };
  const reviewed = view(
    review,
    from === null ? text.review.validityNow : formatInstant(new Date(from), home.timezone),
  );
  if (intent !== 'confirm')
    return { ...editing, stage: 'review', fieldErrors: {}, review: reviewed };

  const outcome = await executeAdminCommand(
    kind === 'initial'
      ? { handler: handlers.publishInitialPrl, role: ['admin', 'super_admin'] }
      : { handler: handlers.changePublishedPrl, role: 'super_admin' },
    {
      second_home_id: homeId,
      nights: review.rows.map((row) => ({
        stay_date: row.stayDate,
        amount_minor: row.proposedMinor,
      })),
      effective_from: from,
      basis: values.basis,
    },
    state.key,
  );
  if (outcome === 'unavailable')
    return {
      ...editing,
      stage: 'review',
      fieldErrors: {},
      review: reviewed,
      rejection: 'unavailable',
    };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'committed')
    redirect(`${prlPath(homeId)}?mes=${review.rows[0]!.stayDate.slice(0, 7)}&feito=${kind}`);
  const key = outcome.operationId === null ? state.key : randomUUID();
  return {
    ...editing,
    key,
    stage: 'review',
    fieldErrors: {},
    review: reviewed,
    rejection: REJECTIONS[outcome.code] ?? 'unexpected',
  };
}
