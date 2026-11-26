// Superfície pública de servidor do módulo luxchange para o registro de jobs do platform (W20): os consumidores do
// outbox. Fora de `index.ts`, como `@/features/booking/jobs`, para que o registro não forme ciclo de inicialização.
export { createLuxchangeConsumers } from './presentation/deposit-consumers';
// W21: job `expire_requests` (encerramentos pré-aceite das Requests vencidas ou inelegíveis; ADR-0037 §7).
export {
  createExpireRequestsJob,
  type ExpireRequestsJobEnvironment,
} from './presentation/request-job';
