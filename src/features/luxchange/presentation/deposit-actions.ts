'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { executeTitularCommand, requireTitularSession } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import {
  CapabilityNotActivatedError,
  getDatabase,
  rootLogger,
  unavailableKeys,
} from '@/features/platform';
import { sumCredits } from '../domain/deposit';
import { MAX_DEPOSIT_NIGHTS } from '../application/deposit-capacity';
import { luxchangePaths } from '../paths';
import { createDepositHandler } from './deposit-handler';
import type { DepositFormState, DepositPreviewResponse } from './deposit-form-state';
import { readDepositCalendar, selectionCredits } from './deposit-read';
import type { DepositOutcomeKey } from './i18n/deposit-pt-br';

const ascending = (dates: readonly string[]) =>
  dates.every((date, index) => index === 0 || dates[index - 1]! < date);
const previewInput = z.strictObject({
  holdingId: z.uuid(),
  nights: z.array(z.iso.date()).min(1).max(MAX_DEPOSIT_NIGHTS).refine(ascending),
});

const handler = createDepositHandler();

/**
 * Prévia do depósito (spec luxchange §5.4): a mesma leitura da tela — RLS prova a holding, o servidor calcula — conferida
 * para a seleção: toda noite pode ser depositada e, no Co-Owner, cada reserva entra inteira. Devolve os Créditos, a
 * validade, o saldo atual e o potencial (informativo) e a chave da confirmação. Sem trava, sem escrita: o command
 * revalida tudo e recusa termos diferentes (`ERR_DEPOSIT_TERMS_CHANGED`).
 */
export async function previewDepositAction(raw: unknown): Promise<DepositPreviewResponse> {
  const parsed = previewInput.safeParse(raw);
  if (!parsed.success) return { status: 'refused', reason: 'ERR_VALIDATION' };
  const session = await requireTitularSession();
  if (session === 'unavailable') return { status: 'unauthenticated' };
  try {
    const data = await readDepositCalendar(session, parsed.data.holdingId);
    if (data === null) return { status: 'refused', reason: 'ERR_PERMISSION' };
    if (!data.holding.membershipActive)
      return { status: 'refused', reason: 'ERR_MEMBERSHIP_INELIGIBLE' };
    if (!data.multiplierPublished || data.validityMonths === null)
      return { status: 'refused', reason: 'ERR_PARAMETER_MISSING' };
    const reason = refusalOf(data, parsed.data.nights);
    if (reason !== null) return { status: 'refused', reason };
    const credits = selectionCredits(data, parsed.data.nights)!;
    const byDate = new Map(data.nights.map((night) => [night.date, night.credits!] as const));
    return {
      status: 'ok',
      secondHomeId: data.holding.secondHomeId,
      secondHomeLabel: data.holding.label,
      modality: data.holding.modality,
      partyId: data.holding.partyId,
      nights: parsed.data.nights,
      nightCredits: parsed.data.nights.map((date) => ({ date, credits: byDate.get(date)! })),
      credits,
      validityMonths: data.validityMonths,
      balance: data.balance,
      potential: sumCredits([data.balance, credits]),
      key: data.open ? randomUUID() : null,
    };
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return { status: 'unavailable' };
  }
}

/** Motivo funcional da seleção que a tela não deveria ter permitido (REQ-098), na ordem do command. */
function refusalOf(
  data: NonNullable<Awaited<ReturnType<typeof readDepositCalendar>>>,
  dates: readonly string[],
): DepositOutcomeKey | null {
  const byDate = new Map(data.nights.map((night) => [night.date, night]));
  const nights = dates.map((date) => byDate.get(date));
  if (nights.some((night) => night?.status === 'notice')) return 'ERR_MIN_NOTICE';
  if (nights.some((night) => night?.status === 'no_reference')) return 'ERR_PRL_MISSING';
  if (
    nights.some(
      (night) => night === undefined || night.status !== 'eligible' || night.credits === null,
    )
  )
    return 'ERR_CAPACITY_UNAVAILABLE';
  const selected = new Set(dates);
  const partial = data.bookings.some(
    (booking) =>
      booking.nights.some((date) => selected.has(date)) &&
      booking.nights.some((date) => !selected.has(date)),
  );
  return partial ? 'ERR_CAPACITY_UNAVAILABLE' : null;
}

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

const REFUSALS: readonly DepositOutcomeKey[] = [
  'ERR_PERMISSION',
  'ERR_MEMBERSHIP_INELIGIBLE',
  'ERR_CAPACITY_UNAVAILABLE',
  'ERR_MIN_NOTICE',
  'ERR_PRL_MISSING',
  'ERR_PARAMETER_MISSING',
  'ERR_STATE_TRANSITION',
  'ERR_DEPOSIT_TERMS_CHANGED',
  'ERR_IDEMPOTENCY_CONFLICT',
  'ERR_VALIDATION',
];

/**
 * "Confirmar depósito" (W20): um único caminho — sessão verificada → guard do Titular → executor (TECH-054) →
 * `deposit_capacity`, o mesmo handler da rota REST. A action só traduz o resultado; confirmado, vai para o resultado lido
 * do banco. Funcionalidade fechada (K4/K6) é estado próprio, nunca falha de autenticação.
 */
export async function confirmDepositAction(
  state: DepositFormState,
  form: FormData,
): Promise<DepositFormState> {
  const nights = field(form, 'nights')
    .split(',')
    .filter((night) => night !== '');
  const input = {
    second_home_id: field(form, 'second_home_id'),
    nights,
    expected_credits: field(form, 'expected_credits'),
    expected_validity_months: Number(field(form, 'expected_validity_months')),
  };
  let outcome: Awaited<ReturnType<typeof executeTitularCommand>>;
  try {
    outcome = await executeTitularCommand(handler, input, state.key, {
      partyId: field(form, 'party_id'),
      holdings: createHoldingDirectory(() => getDatabase()),
    });
  } catch (error) {
    if (!(error instanceof CapabilityNotActivatedError)) throw error;
    rootLogger.info('luxchange deposit not activated', { command: 'deposit_capacity' });
    return { key: state.key, message: 'not_activated' };
  }
  if (outcome === 'unavailable') return { key: state.key, message: 'unavailable' };
  if (outcome.status === 'unauthenticated') return { key: state.key, message: 'unauthenticated' };
  if (outcome.status === 'committed' && outcome.operationId !== null)
    redirect(luxchangePaths.depositResult(outcome.operationId));
  const code = outcome.status === 'rejected' ? outcome.code : 'ERR_VALIDATION';
  const message = (REFUSALS as readonly string[]).includes(code)
    ? (code as DepositOutcomeKey)
    : 'unavailable';
  // Recusa gravada: a próxima tentativa é intenção nova (nova prévia, nova chave).
  return { key: randomUUID(), message };
}
