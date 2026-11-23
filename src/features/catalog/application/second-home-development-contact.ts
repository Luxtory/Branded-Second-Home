import { z } from 'zod';
import { codePointLength } from '../domain/brand-partner-contact';
import {
  composeSecondHomeDevelopmentContactEmail,
  SECOND_HOME_DEVELOPMENT_CONTACT_LIMITS,
  type SecondHomeDevelopmentContactEmailText,
  type SecondHomeDevelopmentContactField,
} from '../domain/second-home-development-contact';
import type { ContactMailer, MailerOutcome } from './brand-partner-contact';

const LINE_CONTROL = /[\u0000-\u001f\u007f]/u;
const MESSAGE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

const boundedText = (field: SecondHomeDevelopmentContactField) =>
  z
    .string('invalid')
    .refine(
      (value) => codePointLength(value) <= SECOND_HOME_DEVELOPMENT_CONTACT_LIMITS[field],
      'too_long',
    )
    .trim();

const line = (field: 'name' | 'company' | 'email') =>
  boundedText(field)
    .min(1, 'required')
    .refine((value) => !LINE_CONTROL.test(value), 'invalid');

function validWebsite(value: string): boolean {
  if (!/^https?:\/\//i.test(value) || /\s/u.test(value) || LINE_CONTROL.test(value)) return false;
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.hostname !== '' && url.username === '' && url.password === '';
}

/** Validação compartilhada para feedback no formulário e decisão no servidor (catalog §23). */
export const secondHomeDevelopmentContactSchema = z.strictObject({
  name: line('name'),
  company: line('company'),
  email: line('email').refine((value) => z.email().safeParse(value).success, 'invalid'),
  message: boundedText('message')
    .min(1, 'required')
    .refine((value) => !MESSAGE_CONTROL.test(value), 'invalid'),
  website: boundedText('website')
    .refine((value) => value === '' || validWebsite(value), 'invalid')
    .optional(),
  _trap: z.string('invalid').optional(),
});

const idempotencyKey = z.guid();

export async function submitSecondHomeDevelopmentContact(
  body: unknown,
  key: string | null,
  mailer: ContactMailer,
  namespace: string,
  emailText: SecondHomeDevelopmentContactEmailText,
): Promise<MailerOutcome | { readonly status: 'invalid' | 'refused' }> {
  const parsed = secondHomeDevelopmentContactSchema.safeParse(body);
  const attempt = idempotencyKey.safeParse(key);
  if (!parsed.success || !attempt.success) return { status: 'invalid' };
  const { _trap, ...contact } = parsed.data;
  if (_trap) return { status: 'refused' };
  return mailer.send(
    composeSecondHomeDevelopmentContactEmail(contact, emailText),
    `${namespace}:${attempt.data.toLowerCase()}`,
  );
}
