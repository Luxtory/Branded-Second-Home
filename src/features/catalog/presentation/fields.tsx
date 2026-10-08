'use client';

import { useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import type { FieldErrorCode, FormState } from './form-state';
import { messages } from './i18n/pt-br';
import { useDeviceTimeZone } from './instant';
import { Notice } from './notice';

const text = messages.form;

/** Ids de dica e erro ligados ao controle por `aria-describedby` (lx-field do DS). */
function describedBy(id: string, hint: boolean, error: boolean): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(
    (value) => value !== null,
  );
  return ids.length === 0 ? undefined : ids.join(' ');
}

function FieldError({
  id,
  code,
}: {
  readonly id: string;
  readonly code: FieldErrorCode | undefined;
}) {
  if (code === undefined) return null;
  return (
    <p className="lx-error" id={`${id}-error`}>
      <Icon name="alert" className="lx-error__icon" />
      {text.fields[code]}
    </p>
  );
}

interface FieldProps {
  readonly form: string;
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly optional?: boolean;
  /** Marca visível no rótulo quando o valor vai ao site como está (docs/specs/catalog.md §13.5). */
  readonly publicTag?: string;
  readonly state: FormState;
}

function PublicTag({ tag }: { readonly tag?: string }) {
  return tag === undefined ? null : <span className="lx-label__tag">{tag}</span>;
}

function Label({
  id,
  label,
  optional,
  publicTag,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly publicTag?: string;
}) {
  return (
    <label className="lx-label" htmlFor={id}>
      {label}
      {optional === true ? <span className="lx-label__optional"> {text.optional}</span> : null}
      <PublicTag tag={publicTag} />
    </label>
  );
}

/** Campo de texto de uma linha ou de várias (`multiline`). */
export function TextField({
  form,
  name,
  label,
  hint,
  optional,
  publicTag,
  state,
  multiline = false,
  maxLength,
  inputMode,
}: FieldProps & {
  readonly multiline?: boolean;
  readonly maxLength: number;
  /** Teclado do celular para números (`numeric`) ou valores com vírgula (`decimal`). */
  readonly inputMode?: 'numeric' | 'decimal';
}) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  const common = {
    id,
    name,
    defaultValue: state.values[name] ?? '',
    maxLength,
    required: optional !== true,
    'aria-invalid': error === undefined ? undefined : true,
    'aria-describedby': describedBy(id, hint !== undefined, error !== undefined),
  } as const;
  return (
    <div className="lx-field">
      <Label id={id} label={label} optional={optional} publicTag={publicTag} />
      {hint === undefined ? null : (
        <p className="lx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea className="lx-textarea" rows={6} {...common} />
      ) : (
        <input
          className="lx-input"
          type="text"
          autoComplete="off"
          inputMode={inputMode}
          {...common}
        />
      )}
      <FieldError id={id} code={error} />
    </div>
  );
}

