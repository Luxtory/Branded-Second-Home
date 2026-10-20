import type { ZodError } from 'zod';
import type { ErrorCode } from '@/features/platform';
import { FORBIDDEN_TERM } from '../domain/terminology';
import {
  DUPLICATE_ITEM,
  END_BEFORE_START,
  INVALID_TERM_LABEL,
  INVALID_TIME_ZONE,
  NOTHING_TO_CORRECT,
} from '../application/inputs';

/** Estado dos formulários do catálogo (Server Action ↔ componente). Textos só pelo i18n. */
export type FieldErrorCode =
  | 'required'
  | 'too_long'
  | 'invalid'
  | 'forbidden_term'
  | 'invalid_time_zone'
  | 'duplicate_item'
  | 'end_before_start'
  | 'invalid_term_label'
  | 'duplicate_term'
  | 'file_too_large'
  | 'invalid_image'
  | 'invalid_amount'
  | 'not_in_future'
  | 'nothing_to_correct';

export type FormRejection =
  'invalid' | 'state' | 'not_found' | 'permission' | 'conflict' | 'unavailable' | 'unexpected';

export interface FormState {
  /** `Idempotency-Key` deste envio (ADR-0010 §6): nova só depois de uma recusa gravada. */
  readonly key: string;
  /** Valores enviados, para o formulário voltar preenchido. */
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Record<string, FieldErrorCode>>;
  readonly rejection: FormRejection | null;
}

/** Estado inicial; `values` pré-preenche o formulário (ex.: versão nova parte da mais recente). */
export const initialFormState = (
  key: string,
  values: Readonly<Record<string, string>> = {},
): FormState => ({ key, values, fieldErrors: {}, rejection: null });

const CUSTOM: ReadonlySet<string> = new Set([
  FORBIDDEN_TERM,
  INVALID_TIME_ZONE,
  DUPLICATE_ITEM,
  END_BEFORE_START,
  INVALID_TERM_LABEL,
  NOTHING_TO_CORRECT,
]);

type Issue = ZodError['issues'][number];

function issueCode(issue: Issue): FieldErrorCode {
  if (issue.code === 'custom' && CUSTOM.has(issue.message)) return issue.message as FieldErrorCode;
  if (issue.code === 'too_big') return 'too_long';
  if (issue.code === 'too_small' && Number(issue.minimum) === 1) return 'required';
  if (issue.code === 'invalid_type' && issue.input === undefined) return 'required';
  return 'invalid';
}

/** Primeiro problema de cada campo (o nome do campo é o 1º elemento do caminho, como no corpo do command). */
export function fieldErrorsFrom(error: ZodError): Record<string, FieldErrorCode> {
  const errors: Record<string, FieldErrorCode> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (field !== '' && errors[field] === undefined) errors[field] = issueCode(issue);
  }
  return errors;
}

/** Recusa do command → mensagem da tela (REQ-098: causa funcional clara). */
export function rejectionFor(code: ErrorCode): FormRejection {
  switch (code) {
    case 'ERR_VALIDATION':
      return 'invalid';
    case 'ERR_STATE_TRANSITION':
      return 'state';
    case 'ERR_NOT_FOUND':
      return 'not_found';
    case 'ERR_PERMISSION':
      return 'permission';
    case 'ERR_IDEMPOTENCY_CONFLICT':
      return 'conflict';
    case 'ERR_UNAVAILABLE':
      return 'unavailable';
    default:
      return 'unexpected';
  }
}
