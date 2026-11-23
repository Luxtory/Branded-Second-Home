// Superfície pública do módulo booking (TECH-011, W12): reserva de uso próprio. O shell (`src/app/`) importa as telas de
// `presentation/` diretamente; os consumidores do outbox saem por `@/features/booking/jobs`.
export { OWN_USE_BOOKING_CONFIRMED } from './application/create-own-use-booking';
export { OWN_USE_BOOKING_CONFIRMED_NOTIFICATION } from './application/own-use-consumers';
export { ownUsePaths } from './presentation/own-use-paths';
// W13 E2: eventos do ciclo da reserva (AsyncAPI); os consumidores chegam na E3.
export {
  OWN_USE_BOOKING_CANCELLED,
  OWN_USE_BOOKING_INVALIDATED,
  OWN_USE_EXCEPTION_OPENED,
  OWN_USE_EXCEPTION_RESOLVED,
  OWN_USE_NO_SHOW_DECLARED,
} from './application/own-use-lifecycle-events';
// W20 (ADR-0036 §1): cessão da reserva de uso próprio Co-Owner pelo depósito Luxchange, na transação do luxchange.
export type { CedableBooking, OwnUseCessionPort } from './application/own-use-cession';
export { createPostgresOwnUseCession as createOwnUseCessionPort } from './infrastructure/postgres-own-use-cession';
