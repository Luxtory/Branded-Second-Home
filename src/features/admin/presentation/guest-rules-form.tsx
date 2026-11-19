'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { setGuestRulesAction } from './guest-rules-action';
import type { GuestRulesField, GuestRulesState } from './guest-rules-state';
import { guestRulesMessages as text } from './i18n/guest-rules-pt-br';

const GUEST_RULES_FIELD_MAX = 20_000;

function FieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p className="lx-error" id={id}>
      <Icon name="alert" className="lx-error__icon" />
      {children}
    </p>
  );
}

function Field(props: {
  readonly name: GuestRulesField;
  readonly label: string;
  readonly hint: string;
  readonly error: string | null;
  readonly children: (described: string, invalid: true | undefined) => ReactNode;
}) {
  const hintId = `${props.name}-dica`;
  const errorId = `${props.name}-erro`;
  return (
    <div className="lx-field">
      <label className="lx-label" htmlFor={props.name}>
        {props.label}
      </label>
      <p className="lx-hint" id={hintId}>
        {props.hint}
      </p>
      {props.children(
        props.error ? `${hintId} ${errorId}` : hintId,
        props.error ? true : undefined,
      )}
      {props.error ? <FieldError id={errorId}>{props.error}</FieldError> : null}
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

/** "Publicar nova versão" (W14; REQ-095): texto, vigência opcional no horário da Second Home e base registrada. */
export function GuestRulesForm(props: {
  readonly secondHomeId: string;
  readonly idempotencyKey: string;
  readonly backHref: string;
}) {
  const [state, action] = useActionState(setGuestRulesAction, {
    key: props.idempotencyKey,
    values: {},
    fieldErrors: {},
    rejection: null,
  } satisfies GuestRulesState);
  const error = (name: GuestRulesField, message: string) =>
    state.fieldErrors[name] ? message : null;
  return (
    <form className="lx-form" action={action} noValidate aria-label={text.formTitle}>
      <input type="hidden" name="second_home_id" value={props.secondHomeId} />
      {state.rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">
            {text.rejection[state.rejection] ?? text.rejection.unexpected}
          </p>
        </div>
      )}
      <Field
        name="value"
        label={text.value}
        hint={text.valueHint}
        error={error('value', text.valueError)}
      >
        {(described, invalid) => (
          <textarea
            className="lx-input"
            id="value"
            name="value"
            rows={8}
            maxLength={GUEST_RULES_FIELD_MAX}
            defaultValue={state.values.value ?? ''}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        name="effective_from"
        label={text.from}
        hint={text.fromHint}
        error={error('effective_from', text.fromError)}
      >
        {(described, invalid) => (
          <input
            className="lx-input"
            id="effective_from"
            name="effective_from"
            type="datetime-local"
            defaultValue={state.values.effective_from ?? ''}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        name="effective_to"
        label={text.to}
        hint={text.toHint}
        error={error('effective_to', text.toError)}
      >
        {(described, invalid) => (
          <input
            className="lx-input"
            id="effective_to"
            name="effective_to"
            type="datetime-local"
            defaultValue={state.values.effective_to ?? ''}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        name="basis"
        label={text.basisLabel}
        hint={text.basisHint}
        error={error('basis', text.basisError)}
      >
        {(described, invalid) => (
          <input
            className="lx-input"
            id="basis"
            name="basis"
            type="text"
            autoComplete="off"
            maxLength={255}
            defaultValue={state.values.basis ?? ''}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <div className="lx-form__actions">
        <Submit />
        <a className="lx-button lx-button--quiet" href={props.backHref}>
          {text.back}
        </a>
      </div>
    </form>
  );
}
