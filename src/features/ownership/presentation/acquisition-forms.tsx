'use client';
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import {
  administrationAction,
  formalizeAcquisitionAction,
  initialAllocationAction,
  lookupAcquisitionParty,
  operationStartAction,
} from './acquisition-actions';
import {
  acquisitionInitialState,
  retryableAcquisitionSubmission,
  type AcquisitionFormState,
  type MaskedPartyOption,
} from './acquisition-form-state';
import { AcquisitionSection } from './acquisition-ui';
import { acquisitionMessages as text } from './i18n/acquisition-pt-br';

interface Configuration {
  readonly id: number;
  readonly participation_bps: number;
  readonly alta: number;
  readonly media: number;
  readonly annual_days: number;
  readonly luxtory_alta: number;
  readonly luxtory_media: number;
}
interface Allocation {
  readonly id: string;
  readonly version: number;
  readonly configuration_id: number;
  readonly date: string;
  readonly basis_ref: string;
}
interface Coverage {
  readonly id: string;
  readonly from: string;
  readonly until: string | null;
}
interface FormsProps {
  readonly homeId: string;
  readonly parties: readonly MaskedPartyOption[];
  readonly configurations: readonly Configuration[];
  readonly allocations: readonly Allocation[];
  readonly coverages: readonly Coverage[];
  readonly baseDate: string | null;
  readonly formalized: boolean;
  readonly started: boolean;
  readonly keys: Readonly<Record<'formalize' | 'allocation' | 'administration' | 'start', string>>;
}
type Action = (state: AcquisitionFormState, form: FormData) => Promise<AcquisitionFormState>;
const back = (id: string) => `/admin/catalogo/second-homes/${id}`;
const rejection = (state: AcquisitionFormState) =>
  state.rejection === 'invalid'
    ? text.invalidSummary
    : state.rejection === null
      ? ''
      : (text.rejection[state.rejection as keyof typeof text.rejection] ??
        text.rejection.unexpected);

