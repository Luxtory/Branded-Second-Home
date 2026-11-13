'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/design-system/react/icons';
import {
  parseSecondHomePartnerContact,
  type SecondHomePartnerContactFieldCode,
  type SecondHomePartnerContactFieldIssue,
} from '../../application/second-home-partner-contact';
import {
  DEVELOPMENT_STAGES,
  SECOND_HOME_PARTNER_CONTACT_FIELDS,
  type SecondHomePartnerContactField,
} from '../../domain/second-home-partner-contact';
import type { SecondHomePartnersMessages } from '../i18n/second-home-partners-pt-br';

const ENDPOINT = '/v1/second-home-partner-contacts';

/** Só os textos do formulário chegam ao navegador (props do componente de servidor), não a copy da página. */
export interface SecondHomePartnerFormText {
  readonly form: SecondHomePartnersMessages['form'];
  readonly submit: string;
  readonly success: string;
}

type Field = SecondHomePartnerContactField;
type TextField = Exclude<Field, 'stage'>;
type Values = Record<Field, string>;
type FieldErrors = Partial<Record<Field, SecondHomePartnerContactFieldCode>>;
type Outcome = keyof SecondHomePartnersMessages['form']['outcomes'];

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'success' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'failed'; readonly outcome: Outcome };

const EMPTY: Values = {
  name: '',
  company: '',
  email: '',
  development: '',
  stage: '',
  message: '',
  website: '',
};

/** Campos de texto na ordem do formulário (a fase vem depois de Empreendimento): tipo, autocomplete e obrigatoriedade. */
const BEFORE_STAGE: readonly TextFieldSpec[] = [
  { name: 'name', autoComplete: 'name' },
  { name: 'company', autoComplete: 'organization' },
  { name: 'email', type: 'email', autoComplete: 'email' },
  { name: 'development', autoComplete: 'off' },
];
const AFTER_STAGE: readonly TextFieldSpec[] = [
  { name: 'message', autoComplete: 'off', multiline: true, optional: true },
  { name: 'website', type: 'url', autoComplete: 'url', optional: true },
];

interface TextFieldSpec {
  readonly name: TextField;
  readonly type?: 'email' | 'url';
  readonly autoComplete: string;
  readonly multiline?: boolean;
  readonly optional?: boolean;
}

/** HTTP → mensagem (TECH-056): 503, 500, falha de rede ou corpo inesperado = envio não confirmado. */
function outcomeFor(status: number): Outcome {
  if (status === 429) return 'rateLimited';
  if (status === 409) return 'conflict';
  if (status === 403 || status === 404 || status === 413 || status === 415) return 'refused';
  return 'unconfirmed';
}

function messageFor(
  text: SecondHomePartnerFormText['form'],
  field: Field,
  code: SecondHomePartnerContactFieldCode,
): string {
  if (field === 'stage') return text.stageRequired;
  if (code === 'invalid' && (field === 'email' || field === 'website'))
    return text.fieldInvalid[field];
  return text.fields[code];
}

function toErrors(issues: readonly SecondHomePartnerContactFieldIssue[]): FieldErrors {
  return Object.fromEntries(issues.map((issue) => [issue.field, issue.code]));
}

/** Códigos de campo da resposta 400 (só nomes e códigos, nunca valores). */
function serverIssues(body: unknown): readonly SecondHomePartnerContactFieldIssue[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('fields' in body) ||
    !Array.isArray(body.fields)
  ) {
    return [];
  }
  return body.fields.filter(
    (item: unknown): item is SecondHomePartnerContactFieldIssue =>
      typeof item === 'object' &&
      item !== null &&
      'field' in item &&
      'code' in item &&
      SECOND_HOME_PARTNER_CONTACT_FIELDS.includes(item.field as Field) &&
      ['required', 'too_long', 'invalid'].includes(String(item.code)),
  );
}

/** Corpo enviado: opcionais vazios saem do JSON; o honeypot só vai quando preenchido. */
function requestBody(values: Values, trap: string) {
  const { message, website, ...required } = values;
  return {
    ...required,
    ...(message.trim() === '' ? {} : { message }),
    ...(website.trim() === '' ? {} : { website }),
    ...(trap === '' ? {} : { _trap: trap }),
  };
}

