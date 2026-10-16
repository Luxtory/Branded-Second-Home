/** Rotas da jornada Brand Partners (REQ-028, spec catalog §14.1) — nenhuma leva à jornada B2C. */
export const brandPartnersPaths = {
  home: '/brand-partner',
  about: '/brand-partner/sobre',
  howItWorks: '/brand-partner/como-funciona',
  /** Âncora do formulário na Home: destino do CTA do REQ-028. */
  conversationAnchor: 'conversa',
  conversation: '/brand-partner#conversa',
} as const;

/**
 * Seções da Home na ordem da copy BP1.1 (catalog §14.9): PICTURE → PROBLEM → PROMISE → Para a sua marca → Para quem
 * vive → mecanismo → governança → PUSH; o E2E lê a ordem pelos `id`.
 */
export const BRAND_PARTNERS_HOME_SECTIONS = [
  'inicio',
  'expansao',
  'proposta',
  'para-a-marca',
  'para-quem-vive',
  'como-acontece',
  'governanca',
  'sua-marca',
  'conversa',
] as const;

/** Seções do Como funciona (PROOF → PUSH); as sete depois da abertura são as âncoras do índice. */
export const BRAND_PARTNERS_HOW_SECTIONS = [
  'abertura',
  'percurso',
  'decisoes-remuneracao',
  'governanca',
  'luxtory-club',
  'condicoes-expansao',
  'para-quem',
  'proximo-passo',
] as const;

export type BrandPartnersSection = 'home' | 'howItWorks' | 'about';

/** O título nomeia a seção; a seção leva a âncora. */
export const titleOf = (section: string) => `${section}-titulo`;
