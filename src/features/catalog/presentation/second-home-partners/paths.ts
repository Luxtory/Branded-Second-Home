/** Rota da jornada Second Home Partners (REQ-105, spec catalog §20.1) — nenhuma leva às jornadas B2C ou Brand Partners. */
export const secondHomePartnersPaths = {
  home: '/second-home-partner',
  /** Âncora do formulário: destino do CTA do REQ-105. */
  conversationAnchor: 'conversa',
} as const;

/**
 * Seções na ordem da Master Copy (catalog §20.2): PICTURE → PROBLEM → PROMISE → PROOF (soluções, processo, perguntas) →
 * PUSH; o E2E lê a ordem pelos `id`.
 */
export const SECOND_HOME_PARTNERS_SECTIONS = [
  'inicio',
  'oportunidade',
  'beneficios',
  'empreendimentos',
  'solucoes',
  'como-funciona',
  'perguntas',
  'conversa',
] as const;

/** O título nomeia a seção; a seção leva a âncora. */
export const titleOf = (section: string) => `${section}-titulo`;
