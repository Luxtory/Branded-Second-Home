import { z } from 'zod';
import {
  codePointLength,
  composeSecondHomePartnerContactEmail,
  DEVELOPMENT_STAGES,
  SECOND_HOME_PARTNER_CONTACT_FIELDS,
  SECOND_HOME_PARTNER_CONTACT_LIMITS,
  type SecondHomePartnerContact,
  type SecondHomePartnerContactEmail,
  type SecondHomePartnerContactEmailText,
  type SecondHomePartnerContactField,
} from '../domain/second-home-partner-contact';

/**
 * Contrato do formulário Second Home Partners (REQ-105, spec catalog §18.3): o mesmo schema Zod valida no servidor
 * (decisão) e no navegador (feedback). Fechado — campo extra é recusado —, limites em pontos de código depois do trim.
 */
export type SecondHomePartnerContactFieldCode = 'required' | 'too_long' | 'invalid';

export interface SecondHomePartnerContactFieldIssue {
  readonly field: SecondHomePartnerContactField;
  readonly code: SecondHomePartnerContactFieldCode;
}

type TextField = Exclude<SecondHomePartnerContactField, 'stage'>;

// Controles C0/DEL; a mensagem aceita tabulação e quebras de linha (texto simples).
const LINE_CONTROL = /[\u0000-\u001f\u007f]/u;
const TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const WEBSITE_SCHEME = /^https?:\/\//i;

const fits = (field: TextField) => (value: string) =>
  codePointLength(value) <= SECOND_HOME_PARTNER_CONTACT_LIMITS[field];

const line = (field: TextField) =>
  z
    .string('invalid')
    .trim()
    .min(1, 'required')
    .refine(fits(field), 'too_long')
    .refine((value) => !LINE_CONTROL.test(value), 'invalid');

const email = z
  .string('invalid')
  .trim()
  .min(1, 'required')
  .refine(fits('email'), 'too_long')
  .refine((value) => !LINE_CONTROL.test(value) && z.email().safeParse(value).success, 'invalid');

const message = z
  .string('invalid')
  .trim()
  .refine(fits('message'), 'too_long')
  .refine((value) => !TEXT_CONTROL.test(value), 'invalid')
  .optional();

/** HTTP/HTTPS com host, sem credenciais nem espaços. Só validado — o servidor nunca acessa o endereço. */
function isWebsite(value: string): boolean {
  if (!WEBSITE_SCHEME.test(value) || /\s/u.test(value) || LINE_CONTROL.test(value)) return false;
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.hostname !== '' && url.username === '' && url.password === '';
}

const website = z
  .string('invalid')
  .trim()
  .refine(fits('website'), 'too_long')
  .refine((value) => value === '' || isWebsite(value), 'invalid')
  .optional();

export const secondHomePartnerContactSchema = z.strictObject({
  name: line('name'),
  company: line('company'),
  email,
  development: line('development'),
  stage: z.enum(DEVELOPMENT_STAGES, 'invalid'),
  message,
  website,
  _trap: z.string('invalid').optional(),
});

export type SecondHomePartnerContactValues = Readonly<
  Partial<Record<SecondHomePartnerContactField | '_trap', unknown>>
>;

const FIELD_CODES: readonly string[] = [
  'required',
  'too_long',
  'invalid',
] satisfies readonly SecondHomePartnerContactFieldCode[];

function issueOf(
  issue: z.core.$ZodIssue,
  values: unknown,
): SecondHomePartnerContactFieldIssue | null {
  const [path] = issue.path;
  if (!SECOND_HOME_PARTNER_CONTACT_FIELDS.includes(path as SecondHomePartnerContactField)) {
    return null;
  }
  const field = path as SecondHomePartnerContactField;
  // Campo ausente (ou fase sem escolha) é obrigatório faltando; os demais códigos vêm das mensagens do schema.
  const raw =
    typeof values === 'object' && values !== null ? (values as SecondHomePartnerContactValues) : {};
  const missing = raw[field] === undefined || (field === 'stage' && raw.stage === '');
  const code = missing
    ? 'required'
    : FIELD_CODES.includes(issue.message)
      ? issue.message
      : 'invalid';
  return { field, code: code as SecondHomePartnerContactFieldCode };
}

