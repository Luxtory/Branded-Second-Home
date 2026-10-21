/**
 * Aviso de Privacidade da jornada da solicitação de conversa (W6; spec ownership §14.11). O conteúdo vem só da Luxtory,
 * depois da validação jurídica; nada é inventado. `approved` só é marcado por commit, depois do checkpoint
 * jurídico/fundador.
 *
 * O software verifica apenas a **estrutura** (tópicos da P-3, textos não vazios, link no canal, nenhum marcador de
 * rascunho). Estrutura completa **não** é validação jurídica: nada aqui afirma suficiência ou conformidade.
 */
export const PRIVACY_NOTICE_TOPICS = [
  'controller',
  'purposes',
  'legal_bases',
  'categories',
  'retention',
  'access',
  'operators',
  'sharing',
  'international_transfers',
  'rights',
  'channel',
] as const;
export type PrivacyNoticeTopic = (typeof PRIVACY_NOTICE_TOPICS)[number];

export interface PrivacyNoticeLink {
  readonly label: string;
  readonly href: string;
}

export interface PrivacyNoticeSection {
  readonly topic: PrivacyNoticeTopic;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly links: readonly PrivacyNoticeLink[];
}

export type PrivacyNotice =
  | { readonly status: 'pending' }
  | {
      readonly status: 'approved';
      readonly version: string;
      /** Data do checkpoint jurídico/fundador (AAAA-MM-DD). */
      readonly approvedOn: string;
      readonly sections: readonly PrivacyNoticeSection[];
    };

// Marcadores de rascunho que nunca podem chegar a um Aviso `approved`. Os de engenharia só em maiúsculas: "todo" é
// palavra comum em português.
const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|XXX)\b|\[|\]|\{\{|\}\}/u;
const LOREM = /lorem ipsum/iu;
const isDraft = (text: string) => PLACEHOLDER.test(text) || LOREM.test(text);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const CONTACT_LINK = /^(?:mailto:\S+@\S+|https:\/\/\S+)$/u;

const blank = (value: string) => value.trim() === '';

function sectionIssues(section: PrivacyNoticeSection): string[] {
  const issues: string[] = [];
  const texts = [section.title, ...section.paragraphs, ...section.links.map((link) => link.label)];
  if (blank(section.title) || section.paragraphs.length === 0 || section.paragraphs.some(blank)) {
    issues.push(`empty:${section.topic}`);
  }
  if (texts.some(isDraft)) issues.push(`placeholder:${section.topic}`);
  const linksValid = section.links.every(
    (link) => !blank(link.label) && CONTACT_LINK.test(link.href),
  );
  const needsLink = section.topic === 'channel' && section.links.length === 0;
  if (!linksValid || needsLink) issues.push(`link:${section.topic}`);
  return issues;
}

/** Problemas estruturais do Aviso; vazio = estrutura completa (o que nunca equivale a validação jurídica). */
export function privacyNoticeIssues(notice: PrivacyNotice): readonly string[] {
  if (notice.status === 'pending') return ['pending'];
  const issues: string[] = [];
  if (blank(notice.version)) issues.push('version');
  if (!ISO_DATE.test(notice.approvedOn)) issues.push('approved_on');
  for (const topic of PRIVACY_NOTICE_TOPICS) {
    const sections = notice.sections.filter((section) => section.topic === topic);
    if (sections.length === 0) issues.push(`missing:${topic}`);
    if (sections.length > 1) issues.push(`duplicated:${topic}`);
  }
  return [...issues, ...notice.sections.flatMap(sectionIssues)];
}

/** Marcado `approved` e estruturalmente completo — condição necessária (não suficiente) para abrir a coleta. */
export function isPrivacyNoticeApproved(notice: PrivacyNotice): boolean {
  return notice.status === 'approved' && privacyNoticeIssues(notice).length === 0;
}
