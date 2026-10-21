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
  asksReferenceFit,
  AVAILABLE_TO_START_BANDS,
  DECISION_HORIZONS,
  DECISION_UNITS,
  REFERENCE_FIT_ANSWERS,
} from '../domain/interest-qualification';
import type { InterestRequestMessages } from './i18n/interest-request-pt-br';

const ENDPOINT = '/v1/interests';
const DAYS = /^[0-9]+$/u;

/** As 3 etapas do fluxo progressivo (spec ownership §14.3), na mesma seção e sem URL nova. */
const STEPS = [1, 2, 3] as const;
type Step = (typeof STEPS)[number];

/** Campos que o visitante preenche, por etapa e na ordem da interface. */
const STEP_FIELDS = {
  1: ['modality', 'desired_location', 'approx_days'],
  2: ['available_to_start_band', 'reference_fit', 'decision_unit', 'decision_horizon'],
  3: ['name', 'phone', 'email'],
} as const;
type UiField = (typeof STEP_FIELDS)[Step][number];
const UI_FIELDS: readonly UiField[] = STEPS.flatMap((step) => STEP_FIELDS[step]);
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
  readonly availableToStartBand: string;
  readonly referenceFit: string;
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
  availableToStartBand: 'available_to_start_band',
  referenceFit: 'reference_fit',
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
  availableToStartBand: '',
  referenceFit: '',
  decisionUnit: '',
  decisionHorizon: '',
  name: '',
  phone: '',
  email: '',
};

/** Campo do contrato → campo da interface; os técnicos (Home Edition, origem, contexto) não têm campo. */
function uiFieldOf(field: InterestField): UiField | null {
  return (UI_FIELDS as readonly string[]).includes(field) ? (field as UiField) : null;
}

