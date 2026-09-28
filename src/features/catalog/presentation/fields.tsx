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
  readonly state: FormState;
}

function Label({
  id,
  label,
  optional,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
}) {
  return (
    <label className="lx-label" htmlFor={id}>
      {label}
      {optional === true ? <span className="lx-label__optional"> {text.optional}</span> : null}
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
  state,
  multiline = false,
  maxLength,
}: FieldProps & { readonly multiline?: boolean; readonly maxLength: number }) {
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
      <Label id={id} label={label} optional={optional} />
      {hint === undefined ? null : (
        <p className="lx-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea className="lx-textarea" rows={6} {...common} />
      ) : (
        <input className="lx-input" type="text" autoComplete="off" {...common} />
      )}
      <FieldError id={id} code={error} />
    </div>
  );
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

/** Botão principal com o indicador de espera do DS (`aria-busy`) enquanto a Server Action roda. */
export function SubmitButton({ children }: { readonly children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="lx-button lx-button--primary"
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {children}
    </button>
  );
}

/** Ações do formulário: a principal primeiro; "Cancelar" volta sem gravar. */
export function FormActions({
  submit,
  cancelHref,
}: {
  readonly submit: string;
  readonly cancelHref: string;
}) {
  return (
    <div className="lx-form__actions">
      <SubmitButton>{submit}</SubmitButton>
      <a className="lx-button lx-button--quiet" href={cancelHref}>
        {text.cancel}
      </a>
    </div>
  );
}
