'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/design-system/react/icons';
import {
  parseBrandPartnerContact,
  type ContactFieldCode,
  type ContactFieldIssue,
} from '../../application/brand-partner-contact';
import { CONTACT_FIELDS, type ContactField } from '../../domain/brand-partner-contact';
import type { BrandPartnersMessages } from '../i18n/brand-partners-pt-br';

const ENDPOINT = '/v1/brand-partner-contacts';

/** Só os textos do formulário chegam ao navegador (props do componente de servidor), não a copy das páginas. */
export interface ContactFormText {
  readonly form: BrandPartnersMessages['form'];
  readonly submit: string;
  readonly success: string;
}

type Values = Record<ContactField, string>;
type FieldErrors = Partial<Record<ContactField, ContactFieldCode>>;
type Outcome = keyof BrandPartnersMessages['form']['outcomes'];

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'success' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'failed'; readonly outcome: Outcome };

const EMPTY: Values = { name: '', brand: '', email: '', message: '', website: '' };

/** Campos na ordem do formulário: tipo, autocomplete e obrigatoriedade do contrato (catalog §14.3). */
const FIELDS: readonly {
  readonly name: ContactField;
  readonly type?: 'email' | 'url';
  readonly autoComplete: string;
  readonly multiline?: boolean;
  readonly optional?: boolean;
}[] = [
  { name: 'name', autoComplete: 'name' },
  { name: 'brand', autoComplete: 'organization' },
  { name: 'email', type: 'email', autoComplete: 'email' },
  { name: 'message', autoComplete: 'off', multiline: true },
  { name: 'website', type: 'url', autoComplete: 'url', optional: true },
];

/** HTTP → mensagem (TECH-056): 503, 500, falha de rede ou corpo inesperado = envio não confirmado (§14.5). */
function outcomeFor(status: number): Outcome {
  if (status === 429) return 'rateLimited';
  if (status === 409) return 'conflict';
  if (status === 403 || status === 404 || status === 413 || status === 415) return 'refused';
  return 'unconfirmed';
}

function messageFor(
  text: ContactFormText['form'],
  field: ContactField,
  code: ContactFieldCode,
): string {
  if (code === 'invalid' && (field === 'email' || field === 'website'))
    return text.fieldInvalid[field];
  return text.fields[code];
}

function toErrors(issues: readonly ContactFieldIssue[]): FieldErrors {
  return Object.fromEntries(issues.map((issue) => [issue.field, issue.code]));
}

/** Códigos de campo da resposta 400 (só nomes e códigos, nunca valores). */
function serverIssues(body: unknown): readonly ContactFieldIssue[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('fields' in body) ||
    !Array.isArray(body.fields)
  ) {
    return [];
  }
  return body.fields.filter(
    (item: unknown): item is ContactFieldIssue =>
      typeof item === 'object' &&
      item !== null &&
      'field' in item &&
      'code' in item &&
      CONTACT_FIELDS.includes(item.field as ContactField) &&
      ['required', 'too_long', 'invalid'].includes(String(item.code)),
  );
}

/**
 * Formulário "Vamos começar pela sua marca." (REQ-028, spec catalog §14.3–14.5). Estados: inicial → validação →
 * enviando → aceite confirmado ou erro. O mesmo schema do servidor dá o feedback; foco no primeiro erro, resumo
 * acessível e região viva. Os dados e a `Idempotency-Key` ficam só na memória desta interação — nunca em URL, cookie
 * ou storage: falha preserva ambos (retry com a mesma chave e o mesmo conteúdo); sucesso limpa e encerra a tentativa.
 */
