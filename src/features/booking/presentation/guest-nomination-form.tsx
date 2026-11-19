'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { nominateGuestAction } from './guest-nomination-action';
import type { GuestNominationState } from './guest-nomination-state';
import { guestNominationMessages as text } from './i18n/guest-nomination-pt-br';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        className="lx-button lx-button--primary"
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.pending : text.submit}
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
 * Declaração de uso por convidados (W14; REQ-092; spec booking §11): só a aceitação das regras exibidas. O erro da
 * aceitação reflete o controle agora; o servidor valida de novo no envio.
 */
export function GuestNominationForm(props: {
  readonly bookingId: string;
  readonly secondHomeId: string;
  readonly partyId: string;
  readonly rulesId: string;
  readonly idempotencyKey: string;
  readonly backHref: string;
}) {
  const [state, action] = useActionState<GuestNominationState, FormData>(nominateGuestAction, {
    key: props.idempotencyKey,
    outcome: null,
  });
  const [accepted, setAccepted] = useState(false);
  const acceptError = state.outcome === 'accept' && !accepted;
  const rejection =
    state.outcome !== null && state.outcome !== 'accept' ? text.outcome[state.outcome] : null;
  return (
    <form className="lx-form" action={action} noValidate aria-label={text.submit}>
      <input type="hidden" name="booking_id" value={props.bookingId} />
      <input type="hidden" name="second_home_id" value={props.secondHomeId} />
      <input type="hidden" name="party_id" value={props.partyId} />
      <input type="hidden" name="guest_rules_id" value={props.rulesId} />
      {rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">{rejection}</p>
        </div>
      )}
      <fieldset
        className="lx-choice-group"
        aria-describedby={acceptError ? 'accept-erro' : undefined}
        aria-invalid={acceptError ? true : undefined}
      >
        <legend className="lx-label">{text.acceptLegend}</legend>
        <div className="lx-choice-group__options">
          <label className="lx-choice">
            <input
              type="checkbox"
              name="accept"
              onChange={(event) => setAccepted(event.currentTarget.checked)}
            />
            <span className="lx-choice__title">{text.accept}</span>
          </label>
        </div>
        {acceptError ? (
          <p className="lx-error" id="accept-erro">
            <Icon name="alert" className="lx-error__icon" />
            {text.acceptError}
          </p>
        ) : null}
      </fieldset>
      <p className="lx-hint">{text.responsibility}</p>
      <div className="lx-form__actions">
        <Submit />
        <a className="lx-button lx-button--quiet" href={props.backHref}>
          {text.back}
        </a>
      </div>
    </form>
  );
}
