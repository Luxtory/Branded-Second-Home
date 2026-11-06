'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { adminActMessages as text } from './i18n/own-use-admin-pt-br';
import type { AdminActField, AdminActState } from './own-use-admin-state';

export type AdminFormAct =
  'open_exception' | 'resolve' | 'no_show' | 'invalidation' | 'recovery' | 'request';

export interface ChoiceOption {
  readonly value: string;
  readonly title: string;
  readonly desc?: string;
}

const REASONS: readonly ChoiceOption[] = [
  { value: 'emergency_maintenance', title: 'Manutenção emergencial' },
  { value: 'security', title: 'Segurança' },
  { value: 'casualty', title: 'Sinistro' },
  { value: 'fortuitous_event', title: 'Caso fortuito' },
  { value: 'force_majeure', title: 'Força maior' },
];

function FieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p className="lx-error" id={id}>
      <Icon name="alert" className="lx-error__icon" />
      {children}
    </p>
  );
}

function Choices(props: {
  readonly name: AdminActField;
  readonly legend: string;
  readonly options: readonly ChoiceOption[];
  readonly selected: string;
  readonly onSelect?: (value: string) => void;
  readonly error: string | null;
  readonly hint?: string;
}) {
  const errorId = `${props.name}-erro`;
  const hintId = `${props.name}-dica`;
  const described = [props.hint ? hintId : null, props.error ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <fieldset
      className="lx-choice-group"
      aria-describedby={described === '' ? undefined : described}
      aria-invalid={props.error ? true : undefined}
    >
      <legend className="lx-label">{props.legend}</legend>
      {props.hint ? (
        <p className="lx-hint" id={hintId}>
          {props.hint}
        </p>
      ) : null}
      <div className="lx-choice-group__options">
        {props.options.map((option) => (
          <label className="lx-choice" key={option.value}>
            <input
              type="radio"
              name={props.name}
              value={option.value}
              defaultChecked={props.selected === option.value}
              onChange={() => props.onSelect?.(option.value)}
            />
            <span className="lx-choice__title">{option.title}</span>
            {option.desc ? <span className="lx-choice__desc">{option.desc}</span> : null}
          </label>
        ))}
      </div>
      {props.error ? <FieldError id={errorId}>{props.error}</FieldError> : null}
    </fieldset>
  );
}

function TextField(props: {
  readonly name: AdminActField;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly error: string | null;
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
      <input
        className="lx-input"
        id={props.name}
        name={props.name}
        type="text"
        autoComplete="off"
        maxLength={255}
        defaultValue={props.value}
        aria-describedby={props.error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={props.error ? true : undefined}
      />
      {props.error ? <FieldError id={errorId}>{props.error}</FieldError> : null}
    </div>
  );
}

function Attest(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly error: string | null;
}) {
  return (
    <fieldset
      className="lx-choice-group"
      aria-describedby={props.error ? 'attest-erro' : undefined}
      aria-invalid={props.error ? true : undefined}
    >
      <legend className="lx-label">{text.attest}</legend>
      <div className="lx-choice-group__options">
        <label className="lx-choice">
          <input type="checkbox" name="attest" defaultChecked={props.checked} />
          <span className="lx-choice__title">{props.label}</span>
        </label>
      </div>
      {props.error ? <FieldError id="attest-erro">{props.error}</FieldError> : null}
    </fieldset>
  );
}

