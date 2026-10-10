import { z } from 'zod';
import {
  codePointLength,
  composeContactEmail,
  CONTACT_FIELDS,
  CONTACT_LIMITS,
  type BrandPartnerContact,
  type ContactEmail,
  type ContactEmailText,
  type ContactField,
} from '../domain/brand-partner-contact';

/**
 * Contrato do formulário Brand Partners (spec catalog §14.3): o mesmo schema Zod valida no servidor (decisão) e no
 * navegador (feedback). Fechado — campo extra é recusado —, limites em pontos de código depois do trim.
 */
export type ContactFieldCode = 'required' | 'too_long' | 'invalid';

export interface ContactFieldIssue {
  readonly field: ContactField;
  readonly code: ContactFieldCode;
}

export type ContactValues = Readonly<Partial<Record<ContactField | '_trap', unknown>>>;

// Controles C0/DEL; o texto da mensagem aceita tabulação e quebras de linha (texto simples).
const LINE_CONTROL = /[\u0000-\u001f\u007f]/u;
const TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const WEBSITE_SCHEME = /^https?:\/\//i;

const fits = (field: ContactField) => (value: string) =>
  codePointLength(value) <= CONTACT_LIMITS[field];

const line = (field: ContactField) =>
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
  .min(1, 'required')
  .refine(fits('message'), 'too_long')
  .refine((value) => !TEXT_CONTROL.test(value), 'invalid');

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

export const brandPartnerContactSchema = z.strictObject({
  name: line('name'),
  brand: line('brand'),
  email,
  message,
  website,
  _trap: z.string('invalid').optional(),
});

const FIELD_CODES: readonly string[] = [
  'required',
  'too_long',
  'invalid',
] satisfies readonly ContactFieldCode[];

function issueOf(issue: z.core.$ZodIssue, values: unknown): ContactFieldIssue | null {
  const [field] = issue.path;
  if (!CONTACT_FIELDS.includes(field as ContactField)) return null;
  // Campo ausente é obrigatório faltando (o Zod não devolve o valor no issue); os demais códigos vêm das mensagens.
  const raw = typeof values === 'object' && values !== null ? (values as ContactValues) : {};
  const missing = issue.code === 'invalid_type' && raw[field as ContactField] === undefined;
  const code = missing
    ? 'required'
    : FIELD_CODES.includes(issue.message)
      ? issue.message
      : 'invalid';
  return { field: field as ContactField, code: code as ContactFieldCode };
}

export type ContactParse =
  | { readonly ok: true; readonly contact: BrandPartnerContact; readonly trapped: boolean }
  | { readonly ok: false; readonly issues: readonly ContactFieldIssue[] };

/** Valida o corpo; problemas por campo (um por campo, na ordem do formulário), nunca com o valor recebido. */
export function parseBrandPartnerContact(values: unknown): ContactParse {
  const result = brandPartnerContactSchema.safeParse(values);
  if (!result.success) {
    const byField = new Map<ContactField, ContactFieldIssue>();
    for (const issue of result.error.issues) {
      const mapped = issueOf(issue, values);
      if (mapped !== null && !byField.has(mapped.field)) byField.set(mapped.field, mapped);
    }
    const issues = CONTACT_FIELDS.flatMap((field) => {
      const issue = byField.get(field);
      return issue === undefined ? [] : [issue];
    });
    return { ok: false, issues };
  }
  const { _trap: trap = '', website: site, ...fields } = result.data;
  return {
    ok: true,
    contact: { ...fields, website: site === undefined || site === '' ? null : site },
    trapped: trap !== '',
  };
}

/** Resultado do provedor de envio (porta implementada em `infrastructure/`). */
export type MailerFailure =
  | 'timeout'
  | 'network'
  | 'provider_rate_limited'
  | 'provider_busy'
  | 'provider_rejected'
  | 'provider_error'
  | 'unexpected_response';

export type MailerOutcome =
  | { readonly status: 'accepted' }
  | { readonly status: 'conflict' }
  | { readonly status: 'unavailable'; readonly reason: MailerFailure };

/** Envio à caixa corporativa (TECH-057): remetente, destinatário e credenciais são configuração do servidor. */
export interface ContactMailer {
  /** `providerKey`: chave de idempotência já com o namespace da aplicação e do ambiente. */
  send(email: ContactEmail, providerKey: string): Promise<MailerOutcome>;
}

export type ContactSubmission =
  | { readonly status: 'accepted' }
  | { readonly status: 'invalid'; readonly issues: readonly ContactFieldIssue[] }
  | { readonly status: 'refused' }
  | { readonly status: 'conflict' }
  | { readonly status: 'unavailable'; readonly reason: MailerFailure };

export interface ContactSubmissionDependencies {
  readonly mailer: ContactMailer;
  /** Namespace da chave no provedor: aplicação, superfície e ambiente. */
  readonly namespace: string;
  readonly emailText: ContactEmailText;
}

const idempotencyKeySchema = z.uuid();

/**
 * Submissão do contato (REQ-028): chave UUID e schema fechado → honeypot (recusa sem envio, sem falso sucesso) →
 * envio com a chave do provedor. Sucesso só com aceite confirmado; nada é gravado.
 */
export async function submitBrandPartnerContact(
  body: unknown,
  idempotencyKey: string,
  { mailer, namespace, emailText }: ContactSubmissionDependencies,
): Promise<ContactSubmission> {
  const parsed = parseBrandPartnerContact(body);
  if (!idempotencyKeySchema.safeParse(idempotencyKey).success) {
    return { status: 'invalid', issues: parsed.ok ? [] : parsed.issues };
  }
  if (!parsed.ok) return { status: 'invalid', issues: parsed.issues };
  if (parsed.trapped) return { status: 'refused' };
  const outcome = await mailer.send(
    composeContactEmail(parsed.contact, emailText),
    `${namespace}:${idempotencyKey.toLowerCase()}`,
  );
  return outcome;
}
