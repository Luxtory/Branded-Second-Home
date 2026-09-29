/** Rotas do Discovery público (docs/specs/catalog.md §13.1). */
export const discoveryPaths = {
  home: '/',
  howItWorks: '/como-funciona',
  collection: '/colecao',
  concept: (conceptId: string) => `/colecao/${conceptId}`,
} as const;

/** Item da navegação B2C marcado como atual (D-W4-08); a Home não é item — o logo leva a ela. */
export type DiscoverySection = 'home' | 'collection' | 'howItWorks' | 'none';