export interface Option {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/** Escolha única em cartões do DS (`lx-choice-group`): opções com o mesmo peso visual (REQ-103). */
export function ChoiceField({
  form,
  name,
  label,
  hint,
  publicTag,
  state,
  options,
}: FieldProps & { readonly options: readonly Option[] }) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  return (
    <fieldset
      className="lx-choice-group"
      aria-describedby={describedBy(id, hint !== undefined, error !== undefined)}
    >
      <legend className="lx-label">
        {label}
        <PublicTag tag={publicTag} />
      </legend>
      {hint === undefined ? null : (
        <p className="lx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <div className="lx-choice-group__options">
        {options.map((option) => (
          <label className="lx-choice" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={state.values[name] === option.value}
              required
            />
            <span className="lx-choice__title">{option.label}</span>
            {option.description === undefined ? null : (
              <span className="lx-choice__desc">{option.description}</span>
            )}
          </label>
        ))}
      </div>
      <FieldError id={id} code={error} />
    </fieldset>
  );
}

/**
 * Seleção nativa (`lx-select`): opções vindas dos dados, nenhuma pré-escolhida (TECH-001). Opcional: a opção vazia
 * (`placeholder`) é uma escolha válida.
 */
export function SelectField({
  form,
  name,
  label,
  hint,
  optional,
  state,
  placeholder,
  options,
}: FieldProps & { readonly placeholder: string; readonly options: readonly Option[] }) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  return (
    <div className="lx-field">
      <Label id={id} label={label} optional={optional} />
      {hint === undefined ? null : (
        <p className="lx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <div className="lx-select-wrap">
        <select
          className="lx-select"
          id={id}
          name={name}
          defaultValue={state.values[name] ?? ''}
          required={optional !== true}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy(id, hint !== undefined, error !== undefined)}
        >
          <option value="" disabled={optional !== true}>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <FieldError id={id} code={error} />
    </div>
  );
}

/** Arquivo (`lx-input` nativo): o envio vai pela Server Action como `multipart`; nada é lido no navegador. */
export function FileField({
  form,
  name,
  label,
  hint,
  state,
  accept,
}: FieldProps & { readonly accept: string }) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  return (
    <div className="lx-field">
      <Label id={id} label={label} />
      {hint === undefined ? null : (
        <p className="lx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <input
        className="lx-input"
        id={id}
        name={name}
        type="file"
        accept={accept}
        required
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(id, hint !== undefined, error !== undefined)}
      />
      <FieldError id={id} code={error} />
    </div>
  );
}

/** Erro de um grupo de campos (ex.: termos repetidos), fora de qualquer controle. */
export function GroupError({
  id,
  state,
  name,
}: {
  readonly id: string;
  readonly state: FormState;
  readonly name: string;
}) {
  return <FieldError id={id} code={state.fieldErrors[name]} />;
}

/** Instante local digitado no dispositivo → ISO 8601 com deslocamento (o navegador conhece o próprio fuso). */
function toIso(local: string): string {
  if (local === '') return '';
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Data e hora interpretadas no fuso do dispositivo (ADR-0010 §11): o campo visível é local e o enviado (`name`) é o
 * instante ISO calculado no navegador; o fuso aparece na dica.
 */
export function DateTimeField({ form, name, label, hint, optional, state }: FieldProps) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  const zone = useDeviceTimeZone();
  const [local, setLocal] = useState(state.values[`${name}_local`] ?? '');
  const hintText = [hint, zone === '' ? null : text.timeZoneHint(zone)].filter(Boolean).join(' ');
  return (
    <div className="lx-field">
      <Label id={id} label={label} optional={optional} />
      <p className="lx-hint" id={`${id}-hint`}>
        {hintText}
      </p>
      <input
        className="lx-input"
        id={id}
        name={`${name}_local`}
        type="datetime-local"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        required={optional !== true}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(id, true, error !== undefined)}
      />
      <input type="hidden" name={name} value={toIso(local)} />
      <FieldError id={id} code={error} />
    </div>
  );
}

/** Recusa do envio (causa funcional, REQ-098), anunciada ao leitor de tela. */
export function FormAlert({ state }: { readonly state: FormState }) {
  if (state.rejection === null) return null;
  return <Notice tone="error" role="alert" title={text.rejections[state.rejection]} />;
}

/** Tom da ação: principal comum ou irreversível (encerrar, revogar — `lx-button--destructive`, discreto). */
export type ActionTone = 'primary' | 'destructive';

/** Botão de envio com o indicador de espera do DS (`aria-busy`) enquanto a Server Action roda. */
export function SubmitButton({
  children,
  tone = 'primary',
}: {
  readonly children: ReactNode;
  readonly tone?: ActionTone;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`lx-button lx-button--${tone}`}
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {children}
    </button>
  );
}

/** Ações do formulário: a de envio primeiro; "Cancelar" volta sem gravar. */
export function FormActions({
  submit,
  cancelHref,
  tone = 'primary',
}: {
  readonly submit: string;
  readonly cancelHref: string;
  readonly tone?: ActionTone;
}) {
  return (
    <div className="lx-form__actions">
      <SubmitButton tone={tone}>{submit}</SubmitButton>
      <a className="lx-button lx-button--quiet" href={cancelHref}>
        {text.cancel}
      </a>
    </div>
  );
}
