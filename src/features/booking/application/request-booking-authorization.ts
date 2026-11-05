import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommandHandler } from '@/features/platform';
import type { CancellationClass } from '../domain/own-use-lifecycle';
import { bookingTarget, referenceBasis } from './lifecycle-inputs';
import { adminTarget, modalityOf, openExceptionOf, reject } from './own-use-closing';
import type {
  AuthorizationPurpose,
  AuthorizationRequestFacts,
  LifecycleBooking,
  LifecycleDependencies,
  OpenException,
} from './own-use-lifecycle-ports';

export const requestBookingAuthorizationInput = z
  .strictObject({
    ...bookingTarget,
    purpose: z.enum(['no_show', 'recovery', 'exception_cancellation', 'invalidation']),
    basis: referenceBasis,
    /** Recuperação de origem P-A: atestação de disponibilidade e compatibilidade com o bloqueio (ADR-0027 §4). */
    availability_attested: z.boolean().default(false),
  })
  .refine((input) => input.purpose === 'recovery' || !input.availability_attested);
export type RequestBookingAuthorizationInput = z.infer<typeof requestBookingAuthorizationInput>;

export type RequestBookingAuthorizationResult = { readonly request_id: string };

interface ExpectedScope {
  readonly exceptionId: string | null;
  readonly dates: readonly string[];
  readonly custodyIds: readonly string[];
  readonly cancellationClass: CancellationClass | null;
}

/**
 * `request_booking_authorization` (TECH-051 "demais operações do REQ-095"; ADR-0027 §4, nota 3; spec booking
 * §10.11.1, §10.12): operação Admin não crítica, **fora da K2**, sem efeito econômico e sem evento. Guard com MFA,
 * `staff_role` revalidado, base, auditoria e idempotência. O escopo esperado é derivado no servidor pelas mesmas
 * funções SQL do autorizador (nunca datas ou custódias do cliente); a única saída é o id opaco da solicitação, que não
 * vale como autorização. A E4 só expõe esta operação com o limitador do gate G-E4-1.
 */
export function createRequestBookingAuthorizationHandler<Tx>(
  deps: LifecycleDependencies<Tx>,
): CommandHandler<RequestBookingAuthorizationInput, RequestBookingAuthorizationResult, Tx> {
  const newId = deps.newId ?? randomUUID;
  return {
    command: 'request_booking_authorization',
    input: requestBookingAuthorizationInput,
    secondHomeId: (input) => input.second_home_id,
    scope: (input) => ({ type: 'second_home', id: input.second_home_id }),
    async execute(context) {
      const { input, tx } = context;
      const booking = await adminTarget(deps, context);
      const facts = await deps.store.requestFacts(tx, booking);
      const exception = await openExceptionOf(deps, tx, booking);
      const scope = expectedScope(input, booking, facts, exception);
      const requestId = newId();
      await deps.store.insertRequest(tx, {
        id: requestId,
        bookingId: booking.id,
        purpose: input.purpose,
        exceptionId: scope.exceptionId,
        expectedDates: scope.dates,
        expectedCustodyIds: scope.custodyIds,
        expectedClass: scope.cancellationClass,
        availabilityAttested: input.availability_attested,
        basis: input.basis,
        operationId: context.operationId,
      });
      context.audit({
        objectType: 'booking_authorization_request',
        objectId: requestId,
        before: null,
        after: {
          booking_id: booking.id,
          purpose: input.purpose,
          exception_id: scope.exceptionId,
          expected_dates: [...scope.dates],
          expected_custody_ids: [...scope.custodyIds],
          expected_cancellation_class: scope.cancellationClass,
          availability_attested: input.availability_attested,
          basis: input.basis,
        },
      });
      return { request_id: requestId };
    },
  };
}

/**
 * Condições de emissão por finalidade (ADR-0027 §4, tabela): fora delas a solicitação seria inútil e é recusada antes de
 * chegar ao aprovador. O autorizador deriva tudo de novo e recusa diferença.
 */
function expectedScope(
  input: RequestBookingAuthorizationInput,
  booking: LifecycleBooking,
  facts: AuthorizationRequestFacts,
  exception: OpenException | null,
): ExpectedScope {
  const none = { exceptionId: null, dates: [], custodyIds: [], cancellationClass: null };
  switch (input.purpose) {
    case 'no_show':
      if (!facts.noShowWindowOpen || !['confirmed', 'in_use'].includes(booking.state))
        throw reject('ERR_STATE_TRANSITION');
      return { ...none, dates: facts.unstartedDates };
    case 'recovery':
      if (modalityOf(booking) === 'owner' || !['no_show', 'cancelled'].includes(booking.state))
        throw reject('ERR_STATE_TRANSITION');
      if (facts.recoverableCustodyIds.length === 0) throw reject('ERR_CAPACITY_UNAVAILABLE');
      if (facts.recoverableFromException && !input.availability_attested)
        throw reject('ERR_VALIDATION');
      return { ...none, custodyIds: facts.recoverableCustodyIds };
    default:
      return exceptionScope(input.purpose, booking, facts, exception);
  }
}

function exceptionScope(
  purpose: Extract<AuthorizationPurpose, 'exception_cancellation' | 'invalidation'>,
  booking: LifecycleBooking,
  facts: AuthorizationRequestFacts,
  exception: OpenException | null,
): ExpectedScope {
  const type = purpose === 'exception_cancellation' ? 'operational' : 'unauthorized_booking';
  if (exception?.type !== type || facts.unstartedDates.length === 0)
    throw reject('ERR_STATE_TRANSITION');
  return {
    exceptionId: exception.id,
    dates: facts.unstartedDates,
    custodyIds: [],
    cancellationClass:
      purpose === 'exception_cancellation' && modalityOf(booking) === 'co_owner'
        ? facts.cancellationClass
        : null,
  };
}
