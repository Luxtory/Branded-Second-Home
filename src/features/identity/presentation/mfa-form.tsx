'use client';

import { useActionState } from 'react';
import { mfaAction } from './actions';
import { INITIAL_MFA_STATE, type MfaMessage } from './form-state';
import { messages } from './i18n/pt-br';

const text = messages.mfa;

const ERRORS: Record<MfaMessage, string> = {
  invalid_code: text.invalidCode,
  enrollment_failed: text.enrollmentFailed,
  unavailable: messages.unavailable.title,
};

/**
 * Segundo fator TOTP (AAL2, TECH-050). Com fator verificado (`factorId`), pede o código; sem ele, cadastra um fator
 * novo (QR code + chave) e confirma com o primeiro código.
 */
export function MfaForm({ factorId }: { readonly factorId: string | null }) {
  const [state, formAction, pending] = useActionState(mfaAction, INITIAL_MFA_STATE);
  const error = state.message === null ? undefined : ERRORS[state.message];
  const activeFactor = factorId ?? state.enrollment?.factorId ?? null;
  const errorNode =
    error === undefined ? null : (
      <p className="lx-error" id="mfa-error" role="alert">
        {error}
      </p>
    );

  if (activeFactor === null) {
    return (
      <form className="lx-form" action={formAction}>
        <p className="lx-body">{text.enrollLead}</p>
        <input type="hidden" name="intent" value="enroll" />
        {errorNode}
        <button
          className="lx-button lx-button--primary"
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {text.startEnrollment}
        </button>
      </form>
    );
  }

  return (
    <form className="lx-form" action={formAction} noValidate>
      {state.enrollment === null ? (
        <p className="lx-body">{text.challengeLead}</p>
      ) : (
        <>
          {/* QR code em data URI gerado pelo Supabase Auth: `next/image` não se aplica. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.enrollment.qrCode} alt={text.qrAlt} width={200} height={200} />
          <p className="lx-body">
            {text.secretLabel} <code>{state.enrollment.secret}</code>
          </p>
        </>
      )}
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="factorId" value={activeFactor} />
      <div className="lx-field">
        <label className="lx-label" htmlFor="mfa-code">
          {text.codeLabel}
        </label>
        <p className="lx-hint" id="mfa-code-hint">
          {text.codeHint}
        </p>
        <input
          className="lx-input"
          id="mfa-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? 'mfa-code-hint' : 'mfa-code-hint mfa-error'}
        />
      </div>
      {errorNode}
      <button
        className="lx-button lx-button--primary"
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {text.confirm}
      </button>
    </form>
  );
}
