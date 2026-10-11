/**
 * Contato público Brand Partners (REQ-028, TECH-057, spec catalog §14.3–14.5): os cinco campos autorizados e o e-mail
 * determinístico enviado à caixa corporativa. Nenhum dado é persistido; a submissão não cria Brand Partner, conta,
 * grant ou vínculo e não constitui parceria.
 */
export const CONTACT_FIELDS = ['name', 'brand', 'email', 'message', 'website'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** Limites em pontos de código Unicode, depois do trim (§14.3). */
export const CONTACT_LIMITS: Readonly<Record<ContactField, number>> = {
  name: 120,
  brand: 200,
  email: 254,
  message: 4000,
  website: 500,
};

/** Corpo efetivo máximo do request (§14.3): 32 KiB. */
export const CONTACT_BODY_MAX_BYTES = 32 * 1024;

export interface BrandPartnerContact {
  readonly name: string;
  readonly brand: string;
  readonly email: string;
  readonly message: string;
  /** Opcional; nunca acessado pelo servidor. */
  readonly website: string | null;
}

/** Textos fixos do e-mail interno (vêm da camada i18n): assunto e rótulos dos campos. */
export interface ContactEmailText {
  readonly subject: string;
  readonly labels: Readonly<Record<ContactField, string>>;
}

export interface ContactEmail {
  readonly subject: string;
  /** Texto simples; nenhum HTML vindo do visitante. */
  readonly text: string;
  /** Só o e-mail validado do visitante — nunca remetente nem destinatário. */
  readonly replyTo: string;
}

/** Quantidade de pontos de código (não de unidades UTF-16): "😀" conta 1. */
export const codePointLength = (value: string): number => [...value].length;

/**
 * E-mail determinístico (§14.5): mesmo contato → mesmo texto, sem horário, correlação ou outro valor variável — o retry
 * com a mesma chave reenvia exatamente o mesmo conteúdo ao provedor.
 */
export function composeContactEmail(
  contact: BrandPartnerContact,
  text: ContactEmailText,
): ContactEmail {
  const { labels } = text;
  const lines = [
    `${labels.name}: ${contact.name}`,
    `${labels.brand}: ${contact.brand}`,
    `${labels.email}: ${contact.email}`,
    ...(contact.website === null ? [] : [`${labels.website}: ${contact.website}`]),
    '',
    `${labels.message}:`,
    contact.message,
  ];
  return { subject: text.subject, text: lines.join('\n'), replyTo: contact.email };
}