function Submit({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="lx-button lx-button--primary"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? text.pending : label}
    </button>
  );
}
function PendingFields({ children }: { readonly children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <fieldset className="lx-choice-group lx-form" disabled={pending}>
      {children}
    </fieldset>
  );
}
function OperationalForm({
  homeId,
  initialKey,
  run,
  submit,
  children,
}: {
  readonly homeId: string;
  readonly initialKey: string;
  readonly run: Action;
  readonly submit: string;
  readonly children: (state: AcquisitionFormState) => ReactNode;
}) {
  const [state, action] = useActionState(
    (previous: AcquisitionFormState, form: FormData) =>
      retryableAcquisitionSubmission(run, previous, form),
    acquisitionInitialState(initialKey),
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.rejection !== null) {
      const target =
        ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        ref.current?.querySelector<HTMLElement>('[data-error-summary]');
      target?.focus();
    }
  }, [state]);
  return (
    <form className="lx-form" action={action} noValidate ref={ref}>
      <input type="hidden" name="second_home_id" value={homeId} />
      {state.rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert" data-error-summary tabIndex={-1}>
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">{rejection(state)}</p>
        </div>
      )}
      <PendingFields>
        <div className="lx-form" key={JSON.stringify(state.values)}>
          {children(state)}
        </div>
      </PendingFields>
      <div className="lx-form__actions">
        <Submit label={submit} />
        <a href={back(homeId)} className="lx-button lx-button--quiet">
          {text.cancel}
        </a>
      </div>
    </form>
  );
}
interface FieldProps {
  readonly name: string;
  readonly label: string;
  readonly state: AcquisitionFormState;
  readonly prefix: string;
  readonly type?: 'text' | 'date' | 'number';
  readonly hint?: string;
  readonly optional?: boolean;
  readonly placeholder?: string;
  readonly children?: ReactNode;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
}
function Field({
  name,
  label,
  state,
  prefix,
  type = 'text',
  hint,
  optional = false,
  placeholder = text.choose,
  children,
  value,
  onChange,
}: FieldProps) {
  const id = `${prefix}-${name}`;
  const error = state.errors[name];
  const describedBy =
    [hint === undefined ? null : `${id}-hint`, error === undefined ? null : `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  const common = {
    id,
    name,
    required: !optional,
    'aria-invalid': error === undefined ? undefined : (true as const),
    'aria-describedby': describedBy,
    ...(value === undefined
      ? { defaultValue: state.values[name] ?? '' }
      : {
          value,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
            onChange?.(event.target.value),
        }),
  };
  return (
    <div className="lx-field">
      <label className="lx-label" htmlFor={id}>
        {label}
      </label>
      {hint === undefined ? null : (
        <p className="lx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children === undefined ? (
        <input
          {...common}
          className="lx-input"
          type={type}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 1 : undefined}
        />
      ) : (
        <div className="lx-select-wrap">
          <select {...common} className="lx-select">
            <option value="" disabled={!optional}>
              {placeholder}
            </option>
            {children}
          </select>
        </div>
      )}
      {error === undefined ? null : (
        <p className="lx-error" id={`${id}-error`}>
          <Icon name="alert" className="lx-error__icon" />
          {text[error]}
        </p>
      )}
    </div>
  );
}
function Check({
  name,
  label,
  prefix,
  state,
}: {
  readonly name: string;
  readonly label: string;
  readonly prefix: string;
  readonly state: AcquisitionFormState;
}) {
  const error = state.errors[name];
  return (
    <div className="lx-field">
      <label className="lx-check">
        <input
          type="checkbox"
          name={name}
          required
          defaultChecked={state.values[name] === 'on'}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : `${prefix}-${name}-error`}
        />
        <span>{label}</span>
      </label>
      {error === undefined ? null : (
        <p className="lx-error" id={`${prefix}-${name}-error`}>
          <Icon name="alert" className="lx-error__icon" />
          {text[error]}
        </p>
      )}
    </div>
  );
}
function ConfigurationField({
  prefix,
  state,
  configurations,
  value,
  onChange,
}: {
  readonly prefix: string;
  readonly state: AcquisitionFormState;
  readonly configurations: readonly Configuration[];
  readonly value?: string;
  readonly onChange?: (value: string) => void;
}) {
  return (
    <Field
      name="configuration_id"
      label={text.configuration}
      prefix={prefix}
      state={state}
      value={value}
      onChange={onChange}
    >
      {configurations.map((config) => (
        <option key={config.id} value={config.id}>
          {text.configurationName(config.id)}
        </option>
      ))}
    </Field>
  );
}
function PartyField({
  prefix,
  state,
  parties,
  name,
  label,
  cnpj = false,
}: {
  readonly prefix: string;
  readonly state: AcquisitionFormState;
  readonly parties: readonly MaskedPartyOption[];
  readonly name: string;
  readonly label: string;
  readonly cnpj?: boolean;
}) {
  const [selected, setSelected] = useState(state.values[name] ?? '');
  return (
    <div className="lx-field">
      <Field
        prefix={prefix}
        state={state}
        name={name}
        label={label}
        value={selected}
        onChange={setSelected}
      >
        {parties
          .filter((party) => !cnpj || party.documentType === 'cnpj')
          .map((party) => (
            <option value={party.id} key={party.id}>
              {party.documentType.toUpperCase()} · {party.maskedDocument} · {party.id}
            </option>
          ))}
      </Field>
      {selected === '' ? null : (
        <a className="lx-link" href={`/admin/pessoas-e-empresas/${selected}`}>
          {text.partyDetail}
        </a>
      )}
    </div>
  );
}
function PartyLoader({ onParty }: { readonly onParty: (party: MaskedPartyOption) => void }) {
  const [id, setId] = useState('');
  const [message, setMessage] = useState('');
  const [pending, transition] = useTransition();
  const status = useRef<HTMLParagraphElement>(null);
  return (
    <div className="lx-form">
      <div className="lx-field">
        <label className="lx-label" htmlFor="acquisition-party-lookup">
          {text.partyId}
        </label>
        <p className="lx-hint" id="party-lookup-hint">
          {text.partyLookupHint}
        </p>
        <input
          id="acquisition-party-lookup"
          className="lx-input"
          value={id}
          onChange={(event) => setId(event.target.value)}
          aria-describedby="party-lookup-hint"
        />
      </div>
      <button
        type="button"
        className="lx-button lx-button--secondary"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          transition(async () => {
            try {
              const result = await lookupAcquisitionParty(id.trim());
              if (result.party !== null) onParty(result.party);
              setMessage(
                result.unavailable
                  ? text.partyUnavailable
                  : result.party === null
                    ? text.partyMissing
                    : text.partyAdded,
              );
            } catch {
              setMessage(text.partyUnavailable);
            }
            requestAnimationFrame(() => status.current?.focus());
          })
        }
      >
        {text.partyLookup}
      </button>
      <p className="lx-hint" role="status" tabIndex={-1} ref={status}>
        {message}
      </p>
    </div>
  );
}
function FormalizeFields({
  state,
  props,
  parties,
}: {
  readonly state: AcquisitionFormState;
  readonly props: FormsProps;
  readonly parties: readonly MaskedPartyOption[];
}) {
  const [modality, setModality] = useState(state.values.modality ?? '');
  const [configuration, setConfiguration] = useState(state.values.configuration_id ?? '');
  const [date, setDate] = useState(state.values.operation_start_date ?? '');
  const prefix = 'formalize';
  return (
    <>
      <Field prefix={prefix} state={state} name="location" label={text.location} />
      <Field
        prefix={prefix}
        state={state}
        name="operation_start_date"
        label={text.startDate}
        type="date"
        value={date}
        onChange={setDate}
      />
      <Field
        prefix={prefix}
        state={state}
        name="modality"
        label={text.modality}
        value={modality}
        onChange={setModality}
      >
        <option value="owner">{text.owner}</option>
        <option value="co_owner">{text.coOwner}</option>
      </Field>
      {modality === 'co_owner' ? (
        <>
          <ConfigurationField
            prefix={prefix}
            state={state}
            configurations={props.configurations}
            value={configuration}
            onChange={setConfiguration}
          />
          <PartyField
            prefix={prefix}
            state={state}
            parties={parties}
            name="spe_party_id"
            label={text.spe}
            cnpj
          />
          {date === '' || date.slice(5) === '01-01' ? null : (
            <Field
              prefix={prefix}
              state={state}
              name="initial_allocation_id"
              label={text.allocationSelected}
            >
              {props.allocations.map((allocation) => (
                <option value={allocation.id} key={allocation.id}>
                  {text.allocationOption(
                    allocation.version,
                    allocation.configuration_id,
                    allocation.date,
                    allocation.basis_ref,
                  )}
                </option>
              ))}
            </Field>
          )}
        </>
      ) : null}
      {modality === '' ? null : (
        <fieldset className="lx-choice-group lx-form">
          <legend className="lx-label">{text.acquirers}</legend>
          <p className="lx-hint">{text.partyHint}</p>
          {Array.from({ length: modality === 'owner' ? 1 : Number(configuration) }, (_, i) => (
            <PartyField
              key={i}
              prefix={prefix}
              state={state}
              parties={parties}
              name={`acquirer_${i + 1}`}
              label={text.acquirer(i + 1)}
            />
          ))}
        </fieldset>
      )}
      <Field prefix={prefix} state={state} name="basis_ref" label={text.basis} />
      <Check prefix={prefix} state={state} name="confirmation" label={text.confirmFormalize} />
    </>
  );
}
function AdministrationFields({
  state,
  parties,
  props,
}: {
  readonly state: AcquisitionFormState;
  readonly parties: readonly MaskedPartyOption[];
  readonly props: FormsProps;
}) {
  const [end, setEnd] = useState(state.values.end_kind ?? '');
  const prefix = 'administration';
  return (
    <>
      <PartyField
        prefix={prefix}
        state={state}
        parties={parties}
        name="provider_party_id"
        label={text.provider}
      />
      <Field prefix={prefix} state={state} name="scope" label={text.scope} hint={text.scopeHint}>
        <option value="professional_administration">{text.professionalScope}</option>
        <option value="full_luxtory_administration">{text.fullScope}</option>
      </Field>
      <Check prefix={prefix} state={state} name="professional" label={text.professional} />
      <Field prefix={prefix} state={state} name="valid_from" type="date" label={text.validFrom} />
      <Field
        prefix={prefix}
        state={state}
        name="end_kind"
        label={text.endKind}
        value={end}
        onChange={setEnd}
      >
        <option value="defined">{text.definedEnd}</option>
        <option value="none">{text.noEnd}</option>
      </Field>
      {end === 'defined' ? (
        <Field
          prefix={prefix}
          state={state}
          name="valid_until"
          type="date"
          label={text.validUntil}
        />
      ) : null}
      <Field
        prefix={prefix}
        state={state}
        name="replaces_id"
        label={text.replaces}
        optional
        placeholder={text.newCoverage}
      >
        {props.coverages.map((coverage) => (
          <option key={coverage.id} value={coverage.id}>
            {text.coverageTitle(coverage.from, coverage.until)} · {coverage.id}
          </option>
        ))}
      </Field>
      <Field prefix={prefix} state={state} name="basis_ref" label={text.basis} />
    </>
  );
}
export function AcquisitionForms(props: FormsProps) {
  const [parties, setParties] = useState(props.parties);
  const addParty = (party: MaskedPartyOption) =>
    setParties((current) =>
      current.some((item) => item.id === party.id) ? current : [...current, party],
    );
  return (
    <>
      <AcquisitionSection id="party-selector" title={text.partySelector}>
        <PartyLoader onParty={addParty} />
      </AcquisitionSection>
      {props.formalized ? null : (
        <>
          <AcquisitionSection id="initial-allocation-form" title={text.allocation}>
            <p className="lx-body">{text.allocationLead}</p>
            <details className="lx-disclosure">
              <summary className="lx-label">{text.allocationSubmit}</summary>
              <OperationalForm
                homeId={props.homeId}
                initialKey={props.keys.allocation}
                run={initialAllocationAction}
                submit={text.allocationSubmit}
              >
                {(state) => (
                  <>
                    <ConfigurationField
                      prefix="allocation"
                      state={state}
                      configurations={props.configurations}
                    />
                    <Field
                      prefix="allocation"
                      state={state}
                      name="operation_start_date"
                      label={text.startDate}
                      type="date"
                    />
                    <p className="lx-hint">{text.quantityHint}</p>
                    {(['alta', 'media', 'luxtoryAlta', 'luxtoryMedia'] as const).map((name, i) => (
                      <Field
                        key={name}
                        prefix="allocation"
                        state={state}
                        name={['alta', 'media', 'luxtory_alta', 'luxtory_media'][i]!}
                        label={text[name]}
                        type="number"
                      />
                    ))}
                    <Field prefix="allocation" state={state} name="basis_ref" label={text.basis} />
                  </>
                )}
              </OperationalForm>
            </details>
          </AcquisitionSection>
          <AcquisitionSection id="formalize-form" title={text.formalize}>
            <p className="lx-body">{text.formalizeLead}</p>
            <OperationalForm
              homeId={props.homeId}
              initialKey={props.keys.formalize}
              run={formalizeAcquisitionAction}
              submit={text.formalizeSubmit}
            >
              {(state) => <FormalizeFields state={state} props={props} parties={parties} />}
            </OperationalForm>
          </AcquisitionSection>
        </>
      )}
      <AcquisitionSection id="administration-form" title={text.administration}>
        <p className="lx-body">{text.administrationLead}</p>
        <p className="lx-hint">{text.coverageHint}</p>
        <details className="lx-disclosure">
          <summary className="lx-label">{text.administrationSubmit}</summary>
          <OperationalForm
            homeId={props.homeId}
            initialKey={props.keys.administration}
            run={administrationAction}
            submit={text.administrationSubmit}
          >
            {(state) => <AdministrationFields state={state} parties={parties} props={props} />}
          </OperationalForm>
        </details>
      </AcquisitionSection>
      {!props.formalized || props.started ? null : (
        <AcquisitionSection id="operation-start-form" title={text.operation}>
          {props.baseDate === null ? null : (
            <p className="lx-body">{text.frozenBase(props.baseDate)}</p>
          )}
          <p className="lx-body">{text.frozen}</p>
          <p className="lx-hint">{text.noCalendar}</p>
          <OperationalForm
            homeId={props.homeId}
            initialKey={props.keys.start}
            run={operationStartAction}
            submit={text.operationSubmit}
          >
            {(state) => (
              <>
                <Field
                  prefix="start"
                  state={state}
                  name="effective_start_date"
                  label={text.effectiveDate}
                  type="date"
                />
                <Field prefix="start" state={state} name="basis_ref" label={text.basis} />
                <Check prefix="start" state={state} name="confirmation" label={text.confirmStart} />
              </>
            )}
          </OperationalForm>
        </AcquisitionSection>
      )}
    </>
  );
}
export function AcquisitionSuccess() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      className="lx-message lx-message--success"
      id="registered"
      role="status"
      tabIndex={-1}
      ref={ref}
    >
      <Icon name="check" className="lx-message__icon" />
      <p className="lx-message__title">{text.saved}</p>
    </div>
  );
}
