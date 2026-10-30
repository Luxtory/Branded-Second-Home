// Superfície pública do módulo ownership (TECH-011) para os outros slices: vazia na W5 — o Admin só aponta para a rota
// da visão de interesses. O shell (`src/app/`) importa os módulos de `presentation/` diretamente.
// W9: consumidores do outbox do sorteio inicial, registrados pelo job `outbox` do platform (ADR-0022).
export {
  createInitialDrawConsumers,
  type InitialDrawConsumerOptions,
} from './presentation/initial-draw-consumers';
// W10: leitura das Second Homes formalizadas para a selagem do calendário (spec calendar §5).
export {
  findFormalizedSecondHome,
  listFormalizedSecondHomes,
  type AcquisitionModality,
  type FormalizedSecondHome,
} from './infrastructure/formalized-second-homes';
