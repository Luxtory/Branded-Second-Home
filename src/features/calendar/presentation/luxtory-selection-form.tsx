'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { luxtorySelectionMessages as text } from './i18n/luxtory-selection-pt-br';
import { selectLuxtoryCapacityAction } from './luxtory-selection-action';
import type { LuxtorySelectionField, LuxtorySelectionState } from './luxtory-selection-state';

const PURPOSES = ['maintenance', 'marketing', 'promotion', 'production', 'inventory'] as const;

function FieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p className="lx-error" id={id}>
      <Icon name="alert" className="lx-error__icon" />
      {children}
    </p>
  );
}

function DateField(props: {
  readonly name: 'first' | 'last';
  readonly label: string;
  readonly value: string;
  readonly error: boolean;
}) {
  const errorId = `${props.name}-erro`;
  return (
    <div className="lx-field">
      <label className="lx-label" htmlFor={props.name}>
        {props.label}
      </label>
      <input
        className="lx-input"
        id={props.name}
        name={props.name}
        type="date"
        defaultValue={props.value}
        aria-describedby={props.error ? `datas-dica ${errorId}` : 'datas-dica'}
        aria-invalid={props.error ? true : undefined}
      />
      {props.error ? <FieldError id={errorId}>{text.datesError}</FieldError> : null}
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

/**
 * "Selecionar noites" (W14; REQ-036): intervalo de noites, finalidade, base registrada e confirmação. Os erros refletem
 * o controle agora; a action e o command validam tudo de novo no envio.
 */
export function LuxtorySelectionForm(props: {
  readonly secondHomeId: string;
  readonly idempotencyKey: string;
  readonly backHref: string;
}) {
  const [state, action] = useActionState(selectLuxtoryCapacityAction, {
    key: props.idempotencyKey,
    values: {},
    fieldErrors: {},
    rejection: null,
  } satisfies LuxtorySelectionState);
  const [purpose, setPurpose] = useState(state.values.purpose ?? '');
  const [confirmed, setConfirmed] = useState(state.values.confirm === 'on');
  const failed = (name: LuxtorySelectionField) => state.fieldErrors[name] === true;
  const purposeError = failed('purpose') && purpose === '';
  const confirmError = failed('confirm') && !confirmed;
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
      <p className="lx-hint" id="datas-dica">
        {text.datesHint}
      </p>
      <DateField
        name="first"
        label={text.first}
        value={state.values.first ?? ''}
        error={failed('first')}
      />
      <DateField
        name="last"
        label={text.last}
        value={state.values.last ?? ''}
        error={failed('last')}
      />
      <fieldset
        className="lx-choice-group"
        aria-describedby={purposeError ? 'purpose-erro' : undefined}
        aria-invalid={purposeError ? true : undefined}
      >
        <legend className="lx-label">{text.purpose}</legend>
        <div className="lx-choice-group__options">
          {PURPOSES.map((value) => (
            <label className="lx-choice" key={value}>
              <input
                type="radio"
                name="purpose"
                value={value}
                defaultChecked={state.values.purpose === value}
                onChange={() => setPurpose(value)}
              />
              <span className="lx-choice__title">{text.purposes[value]}</span>
            </label>
          ))}
        </div>
        {purposeError ? <FieldError id="purpose-erro">{text.purposeError}</FieldError> : null}
      </fieldset>
      <div className="lx-field">
        <label className="lx-label" htmlFor="basis">
          {text.basis}
        </label>
        <p className="lx-hint" id="basis-dica">
          {text.basisHint}
        </p>
        <input
          className="lx-input"
          id="basis"
          name="basis"
          type="text"
          autoComplete="off"
          maxLength={255}
          defaultValue={state.values.basis ?? ''}
          aria-describedby={failed('basis') ? 'basis-dica basis-erro' : 'basis-dica'}
          aria-invalid={failed('basis') ? true : undefined}
        />
        {failed('basis') ? <FieldError id="basis-erro">{text.basisError}</FieldError> : null}
      </div>
      <fieldset
        className="lx-choice-group"
        aria-describedby={confirmError ? 'confirm-erro' : undefined}
        aria-invalid={confirmError ? true : undefined}
      >
        <legend className="lx-label">{text.confirmLegend}</legend>
        <div className="lx-choice-group__options">
          <label className="lx-choice">
            <input
              type="checkbox"
              name="confirm"
              defaultChecked={state.values.confirm === 'on'}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
            <span className="lx-choice__title">{text.confirm}</span>
          </label>
        </div>
        {confirmError ? <FieldError id="confirm-erro">{text.confirmError}</FieldError> : null}
      </fieldset>
      <div className="lx-form__actions">
        <Submit />
        <a className="lx-button lx-button--quiet" href={props.backHref}>
          {text.back}
        </a>
      </div>
    </form>
  );
}
