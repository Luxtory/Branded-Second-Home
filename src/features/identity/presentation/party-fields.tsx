'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { partyMessages as text } from './i18n/parties-pt-br';
import type { PartyFieldError, PartyFormState } from './party-form-state';

const noSubscription = () => () => undefined;

/** Fuso IANA do dispositivo (vazio no servidor), para interpretar a data digitada (ADR-0010 §11). */
function useDeviceTimeZone(): string {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => '',
  );
}

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
  readonly code: PartyFieldError | undefined;
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
  readonly state: PartyFormState;
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

function Hint({ id, hint }: { readonly id: string; readonly hint?: string }) {
  return hint === undefined || hint === '' ? null : (
    <p className="lx-hint" id={`${id}-hint`}>
      {hint}
    </p>
  );
}

/** Campo de uma linha (texto ou e-mail), com dica e erro ligados por `aria-describedby`. */
export function TextField({
  form,
  name,
  label,
  hint,
  optional,
  state,
  maxLength,
  type = 'text',
  autoComplete = 'off',
}: FieldProps & {
  readonly maxLength: number;
  readonly type?: 'text' | 'email';
  readonly autoComplete?: string;
}) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  return (
    <div className="lx-field">
      <Label id={id} label={label} optional={optional} />
      <Hint id={id} hint={hint} />
      <input
        className="lx-input"
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        spellCheck={false}
        defaultValue={state.values[name] ?? ''}
        maxLength={maxLength}
        required={optional !== true}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(id, hint !== undefined, error !== undefined)}
      />
      <FieldError id={id} code={error} />
    </div>
  );
}

function toIso(local: string): string {
  if (local === '') return '';
  const instant = new Date(local);
  return Number.isNaN(instant.getTime()) ? '' : instant.toISOString();
}

/** Data e hora no fuso do dispositivo: o campo visível é local e o enviado (`name`) é o instante ISO. */
export function DateTimeField({ form, name, label, hint, optional, state }: FieldProps) {
  const id = `${form}-${name}`;
  const error = state.fieldErrors[name];
  const zone = useDeviceTimeZone();
  const [local, setLocal] = useState(state.values[`${name}_local`] ?? '');
  const hintText = [hint, zone === '' ? null : text.timeZoneHint(zone)].filter(Boolean).join(' ');
  return (
    <div className="lx-field">
      <Label id={id} label={label} optional={optional} />
      <Hint id={id} hint={hintText} />
      <input
        className="lx-input"
        id={id}
        name={`${name}_local`}
        type="datetime-local"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        required={optional !== true}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(id, hintText !== '', error !== undefined)}
      />
      <input type="hidden" name={name} value={toIso(local)} />
      <FieldError id={id} code={error} />
    </div>
  );
}

/** Recusa do envio (causa funcional, REQ-098), anunciada ao leitor de tela. */
export function FormAlert({ title }: { readonly title: string | null }) {
  if (title === null) return null;
  return (
    <div className="lx-message lx-message--error" role="alert">
      <Icon name="alert" className="lx-message__icon" />
      <p className="lx-message__title">{title}</p>
    </div>
  );
}

/** Botão de envio com o indicador de espera do DS (`aria-busy`) enquanto a Server Action roda. */
export function SubmitButton({
  children,
  tone = 'primary',
  name,
  value,
}: {
  readonly children: ReactNode;
  readonly tone?: 'primary' | 'secondary' | 'quiet' | 'destructive';
  readonly name?: string;
  readonly value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`lx-button lx-button--${tone}`}
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {children}
    </button>
  );
}
