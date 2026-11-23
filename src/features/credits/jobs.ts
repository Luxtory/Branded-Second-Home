// Superfície pública de servidor do módulo credits (W17): o job `expire_credit_lots`, registrado pelo platform (spec
// credits §5.3). Fora de `index.ts`, como `@/features/calendar/jobs`, para que o registro de jobs não forme ciclo de
// inicialização.
export {
  createExpireCreditLotsJob,
  type ExpireCreditLotsJobEnvironment,
} from './presentation/expire-credit-lots-job';
