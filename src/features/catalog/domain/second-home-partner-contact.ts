/**
 * Contato público Second Home Partners (REQ-105, TECH-057, spec catalog §18.3–18.4): os campos autorizados e o e-mail
 * determinístico enviado à caixa corporativa da jornada. Nenhum dado é persistido; a submissão não cria parceria,
 * afiliação, adesão ao Luxtory Club, conta ou cadastro.
 */
export const SECOND_HOME_PARTNER_CONTACT_FIELDS = [
  'name',
  'company',
  'email',
  'development',
  'stage',
  'message',
  'website',
] as const;
export type SecondHomePartnerContactField = (typeof SECOND_HOME_PARTNER_CONTACT_FIELDS)[number];

/** Fase do empreendimento (REQ-105), na ordem do formulário. */
export const DEVELOPMENT_STAGES = [
  'planning_or_launch',
  'construction_or_sales',
  'delivered_or_operating',
] as const;
export type DevelopmentStage = (typeof DEVELOPMENT_STAGES)[number];

type TextField = Exclude<SecondHomePartnerContactField, 'stage'>;

/** Limites em pontos de código Unicode, depois do trim (§18.3). */
export const SECOND_HOME_PARTNER_CONTACT_LIMITS: Readonly<Record<TextField, number>> = {
  name: 120,
  company: 200,
  email: 254,
  development: 200,
  message: 4000,
  website: 500,
};

/** Corpo efetivo máximo do request (§18.4): 32 KiB. */
export const SECOND_HOME_PARTNER_CONTACT_BODY_MAX_BYTES = 32 * 1024;

export interface SecondHomePartnerContact {
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly development: string;
  readonly stage: DevelopmentStage;
  /** Opcionais: vazio = ausente. */
  readonly message: string | null;
  /** Nunca acessado pelo servidor. */
  readonly website: string | null;
}

/** Textos fixos do e-mail interno (vêm da camada i18n): assunto, rótulos dos campos e nomes das fases. */
export interface SecondHomePartnerContactEmailText {
  readonly subject: string;
  readonly labels: Readonly<Record<SecondHomePartnerContactField, string>>;
  readonly stages: Readonly<Record<DevelopmentStage, string>>;
}

export interface SecondHomePartnerContactEmail {
  readonly subject: string;
  /** Texto simples; nenhum HTML vindo do visitante. */
  readonly text: string;
  /** Só o e-mail validado do visitante — nunca remetente nem destinatário. */
  readonly replyTo: string;
}

/** Quantidade de pontos de código (não de unidades UTF-16): "😀" conta 1. */
export const codePointLength = (value: string): number => [...value].length;

/**
 * E-mail determinístico: mesmo contato → mesmo texto, sem horário, correlação ou outro valor variável — o retry com a
 * mesma chave reenvia exatamente o mesmo conteúdo ao provedor.
 */
export function composeSecondHomePartnerContactEmail(
  contact: SecondHomePartnerContact,
  text: SecondHomePartnerContactEmailText,
): SecondHomePartnerContactEmail {
  const { labels } = text;
  const lines = [
    `${labels.name}: ${contact.name}`,
    `${labels.company}: ${contact.company}`,
    `${labels.email}: ${contact.email}`,
    `${labels.development}: ${contact.development}`,
    `${labels.stage}: ${text.stages[contact.stage]}`,
    ...(contact.website === null ? [] : [`${labels.website}: ${contact.website}`]),
    ...(contact.message === null ? [] : ['', `${labels.message}:`, contact.message]),
  ];
  return { subject: text.subject, text: lines.join('\n'), replyTo: contact.email };
}
