import type { ContactEmail } from './brand-partner-contact';

export const SECOND_HOME_DEVELOPMENT_CONTACT_LIMITS = {
  name: 120,
  company: 160,
  email: 254,
  message: 2000,
  website: 300,
} as const;

export type SecondHomeDevelopmentContactField = keyof typeof SECOND_HOME_DEVELOPMENT_CONTACT_LIMITS;

interface SecondHomeDevelopmentContact {
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly message: string;
  readonly website?: string;
}

export interface SecondHomeDevelopmentContactEmailText {
  readonly subject: string;
  readonly labels: Readonly<Record<SecondHomeDevelopmentContactField, string>>;
}

/** Texto simples e determinístico para as repetições com a mesma chave (TECH-057, catalog §23). */
export function composeSecondHomeDevelopmentContactEmail(
  { name, company, email, message, website }: SecondHomeDevelopmentContact,
  { subject, labels }: SecondHomeDevelopmentContactEmailText,
): ContactEmail {
  return {
    subject,
    replyTo: email,
    text: [
      `${labels.name}: ${name}`,
      `${labels.company}: ${company}`,
      `${labels.email}: ${email}`,
      ...(website ? [`${labels.website}: ${website}`] : []),
      '',
      `${labels.message}:`,
      message,
    ].join('\n'),
  };
}