function Submit({ label, destructive }: { readonly label: string; readonly destructive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        className={`lx-button ${destructive ? 'lx-button--destructive' : 'lx-button--primary'}`}
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.pending : label}
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
 * Formulário de um ato do Admin (W13 E4b). Campos pelo contrato do command; erro associado ao campo; recusa do servidor
 * no topo (`role="alert"`). Em "Resolver exceção", o aviso de autorização só aparece com "Cancelar a reserva"
 * selecionado — e essa opção só existe com autorização viva (o servidor recusa de qualquer forma).
 */
export function OwnUseAdminForm(props: {
  readonly act: AdminFormAct;
  readonly action: (state: AdminActState, form: FormData) => Promise<AdminActState>;
  readonly idempotencyKey: string;
  readonly hidden: Readonly<Record<string, string>>;
  readonly outcomes?: readonly ChoiceOption[];
  readonly outcomeHint?: string;
  readonly cancelNotice?: string | null;
  readonly purposes?: readonly ChoiceOption[];
  readonly attest?: 'no_show' | 'recovery' | null;
  readonly destructive?: boolean;
  readonly backHref: string;
}) {
  const initial: AdminActState = {
    key: props.idempotencyKey,
    values: {},
    fieldErrors: {},
    rejection: null,
  };
  const [state, action] = useActionState(props.action, initial);
  const [outcome, setOutcome] = useState(state.values.outcome ?? '');
  const error = (field: AdminActField, message: string) =>
    state.fieldErrors[field] ? message : null;
  const basisLabel = props.act === 'no_show' ? text.noShowBasis : text.basis;
  const basisHint = props.act === 'no_show' ? text.noShowBasisHint : text.basisHint;
  return (
    <form className="lx-form" action={action} noValidate aria-label={text.submit[props.act]}>
      {Object.entries(props.hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">
            {state.rejection === 'invalid' ? text.errorSummary : text.rejection[state.rejection]}
          </p>
        </div>
      )}
      {props.act === 'open_exception' ? (
        <>
          <Choices
            name="type"
            legend={text.type}
            selected={state.values.type ?? ''}
            error={error('type', text.outcomeChoiceError)}
            options={[
              { value: 'operational', title: text.typeOperational, desc: text.typeOperationalDesc },
              { value: 'unauthorized_booking', title: text.typeReview, desc: text.typeReviewDesc },
            ]}
          />
          <Choices
            name="reason"
            legend={text.reason}
            selected={state.values.reason ?? ''}
            error={error('reason', text.reasonError)}
            options={REASONS}
          />
          <TextField
            name="incident_ref"
            label={text.incident}
            hint={text.incidentHint}
            value={state.values.incident_ref ?? ''}
            error={error('incident_ref', text.incidentError)}
          />
        </>
      ) : null}
      {props.act === 'resolve' && props.outcomes !== undefined ? (
        <>
          <Choices
            name="outcome"
            legend={text.outcome}
            hint={props.outcomeHint}
            selected={outcome}
            onSelect={setOutcome}
            error={error('outcome', text.outcomeChoiceError)}
            options={props.outcomes}
          />
          {outcome === 'cancelled' && props.cancelNotice ? (
            <div className="lx-message lx-message--warning" role="status">
              <Icon name="alert" className="lx-message__icon" />
              <p className="lx-message__title">{props.cancelNotice}</p>
            </div>
          ) : null}
        </>
      ) : null}
      {props.act === 'request' && props.purposes !== undefined ? (
        <Choices
          name="purpose"
          legend={text.purpose}
          selected={
            state.values.purpose ?? (props.purposes.length === 1 ? props.purposes[0]!.value : '')
          }
          error={error('purpose', text.purposeError)}
          options={props.purposes}
        />
      ) : null}
      {props.attest ? (
        <Attest
          label={props.attest === 'no_show' ? text.attestNoShow : text.attestRecovery}
          checked={state.values.attest === 'on'}
          error={error('attest', text.attestError)}
        />
      ) : null}
      <TextField
        name="basis"
        label={basisLabel}
        hint={basisHint}
        value={state.values.basis ?? ''}
        error={error('basis', text.basisError)}
      />
      <div className="lx-form__actions">
        <Submit label={text.submit[props.act]!} destructive={props.destructive === true} />
        <a className="lx-button lx-button--quiet" href={props.backHref}>
          {text.back}
        </a>
      </div>
    </form>
  );
}