/**
 * Formulário “Seu empreendimento pode fazer parte dessa história.” (REQ-105, spec catalog §20.3). Estados: inicial →
 * validação → enviando → aceite confirmado ou erro. O mesmo schema do servidor dá o feedback; foco no primeiro erro,
 * resumo acessível e região viva. Os dados e a `Idempotency-Key` ficam só na memória desta interação — nunca em URL,
 * cookie ou storage: falha preserva ambos (retry com a mesma chave e o mesmo conteúdo); sucesso limpa e encerra.
 */
export function SecondHomePartnerContactForm({
  text: { form: text, submit, success },
}: {
  readonly text: SecondHomePartnerFormText;
}) {
  const id = useId();
  const fieldId = (field: Field) => `${id}-${field}`;
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const trap = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  // Tentativa lógica: a chave acompanha exatamente o conteúdo enviado. Conteúdo novo = tentativa nova.
  const attempt = useRef<{ readonly key: string; readonly payload: string } | null>(null);

  const focusFirst = (fieldErrors: FieldErrors) => {
    const first = SECOND_HOME_PARTNER_CONTACT_FIELDS.find(
      (field) => fieldErrors[field] !== undefined,
    );
    if (first !== undefined) document.getElementById(fieldId(first))?.focus();
  };

  // O foco só vai ao campo depois que `aria-invalid` e a mensagem de erro já estão no DOM.
  const showIssues = (issues: readonly SecondHomePartnerContactFieldIssue[]) => {
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
    const body = requestBody(values, trapValue);
    const parsed = parseSecondHomePartnerContact(body);
    if (!parsed.ok) {
      showIssues(parsed.issues);
      return;
    }
    setErrors({});
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

  const invalid = SECOND_HOME_PARTNER_CONTACT_FIELDS.filter((field) => errors[field] !== undefined);
  const isSending = status.kind === 'sending';

  // Ao fim do envio (aceite ou falha), o foco volta ao botão; erros de campo levam o foco ao primeiro campo inválido.
  const wasSending = useRef(false);
  useEffect(() => {
    if (wasSending.current && (status.kind === 'success' || status.kind === 'failed')) {
      submitButton.current?.focus();
    }
    wasSending.current = status.kind === 'sending';
  }, [status.kind]);

  const setValue = (field: Field, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const errorText = (field: Field) => {
    const code = errors[field];
    return code === undefined ? null : (
      <p className="lx-error" id={`${fieldId(field)}-error`}>
        <Icon name="alert" className="lx-error__icon" />
        {messageFor(text, field, code)}
      </p>
    );
  };

  const textField = (field: TextFieldSpec) => {
    const control = fieldId(field.name);
    const code = errors[field.name];
    const common = {
      id: control,
      name: field.name,
      value: values[field.name],
      autoComplete: field.autoComplete,
      required: field.optional !== true,
      readOnly: isSending,
      'aria-invalid': code === undefined ? undefined : (true as const),
      'aria-describedby': code === undefined ? undefined : `${control}-error`,
      onChange: (event: { target: { value: string } }) => setValue(field.name, event.target.value),
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
          <textarea className="lx-textarea" rows={5} {...common} />
        ) : (
          <input
            className="lx-input"
            type={field.type ?? 'text'}
            inputMode={field.type}
            spellCheck={field.type === undefined ? undefined : false}
            {...common}
          />
        )}
        {errorText(field.name)}
      </div>
    );
  };

  const stageError = errors.stage === undefined ? undefined : `${fieldId('stage')}-error`;

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

      {BEFORE_STAGE.map(textField)}

      <fieldset className="lx-choice-group" aria-describedby={stageError}>
        <legend className="lx-label">{text.labels.stage}</legend>
        <div className="lx-choice-group__options">
          {DEVELOPMENT_STAGES.map((stage, index) => (
            <label className="lx-choice" key={stage}>
              <input
                type="radio"
                name="stage"
                value={stage}
                id={index === 0 ? fieldId('stage') : undefined}
                checked={values.stage === stage}
                required
                disabled={isSending}
                onChange={() => setValue('stage', stage)}
              />
              <span className="lx-choice__title">{text.stages[stage]}</span>
            </label>
          ))}
        </div>
        {errorText('stage')}
      </fieldset>

      {AFTER_STAGE.map(textField)}

      {/* Honeypot técnico: fora do teclado e da árvore acessível; sem rótulo de negócio. */}
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
