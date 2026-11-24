// Superfície pública de servidor do módulo luxchange para o registro de jobs do platform (W20): os consumidores do
// outbox. Fora de `index.ts`, como `@/features/booking/jobs`, para que o registro não forme ciclo de inicialização.
export { createLuxchangeConsumers } from './presentation/deposit-consumers';
