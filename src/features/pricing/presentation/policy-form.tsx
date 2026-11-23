'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { MAX_CANCELLATION_TIERS, type PolicyMechanism } from '../domain/commercial-policy';
import { publishPolicyAction } from './policy-actions';
import { eventField, fractionAxes, tierField } from './policy-input';
import type { PolicyFormState } from './policy-state';
import { PolicyAcceptance, PolicyTerms } from './policy-terms';
import { policiesMessages as text } from './i18n/policies-pt-br';

function Field(props: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error: boolean;
  readonly children: (
    id: string,
    described: string | undefined,
    invalid: true | undefined,
  ) => ReactNode;
}) {
  const hintId = `${props.id}-dica`;
  const errorId = `${props.id}-erro`;
  const described = [props.hint ? hintId : null, props.error ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="lx-field">
      <label className="lx-label" htmlFor={props.id}>
        {props.label}
      </label>
      {props.hint ? (
        <p className="lx-hint" id={hintId}>
          {props.hint}
        </p>
      ) : null}
      {props.children(
        props.id,
        described === '' ? undefined : described,
        props.error ? true : undefined,
      )}
      {props.error ? (
        <p className="lx-error" id={errorId}>
          <Icon name="alert" className="lx-error__icon" />
          {text.fields.fieldError}
        </p>
      ) : null}
    </div>
  );
}

function TextInput(props: {
  readonly state: PolicyFormState;
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly numeric?: boolean;
  readonly type?: 'text' | 'datetime-local';
}) {
  const id = `${props.state.mechanism}-${props.name}`;
  return (
    <Field
      id={id}
      label={props.label}
      hint={props.hint}
      error={props.state.fieldErrors.includes(props.name)}
    >
      {(fieldId, described, invalid) => (
        <input
          className="lx-input"
          id={fieldId}
          name={props.name}
          type={props.type ?? 'text'}
          inputMode={props.numeric ? 'decimal' : undefined}
          autoComplete="off"
          maxLength={props.type === 'datetime-local' ? undefined : 255}
          defaultValue={props.state.values[props.name] ?? ''}
          aria-describedby={described}
          aria-invalid={invalid}
        />
      )}
    </Field>
  );
}

function EffectInputs(props: {
  readonly state: PolicyFormState;
  readonly name: (axis: ReturnType<typeof fractionAxes>[number]) => string;
}) {
  return (
    <>
      {fractionAxes(props.state.mechanism).map((axis) => (
        <TextInput
          key={axis}
          state={props.state}
          name={props.name(axis)}
          label={text.fields.axis[axis]}
          numeric
        />
      ))}
    </>
  );
}

function Pending({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        className="lx-button lx-button--primary"
        type="submit"
        name="intent"
        value={label === text.submit ? 'review' : 'confirm'}
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

function EditStage({ state }: { readonly state: PolicyFormState }) {
  return (
    <>
      <p className="lx-hint">{text.fields.capacityFixed}</p>
      <fieldset className="lx-choice-group">
        <legend className="lx-label">{text.fields.tiersLegend}</legend>
        <p className="lx-hint">{text.fields.tiersHint}</p>
        {Array.from({ length: MAX_CANCELLATION_TIERS }, (_, i) => (
          <fieldset className="lx-choice-group" key={i}>
            <legend className="lx-label">{text.fields.tier(i + 1)}</legend>
            <div className="lx-form__row">
              <TextInput
                state={state}
                name={tierField(i, 'hours')}
                label={text.fields.hours}
                hint={i === 0 ? text.fields.hoursHint : undefined}
                numeric
              />
              <EffectInputs state={state} name={(axis) => tierField(i, axis)} />
            </div>
          </fieldset>
        ))}
      </fieldset>
      {(['no_show', 'exception'] as const).map((event) => (
        <fieldset className="lx-choice-group" key={event}>
          <legend className="lx-label">
            {event === 'no_show' ? text.fields.noShowLegend : text.fields.exceptionLegend}
          </legend>
          <p className="lx-hint">{text.fields.percentHint}</p>
          <div className="lx-form__row">
            <EffectInputs state={state} name={(axis) => eventField(event, axis)} />
          </div>
        </fieldset>
      ))}
      <div className="lx-parameter__dates">
        <TextInput
          state={state}
          name="effective_from"
          type="datetime-local"
          label={text.fields.effective_from}
          hint={text.fields.effectiveFromHint}
        />
        <TextInput
          state={state}
          name="effective_to"
          type="datetime-local"
          label={text.fields.effective_to}
          hint={text.fields.effectiveToHint}
        />
      </div>
      <TextInput
        state={state}
        name="basis"
        label={text.fields.basis}
        hint={text.fields.basisHint}
      />
      <div className="lx-form__actions">
        <Pending label={text.submit} />
      </div>
    </>
  );
}

/** Revisão: a política como o Titular a verá, o aceite em prévia, as consequências, a vigência e a base. */
function ReviewStage({ state }: { readonly state: PolicyFormState }) {
  const review = state.review!;
  const { pending } = useFormStatus();
  const facts: [string, string][] = [
    [text.review.current, review.current ?? text.review.currentNone],
    [text.review.from, review.from],
    [text.review.to, review.to],
    [text.review.basis, review.basis],
    [text.review.authority, text.authorityAdmin],
  ];
  return (
    <>
      <div className="lx-pricing__block">
        <p className="lx-pricing__eyebrow">{text.review.title}</p>
        <PolicyTerms mechanism={state.mechanism} config={review.config} />
        <PolicyAcceptance
          policyId={`previa-${state.mechanism}`}
          versionLabel={text.acceptance.newVersion}
          since={review.from}
          preview
        />
      </div>
      <dl className="lx-pricing__facts">
        {facts.map(([label, value]) => (
          <div className="lx-pricing__fact" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="lx-pricing__block">
        <p className="lx-pricing__text">{text.review.consequences}</p>
        <ul className="lx-pricing__history">
          <li>{text.review.consequenceFrom(review.from)}</li>
          <li>{text.review.consequenceKept}</li>
          <li>{text.review.consequenceFinal}</li>
          <li>{text.review.consequenceNoActivation}</li>
        </ul>
      </div>
      {Object.entries(state.values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="lx-form__actions">
        <Pending label={text.review.confirm} />
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

/** Nova versão de política de um mecanismo (W18; spec pricing §5 "Políticas comerciais"). */
export function PolicyForm(props: {
  readonly mechanism: PolicyMechanism;
  readonly idempotencyKey: string;
  readonly initialValues?: Readonly<Record<string, string>>;
}) {
  const [state, action] = useActionState(publishPolicyAction, {
    key: props.idempotencyKey,
    mechanism: props.mechanism,
    values: props.initialValues ?? {},
    fieldErrors: [],
    issues: [],
    rejection: null,
  } satisfies PolicyFormState);
  return (
    <form
      className="lx-form"
      action={action}
      noValidate
      aria-label={`${text.publish}: ${text.mechanisms[props.mechanism].name}`}
    >
      {state.rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">
            {text.rejection[state.rejection] ?? text.rejection.unexpected}
          </p>
          {state.issues.length === 0 ? null : (
            <ul className="lx-message__body">
              {[...new Set(state.issues.map((issue) => issue.issue))].map((issue) => (
                <li key={issue}>{text.issues[issue]}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.stage === 'review' && state.review ? (
        <ReviewStage state={state} />
      ) : (
        <EditStage state={state} />
      )}
    </form>
  );
}
