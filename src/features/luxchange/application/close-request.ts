import { z } from 'zod';
import { reverseLuxchangeFee, type BillingStore } from '@/features/billing';
import { releaseHold, type CreditStore } from '@/features/credits';
import { CommandRejection, type CommandContext, type CommandHandler } from '@/features/platform';
import { sumCredits } from '../domain/deposit';
import type { RequestClosureReason } from '../domain/request';
import { requestClosedEvent } from './request-events';
import type { LockedRequest, RecordedClosing, RequestStore } from './request-ports';

export interface ClosingDependencies<Tx> {
  readonly store: RequestStore<Tx>;
  readonly credits: CreditStore<Tx>;
  readonly billing: BillingStore<Tx>;
}

export type RequestClosingResult = {
  readonly request_id: string;
  readonly operation_id: string;
  readonly state: 'expired' | 'cancelled_pre_accept';
  readonly reason: RequestClosureReason;
  readonly guarantee_released: string;
  /** Estorno `pending` da Taxa de intermediação; quem chama o processa depois do commit (TECH-080). */
  readonly refund_id: string;
};

export const withdrawRequestInput = z.strictObject({
  /** Party que age (escopo `party` do guard do solicitante). */
  party_id: z.uuid(),
  request_id: z.uuid(),
});
export type WithdrawRequestInput = z.infer<typeof withdrawRequestInput>;

export const systemClosingInput = z.strictObject({ request_id: z.uuid() });
export type SystemClosingInput = z.infer<typeof systemClosingInput>;

/** Trava da Request (TECH-053, classe 1), relida depois da trava; inexistente → `ERR_NOT_FOUND`. */
async function lockRequest<I, Tx>(
  context: CommandContext<I, Tx>,
  store: RequestStore<Tx>,
  requestId: string,
): Promise<LockedRequest> {
  const [key] = context.locks.claim('luxchange_request', [requestId]);
  const [request] = await store.lockRequests(context.tx, [key!]);
  if (request === undefined) throw new CommandRejection('ERR_NOT_FOUND');
  return request;
}

/**
 * Encerramento pré-aceite (ADR-0037 §7) na transação do command, com a Request já travada: evento (o banco decide estado,
 * motivo e prova), liberação de toda a Garantia (classe 7; `expired` se o lote venceu) e reversão integral da Taxa com
 * estorno `pending` (classe 8). Nenhuma chave é exigida: obrigação existente nunca fica presa (ADR-0037 §10).
 */
/** Garantia zero em qualquer escala decimal devolvida pelo banco (`0`, `0.00`). */
const NO_GUARANTEE = /^0(\.0+)?$/;

async function closeLocked<I, Tx>(
  context: CommandContext<I, Tx>,
  deps: ClosingDependencies<Tx>,
  request: LockedRequest,
): Promise<RequestClosingResult> {
  const { tx, locks, operationId } = context;
  const closing: RecordedClosing = await deps.store.insertClosing(tx, request.id, operationId);
  // Request com `G = 0` (o complemento cobre `N`) nunca reteve Créditos: não há Garantia a liberar (PD-012).
  const released = NO_GUARANTEE.test(request.guaranteeCredits)
    ? []
    : await releaseHold(
        { tx, locks, operationId },
        { store: deps.credits },
        { holdOperationId: request.operationId },
      );
  const { refundId } = await reverseLuxchangeFee(
    { tx, locks, operationId },
    { store: deps.billing },
    { feeChargeId: request.feeChargeId },
  );
  const guaranteeReleased = sumCredits(released.map((movement) => movement.quantity));
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
      guarantee_released: guaranteeReleased,
      closed_at: closing.closedAt,
    }),
  );
  context.audit({
    objectType: 'luxchange_request',
    objectId: request.id,
    before: { state: request.state },
    after: {
      act: context.actor.kind === 'system' ? 'close_request' : 'withdraw_request',
      state: closing.state,
      reason: closing.reason,
      transition_id: closing.transitionId,
      guarantee_released: guaranteeReleased,
      fee_charge_id: request.feeChargeId,
      refund_id: refundId,
    },
  });
  return {
    request_id: request.id,
    operation_id: operationId,
    state: closing.state,
    reason: closing.reason,
    guarantee_released: guaranteeReleased,
    refund_id: refundId,
  };
}

/**
 * `withdraw_request` (TECH-051 autoridade "solicitante", sem Membership; ADR-0037 §7): o solicitante retira a Request
 * pendente — `cancelled_pre_accept` (`withdrawn`), ou `expired` se o prazo já venceu (o banco decide). Outra party ou
 * Request inexistente → `ERR_NOT_FOUND` (sem oráculo); já encerrada → `ERR_STATE_TRANSITION`.
 */
export function createWithdrawRequestHandler<Tx>(
  deps: ClosingDependencies<Tx>,
): CommandHandler<WithdrawRequestInput, RequestClosingResult, Tx> {
  return {
    command: 'withdraw_request',
    input: withdrawRequestInput,
    scope: (input) => ({ type: 'party', id: input.party_id }),
    async execute(context) {
      const { input, actor, tx } = context;
      if (actor.kind !== 'user' || actor.actingPartyId !== input.party_id)
        throw new CommandRejection('ERR_PERMISSION');
      const request = await lockRequest(context, deps.store, input.request_id);
      if (request.requesterPartyId !== input.party_id) throw new CommandRejection('ERR_NOT_FOUND');
      if (request.state !== 'pending') throw new CommandRejection('ERR_STATE_TRANSITION');
      if (!(await deps.store.lockDelegation(tx, actor.userId, input.party_id, context.now)))
        throw new CommandRejection('ERR_PERMISSION');
      return closeLocked(context, deps, request);
    },
  };
}

/**
 * `expire_requests` e `close_ineligible_request` (sistema, job `expire_requests`; TECH-024, TECH-044): materializam o
 * encerramento da Request que não pode mais ser aceita — vencida pelo relógio do banco, ou inelegível com prova
 * registrada desde o envio. Ainda aceitável, já encerrada ou com motivo de outro command → `ERR_STATE_TRANSITION` (o job
 * conta como item pulado).
 */
export function createSystemClosingHandler<Tx>(
  command: 'expire_requests' | 'close_ineligible_request',
  deps: ClosingDependencies<Tx>,
): CommandHandler<SystemClosingInput, RequestClosingResult, Tx> {
  return {
    command,
    input: systemClosingInput,
    async execute(context) {
      if (context.actor.kind !== 'system') throw new CommandRejection('ERR_PERMISSION');
      const request = await lockRequest(context, deps.store, context.input.request_id);
      const reason = request.closureReason;
      if (
        request.state !== 'pending' ||
        reason === null ||
        (command === 'expire_requests') !== (reason === 'expired')
      )
        throw new CommandRejection('ERR_STATE_TRANSITION');
      return closeLocked(context, deps, request);
    },
  };
}
