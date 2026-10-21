'use client';

import { useActionState, useState } from 'react';
import { loginAction } from './actions';
import { initialLoginState, type LoginDestination, type LoginMessage } from './form-state';
import { messages } from './i18n/pt-br';

const text = messages.login;

const ERRORS: Partial<Record<LoginMessage, string>> = {
  invalid_email: text.invalidEmail,
  invalid_code: text.invalidCode,
  rate_limited: text.rateLimited,
  unavailable: messages.unavailable.title,
};

/** Avisos do envio do código (não são erro de campo): o reenvio mantém o formulário do código. */
const NOTICES: Partial<
  Record<
    LoginMessage,
    { readonly tone: 'success' | 'warning'; readonly title: string; readonly body: string }
  >
> = {
  code_sent: { tone: 'success', title: text.codeSentTitle, body: text.codeSentBody },
  code_resent: { tone: 'success', title: text.codeResentTitle, body: text.codeResentBody },
  resend_rate_limited: {
    tone: 'warning',
    title: text.resendRateLimitedTitle,
    body: text.resendRateLimitedBody,
  },
};

/**
 * Formulário de login em dois passos: e-mail → código de uso único (TECH-050), com reenvio do código. `destination`
 * (fechado): staff segue para o segundo fator; o Titular, para a Área (W7).
 */
export function LoginForm({ destination = 'admin' }: { readonly destination?: LoginDestination }) {
  const [state, formAction, pending] = useActionState(loginAction, initialLoginState(destination));
  const restart = destination === 'titular' ? '/titular/entrar' : '/entrar';
  // Qual botão enviou o formulário, para o indicador de espera aparecer no botão certo.
  const [resending, setResending] = useState(false);
  const error = state.message === null ? undefined : ERRORS[state.message];
  const notice = state.message === null ? undefined : NOTICES[state.message];
  const onCode = state.step === 'code';

  return (
    <form className="lx-form" action={formAction} noValidate>
      {notice === undefined ? null : (
        <div className={`lx-message lx-message--${notice.tone}`} role="status">
          <p className="lx-message__title">{notice.title}</p>
          <p className="lx-message__body">{notice.body}</p>
        </div>
      )}
      <input type="hidden" name="step" value={state.step} />
      <input type="hidden" name="destination" value={state.destination} />
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
        {/* 1º botão de envio: Enter no campo do código confirma, não reenvia. */}
        <button
          className="lx-button lx-button--primary"
          type="submit"
          disabled={pending}
          aria-busy={(pending && !resending) || undefined}
          onClick={() => setResending(false)}
        >
          {onCode ? text.confirmCode : text.sendCode}
        </button>
        {onCode ? (
          <button
            className="lx-button lx-button--quiet"
            type="submit"
            name="intent"
            value="resend"
            disabled={pending}
            aria-busy={(pending && resending) || undefined}
            onClick={() => setResending(true)}
          >
            {text.resendCode}
          </button>
        ) : null}
      </div>
      {onCode ? (
        <a className="lx-link" href={restart}>
          {text.otherEmail}
        </a>
      ) : null}
    </form>
  );
}
