'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { cancellationMessages as text } from './i18n/own-use-lifecycle-pt-br';
import { cancelOwnUseBookingAction } from './own-use-cancel-action';
import type { OwnUseCancelState } from './own-use-cancel-state';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        className="lx-button lx-button--destructive"
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.pending : text.confirm}
      </button>
      {pending ? (
        <p className="lx-visually-hidden" role="status">
          {text.pendingStatus}
        </p>
      ) : null}
    </>
  );
}

/**
 * Confirmação do cancelamento (W13 E4b): leva os termos da prévia (classe e primeira noite afetada, D7) e a chave
 * nascida com ela. "Confirmar cancelamento" é a única ação destrutiva; "Manter reserva" volta ao detalhe.
 */
export function OwnUseCancelForm(props: {
  readonly bookingId: string;
  readonly secondHomeId: string;
  readonly partyId: string;
  readonly expectedClass: 'timely' | 'late' | null;
  readonly expectedFirstDate: string;
  readonly idempotencyKey: string;
  readonly statement: string;
  readonly hint: string | null;
  readonly detailHref: string;
}) {
  const initial: OwnUseCancelState = { key: props.idempotencyKey, outcome: null };
  const [state, action] = useActionState(cancelOwnUseBookingAction, initial);
  const outcome = state.outcome;
  return (
    <form className="lx-form" action={action} aria-label={text.confirm}>
      <input type="hidden" name="booking_id" value={props.bookingId} />
      <input type="hidden" name="second_home_id" value={props.secondHomeId} />
      <input type="hidden" name="party_id" value={props.partyId} />
      <input type="hidden" name="expected_cancellation_class" value={props.expectedClass ?? ''} />
      <input type="hidden" name="expected_first_affected_date" value={props.expectedFirstDate} />
      {outcome === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          {outcome === 'unavailable' ? (
            <>
              <p className="lx-message__title">{text.outcome.unavailableTitle}</p>
              <p className="lx-message__body">{text.outcome.unavailable}</p>
            </>
          ) : (
            <p className="lx-message__title">{text.outcome[outcome]}</p>
          )}
        </div>
      )}
      <p className="lx-body">{props.statement}</p>
      <div className="lx-form__actions">
        <Submit />
        <a className="lx-button lx-button--quiet" href={props.detailHref}>
          {text.keep}
        </a>
      </div>
      {props.hint === null ? null : <p className="lx-hint">{props.hint}</p>}
    </form>
  );
}
