'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/design-system/react/icons';
import {
  parseInterestRequest,
  type InterestField,
  type InterestFieldCode,
  type InterestFieldIssue,
} from '../application/interest-input';
import type { InterestModality } from '../domain/interest';
import {
  DECISION_HORIZONS,
  DECISION_UNITS,
  INVESTMENT_ANSWERS,
  investmentQuestionFor,
  type InvestmentQuestion,
} from '../domain/interest-qualification';
import type { InterestRequestMessages } from './i18n/interest-request-pt-br';

const ENDPOINT = '/v1/interests';
const DAYS = /^[0-9]+$/u;

/** Campos que o visitante preenche, na ordem da interface (spec ownership §14.3). */
const UI_FIELDS = [
  'modality',
  'desired_location',
  'approx_days',
  'investment_answer',
  'decision_unit',
  'decision_horizon',
  'name',
  'phone',
  'email',
] as const;
type UiField = (typeof UI_FIELDS)[number];
type FieldErrors = Partial<Record<UiField, InterestFieldCode>>;
type Outcome = keyof InterestRequestMessages['outcomes'];

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'success' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'failed'; readonly outcome: Outcome };

interface Values {
  readonly modality: InterestModality | '';
  readonly desiredLocation: string;
  readonly approxDays: string;
  readonly investmentAnswer: string;
  readonly decisionUnit: string;
  readonly decisionHorizon: string;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

/** Campo da interface de cada valor: editar o valor encerra o erro mostrado nele. */
const FIELD_OF: Readonly<Record<keyof Values, UiField>> = {
  modality: 'modality',
  desiredLocation: 'desired_location',
  approxDays: 'approx_days',
  investmentAnswer: 'investment_answer',
  decisionUnit: 'decision_unit',
  decisionHorizon: 'decision_horizon',
  name: 'name',
  phone: 'phone',
  email: 'email',
};

const EMPTY: Values = {
  modality: '',
  desiredLocation: '',
  approxDays: '',
  investmentAnswer: '',
  decisionUnit: '',
  decisionHorizon: '',
  name: '',
  phone: '',
  email: '',
};

/** Campo do contrato → campo da interface; a variante da pergunta é respondida na mesma escolha da resposta. */
function uiFieldOf(field: InterestField): UiField | null {
  if (field === 'investment_question') return 'investment_answer';
  return (UI_FIELDS as readonly string[]).includes(field) ? (field as UiField) : null;
}

/** HTTP → mensagem (TECH-056): 503, 500, falha de rede ou corpo inesperado = envio não confirmado. */
function outcomeFor(status: number): Outcome {
  if (status === 429) return 'rateLimited';
  if (status === 409) return 'conflict';
  if (status === 404) return 'unavailable';
  if (status === 403 || status === 413 || status === 415) return 'refused';
  return 'unconfirmed';
}

/** Códigos de campo da resposta 400 (só nomes e códigos, nunca valores). */
function serverIssues(body: unknown): readonly InterestFieldIssue[] {
  if (typeof body !== 'object' || body === null || !('fields' in body)) return [];
  const { fields } = body as { readonly fields: unknown };
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (item: unknown): item is InterestFieldIssue =>
      typeof item === 'object' &&
      item !== null &&
      'field' in item &&
      'code' in item &&
      typeof item.field === 'string' &&
      ['required', 'too_long', 'invalid', 'not_allowed'].includes(String(item.code)),
  );
}

/** Variante da dimensão de investimento: a mesma regra do servidor, a partir do que a página apresentou. */
function questionOf(values: Values, hasReference: boolean): InvestmentQuestion | null {
  return values.modality === '' ? null : investmentQuestionFor(values.modality, hasReference);
}

const optional = (key: string, value: string) => (value === '' ? {} : { [key]: value });

