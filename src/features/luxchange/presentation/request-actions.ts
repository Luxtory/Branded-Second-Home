'use server';

import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PaymentRejection, PaymentsUnavailableError } from '@/features/billing';
import { executeTitularCommand, requireTitularSession } from '@/features/identity';
import { createHoldingDirectory } from '@/features/ownership';
import {
  CapabilityNotActivatedError,
  CommandRejection,
  getDatabase,
  rootLogger,
  unavailableKeys,
} from '@/features/platform';
import { sumCredits } from '../domain/deposit';
import {
  payRequestFee,
  processRequestRefunds,
  recoverRequestPayment,
} from '../application/request-flow';
import {
  sendRequestInput,
  type RequestQuote,
  type RequestShape,
  type SendRequestInput,
} from '../application/send-request';
import { luxchangePaths } from '../paths';
import {
  createSendRequestProductionHandler,
  createWithdrawRequestProductionHandler,
} from './request-handlers';
import { productionRequestFlow } from './request-production';
import { readRequestJourney } from './request-read';
import { REQUEST_CONSENT_TEXT_VERSION, type RequestOutcomeKey } from './i18n/request-pt-br';

/**
 * Server Actions da Request (W21 E3; spec luxchange §13.5): prévia, pagamento da Taxa + envio e retirada pelo mesmo
 * caminho das rotas REST — sessão verificada, guard do Titular, executor (TECH-054) e o fluxo financeiro com recuperação.
 * As actions só traduzem desfechos; o banco decide termos, prazo, estado e motivo.
 */
const shape = sendRequestInput.pick({
  party_id: true,
  second_home_id: true,
  checkin: true,
  checkout: true,
  complement: true,
});

const OUTCOMES: readonly RequestOutcomeKey[] = [
  'ERR_PERMISSION',
  'ERR_MEMBERSHIP_INELIGIBLE',
  'ERR_CAPACITY_UNAVAILABLE',
  'ERR_MIN_NOTICE',
  'ERR_CREDITS_INSUFFICIENT',
  'ERR_CREDIT_HOLD_INVALID',
  'ERR_PAYMENT_FAILED',
  'ERR_POLICY_MISSING',
  'ERR_PRL_MISSING',
  'ERR_PARAMETER_MISSING',
  'ERR_REQUEST_TERMS_CHANGED',
  'ERR_STATE_TRANSITION',
  'ERR_IDEMPOTENCY_CONFLICT',
  'ERR_NOT_FOUND',
  'ERR_VALIDATION',
];
const outcomeOf = (code: string): RequestOutcomeKey =>
  (OUTCOMES as readonly string[]).includes(code) ? (code as RequestOutcomeKey) : 'unavailable';

export type RequestPreviewResponse =
  | {
      readonly status: 'ok';
      readonly quote: RequestQuote;
      readonly balance: string;
      /** Saldo potencial para intercâmbio: disponível + Créditos potenciais das datas (não utilizáveis antes do aceite). */
      readonly exchange: string;
      /** Chaves da revisão: a do pagamento da Taxa e a do envio (a mesma tentativa nunca cobra nem envia duas vezes). */
      readonly paymentKey: string;
      readonly sendKey: string;
    }
  | { readonly status: 'refused'; readonly reason: RequestOutcomeKey };

function refusal(error: unknown): { status: 'refused'; reason: RequestOutcomeKey } {
  if (error instanceof CommandRejection || error instanceof PaymentRejection)
    return { status: 'refused', reason: outcomeOf(error.code) };
  if (error instanceof PaymentsUnavailableError || error instanceof CapabilityNotActivatedError)
    return { status: 'refused', reason: 'not_activated' };
  if (unavailableKeys(error) !== null) return { status: 'refused', reason: 'unavailable' };
  throw error;
}

