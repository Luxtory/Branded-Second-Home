'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { withdrawRequestAction, type WithdrawFormState } from './request-actions';
import { requestMessages as text } from './i18n/request-pt-br';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      className="lx-button lx-button--secondary"
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? text.detail.withdrawing : text.detail.withdraw}
    </button>
  );
}

/** "Retirar solicitação" (spec §13.5 item 7): a chave nasce com a tela; recusa gravada → nova intenção, nova chave. */
export function RequestWithdrawForm(props: {
  readonly requestId: string;
  readonly partyId: string;
  readonly initialKey: string;
}) {
  const [state, action] = useActionState<WithdrawFormState, FormData>(withdrawRequestAction, {
    key: props.initialKey,
    message: null,
  });
  return (
    <form className="lx-form" action={action}>
      <input type="hidden" name="request_id" value={props.requestId} />
      <input type="hidden" name="party_id" value={props.partyId} />
      <p className="lx-hint">{text.detail.withdrawHint}</p>
      {state.message === null ? null : (
        <p className="lx-booking__outcome" role="alert">
          {text.outcome[state.message]}
        </p>
      )}
      <div className="lx-form__actions">
        <Submit />
      </div>
    </form>
  );
}
