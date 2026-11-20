'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { ECONOMIC_PARAMETER_TYPES, type EconomicParameterKey } from '../domain/parameter';
import { setEconomicParameterAction } from './economic-parameter-action';
import type { EconomicParameterField, EconomicParameterState } from './economic-parameter-state';
import { economicParametersMessages as text } from './i18n/economic-parameters-pt-br';

function Field(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly error: string | null;
  readonly children: (id: string, described: string, invalid: true | undefined) => ReactNode;
}) {
  const hintId = `${props.id}-dica`;
  const errorId = `${props.id}-erro`;
  return (
    <div className="lx-field">
      <label className="lx-label" htmlFor={props.id}>
        {props.label}
      </label>
      <p className="lx-hint" id={hintId}>
        {props.hint}
      </p>
      {props.children(
        props.id,
        props.error ? `${hintId} ${errorId}` : hintId,
        props.error ? true : undefined,
      )}
      {props.error ? (
        <p className="lx-error" id={errorId}>
          <Icon name="alert" className="lx-error__icon" />
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        className="lx-button lx-button--primary"
        type="submit"
        name="intent"
        value="review"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.pending : text.submit}
      </button>
      {pending ? (
        <p className="lx-visually-hidden" role="status">
          {text.pendingStatus}
        </p>
      ) : null}
    </>
  );
}

/** Revisão calculada no servidor: vigente agora, agendados, novo valor, vigência, término, base e autoridade. */
function ReviewBlock({ state }: { readonly state: EconomicParameterState }) {
  const review = state.review!;
  const { pending } = useFormStatus();
  const facts: [string, string][] = [
    [text.review.current, review.current ?? text.review.currentNone],
    ...(review.scheduled.length === 0
      ? []
      : ([[text.review.scheduled, review.scheduled.join(' · ')]] as [string, string][])),
    [
      text.review.change,
      review.current === null
        ? review.proposed
        : text.review.compare(review.current, review.proposed),
    ],
    [text.review.from, review.from],
    [text.review.to, review.to],
    [text.review.basis, review.basis],
    [text.review.authority, text.review.authorityAdmin],
  ];
  return (
    <>
      <p className="lx-label">{text.review.title}</p>
      <dl className="lx-evidence">
        {facts.map(([label, value]) => (
          <div className="lx-evidence__item" key={label}>
            <dt className="lx-evidence__label">{label}</dt>
            <dd className="lx-evidence__value">{value}</dd>
          </div>
        ))}
      </dl>
      {(['value', 'effective_from', 'effective_to', 'basis'] as const).map((name) => (
        <input key={name} type="hidden" name={name} value={state.values[name] ?? ''} />
      ))}
      <div className="lx-form__actions">
        <button
          className="lx-button lx-button--primary"
          type="submit"
          name="intent"
          value="confirm"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? text.pending : text.review.confirm}
        </button>
        <button
          className="lx-button lx-button--quiet"
          type="submit"
          name="intent"
          value="edit"
          disabled={pending}
        >
          {text.review.edit}
        </button>
      </div>
    </>
  );
}

/** Nova versão de um parâmetro econômico global (W16; spec admin §14): valor no formato da tela, vigência e base. */
export function EconomicParameterForm(props: {
  readonly parameter: EconomicParameterKey;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(setEconomicParameterAction, {
    key: props.idempotencyKey,
    parameter: props.parameter,
    values: {},
    fieldErrors: {},
    rejection: null,
  } satisfies EconomicParameterState);
  const type = ECONOMIC_PARAMETER_TYPES[props.parameter];
  const id = (name: EconomicParameterField) => `${props.parameter}-${name}`;
  const error = (name: EconomicParameterField, message: string) =>
    state.fieldErrors[name] ? message : null;
  const value = (name: EconomicParameterField) => state.values[name] ?? '';
  return (
    <form
      className="lx-form"
      action={action}
      noValidate
      aria-label={`${text.publish}: ${text.keys[props.parameter].name}`}
    >
      {state.rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">
            {text.rejection[state.rejection] ?? text.rejection.unexpected}
          </p>
        </div>
      )}
      {state.stage === 'review' && state.review ? (
        <ReviewBlock state={state} />
      ) : (
        <>
          <Field
            id={id('value')}
            label={text.fields.value[type]}
            hint={text.fields.value[`${type}Hint`]}
            error={error('value', text.fields.value.error)}
          >
            {(fieldId, described, invalid) => (
              <input
                className="lx-input"
                id={fieldId}
                name="value"
                type="text"
                inputMode={type === 'months' || type === 'hours' ? 'numeric' : 'decimal'}
                autoComplete="off"
                defaultValue={value('value')}
                aria-describedby={described}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field
            id={id('effective_from')}
            label={text.fields.effective_from}
            hint={text.fields.effectiveFromHint}
            error={error('effective_from', text.fields.effectiveFromError)}
          >
            {(fieldId, described, invalid) => (
              <input
                className="lx-input"
                id={fieldId}
                name="effective_from"
                type="datetime-local"
                defaultValue={value('effective_from')}
                aria-describedby={described}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field
            id={id('effective_to')}
            label={text.fields.effective_to}
            hint={text.fields.effectiveToHint}
            error={error('effective_to', text.fields.effectiveToError)}
          >
            {(fieldId, described, invalid) => (
              <input
                className="lx-input"
                id={fieldId}
                name="effective_to"
                type="datetime-local"
                defaultValue={value('effective_to')}
                aria-describedby={described}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field
            id={id('basis')}
            label={text.fields.basis}
            hint={text.fields.basisHint}
            error={error('basis', text.fields.basisError)}
          >
            {(fieldId, described, invalid) => (
              <input
                className="lx-input"
                id={fieldId}
                name="basis"
                type="text"
                autoComplete="off"
                maxLength={255}
                defaultValue={value('basis')}
                aria-describedby={described}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <div className="lx-form__actions">
            <Submit />
          </div>
        </>
      )}
    </form>
  );
}
