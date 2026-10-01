/** Rotas do Discovery público (docs/specs/catalog.md §13.1). Âncoras dos dois grupos da Coleção (§13.4). */
export const discoveryPaths = {
  home: '/',
  howItWorks: '/como-funciona',
  collection: '/colecao',
  concept: (conceptId: string) => `/colecao/${conceptId}`,
  editionsAnchor: 'home-editions',
  conceptsAnchor: 'home-concepts',
} as const;

/**
 * Seções da Home na ordem da copy do fundador (D-B2C-18): Hero (PICTURE) → renúncia e regra (PROBLEM) → possibilidade
 * (PROMISE) → Luxtory e os três pilares + gestão (PROOF) → PUSH → dúvidas. São os `id` das seções; o E2E lê a ordem.
 */
export const HOME_SECTIONS = [
  'inicio',
  'renuncia',
  'regra',
  'possibilidade',
  'luxtory',
  'pertencimento',
  'patrimonio',
  'liberdade',
  'gestao',
  'para-quem',
  'duvidas',
] as const;

/** Item da navegação B2C marcado como atual; a Home não é item — o logo leva a ela. */
export type DiscoverySection = 'home' | 'collection' | 'howItWorks' | 'none';
