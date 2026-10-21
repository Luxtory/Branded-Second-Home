import { z } from 'zod';
import {
  APPROX_DAYS_MAX,
  approxDaysRule,
  codePointLength,
  INTEREST_MODALITIES,
  INTEREST_TEXT_MAX,
  normalizeText,
  type Interest,
} from '../domain/interest';
import {
  EMAIL_MAX,
  isEmail,
  isPhone,
  normalizeEmail,
  normalizePhone,
  PHONE_INPUT_MAX,
  type InterestContact,
} from '../domain/interest-contact';
import {
  AVAILABLE_TO_START_BANDS,
  DECISION_HORIZONS,
  DECISION_UNITS,
  REFERENCE_FIT_ANSWERS,
  type AvailableToStartBand,
  type DecisionHorizon,
  type DecisionUnit,
  type ReferenceFit,
} from '../domain/interest-qualification';

/**
 * Corpo da solicitação de conversa (spec ownership §5.1, §14.4.1; OpenAPI `InterestRequest`), validado pelo mesmo
 * schema no servidor e no formulário. Este módulo não importa nada de servidor (banco, cripto, ambiente): o componente
 * cliente usa a mesma validação, e o servidor decide.
 */
export const INTEREST_FIELDS = [
  'home_edition_id',
  'modality',
  'desired_location',
  'approx_days',
  'available_to_start_band',
  'reference_fit',
  'decision_unit',
  'decision_horizon',
  'name',
  'phone',
  'email',
  'origin',
  'partner_ref',
  'presentation_context',
] as const;
export type InterestField = (typeof INTEREST_FIELDS)[number];
export type InterestFieldCode = 'required' | 'too_long' | 'invalid' | 'not_allowed';

export interface InterestFieldIssue {
  readonly field: InterestField;
  readonly code: InterestFieldCode;
}

/** Limite técnico do contexto de apresentação assinado (opaco para o cliente). */
export const PRESENTATION_CONTEXT_MAX = 512;

// Controles C0/DEL: os campos são de uma linha (texto simples).
const LINE_CONTROL = /[\u0000-\u001f\u007f]/u;
const CONTEXT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
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

/** Telefone: formatos humanos aceitos; o servidor tira os separadores e confere `+` opcional e 8–15 dígitos. */
const phone = z
  .string('invalid')
  .trim()
  .refine((value) => value !== '', 'required')
  .refine((value) => codePointLength(value) <= PHONE_INPUT_MAX, 'too_long')
  .transform(normalizePhone)
  .refine(isPhone, 'invalid');

/** E-mail: pontas sem espaço, até 254, formato `local@domínio`; domínio em minúsculas. */
const email = z
  .string('invalid')
  .trim()
  .refine((value) => value !== '', 'required')
  .refine((value) => codePointLength(value) <= EMAIL_MAX, 'too_long')
  .transform(normalizeEmail)
  .refine(isEmail, 'invalid');

// Ids em minúsculas: o mesmo conteúdo lógico gera o mesmo hash de idempotência.
const id = z.guid('invalid').transform((value) => value.toLowerCase());

/** Contrato do corpo: fechado — campo extra é recusado. */
export const interestRequestSchema = z.strictObject({
  home_edition_id: id,
  modality: z.enum(INTEREST_MODALITIES, 'invalid'),
  desired_location: requiredText,
  approx_days: z
    .number('invalid')
    .int('invalid')
    .positive('invalid')
    .max(APPROX_DAYS_MAX, 'invalid')
    .nullish(),
  available_to_start_band: z.enum(AVAILABLE_TO_START_BANDS, 'invalid'),
  // Exigida ou recusada no servidor, conforme a modalidade e a média que a página apresentou (spec §14.5).
  reference_fit: z.enum(REFERENCE_FIT_ANSWERS, 'invalid').nullish(),
  decision_unit: z.enum(DECISION_UNITS, 'invalid'),
  decision_horizon: z.enum(DECISION_HORIZONS, 'invalid'),
  name: requiredText,
  phone,
  email,
  origin: optionalText,
  partner_ref: optionalText,
  presentation_context: z
    .string('invalid')
    .refine((value) => value !== '', 'required')
    .refine((value) => value.length <= PRESENTATION_CONTEXT_MAX, 'too_long')
    .refine((value) => CONTEXT.test(value), 'invalid'),
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

/** As respostas declaradas da pré-qualificação; a referência apresentada vem do contexto assinado, no servidor. */
export interface QualificationAnswers {
  readonly availableToStartBand: AvailableToStartBand;
  readonly referenceFit: ReferenceFit | null;
  readonly decisionUnit: DecisionUnit;
  readonly decisionHorizon: DecisionHorizon;
}

export interface InterestRequest {
  readonly interest: Interest;
  readonly contact: InterestContact;
  readonly answers: QualificationAnswers;
  /** Contexto de apresentação como recebido; a verificação é do servidor (ADR-0018 §4). */
  readonly presentationContext: string;
}

export type InterestRequestParse =
  | { readonly ok: true; readonly request: InterestRequest }
  | { readonly ok: false; readonly issues: readonly InterestFieldIssue[] };

/** Um problema por campo, na ordem do contrato. */
export function orderedIssues(
  issues: readonly InterestFieldIssue[],
): readonly InterestFieldIssue[] {
  const byField = new Map<InterestField, InterestFieldIssue>();
  for (const issue of issues) if (!byField.has(issue.field)) byField.set(issue.field, issue);
  return INTEREST_FIELDS.flatMap((field) => {
    const issue = byField.get(field);
    return issue === undefined ? [] : [issue];
  });
}

/** Regra entre campos: dias só e sempre para Co-Owner (F2b). */
function crossFieldIssues(data: z.infer<typeof interestRequestSchema>): InterestFieldIssue[] {
  const rule = approxDaysRule(data.modality, data.approx_days ?? null);
  return rule === 'ok' ? [] : [{ field: 'approx_days', code: rule }];
}

/** Valida o corpo; um problema por campo, na ordem do contrato, nunca com o valor recebido. */
export function parseInterestRequest(values: unknown): InterestRequestParse {
  const result = interestRequestSchema.safeParse(values);
  if (!result.success) {
    const issues = result.error.issues.flatMap((issue) => {
      const mapped = issueOf(issue, values);
      return mapped === null ? [] : [mapped];
    });
    return { ok: false, issues: orderedIssues(issues) };
  }
  const data = result.data;
  const cross = crossFieldIssues(data);
  if (cross.length > 0) return { ok: false, issues: orderedIssues(cross) };
  return {
    ok: true,
    request: {
      interest: {
        homeEditionId: data.home_edition_id,
        modality: data.modality,
        desiredLocation: data.desired_location,
        approxDays: data.approx_days ?? null,
        origin: data.origin ?? null,
        partnerRef: data.partner_ref ?? null,
      },
      contact: { name: data.name, phone: data.phone, email: data.email },
      answers: {
        availableToStartBand: data.available_to_start_band,
        referenceFit: data.reference_fit ?? null,
        decisionUnit: data.decision_unit,
        decisionHorizon: data.decision_horizon,
      },
      presentationContext: data.presentation_context,
    },
  };
}
