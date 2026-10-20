import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import type { ZodType } from 'zod';
import { executeAdminCommand, type AdminCommand } from '@/features/identity';
import type { JsonValue } from '@/features/platform';
import { COVER_MAX_BYTES } from '../application/inputs';
import { fieldErrorsFrom, rejectionFor, type FieldErrorCode, type FormState } from './form-state';

/**
 * Apoio das Server Actions do catálogo: mesma entrada da API (ADR-0010 §6). O schema do command valida antes só para
 * mostrar o erro no campo; a decisão é do command, que revalida tudo na transação. Fora do módulo `'use server'`, que
 * só pode exportar as actions.
 */
export const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/** Campo vazio = ausente (obrigatório → "Preencha este campo"; opcional → não enviado). */
export const present = (value: string): string | undefined =>
  value.trim() === '' ? undefined : value;

export const valuesOf = (form: FormData, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, field(form, name)]));

/** Campo de várias linhas → lista (uma entrada por linha, sem linhas vazias). */
export const lines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** Número inteiro digitado; o que não for dígito segue como texto para o schema recusar ("Valor inválido"). */
export function integer(value: string): number | string | undefined {
  const text = value.trim();
  if (text === '') return undefined;
  return /^\d{1,9}$/.test(text) ? Number(text) : text;
}

/** Seleções ordenadas `<prefixo>_1…n` → ids escolhidos, na ordem, sem as vazias. */
export function orderedChoices(form: FormData, prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => field(form, `${prefix}_${index + 1}`)).filter(
    (value) => value !== '',
  );
}

/** Arquivo do formulário → base64 do command; vazio ou acima de 3 MiB vira erro de campo antes do envio. */
export async function imageField(form: FormData): Promise<{
  readonly image: string | undefined;
  readonly error: FieldErrorCode | null;
}> {
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return { image: undefined, error: 'required' };
  if (file.size > COVER_MAX_BYTES) return { image: undefined, error: 'file_too_large' };
  return { image: Buffer.from(await file.arrayBuffer()).toString('base64'), error: null };
}

/**
 * Recusa `ERR_VALIDATION` do command sem erro de campo (algo que só o command valida): o erro vai para o campo que a
 * causou, para a tela dizer o quê corrigir.
 */
export function attributeValidation(
  state: FormState,
  name: string,
  code: FieldErrorCode,
): FormState {
  return state.rejection === 'invalid' && Object.keys(state.fieldErrors).length === 0
    ? { ...state, fieldErrors: { [name]: code } }
    : state;
}

/** "Sem Investor" é escolha explícita; a opção vazia não foi escolhida. */
export const NO_INVESTOR = 'none';

export interface Submission<I, R extends JsonValue> {
  readonly command: AdminCommand<I, R>;
  readonly schema: ZodType<I>;
  readonly input: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly success: (result: R) => string;
  /** Erros que só a tela conhece (ex.: escolha obrigatória que o command trata como opcional). */
  readonly extraErrors?: Readonly<Record<string, FieldErrorCode>>;
}

export async function submit<I, R extends JsonValue>(
  state: FormState,
  { command, schema, input, values, success, extraErrors = {} }: Submission<I, R>,
): Promise<FormState> {
  const parsed = schema.safeParse(input);
  const fieldErrors = { ...(parsed.success ? {} : fieldErrorsFrom(parsed.error)), ...extraErrors };
  if (Object.keys(fieldErrors).length > 0) {
    return { key: state.key, values, fieldErrors, rejection: 'invalid' };
  }
  const outcome = await executeAdminCommand(command, input, state.key);
  if (outcome === 'unavailable')
    return { key: state.key, values, fieldErrors: {}, rejection: 'unavailable' };
  if (outcome.status === 'unauthenticated') redirect('/entrar');
  if (outcome.status === 'rejected') {
    // Recusa gravada consome a chave (replay repetiria a recusa): o próximo envio leva uma nova.
    const key = outcome.operationId === null ? state.key : randomUUID();
    return { key, values, fieldErrors: {}, rejection: rejectionFor(outcome.code) };
  }
  redirect(success(outcome.result));
}
