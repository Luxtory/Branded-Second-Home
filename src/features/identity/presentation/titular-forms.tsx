'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { acceptInviteAction } from './actions';
import { INITIAL_INVITE_STATE, type ActivationState, type InviteMessage } from './form-state';
import { titularMessages } from './i18n/titular-pt-br';
import { messages } from './i18n/pt-br';
import { activateDelegationAction } from './titular-actions';

const text = titularMessages.activate;

const ERRORS: Record<InviteMessage, string> = {
  invalid_email: text.invalidEmail,
  invalid_code: text.invalidCode,
  unavailable: messages.unavailable.title,
};

function Submit({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="lx-button lx-button--primary"
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {label}
    </button>
  );
}

/** Primeiro acesso: e-mail + código de seis dígitos do convite (resposta genérica, sem enumerar contas). */
export function InviteCodeForm() {
  const [state, action] = useActionState(acceptInviteAction, INITIAL_INVITE_STATE);
  const error = state.message === null ? undefined : ERRORS[state.message];
  const describe = (hint: string) => (error === undefined ? hint : `${hint} invite-error`);
  return (
    <form className="lx-form" action={action} noValidate>
      <div className="lx-field">
        <label className="lx-label" htmlFor="invite-email">
          {text.emailLabel}
        </label>
        <p className="lx-hint" id="invite-email-hint">
          {text.emailHint}
        </p>
        <input
          className="lx-input"
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describe('invite-email-hint')}
        />
      </div>
      <div className="lx-field">
        <label className="lx-label" htmlFor="invite-code">
          {text.codeLabel}
        </label>
        <p className="lx-hint" id="invite-code-hint">
          {text.codeHint}
        </p>
        <input
          className="lx-input"
          id="invite-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describe('invite-code-hint')}
        />
      </div>
      {error === undefined ? null : (
        <p className="lx-error" id="invite-error" role="alert">
          {error}
        </p>
      )}
      <div className="lx-form__row">
        <Submit label={text.submit} />
      </div>
    </form>
  );
}

const ACTIVATION_ERRORS = titularMessages.rejections;

/** "Ativar representação" de um convite pendente (o command confere dono, estado e vigência). */
export function ActivateDelegationForm({
  delegationId,
  idempotencyKey,
}: {
  readonly delegationId: string;
  readonly idempotencyKey: string;
}) {
  const initial: ActivationState = { key: idempotencyKey, message: null };
  const [state, action] = useActionState(activateDelegationAction, initial);
  return (
    <form className="lx-form" action={action}>
      <input type="hidden" name="party_delegation_id" value={delegationId} />
      {state.message === null ? null : (
        <p className="lx-error" role="alert">
          {ACTIVATION_ERRORS[state.message]}
        </p>
      )}
      <div className="lx-form__row">
        <Submit label={titularMessages.area.activate} />
      </div>
    </form>
  );
}
