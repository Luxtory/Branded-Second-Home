// Superfície pública do módulo luxchange (TECH-011). W20: depósito de capacidade (`deposit_capacity`; ADR-0036). O
// shell (`src/app/`) importa as telas de `presentation/` diretamente; os consumidores do outbox saem por `./jobs`.
export {
  createDepositCapacityHandler,
  depositCapacityInput,
  DepositWriteError,
  MAX_DEPOSIT_NIGHTS,
  type DepositCapacityInput,
  type DepositCapacityResult,
  type DepositDependencies,
} from './application/deposit-capacity';
export { CREDITS_ORIGINATED, type CreditsOriginatedPayload } from './application/deposit-events';
export { DEPOSIT_COMPLETED_NOTIFICATION } from './application/deposit-consumers';
export { CREDITS_CAPABILITY, LUXCHANGE_DEPOSIT_CAPABILITY } from './application/ports';
export { createDepositHandler } from './presentation/deposit-handler';
