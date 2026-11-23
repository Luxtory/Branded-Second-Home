'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/design-system/react/icons';
import { secondHomeDevelopmentContactSchema } from '../../application/second-home-development-contact';
import {
  SECOND_HOME_DEVELOPMENT_CONTACT_LIMITS,
  type SecondHomeDevelopmentContactField as Field,
} from '../../domain/second-home-development-contact';
import { secondHomeDevelopmentContactFormMessages as text } from '../i18n/second-home-development-contact-pt-br';

const ENDPOINT = '/v1/second-home-development-contacts';
const FIELDS: readonly {
  name: Field;
  autoComplete: string;
  type?: 'email' | 'url';
}[] = [
  { name: 'name', autoComplete: 'name' },
  { name: 'company', autoComplete: 'organization' },
  { name: 'email', type: 'email', autoComplete: 'email' },
  { name: 'message', autoComplete: 'off' },
  { name: 'website', type: 'url', autoComplete: 'url' },
];

type Status =
  | 'idle'
  | 'invalid'
  | 'sending'
  | 'success'
  | 'unconfirmed'
  | 'unavailable'
  | 'rateLimited'
  | 'conflict'
  | 'rejectedData';

const RESPONSE_STATUS: Readonly<Partial<Record<number, Status>>> = {
  400: 'rejectedData',
  403: 'unavailable',
  404: 'unavailable',
  409: 'conflict',
  413: 'rejectedData',
  415: 'rejectedData',
  429: 'rateLimited',
};

function fieldError(field: Field, code: string): string {
  if (code === 'required') return text.required;
  if (code === 'too_long') return text.tooLong(SECOND_HOME_DEVELOPMENT_CONTACT_LIMITS[field]);
  if (field === 'email') return text.invalidEmail;
  if (field === 'website') return text.invalidWebsite;
  return text.invalidField;
}

/** Os campos e a chave da tentativa ficam na memória da página até o aceite. */
export function SecondHomeDevelopmentContactForm() {
  const prefix = useId();
  const fieldId = (field: Field) => `${prefix}-${field}`;
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<Status>('idle');
  const sending = useRef(false);
  const attempt = useRef<{ key: string; payload: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const parsed = secondHomeDevelopmentContactSchema.safeParse(
      Object.fromEntries(new FormData(form)),
    );
    if (!parsed.success) {
      const issues: Partial<Record<Field, string>> = {};
      for (const { name } of FIELDS) {
        const issue = parsed.error.issues.find(({ path }) => path[0] === name);
        if (issue !== undefined) issues[name] = fieldError(name, issue.message);
      }
      flushSync(() => {
        setErrors(issues);
        setStatus('invalid');
      });
      const first = FIELDS.find(({ name }) => issues[name] !== undefined);
      if (first !== undefined) document.getElementById(fieldId(first.name))?.focus();
      return;
    }

    setErrors({});
    setStatus('sending');
    sending.current = true;
    try {
      const { website, _trap, ...contact } = parsed.data;
      const payload = JSON.stringify({
        ...contact,
        ...(website ? { website } : {}),
        ...(_trap ? { _trap } : {}),
      });
      if (attempt.current?.payload !== payload) {
        attempt.current = { key: crypto.randomUUID(), payload };
      }
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': attempt.current.key },
        body: payload,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 202) {
        const body: unknown = await response.json();
        if (
          typeof body === 'object' &&
          body !== null &&
          'status' in body &&
          body.status === 'accepted'
        ) {
          attempt.current = null;
          form.reset();
          setStatus('success');
          return;
        }
      }
      if (response.status === 409) attempt.current = null;
      setStatus(RESPONSE_STATUS[response.status] ?? 'unconfirmed');
    } catch {
      setStatus('unconfirmed');
    } finally {
      sending.current = false;
    }
  }

  const isSending = status === 'sending';
  const isSuccess = status === 'success';

  return (
    <form className="lx-form" method="post" noValidate onSubmit={(event) => void submit(event)}>
      {status === 'invalid' ? (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">{text.invalid}</p>
        </div>
      ) : null}
      {FIELDS.map(({ name, autoComplete, type }) => {
        const id = fieldId(name);
        const optional = name === 'website';
        const error = errors[name];
        const control = {
          id,
          name,
          autoComplete,
          required: !optional,
          readOnly: isSending,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${id}-error` : undefined,
        };
        return (
          <div className="lx-field" key={name}>
            <label className="lx-label" htmlFor={id}>
              {text.labels[name]}
              {optional ? <span className="lx-label__optional"> {text.optional}</span> : null}
            </label>
            {name === 'message' ? (
              <textarea className="lx-textarea" rows={5} {...control} />
            ) : (
              <input
                className="lx-input"
                type={type ?? 'text'}
                inputMode={type}
                spellCheck={type === undefined ? undefined : false}
                {...control}
              />
            )}
            {error ? (
              <p className="lx-error" id={`${id}-error`}>
                <Icon name="alert" className="lx-error__icon" />
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="lx-visually-hidden" aria-hidden="true">
        <input type="text" name="_trap" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="lx-form__actions">
        <button className="lx-button lx-button--primary" disabled={isSending} type="submit">
          {text.submit}
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {isSending ? <p className="lx-body">{text.sending}</p> : null}
        {status !== 'idle' && status !== 'invalid' && !isSending ? (
          <div className={`lx-message ${isSuccess ? 'lx-message--success' : 'lx-message--error'}`}>
            <Icon name={isSuccess ? 'check' : 'alert'} className="lx-message__icon" />
            <p className="lx-message__title">{text[status]}</p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