export type SecondHomePartnerContactParse =
  | {
      readonly ok: true;
      readonly contact: SecondHomePartnerContact;
      readonly trapped: boolean;
    }
  | { readonly ok: false; readonly issues: readonly SecondHomePartnerContactFieldIssue[] };

const orNull = (value: string | undefined) => (value === undefined || value === '' ? null : value);

/** Valida o corpo; problemas por campo (um por campo, na ordem do formulário), nunca com o valor recebido. */
export function parseSecondHomePartnerContact(values: unknown): SecondHomePartnerContactParse {
  const result = secondHomePartnerContactSchema.safeParse(values);
  if (!result.success) {
    const byField = new Map<SecondHomePartnerContactField, SecondHomePartnerContactFieldIssue>();
    for (const issue of result.error.issues) {
      const mapped = issueOf(issue, values);
      if (mapped !== null && !byField.has(mapped.field)) byField.set(mapped.field, mapped);
    }
    const issues = SECOND_HOME_PARTNER_CONTACT_FIELDS.flatMap((field) => {
      const issue = byField.get(field);
      return issue === undefined ? [] : [issue];
    });
    return { ok: false, issues };
  }
  const { _trap: trap = '', message: text, website: site, ...fields } = result.data;
  return {
    ok: true,
    contact: { ...fields, message: orNull(text), website: orNull(site) },
    trapped: trap !== '',
  };
}

/** Resultado do provedor de envio — a mesma forma da porta do contato Brand Partners (ADR-0028). */
export type SecondHomePartnerMailerFailure =
  | 'timeout'
  | 'network'
  | 'provider_rate_limited'
  | 'provider_busy'
  | 'provider_rejected'
  | 'provider_error'
  | 'unexpected_response';

export type SecondHomePartnerMailerOutcome =
  | { readonly status: 'accepted' }
  | { readonly status: 'conflict' }
  | { readonly status: 'unavailable'; readonly reason: SecondHomePartnerMailerFailure };

/**
 * Porta própria de envio à caixa corporativa (TECH-057). Os adaptadores existentes (Resend e determinístico) são ligados
 * só na rota: o contrato não importa nada de Brand Partners, e uma mudança incompatível neles quebra o typecheck.
 */
export interface SecondHomePartnerContactMailer {
  /** `providerKey`: chave de idempotência já com o namespace da aplicação, da superfície e do ambiente. */
  send(
    email: SecondHomePartnerContactEmail,
    providerKey: string,
  ): Promise<SecondHomePartnerMailerOutcome>;
}

export type SecondHomePartnerContactSubmission =
  | { readonly status: 'accepted' }
  | { readonly status: 'invalid'; readonly issues: readonly SecondHomePartnerContactFieldIssue[] }
  | { readonly status: 'refused' }
  | { readonly status: 'conflict' }
  | { readonly status: 'unavailable'; readonly reason: SecondHomePartnerMailerFailure };

export interface SecondHomePartnerContactDependencies {
  readonly mailer: SecondHomePartnerContactMailer;
  /** Namespace da chave no provedor: aplicação, superfície e ambiente. */
  readonly namespace: string;
  readonly emailText: SecondHomePartnerContactEmailText;
}

// Formato 8-4-4-4-12 hexadecimal, como o `format: uuid` do OpenAPI (o navegador gera v4 com `crypto.randomUUID`).
const idempotencyKeySchema = z.guid();

/**
 * Submissão do contato (REQ-105): chave UUID e schema fechado → honeypot (recusa sem envio, sem falso sucesso) → envio
 * com a chave do provedor no namespace da jornada. Sucesso só com aceite confirmado; nada é gravado.
 */
export async function submitSecondHomePartnerContact(
  body: unknown,
  idempotencyKey: string,
  { mailer, namespace, emailText }: SecondHomePartnerContactDependencies,
): Promise<SecondHomePartnerContactSubmission> {
  const parsed = parseSecondHomePartnerContact(body);
  if (!idempotencyKeySchema.safeParse(idempotencyKey).success) {
    return { status: 'invalid', issues: parsed.ok ? [] : parsed.issues };
  }
  if (!parsed.ok) return { status: 'invalid', issues: parsed.issues };
  if (parsed.trapped) return { status: 'refused' };
  return mailer.send(
    composeSecondHomePartnerContactEmail(parsed.contact, emailText),
    `${namespace}:${idempotencyKey.toLowerCase()}`,
  );
}
