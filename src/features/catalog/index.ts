// Superfície pública do módulo catalog (TECH-011) para os outros slices. O shell (`src/app/`) importa os módulos de
// `presentation/` diretamente.

// Consultas servidas ao módulo ownership (interesse, spec ownership §13): a Home Edition pública alvo da manifestação e
// os rótulos para a visão do Admin.
export type { PublicHomeEditionTarget } from './application/public-views';
export type { HomeEditionLabel } from './application/views';
export { readHomeEditionLabels } from './infrastructure/postgres-cross-module-reader';
export { findPublicHomeEdition } from './presentation/public-home-edition';
