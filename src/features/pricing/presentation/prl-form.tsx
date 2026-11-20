'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { prlMessages as text } from './i18n/prl-pt-br';
import { changePublishedPrlAction, publishInitialPrlAction } from './prl-actions';
import type { PrlField, PrlFormKind, PrlFormState } from './prl-state';

function Field(props: {
  readonly id: string;
  readonly name: PrlField;
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

function Submit({ kind }: { readonly kind: PrlFormKind }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        className="lx-button lx-button--primary"
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.pending : text.submit[kind]}
      </button>
      {pending ? (
        <p className="lx-visually-hidden" role="status">
          {text.pendingStatus}
        </p>
      ) : null}
    </>
  );
}

/**
 * Publicação do PRL (W16; REQ-013): intervalo de noites, valor por noite em reais, início opcional no horário da Second
 * Home e base registrada. `initial` só em noites sem PRL; `change` só pelo Super Admin, em noites publicadas.
 */
export function PrlForm(props: {
  readonly kind: PrlFormKind;
  readonly secondHomeId: string;
  readonly idempotencyKey: string;
}) {
  const [state, action] = useActionState(
    props.kind === 'initial' ? publishInitialPrlAction : changePublishedPrlAction,
    {
      key: props.idempotencyKey,
      values: {},
      fieldErrors: {},
      rejection: null,
    } satisfies PrlFormState,
  );
  const prefix = props.kind === 'initial' ? 'inicial' : 'alteracao';
  const id = (name: PrlField) => `${prefix}-${name}`;
  const error = (name: PrlField, message: string) => (state.fieldErrors[name] ? message : null);
  const value = (name: PrlField) => state.values[name] ?? '';
  const title = props.kind === 'initial' ? text.initialTitle : text.changeTitle;
  return (
    <form className="lx-form" action={action} noValidate aria-label={title}>
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
        id={id('first_night')}
        name="first_night"
        label={text.fields.first_night}
        hint={text.fields.firstNightHint}
        error={error('first_night', text.fields.nightsError)}
      >
        {(fieldId, described, invalid) => (
          <input
            className="lx-input"
            id={fieldId}
            name="first_night"
            type="date"
            defaultValue={value('first_night')}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        id={id('last_night')}
        name="last_night"
        label={text.fields.last_night}
        hint={text.fields.lastNightHint}
        error={error('last_night', text.fields.nightsError)}
      >
        {(fieldId, described, invalid) => (
          <input
            className="lx-input"
            id={fieldId}
            name="last_night"
            type="date"
            defaultValue={value('last_night')}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        id={id('amount')}
        name="amount"
        label={text.fields.amount}
        hint={text.fields.amountHint}
        error={error('amount', text.fields.amountError)}
      >
        {(fieldId, described, invalid) => (
          <input
            className="lx-input"
            id={fieldId}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={value('amount')}
            aria-describedby={described}
            aria-invalid={invalid}
          />
        )}
      </Field>
      <Field
        id={id('effective_from')}
        name="effective_from"
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
        id={id('basis')}
        name="basis"
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
        <Submit kind={props.kind} />
      </div>
    </form>
  );
}
