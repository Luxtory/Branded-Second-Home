/** Rotas da jornada Brand Partners (REQ-028, spec catalog §14.1) — nenhuma leva à jornada B2C. */
export const brandPartnersPaths = {
  home: '/brand-partner',
  howItWorks: '/brand-partner/como-funciona',
  /** Âncora do formulário na Home: destino do CTA do REQ-028. */
  conversationAnchor: 'conversa',
  conversation: '/brand-partner#conversa',
} as const;

/** Seções da Home na ordem da copy (PICTURE → PROBLEM → PROMISE → PROOF → PUSH); o E2E lê a ordem pelos `id`. */
export const BRAND_PARTNERS_HOME_SECTIONS = [
  'inicio',
  'expansao',
  'proposta',
  'mecanismo',
  'demanda',
  'governanca',
  'realizacao',
  'sua-marca',
  'conversa',
] as const;

/** Seções do Como funciona (PROOF → PUSH); as cinco do índice são as âncoras da copy. */
export const BRAND_PARTNERS_HOW_SECTIONS = [
  'abertura',
  'percurso',
  'governanca',
  'papeis-remuneracao',
  'expansao-continuidade',
  'proximo-passo',
] as const;

export type BrandPartnersSection = 'home' | 'howItWorks';

/** O título nomeia a seção; a seção leva a âncora. */
export const titleOf = (section: string) => `${section}-titulo`;