/** Prévia do servidor para a seleção (sem trava nem escrita), com o saldo atual e as chaves da revisão. */
export async function previewRequestAction(raw: unknown): Promise<RequestPreviewResponse> {
  const parsed = shape.safeParse(raw);
  if (!parsed.success) return { status: 'refused', reason: 'ERR_VALIDATION' };
  const session = await requireTitularSession();
  if (session === 'unavailable') return { status: 'refused', reason: 'unauthenticated' };
  try {
    const flow = productionRequestFlow(getDatabase(), rootLogger);
    const viewer = { userId: session.userId, partyId: parsed.data.party_id };
    const quote = await flow.quote(viewer, parsed.data);
    const journey = await readRequestJourney(session, viewer.partyId, quote.second_home_id);
    const balance = journey?.balance ?? '0';
    return {
      status: 'ok',
      quote,
      balance,
      exchange: sumCredits([balance, quote.complement_credits]),
      paymentKey: randomUUID(),
      sendKey: randomUUID(),
    };
  } catch (error) {
    return refusal(error);
  }
}

const submission = z.strictObject({
  shape,
  quote: z.custom<RequestQuote>((value) => typeof value === 'object' && value !== null),
  paymentKey: z.uuid(),
  sendKey: z.uuid(),
  acceptedPolicy: z.literal(true),
  acceptedComplement: z.boolean(),
});

export type RequestSubmitResponse =
  | {
      readonly status: 'refused';
      readonly reason: RequestOutcomeKey;
      /** A Taxa foi paga e a solicitação não foi enviada: devolução solicitada (nunca "concluída" aqui). */
      readonly refunding?: boolean;
    }
  | { readonly status: 'payment_pending' };

const expectedOf = (
  request: RequestShape,
  quote: RequestQuote,
  paymentId: string,
): SendRequestInput => ({
  ...request,
  payment_id: paymentId,
  accepted_policy_id: quote.policy_id,
  consent_text_version: REQUEST_CONSENT_TEXT_VERSION,
  expected: {
    night_credits: [...quote.night_credits],
    credits_required: quote.credits_required,
    complement_nights: [...quote.complement_nights],
    complement_credits: quote.complement_credits,
    guarantee_credits: quote.guarantee_credits,
    fee_amount_minor: quote.fee_amount_minor,
    deadline_hours: quote.deadline_hours,
    credit_validity_months: quote.credit_validity_months,
  },
});

/**
 * "Pagar a Taxa e enviar" (spec §13.5 item 5): cobra a Taxa da prévia (chave da revisão) e, só com pagamento aprovado,
 * executa `send_request` com os termos revisados. Pendente → "Pagamento em processamento" (a mesma revisão tenta de novo
 * sem cobrar de novo). Recusado ou com falha depois do pagamento aprovado da própria party → recuperação imediata do
 * pagamento (estorno), com a conciliação como rede de segurança. Confirmado → o detalhe lido do banco.
 */
export async function submitRequestAction(raw: unknown): Promise<RequestSubmitResponse> {
  const parsed = submission.safeParse(raw);
  if (!parsed.success) return { status: 'refused', reason: 'ERR_VALIDATION' };
  const { shape: request, quote, paymentKey, sendKey } = parsed.data;
  if (request.complement.length > 0 && !parsed.data.acceptedComplement)
    return { status: 'refused', reason: 'ERR_VALIDATION' };
  const session = await requireTitularSession();
  if (session === 'unavailable') return { status: 'refused', reason: 'unauthenticated' };
  const db = getDatabase();
  const flow = productionRequestFlow(db, rootLogger);
  const viewer = { userId: session.userId, partyId: request.party_id };
  let paymentId: string;
  try {
    // Termos mudaram desde a revisão → nova prévia, sem cobrar (o envio conferiria de novo de qualquer forma).
    if (!sameTerms(await flow.quote(viewer, request), quote))
      return { status: 'refused', reason: 'ERR_REQUEST_TERMS_CHANGED' };
    const paid = await payRequestFee({ ...flow, send: notUsed }, viewer, request, paymentKey);
    if (paid.state === 'pending') return { status: 'payment_pending' };
    if (paid.state !== 'approved') return { status: 'refused', reason: 'ERR_PAYMENT_FAILED' };
    paymentId = paid.payment_id;
  } catch (error) {
    return refusal(error);
  }
  const correlationId = randomUUID();
  let committed: string | null = null;
  try {
    const outcome = await executeTitularCommand(
      createSendRequestProductionHandler(db),
      expectedOf(request, quote, paymentId),
      sendKey,
      { partyId: request.party_id, holdings: createHoldingDirectory(() => db) },
    );
    if (outcome === 'unavailable' || outcome.status === 'unauthenticated') {
      await recoverRequestPayment(flow, viewer, paymentId, correlationId);
      return {
        status: 'refused',
        reason: outcome === 'unavailable' ? 'unavailable' : 'unauthenticated',
        refunding: true,
      };
    }
    if (outcome.status === 'committed') {
      const result = outcome.result;
      if (!outcome.replayed)
        after(() => processRequestRefunds(flow, result.refund_ids, correlationId));
      committed = result.request_id;
    } else {
      await recoverRequestPayment(flow, viewer, paymentId, correlationId);
      return {
        status: 'refused',
        reason: outcomeOf(outcome.status === 'rejected' ? outcome.code : 'unavailable'),
        refunding: true,
      };
    }
  } catch (error) {
    await recoverRequestPayment(flow, viewer, paymentId, correlationId);
    if (error instanceof CapabilityNotActivatedError)
      return { status: 'refused', reason: 'not_activated', refunding: true };
    throw error;
  }
  redirect(`${luxchangePaths.request(committed)}?enviada=1`);
}

