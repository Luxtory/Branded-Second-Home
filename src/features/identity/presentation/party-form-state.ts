import type { ZodError } from 'zod';
import type { ErrorCode } from '@/features/platform';

/** Estado dos formulários de pessoas e empresas (Server Action ↔ componente). Textos só pelo i18n. */
export type PartyFieldError =
  | 'required'
  | 'too_long'
  | 'invalid'
  | 'invalid_document'
  | 'invalid_email'
  | 'email_mismatch'
  | 'not_in_future';

export type PartyRejection =
  'invalid' | 'state' | 'not_found' | 'permission' | 'conflict' | 'unavailable' | 'unexpected';

export interface PartyFormState {
  /** `Idempotency-Key` deste envio: nova só depois de uma recusa gravada. */
  readonly key: string;
  /** Valores enviados, para o formulário voltar preenchido (nunca persistidos). */
  readonly values: Readonly<Record<string, string>>;
  readonly fieldErrors: Readonly<Record<string, PartyFieldError>>;
  readonly rejection: PartyRejection | null;
  /** Convite em dois passos: dados → resumo para conferência (spec identity §13.4). */
  readonly step: 'edit' | 'review';
  /** Busca sem resultado (sem revelar nada além disso). */
  readonly notFound?: boolean;
}

export const initialPartyFormState = (key: string): PartyFormState => ({
  key,
  values: {},
  fieldErrors: {},
  rejection: null,
  step: 'edit',
});

const CUSTOM: ReadonlySet<string> = new Set([
  'invalid_document',
  'email_mismatch',
  'not_in_future',
]);

type Issue = ZodError['issues'][number];

function issueCode(issue: Issue, field: string): PartyFieldError {
  if (issue.code === 'custom' && CUSTOM.has(issue.message)) return issue.message as PartyFieldError;
  if (issue.code === 'too_big') return 'too_long';
  if (issue.code === 'too_small' && Number(issue.minimum) === 1) return 'required';
  if (issue.code === 'invalid_type' && issue.input === undefined) return 'required';
  return field === 'email' ? 'invalid_email' : 'invalid';
}

/** Primeiro problema de cada campo. */
export function partyFieldErrors(error: ZodError): Record<string, PartyFieldError> {
  const errors: Record<string, PartyFieldError> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '');
    if (field !== '' && errors[field] === undefined) errors[field] = issueCode(issue, field);
  }
  return errors;
}

/** Recusa do command → mensagem da tela (REQ-098). */
export function partyRejectionFor(code: ErrorCode): PartyRejection {
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