/** Dias digitados: inteiro → número; outro texto → `NaN` (o schema recusa como inválido); vazio → ausente. */
function daysOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return DAYS.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function bodyOf(
  values: Values,
  question: InvestmentQuestion | null,
  homeEditionId: string,
  presentationContext: string,
): Record<string, unknown> {
  return {
    home_edition_id: homeEditionId,
    ...optional('modality', values.modality),
    desired_location: values.desiredLocation,
    ...(values.modality === 'co_owner' ? { approx_days: daysOf(values.approxDays) } : {}),
    ...(question === null ? {} : { investment_question: question }),
    ...optional('investment_answer', values.investmentAnswer),
    ...optional('decision_unit', values.decisionUnit),
    ...optional('decision_horizon', values.decisionHorizon),
    name: values.name,
    phone: values.phone,
    email: values.email,
    presentation_context: presentationContext,
  };
}

function ErrorText({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p className="lx-error" id={id}>
      <Icon name="alert" className="lx-error__icon" />
      {children}
    </p>
  );
}

interface ChoiceOption {
  readonly value: string;
  readonly title: string;
  readonly desc?: string;
}

/** Choice Group do Core DS (`fieldset` + `legend.lx-label` + cartões `lx-choice`): o cartão inteiro é alvo. */
function ChoiceGroup({
  name,
  legend,
  options,
  value,
  onChange,
  firstId,
  errorId,
  error,
  disabled,
  notes,
}: {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly ChoiceOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly firstId: string;
  readonly errorId: string;
  readonly error: string | null;
  readonly disabled: boolean;
  /** Notas factuais ligadas ao grupo (referência apresentada, nota do Co-Owner). */
  readonly notes?: readonly { readonly id: string; readonly text: string }[];
}) {
  const describedBy = [
    ...(notes ?? []).map((note) => note.id),
    ...(error === null ? [] : [errorId]),
  ];
  return (
    <fieldset
      className="lx-choice-group"
      aria-describedby={describedBy.length === 0 ? undefined : describedBy.join(' ')}
    >
      <legend className="lx-label">{legend}</legend>
      {(notes ?? []).map((note) => (
        <p className="lx-hint" id={note.id} key={note.id}>
          {note.text}
        </p>
      ))}
      <div className="lx-choice-group__options">
        {options.map((option, index) => (
          <label className="lx-choice" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              id={index === 0 ? firstId : undefined}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="lx-choice__title">{option.title}</span>
            {option.desc === undefined ? null : (
              <span className="lx-choice__desc">{option.desc}</span>
            )}
          </label>
        ))}
      </div>
      {error === null ? null : <ErrorText id={errorId}>{error}</ErrorText>}
    </fieldset>
  );
}

export interface InterestRequestFormProps {
  readonly homeEditionId: string;
  /** A média projetada como a página a mostrou; `null` = nenhuma apresentada. */
  readonly presentedLabel: string | null;
  /** Contexto de apresentação assinado no servidor (ADR-0018 §4); opaco aqui. */
  readonly presentationContext: string;
  readonly privacyHref: string;
  readonly collectionHref: string;
  readonly text: InterestRequestMessages;
}

/**
 * Formulário "Solicitar uma conversa" (spec ownership §14.3–§14.5). Estados: inicial → validação (o mesmo schema do
 * servidor) → enviando → solicitação recebida ou falha. Foco no primeiro erro, resumo acessível e região viva. Os dados
 * e a `Idempotency-Key` ficam só na memória desta interação — nunca em URL, cookie ou storage: falha preserva ambos
 * (repetir com a mesma chave e o mesmo conteúdo); sucesso encerra a tentativa e substitui o formulário.
 */