function stepOf(field: UiField): Step {
  return STEPS.find((step) => (STEP_FIELDS[step] as readonly string[]).includes(field)) ?? 3;
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

const optional = (key: string, value: string) => (value === '' ? {} : { [key]: value });

/** Dias digitados: inteiro → número; outro texto → `NaN` (o schema recusa como inválido); vazio → ausente. */
function daysOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return DAYS.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function bodyOf(
  values: Values,
  asksFit: boolean,
  homeEditionId: string,
  presentationContext: string,
): Record<string, unknown> {
  return {
    home_edition_id: homeEditionId,
    ...optional('modality', values.modality),
    desired_location: values.desiredLocation,
    ...(values.modality === 'co_owner' ? { approx_days: daysOf(values.approxDays) } : {}),
    ...optional('available_to_start_band', values.availableToStartBand),
    ...(asksFit ? optional('reference_fit', values.referenceFit) : {}),
    ...optional('decision_unit', values.decisionUnit),
    ...optional('decision_horizon', values.decisionHorizon),
    name: values.name,
    phone: values.phone,
    email: values.email,
    presentation_context: presentationContext,
  };
}

/**
 * Problemas do formulário inteiro, como o servidor os veria — mais a regra que só o servidor conhece pelo contexto:
 * a comparação com a média é obrigatória para Owner quando a página a mostrou (spec §14.5).
 */
function issuesOf(body: Record<string, unknown>, asksFit: boolean): readonly InterestFieldIssue[] {
  const parsed = parseInterestRequest(body);
  const issues = parsed.ok ? [] : [...parsed.issues];
  if (asksFit && body.reference_fit === undefined) {
    issues.push({ field: 'reference_fit', code: 'required' });
  }
  return issues;
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
  /** Notas factuais ligadas ao grupo (ajuda, referência apresentada, nota do Co-Owner). */
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
 * Formulário "Solicitar uma conversa" em 3 etapas (spec ownership §14.3–§14.5): Sua Second Home → Investimento e
 * decisão → Contato. "Continuar" valida só a etapa (o mesmo schema do servidor); "Voltar" preserva tudo; nada é enviado
 * antes do envio final. Os dados e a `Idempotency-Key` ficam só na memória desta interação — nunca em URL, cookie ou
 * storage: falha preserva ambos (repetir com a mesma chave e o mesmo conteúdo); sucesso encerra a tentativa e substitui
 * o formulário. Foco no título da etapa a cada troca, no primeiro erro e na confirmação.
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
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const submitButton = useRef<HTMLButtonElement>(null);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const successMessage = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const stepMoved = useRef(false);
  // Tentativa lógica: a chave acompanha exatamente o conteúdo enviado. Conteúdo novo = tentativa nova.
  const attempt = useRef<{ readonly key: string; readonly payload: string } | null>(null);

  const hasReference = presentedLabel !== null;
  const asksFit = values.modality !== '' && asksReferenceFit(values.modality, hasReference);
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

  /**
   * Trocar a modalidade invalida só o que ficou incompatível (spec §14.3): Co-Owner descarta a comparação com a média;
   * Owner descarta os dias. Faixa, decisão, momento e contato ficam.
   */
  const chooseModality = (modality: InterestModality) => {
    clearErrors(['modality', 'approx_days', 'reference_fit']);
    setValues((current) => ({
      ...current,
      modality,
      approxDays: modality === 'owner' ? '' : current.approxDays,
      referenceFit: asksReferenceFit(modality, hasReference) ? current.referenceFit : '',
    }));
  };

  const goTo = (next: Step) => {
    stepMoved.current = true;
    setErrors({});
    setStatus({ kind: 'idle' });
    setStep(next);
  };

  /** Mostra os erros de uma etapa (a primeira com erro) e leva o foco ao primeiro campo inválido. */
  const showIssues = (issues: readonly InterestFieldIssue[]) => {
    const fieldErrors: FieldErrors = {};
    for (const issue of issues) {
      const field = uiFieldOf(issue.field);
      if (field !== null) fieldErrors[field] ??= issue.code;
    }
    const first = UI_FIELDS.find((field) => fieldErrors[field] !== undefined);
    if (first === undefined) return;
    const target = stepOf(first);
    const onStep = Object.fromEntries(
      Object.entries(fieldErrors).filter(([field]) => stepOf(field as UiField) === target),
    ) as FieldErrors;
    // O foco só vai ao campo depois que `aria-invalid` e a mensagem de erro já estão no DOM.
    flushSync(() => {
      setStep(target);
      setErrors(onStep);
      setStatus({ kind: 'invalid' });
    });
    document.getElementById(fieldId(first))?.focus();
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

  /** Envio do formulário: nas etapas 1 e 2 é "Continuar" (só valida a etapa); na 3, o envio final. */
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current) return;
    const body = bodyOf(values, asksFit, homeEditionId, presentationContext);
    const issues = issuesOf(body, asksFit);
    if (step !== 3) {
      const own = issues.filter((issue) => {
        const field = uiFieldOf(issue.field);
        return field !== null && stepOf(field) === step;
      });
      if (own.length > 0) showIssues(own);
      else goTo((step + 1) as Step);
      return;
    }
    if (issues.length > 0) {
      showIssues(issues);
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

  // Troca de etapa → foco no título da etapa; fim de envio com falha → botão; sucesso → confirmação.
  const wasSending = useRef(false);
  useEffect(() => {
    if (stepMoved.current) {
      stepMoved.current = false;
      stepTitle.current?.focus();
    }
  }, [step]);
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

  const choice = (field: UiField) => ({
    firstId: fieldId(field),
    errorId: errorId(field),
    error: errorText(field, text.choiceRequired),
    disabled: isSending,
  });

  const stepOne = (
    <>
      <ChoiceGroup
        name="modality"
        legend={text.modality.legend}
        options={[
          { value: 'owner', title: text.modality.owner, desc: text.modality.ownerDesc },
          { value: 'co_owner', title: text.modality.coOwner, desc: text.modality.coOwnerDesc },
        ]}
        value={values.modality}
        onChange={(value) => chooseModality(value as InterestModality)}
        {...choice('modality')}
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
    </>
  );

  const startNotes = [
    { id: `${id}-start-hint`, text: text.availableToStart.hint },
    ...(values.modality === 'co_owner' && hasReference
      ? [{ id: `${id}-co-owner-note`, text: text.coOwnerNote }]
      : []),
  ];
  const stepTwo = (
    <>
      <ChoiceGroup
        name="available_to_start_band"
        legend={text.availableToStart.legend}
        options={AVAILABLE_TO_START_BANDS.map((band) => ({
          value: band,
          title: text.availableToStart.answers[band],
        }))}
        value={values.availableToStartBand}
        onChange={(availableToStartBand) => update({ availableToStartBand })}
        notes={startNotes}
        {...choice('available_to_start_band')}
      />
      {asksFit && presentedLabel !== null ? (
        <ChoiceGroup
          name="reference_fit"
          legend={`${text.referenceFit.legendBefore} ${presentedLabel} ${text.referenceFit.legendAfter}`}
          options={REFERENCE_FIT_ANSWERS.map((answer) => ({
            value: answer,
            title: text.referenceFit.answers[answer],
          }))}
          value={values.referenceFit}
          onChange={(referenceFit) => update({ referenceFit })}
          notes={[{ id: `${id}-reference-note`, text: text.referenceFit.note }]}
          {...choice('reference_fit')}
        />
      ) : null}
      <ChoiceGroup
        name="decision_unit"
        legend={text.decisionUnit.legend}
        options={DECISION_UNITS.map((unit) => ({
          value: unit,
          title: text.decisionUnit.answers[unit],
        }))}
        value={values.decisionUnit}
        onChange={(decisionUnit) => update({ decisionUnit })}
        {...choice('decision_unit')}
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
        {...choice('decision_horizon')}
      />
    </>
  );

  const stepThree = (
    <>
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
    </>
  );

  const invalidFields = STEP_FIELDS[step].filter((field) => errors[field] !== undefined);
  const stepTitleId = `${id}-step`;
  const count = `${step} ${text.steps.of} ${STEPS.length}`;

  return (
    <form
      className="lx-form"
      noValidate
      method="post"
      aria-labelledby={stepTitleId}
      onSubmit={(event) => void onSubmit(event)}
    >
      {/* O contexto de apresentação assinado viaja com o formulário; opaco aqui, verificado no servidor. */}
      <input type="hidden" name="presentation_context" value={presentationContext} />

      <div className="lx-stack">
        <p className="lx-eyebrow" aria-hidden="true">
          {count}
        </p>
        <h3 ref={stepTitle} id={stepTitleId} className="lx-display-s lx-form__step" tabIndex={-1}>
          <span className="lx-visually-hidden">{count} — </span>
          {text.steps.titles[step - 1]}
        </h3>
      </div>

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

      {step === 1 ? stepOne : step === 2 ? stepTwo : stepThree}

      <div className="lx-form__actions">
        <button
          ref={step === 3 ? submitButton : undefined}
          className="lx-button lx-button--primary"
          type="submit"
          disabled={isSending}
          aria-busy={isSending ? true : undefined}
        >
          {step === 3 ? text.submit : text.continue}
        </button>
        {step === 1 ? null : (
          <button
            className="lx-button lx-button--secondary"
            type="button"
            disabled={isSending}
            onClick={() => goTo((step - 1) as Step)}
          >
            {text.back}
          </button>
        )}
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
