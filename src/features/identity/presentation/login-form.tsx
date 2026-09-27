'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';
import { INITIAL_LOGIN_STATE, type LoginMessage } from './form-state';
import { messages } from './i18n/pt-br';

const text = messages.login;

const ERRORS: Partial<Record<LoginMessage, string>> = {
  invalid_email: text.invalidEmail,
  invalid_code: text.invalidCode,
  rate_limited: text.rateLimited,
  unavailable: messages.unavailable.title,
};

/** Formulário de login em dois passos: e-mail → código de uso único (TECH-050). */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_LOGIN_STATE);
  const error = state.message === null ? undefined : ERRORS[state.message];
  const onCode = state.step === 'code';

  return (
    <form className="lx-form" action={formAction} noValidate>
      {state.message === 'code_sent' ? (
        <div className="lx-message lx-message--success" role="status">
          <p className="lx-message__title">{text.codeSentTitle}</p>
          <p className="lx-message__body">{text.codeSentBody}</p>
        </div>
      ) : null}
      <input type="hidden" name="step" value={state.step} />
      {onCode ? (
        <>
          <input type="hidden" name="email" value={state.email} />
          <div className="lx-field">
            <label className="lx-label" htmlFor="login-code">
              {text.codeLabel}
            </label>
            <p className="lx-hint" id="login-code-hint">
              {text.codeHint}
            </p>
            <input
              className="lx-input"
              id="login-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby={
                error === undefined ? 'login-code-hint' : 'login-code-hint login-error'
              }
            />
          </div>
        </>
      ) : (
        <div className="lx-field">
          <label className="lx-label" htmlFor="login-email">
            {text.emailLabel}
          </label>
          <p className="lx-hint" id="login-email-hint">
            {text.emailHint}
          </p>
          <input
            className="lx-input"
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            required
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={
              error === undefined ? 'login-email-hint' : 'login-email-hint login-error'
            }
          />
        </div>
      )}
      {error === undefined ? null : (
        <p className="lx-error" id="login-error" role="alert">
          {error}
        </p>
      )}
      <div className="lx-form__row">
        <button
          className="lx-button lx-button--primary"
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {onCode ? text.confirmCode : text.sendCode}
        </button>
        {onCode ? (
          <a className="lx-link" href="/entrar">
            {text.otherEmail}
          </a>
        ) : null}
      </div>
    </form>
  );
}
