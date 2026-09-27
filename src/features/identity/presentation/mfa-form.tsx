'use client';

import { useActionState, useState } from 'react';
import { mfaAction } from './actions';
import { AUTHENTICATOR_APPS } from './authenticator-apps';
import { INITIAL_MFA_STATE, type MfaMessage, type MfaState } from './form-state';
import { messages } from './i18n/pt-br';

const text = messages.mfa;

const ERRORS: Record<MfaMessage, string> = {
  invalid_code: text.invalidCode,
  enrollment_failed: text.enrollmentFailed,
  unavailable: messages.unavailable.title,
};

type FormAction = (form: FormData) => void;
type Enrollment = NonNullable<MfaState['enrollment']>;

const KEY_GROUP = /.{1,4}/g;

/**
 * Segundo fator TOTP (AAL2, TECH-050). Com fator verificado (`factorId`), pede só o código; sem ele, guia o primeiro
 * cadastro em três passos — aplicativo, QR Code (ou chave manual) e código — sem enfraquecer o TOTP padrão.
 */
export function MfaForm({ factorId }: { readonly factorId: string | null }) {
  const [state, formAction, pending] = useActionState(mfaAction, INITIAL_MFA_STATE);
  const error = state.message === null ? undefined : ERRORS[state.message];
  if (factorId !== null) {
    return (
      <CodeForm
        factorId={factorId}
        action={formAction}
        pending={pending}
        error={error}
        lead={text.challengeLead}
      />
    );
  }
  return <Enrollment state={state} action={formAction} pending={pending} error={error} />;
}

interface FormProps {
  readonly action: FormAction;
  readonly pending: boolean;
  readonly error: string | undefined;
}

function Enrollment({ state, action, pending, error }: FormProps & { readonly state: MfaState }) {
  const enrollment = state.enrollment;
  return (
    <div className="lx-grid">
      <p className="lx-lead">{text.enrollLead}</p>
      <InstallStep />
      <section className="lx-prose" aria-labelledby="mfa-add">
        <h2 className="lx-display-s" id="mfa-add">
          {text.addTitle}
        </h2>
        {enrollment === null ? (
          <StartEnrollment action={action} pending={pending} error={error} />
        ) : (
          <AddToApp enrollment={enrollment} />
        )}
      </section>
      <section className="lx-prose" aria-labelledby="mfa-code-step">
        <h2 className="lx-display-s" id="mfa-code-step">
          {text.codeTitle}
        </h2>
        {enrollment === null ? (
          <p className="lx-body">{text.codePending}</p>
        ) : (
          <CodeForm
            factorId={enrollment.factorId}
            action={action}
            pending={pending}
            error={error}
          />
        )}
      </section>
    </div>
  );
}

function InstallStep() {
  return (
    <section className="lx-prose" aria-labelledby="mfa-install">
      <h2 className="lx-display-s" id="mfa-install">
        {text.installTitle}
      </h2>
      <p className="lx-body">{text.installBody}</p>
      <ul>
        {AUTHENTICATOR_APPS.map((app) => (
          <li key={app.href}>
            <a className="lx-link" href={app.href} target="_blank" rel="noopener noreferrer">
              {app.name} <span className="lx-visually-hidden">{text.newTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StartEnrollment({ action, pending, error }: FormProps) {
  return (
    <form className="lx-form" action={action}>
      <p className="lx-body">{text.addBeforeQr}</p>
      <input type="hidden" name="intent" value="enroll" />
      {error === undefined ? null : (
        <p className="lx-error" role="alert">
          {error}
        </p>
      )}
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

function AddToApp({ enrollment }: { readonly enrollment: Enrollment }) {
  return (
    <>
      <p className="lx-body">{text.addWithQr}</p>
      {/* QR Code em data URI gerado pelo Supabase Auth: `next/image` não se aplica. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qrCode} alt={text.qrAlt} width={200} height={200} />
      {/* A chave fica oculta até ser pedida: o QR Code é o caminho principal. */}
      <details className="lx-prose">
        <summary className="lx-link">{text.cannotScan}</summary>
        <p className="lx-body">{text.manualSteps}</p>
        <p className="lx-body">
          <span className="lx-label">{text.manualKeyLabel}: </span>
          <code>{enrollment.secret.match(KEY_GROUP)?.join(' ')}</code>
        </p>
        <CopyKeyButton secret={enrollment.secret} />
      </details>
    </>
  );
}

/** Copia a chave sem espaços para a área de transferência local — nada sai do navegador. */
function CopyKeyButton({ secret }: { readonly secret: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };
  return (
    <>
      <button className="lx-button lx-button--secondary" type="button" onClick={() => void copy()}>
        {text.copyKey}
      </button>
      <p className="lx-hint" role="status">
        {status === 'copied' ? text.keyCopied : status === 'failed' ? text.copyFailed : ''}
      </p>
    </>
  );
}

function CodeForm({
  factorId,
  action,
  pending,
  error,
  lead,
}: FormProps & { readonly factorId: string; readonly lead?: string }) {
  return (
    <form className="lx-form" action={action} noValidate>
      {lead === undefined ? null : <p className="lx-body">{lead}</p>}
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="factorId" value={factorId} />
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
      {error === undefined ? null : (
        <p className="lx-error" id="mfa-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="lx-button lx-button--primary"
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {lead === undefined ? text.confirmEnrollment : text.confirm}
      </button>
    </form>
  );
}