const TERM_FIELDS = [
  'second_home_id',
  'checkin',
  'checkout',
  'night_credits',
  'complement_nights',
  'credits_required',
  'complement_credits',
  'guarantee_credits',
  'fee_amount_minor',
  'deadline_hours',
  'credit_validity_months',
  'policy_id',
] as const satisfies readonly (keyof RequestQuote)[];

const sameTerms = (current: RequestQuote, reviewed: RequestQuote) =>
  TERM_FIELDS.every((key) => JSON.stringify(current[key]) === JSON.stringify(reviewed[key]));

const notUsed = () => {
  throw new Error('send is executed by the action itself');
};

const withdrawal = z.strictObject({ requestId: z.uuid(), partyId: z.uuid(), key: z.uuid() });

export interface WithdrawFormState {
  readonly key: string;
  readonly message: RequestOutcomeKey | null;
}

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/**
 * "Retirar solicitação" (spec §13.5 item 7): `withdraw_request` pelo executor; confirmado, o estorno da Taxa é processado
 * no PSP depois da resposta e a tela relê o estado real (solicitado/pending até o PSP confirmar).
 */
export async function withdrawRequestAction(
  state: WithdrawFormState,
  form: FormData,
): Promise<WithdrawFormState> {
  const parsed = withdrawal.safeParse({
    requestId: field(form, 'request_id'),
    partyId: field(form, 'party_id'),
    key: state.key,
  });
  if (!parsed.success) return { key: state.key, message: 'ERR_VALIDATION' };
  const db = getDatabase();
  let outcome: Awaited<ReturnType<typeof executeTitularCommand>>;
  try {
    outcome = await executeTitularCommand(
      createWithdrawRequestProductionHandler(db),
      { party_id: parsed.data.partyId, request_id: parsed.data.requestId },
      parsed.data.key,
      { partyId: parsed.data.partyId, holdings: createHoldingDirectory(() => db) },
    );
  } catch (error) {
    if (!(error instanceof CapabilityNotActivatedError)) throw error;
    return { key: state.key, message: 'not_activated' };
  }
  if (outcome === 'unavailable') return { key: state.key, message: 'unavailable' };
  if (outcome.status === 'unauthenticated') return { key: state.key, message: 'unauthenticated' };
  if (outcome.status === 'committed') {
    const refundId = (outcome.result as { refund_id?: unknown }).refund_id;
    if (!outcome.replayed && typeof refundId === 'string') {
      const flow = productionRequestFlow(db, rootLogger);
      after(() => processRequestRefunds(flow, [refundId], randomUUID()));
    }
    redirect(luxchangePaths.request(parsed.data.requestId));
  }
  return {
    key: randomUUID(),
    message: outcomeOf(outcome.status === 'rejected' ? outcome.code : 'unavailable'),
  };
}