export function InterestRequestForm({
  homeEditionId,
  presentedLabel,
  presentationContext,
  privacyHref,
  collectionHref,
  text,
}: InterestRequestFormProps) {
  const id = useId();
  const fieldId = (field: UiField) => `${id}-${field}`;
  const errorId = (field: UiField) => `${fieldId(field)}-error`;
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const submitButton = useRef<HTMLButtonElement>(null);
  const successMessage = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  // Tentativa lógica: a chave acompanha exatamente o conteúdo enviado. Conteúdo novo = tentativa nova.
  const attempt = useRef<{ readonly key: string; readonly payload: string } | null>(null);

  const hasReference = presentedLabel !== null;
  const question = questionOf(values, hasReference);
  const isSending = status.kind === 'sending';

  /** Um erro mostrado não sobrevive à edição do campo; o resumo acompanha (o servidor decide de novo no envio). */
  const clearErrors = (fields: readonly UiField[]) =>
    setErrors((current) => {
      if (!fields.some((field) => current[field] !== undefined)) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });

  const update = (patch: Partial<Values>) => {
    setValues((current) => ({ ...current, ...patch }));
    clearErrors((Object.keys(patch) as (keyof Values)[]).map((key) => FIELD_OF[key]));
  };

  /** Trocar a modalidade descarta a resposta de investimento quando a variante muda (spec §14.5). */
  const chooseModality = (modality: InterestModality) => {
    clearErrors(['modality', 'approx_days']);
    setValues((current) => {
      const before = questionOf(current, hasReference);
      const after = investmentQuestionFor(modality, hasReference);
      return {
        ...current,
        modality,
        investmentAnswer: before === after ? current.investmentAnswer : '',
      };
    });
  };

  const showIssues = (issues: readonly InterestFieldIssue[]) => {
    const fieldErrors: FieldErrors = {};
    for (const issue of issues) {
      const field = uiFieldOf(issue.field);
      // Sem modalidade, a pergunta de investimento ainda não aparece: o erro fica na modalidade.
      if (field === null || (field === 'investment_answer' && values.modality === '')) continue;
      fieldErrors[field] ??= issue.code;
    }
    // O foco só vai ao campo depois que `aria-invalid` e a mensagem de erro já estão no DOM.
    flushSync(() => {
      setErrors(fieldErrors);
      setStatus({ kind: 'invalid' });
    });
    const first = UI_FIELDS.find((field) => fieldErrors[field] !== undefined);
    if (first !== undefined) document.getElementById(fieldId(first))?.focus();
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
    if (response.status === 201) {
      attempt.current = null;
      setValues(EMPTY);
      setErrors({});
      setStatus({ kind: 'success' });
      return;
    }
    if (response.status === 400) {
      const issues = serverIssues(await response.json().catch(() => null));
      if (issues.some((issue) => issue.field === 'presentation_context')) {
        setStatus({ kind: 'failed', outcome: 'stale' });
        return;
      }
      if (issues.some((issue) => uiFieldOf(issue.field as InterestField) !== null)) {
        showIssues(issues);
        return;
      }
      setStatus({ kind: 'failed', outcome: 'refused' });
      return;
    }
    // Conflito: a chave já levou outro conteúdo. Não há retry automático; o próximo envio é uma tentativa nova.
    if (response.status === 409) attempt.current = null;
    setStatus({ kind: 'failed', outcome: outcomeFor(response.status) });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current) return;
    const body = bodyOf(values, question, homeEditionId, presentationContext);
    const parsed = parseInterestRequest(body);
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

  // Ao fim do envio com falha, o foco volta ao botão; no sucesso, vai à confirmação que substitui o formulário.
  const wasSending = useRef(false);
  useEffect(() => {
    if (wasSending.current && status.kind === 'failed') submitButton.current?.focus();
    if (wasSending.current && status.kind === 'success') successMessage.current?.focus();
    wasSending.current = status.kind === 'sending';
  }, [status.kind]);

  if (status.kind === 'success') {
    return (
      <div
        ref={successMessage}
        className="lx-message lx-message--success"
        role="status"
        tabIndex={-1}
      >
        <Icon name="check" className="lx-message__icon" />
        <p className="lx-message__title">{text.success}</p>
      </div>
    );
  }

  const errorText = (field: UiField, fallback?: string): string | null => {
    const code = errors[field];
    if (code === undefined) return null;
    if (code === 'required' && fallback !== undefined) return fallback;
    if (code === 'invalid' && (field === 'email' || field === 'phone' || field === 'approx_days')) {
      return text.fieldInvalid[field];
    }
    return text.fields[code];
  };

  const textInput = (
    field: 'desired_location' | 'approx_days' | 'name' | 'phone' | 'email',
    props: {
      readonly label: string;
      readonly value: string;
      readonly onChange: (value: string) => void;
      readonly hint?: string;
      readonly type?: 'text' | 'tel' | 'email';
      readonly inputMode?: 'numeric' | 'tel' | 'email';
      readonly autoComplete: string;
    },
  ) => {
    const control = fieldId(field);
    const error = errorText(field);
    const hintId = `${control}-hint`;
    const describedBy = [
      ...(props.hint === undefined ? [] : [hintId]),
      ...(error === null ? [] : [errorId(field)]),
    ];
    return (
      <div className="lx-field">
        <label className="lx-label" htmlFor={control}>
          {props.label}
        </label>
        {props.hint === undefined ? null : (
          <p className="lx-hint" id={hintId}>
            {props.hint}
          </p>
        )}
        <input
          className="lx-input"
          id={control}
          name={field}
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
          spellCheck={props.type === 'email' ? false : undefined}
          required
          readOnly={isSending}
          value={props.value}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={describedBy.length === 0 ? undefined : describedBy.join(' ')}
          onChange={(event) => props.onChange(event.target.value)}
        />
        {error === null ? null : <ErrorText id={errorId(field)}>{error}</ErrorText>}
      </div>
    );
  };

  const investment = question === null ? null : text.investment[question];
  const investmentNotes =
    question === 'reference_fit' && presentedLabel !== null
      ? [
          {
            id: `${id}-reference`,
            text: `${text.investment.reference_fit.presented} ${presentedLabel}.`,
          },
          { id: `${id}-reference-note`, text: text.investment.reference_fit.note },
        ]
      : values.modality === 'co_owner'
        ? [{ id: `${id}-co-owner-note`, text: text.investment.investment_definition.coOwnerNote }]
        : [];
  const invalidFields = UI_FIELDS.filter((field) => errors[field] !== undefined);

  return (
    <form className="lx-form" noValidate method="post" onSubmit={(event) => void onSubmit(event)}>
      {/* O contexto de apresentação assinado viaja com o formulário; opaco aqui, verificado no servidor. */}
      <input type="hidden" name="presentation_context" value={presentationContext} />
      {status.kind === 'invalid' && invalidFields.length > 0 ? (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">{text.errorSummary}</p>
          <ul className="lx-message__body">
            {invalidFields.map((field) => (
              <li key={field}>
                <a className="lx-link" href={`#${fieldId(field)}`}>
                  {text.labels[field]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="lx-display-s">{text.groups.secondHome}</h3>
      <ChoiceGroup
        name="modality"
        legend={text.modality.legend}
        options={[
          { value: 'owner', title: text.modality.owner, desc: text.modality.ownerDesc },
          { value: 'co_owner', title: text.modality.coOwner, desc: text.modality.coOwnerDesc },
        ]}
        value={values.modality}
        onChange={(value) => chooseModality(value as InterestModality)}
        firstId={fieldId('modality')}
        errorId={errorId('modality')}
        error={errorText('modality', text.choiceRequired)}
        disabled={isSending}
      />
      {textInput('desired_location', {
        label: text.desiredLocation.label,
        hint: text.desiredLocation.hint,
        value: values.desiredLocation,
        onChange: (desiredLocation) => update({ desiredLocation }),
        autoComplete: 'off',
      })}
      {values.modality === 'co_owner'
        ? textInput('approx_days', {
            label: text.approxDays.label,
            hint: text.approxDays.hint,
            value: values.approxDays,
            onChange: (approxDays) => update({ approxDays }),
            inputMode: 'numeric',
            autoComplete: 'off',
          })
        : null}

      <h3 className="lx-display-s">{text.groups.decision}</h3>
      {question === null || investment === null ? null : (
        <ChoiceGroup
          name="investment_answer"
          legend={investment.legend}
          options={INVESTMENT_ANSWERS[question].map((answer) => ({
            value: answer,
            title: (investment.answers as Readonly<Record<string, string>>)[answer] ?? answer,
          }))}
          value={values.investmentAnswer}
          onChange={(investmentAnswer) => update({ investmentAnswer })}
          firstId={fieldId('investment_answer')}
          errorId={errorId('investment_answer')}
          error={errorText('investment_answer', text.choiceRequired)}
          disabled={isSending}
          notes={investmentNotes}
        />
      )}
      <ChoiceGroup
        name="decision_unit"
        legend={text.decisionUnit.legend}
        options={DECISION_UNITS.map((unit) => ({
          value: unit,
          title: text.decisionUnit.answers[unit],
        }))}
        value={values.decisionUnit}
        onChange={(decisionUnit) => update({ decisionUnit })}
        firstId={fieldId('decision_unit')}
        errorId={errorId('decision_unit')}
        error={errorText('decision_unit', text.choiceRequired)}
        disabled={isSending}
      />
      <ChoiceGroup
        name="decision_horizon"
        legend={text.decisionHorizon.legend}
        options={DECISION_HORIZONS.map((horizon) => ({
          value: horizon,
          title: text.decisionHorizon.answers[horizon],
        }))}
        value={values.decisionHorizon}
        onChange={(decisionHorizon) => update({ decisionHorizon })}
        firstId={fieldId('decision_horizon')}
        errorId={errorId('decision_horizon')}
        error={errorText('decision_horizon', text.choiceRequired)}
        disabled={isSending}
      />

      <h3 className="lx-display-s">{text.groups.contact}</h3>
      {textInput('name', {
        label: text.contact.name,
        value: values.name,
        onChange: (name) => update({ name }),
        autoComplete: 'name',
      })}
      <div className="lx-form__row">
        {textInput('phone', {
          label: text.contact.phone,
          hint: text.contact.phoneHint,
          value: values.phone,
          onChange: (phone) => update({ phone }),
          type: 'tel',
          inputMode: 'tel',
          autoComplete: 'tel',
        })}
        {textInput('email', {
          label: text.contact.email,
          value: values.email,
          onChange: (email) => update({ email }),
          type: 'email',
          inputMode: 'email',
          autoComplete: 'email',
        })}
      </div>

      <div className="lx-stack">
        <p className="lx-small">{text.transparency.notAcquisition}</p>
        <p className="lx-small">
          {text.transparency.privacy} {text.transparency.privacyMore}{' '}
          <a className="lx-link" href={privacyHref} target="_blank" rel="noopener noreferrer">
            {text.transparency.privacyLink}
            <span className="lx-visually-hidden"> {text.transparency.newTab}</span>
          </a>
          .
        </p>
      </div>

      <div className="lx-form__actions">
        <button
          ref={submitButton}
          className="lx-button lx-button--primary"
          type="submit"
          disabled={isSending}
          aria-busy={isSending ? true : undefined}
        >
          {text.submit}
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {isSending ? <p className="lx-body">{text.sending}</p> : null}
        {status.kind === 'failed' ? (
          <div className="lx-message lx-message--error">
            <Icon name="alert" className="lx-message__icon" />
            <p className="lx-message__title">{text.outcomes[status.outcome]}</p>
            {status.outcome === 'unavailable' ? (
              <p className="lx-message__body">
                <a className="lx-link" href={collectionHref}>
                  {text.unavailableLink}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
