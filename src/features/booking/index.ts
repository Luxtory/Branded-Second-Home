// Superfície pública do módulo booking (TECH-011, W12): reserva de uso próprio. O shell (`src/app/`) importa as telas de
// `presentation/` diretamente; os consumidores do outbox saem por `@/features/booking/jobs`.
export { OWN_USE_BOOKING_CONFIRMED } from './application/create-own-use-booking';
export { OWN_USE_BOOKING_CONFIRMED_NOTIFICATION } from './application/own-use-consumers';
export { ownUsePaths } from './presentation/own-use-paths';
