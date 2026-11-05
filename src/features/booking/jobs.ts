// Superfície pública de servidor do booking (W12): consumidores do outbox, registrados pelo platform (spec booking). Fora
// de `index.ts`, como `@/features/calendar/jobs`, para que o registro de jobs não forme ciclo de inicialização.
export { createOwnUseBookingConsumers } from './presentation/own-use-consumers';
// W13 E3: jobs do ciclo da reserva (spec booking §10.14), registrados pelo platform.
export {
  createAdvanceBookingStatesJob,
  createFlagNoShowCandidatesJob,
  type LifecycleJobEnvironment,
} from './presentation/lifecycle-jobs';