export function BrandPartnerContactForm({
  text: { form: text, submit, success },
}: {
  readonly text: ContactFormText;
}) {
  const id = useId();
  const fieldId = (field: ContactField) => `${id}-${field}`;
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const trap = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  // Tentativa lógica: a chave acompanha exatamente o conteúdo enviado. Conteúdo novo = tentativa nova.
  const attempt = useRef<{ readonly key: string; readonly payload: string } | null>(null);

  const focusFirst = (fieldErrors: FieldErrors) => {
    const first = CONTACT_FIELDS.find((field) => fieldErrors[field] !== undefined);
    if (first !== undefined) document.getElementById(fieldId(first))?.focus();
  };

  // O foco só vai ao campo depois que `aria-invalid` e a mensagem de erro já estão no DOM.
  const showIssues = (issues: readonly ContactFieldIssue[]) => {
    const fieldErrors = toErrors(issues);
    flushSync(() => {
      setErrors(fieldErrors);
      setStatus({ kind: 'invalid' });
    });
    focusFirst(fieldErrors);
  };

  const send = async (payload: string) => {
    let response: Response;
    try {
      if (attempt.current?.payload !== payload) {
        attempt.current = { key: crypto.randomUUID(), payload };
      }
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': attempt.current.key },
        body: payload,
        cache: 'no-store',
        credentials: 'same-origin',
      });
    } catch {
      setStatus({ kind: 'failed', outcome: 'unconfirmed' });
      return;
    }
    if (response.status === 202) {
      attempt.current = null;
      setValues(EMPTY);
      setErrors({});
      setStatus({ kind: 'success' });
      return;
    }
    if (response.status === 400) {
      const issues = serverIssues(await response.json().catch(() => null));
      if (issues.length > 0) {
        showIssues(issues);
        return;
      }
    }
    // Conflito: a chave já levou outro conteúdo. Não há retry automático; o próximo envio é uma tentativa nova.
    if (response.status === 409) attempt.current = null;
    setStatus({ kind: 'failed', outcome: outcomeFor(response.status) });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current) return;
    const trapValue = trap.current?.value ?? '';
    const parsed = parseBrandPartnerContact({ ...values, _trap: trapValue });
    if (!parsed.ok) {
      showIssues(parsed.issues);
      return;
    }
    setErrors({});
    const { website, ...rest } = values;
    const body = {
      ...rest,
      ...(website.trim() === '' ? {} : { website }),
      ...(trapValue === '' ? {} : { _trap: trapValue }),
    };
    sending.current = true;
    setStatus({ kind: 'sending' });
    try {
      await send(JSON.stringify(body));
    } catch {
      // Qualquer falha inesperada do navegador também é "envio não confirmado", nunca um estado preso.
      setStatus({ kind: 'failed', outcome: 'unconfirmed' });
    } finally {
      sending.current = false;
    }
  };

  const invalid = CONTACT_FIELDS.filter((field) => errors[field] !== undefined);
  const isSending = status.kind === 'sending';

  // Durante o envio os campos ficam somente leitura e o botão desabilitado: o resultado vale para o conteúdo enviado.
  // Desabilitar o botão tira o foco dele; ao fim do envio, o foco volta ao botão se ficou perdido no documento.
  const wasSending = useRef(false);
  useEffect(() => {
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (wasSending.current && !isSending && lost) submitButton.current?.focus();
    wasSending.current = isSending;
  }, [isSending]);

  return (
    <form className="lx-form" noValidate method="post" onSubmit={(event) => void onSubmit(event)}>
      {status.kind === 'invalid' && invalid.length > 0 ? (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">{text.errorSummary}</p>
          <ul className="lx-message__body">
            {invalid.map((field) => (
              <li key={field}>
                <a className="lx-link" href={`#${fieldId(field)}`}>
                  {text.labels[field]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {FIELDS.map((field) => {
        const control = fieldId(field.name);
        const code = errors[field.name];
        const describedBy = code === undefined ? undefined : `${control}-error`;
        const common = {
          id: control,
          name: field.name,
          value: values[field.name],
          autoComplete: field.autoComplete,
          required: field.optional !== true,
          readOnly: isSending,
          'aria-invalid': code === undefined ? undefined : (true as const),
          'aria-describedby': describedBy,
          onChange: (event: { target: { value: string } }) => {
            const { value } = event.target;
            setValues((current) => ({ ...current, [field.name]: value }));
          },
        };
        return (
          <div className="lx-field" key={field.name}>
            <label className="lx-label" htmlFor={control}>
              {text.labels[field.name]}
              {field.optional === true ? (
                <span className="lx-label__optional"> {text.optional}</span>
              ) : null}
            </label>
            {field.multiline === true ? (
              <textarea className="lx-textarea" rows={6} {...common} />
            ) : (
              <input
                className="lx-input"
                type={field.type ?? 'text'}
                inputMode={field.type}
                spellCheck={field.type === undefined ? undefined : false}
                {...common}
              />
            )}
            {code === undefined ? null : (
              <p className="lx-error" id={`${control}-error`}>
                <Icon name="alert" className="lx-error__icon" />
                {messageFor(text, field.name, code)}
              </p>
            )}
          </div>
        );
      })}

      {/* Honeypot técnico (§14.3): fora do teclado e da árvore acessível; sem rótulo de negócio. */}
      <div className="lx-visually-hidden" aria-hidden="true">
        <input
          ref={trap}
          type="text"
          name="_trap"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <div className="lx-form__actions">
        <button
          ref={submitButton}
          className="lx-button lx-button--primary"
          type="submit"
          disabled={isSending}
        >
          {submit}
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {status.kind === 'sending' ? <p className="lx-body">{text.sending}</p> : null}
        {status.kind === 'success' ? (
          <div className="lx-message lx-message--success">
            <Icon name="check" className="lx-message__icon" />
            <p className="lx-message__title">{success}</p>
          </div>
        ) : null}
        {status.kind === 'failed' ? (
          <div className="lx-message lx-message--error">
            <Icon name="alert" className="lx-message__icon" />
            <p className="lx-message__title">{text.outcomes[status.outcome]}</p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
