// Superfície pública do módulo catalog (TECH-011) para os outros slices. O shell (`src/app/`) importa os módulos de
// `presentation/` diretamente.

// Consultas servidas ao módulo ownership (interesse, spec ownership §13): a Home Edition pública alvo da manifestação e
// os rótulos para a visão do Admin.
export type { PublicHomeEditionTarget } from './application/public-views';
export type { HomeEditionLabel } from './application/views';
export { readHomeEditionLabels } from './infrastructure/postgres-cross-module-reader';
export { findPublicHomeEdition } from './presentation/public-home-edition';

// W6 (spec ownership §14, catalog §18): revalidação com trava dentro da transação do registro de interesse, médias
// projetadas apresentadas para a leitura auditada do Admin e a formatação única de valores da interface.
export type { ProjectedInvestmentReference } from './application/views';
export {
  lockPublicHomeEdition,
  readProjectedInvestmentReferences,
} from './infrastructure/postgres-cross-module-reader';
export { formatMoney } from './presentation/money';
