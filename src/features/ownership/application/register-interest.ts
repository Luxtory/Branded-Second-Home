import { z } from 'zod';
import { isPublicIdempotencyKey, publicAttempt, type Clock } from '@/features/platform';
import {
  APPROX_DAYS_MAX,
  approxDaysRule,
  codePointLength,
  INTEREST_MODALITIES,
  INTEREST_TEXT_MAX,
  normalizeText,
  type Interest,
} from '../domain/interest';
import type { InterestStore, InterestTargets } from './ports';

/** Superfície da idempotência pública do interesse (ADR-0017); a W6 reutiliza a mesma. */
export const INTEREST_SURFACE = 'interest';

export const INTEREST_FIELDS = [
  'home_edition_id',
  'modality',
  'desired_location',
  'approx_days',
  'origin',
  'partner_ref',
] as const;
export type InterestField = (typeof INTEREST_FIELDS)[number];
export type InterestFieldCode = 'required' | 'too_long' | 'invalid' | 'not_allowed';

export interface InterestFieldIssue {
  readonly field: InterestField;
  readonly code: InterestFieldCode;
}

// Controles C0/DEL: os campos são de uma linha (texto simples).
const LINE_CONTROL = /[\u0000-\u001f\u007f]/u;
const fits = (value: string) => codePointLength(value) <= INTEREST_TEXT_MAX;
const hasNoControl = (value: string) => !LINE_CONTROL.test(value);

/** Texto obrigatório: pontas removidas, controles recusados, espaços internos reduzidos, 1 a 200 pontos de código. */
const requiredText = z
  .string('invalid')
  .trim()
  .refine(hasNoControl, 'invalid')
  .transform(normalizeText)
  .refine((value) => value !== '', 'required')
  .refine(fits, 'too_long');

/** Texto opcional: como o obrigatório, mas vazio = ausente. */
const optionalText = z
  .string('invalid')
  .trim()
  .refine(hasNoControl, 'invalid')
  .transform(normalizeText)
  .refine(fits, 'too_long')
  .transform((value) => (value === '' ? null : value))
  .nullish();

// Ids em minúsculas: o mesmo conteúdo lógico gera o mesmo hash de idempotência.
const id = z.guid('invalid').transform((value) => value.toLowerCase());

/** Contrato do corpo (spec ownership §5.1, OpenAPI `InterestRequest`): fechado — campo extra é recusado. */
export const interestSchema = z.strictObject({
  home_edition_id: id,
  modality: z.enum(INTEREST_MODALITIES, 'invalid'),
  desired_location: requiredText,
  approx_days: z
    .number('invalid')
    .int('invalid')
    .positive('invalid')
    .max(APPROX_DAYS_MAX, 'invalid')
    .nullish(),
  origin: optionalText,
  partner_ref: optionalText,
});

const FIELD_CODES: readonly string[] = [
  'required',
  'too_long',
  'invalid',
] satisfies readonly InterestFieldCode[];

function issueOf(issue: z.core.$ZodIssue, values: unknown): InterestFieldIssue | null {
  const [field] = issue.path;
  if (!INTEREST_FIELDS.includes(field as InterestField)) return null;
  // Problema num campo ausente é obrigatório faltando — tipo ou enum (o Zod não devolve o valor no issue); os opcionais
  // ausentes não geram problema. Os demais códigos vêm das mensagens.
  const raw =
    typeof values === 'object' && values !== null
      ? (values as Readonly<Record<string, unknown>>)
      : {};
  const missing = raw[field as InterestField] === undefined;
  const code = missing
    ? 'required'
    : FIELD_CODES.includes(issue.message)
      ? issue.message
      : 'invalid';
  return { field: field as InterestField, code: code as InterestFieldCode };
}

export type InterestParse =
  | { readonly ok: true; readonly interest: Interest }
  | { readonly ok: false; readonly issues: readonly InterestFieldIssue[] };

/** Valida o corpo; um problema por campo, na ordem do contrato, nunca com o valor recebido. */
export function parseInterest(values: unknown): InterestParse {
  const result = interestSchema.safeParse(values);
  if (!result.success) {
    const byField = new Map<InterestField, InterestFieldIssue>();
    for (const issue of result.error.issues) {
      const mapped = issueOf(issue, values);
      if (mapped !== null && !byField.has(mapped.field)) byField.set(mapped.field, mapped);
    }
    const issues = INTEREST_FIELDS.flatMap((field) => {
      const issue = byField.get(field);
      return issue === undefined ? [] : [issue];
    });
    return { ok: false, issues };
  }
  const data = result.data;
  const approxDays = data.approx_days ?? null;
  const rule = approxDaysRule(data.modality, approxDays);
  if (rule !== 'ok') return { ok: false, issues: [{ field: 'approx_days', code: rule }] };
  return {
    ok: true,
    interest: {
      homeEditionId: data.home_edition_id,
      modality: data.modality,
      desiredLocation: data.desired_location,
      approxDays,
      origin: data.origin ?? null,
      partnerRef: data.partner_ref ?? null,
    },
  };
}

export type InterestRegistration =
  | { readonly status: 'registered'; readonly replayed: boolean }
  | { readonly status: 'invalid'; readonly issues: readonly InterestFieldIssue[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'conflict' };

export interface RegisterInterestDependencies {
  readonly targets: InterestTargets;
  readonly store: InterestStore;
  readonly clock: Clock;
  readonly newId: () => string;
}

/**
 * Registro do interesse (REQ-022–REQ-025, spec ownership §5, §13): chave UUID e schema fechado → chave já usada
 * (repetição ou conflito, sem reavaliar o alvo) → Home Edition pública → gravação atômica com a chave. Qualquer
 * modalidade desejada é aceita: a Home Edition não restringe modalidade (BR-032). Recusas não consomem a chave
 * (ADR-0017). Nunca cria Ação, Direito de Uso nem prerrogativa.
 */
export async function registerInterest(
  body: unknown,
  idempotencyKey: string,
  { targets, store, clock, newId }: RegisterInterestDependencies,
): Promise<InterestRegistration> {
  const parsed = parseInterest(body);
  if (!isPublicIdempotencyKey(idempotencyKey)) {
    return { status: 'invalid', issues: parsed.ok ? [] : parsed.issues };
  }
  if (!parsed.ok) return { status: 'invalid', issues: parsed.issues };
  const { interest } = parsed;
  const attempt = publicAttempt(INTEREST_SURFACE, idempotencyKey, interest);
  const prior = await store.priorAttempt(attempt);
  if (prior === 'replayed') return { status: 'registered', replayed: true };
  if (prior === 'conflict') return { status: 'conflict' };

  // Home Edition em preparação, fora do público ou inexistente → mesma resposta (`02` §15, item 15).
  if ((await targets.find(interest.homeEditionId)) === null) return { status: 'not_found' };

  const written = await store.register(
    { ...interest, id: newId(), createdAt: clock.now() },
    attempt,
  );
  if (written === 'conflict') return { status: 'conflict' };
  return { status: 'registered', replayed: written === 'replayed' };
}
