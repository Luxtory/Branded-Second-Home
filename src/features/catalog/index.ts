// Superfície pública do módulo catalog (TECH-011) para os outros slices. O shell (`src/app/`) importa os módulos de
// `presentation/` diretamente.

// W5 — consultas servidas ao módulo ownership (interesse): oferta pública do Concept e rótulos para o Admin.
export type { PublicConceptOffer } from './application/public-views';
export type { ConceptLabel } from './application/views';
export type { EditionModality } from './domain/catalog';
export { readConceptLabels } from './infrastructure/postgres-cross-module-reader';
export { findPublicConceptOffer } from './presentation/public-offer';
