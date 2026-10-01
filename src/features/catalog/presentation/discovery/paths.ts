/** Rotas do Discovery público (docs/specs/catalog.md §13.1). Âncoras dos dois grupos da Coleção (§13.4). */
export const discoveryPaths = {
  home: '/',
  howItWorks: '/como-funciona',
  collection: '/colecao',
  concept: (conceptId: string) => `/colecao/${conceptId}`,
  editionsAnchor: 'residence-editions',
  conceptsAnchor: 'residence-concepts',
} as const;

/** Seções da Home na ordem dos 5Ps: os ids nomeiam cada seção (`aria-labelledby`) e o E2E lê a ordem no DOM. */
export const HOME_SECTIONS = ['inicio', 'conflito', 'virada', 'arquitetura', 'para-quem'] as const;

/** Item da navegação B2C marcado como atual; a Home não é item — o logo leva a ela. */
export type DiscoverySection = 'home' | 'collection' | 'howItWorks' | 'none';
