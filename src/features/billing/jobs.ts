// Superfície pública de servidor do módulo billing (W19): o job `reconciliation`, registrado pelo platform (spec billing
// §4.5). Fora de `index.ts`, como `@/features/credits/jobs`, para que o registro de jobs não forme ciclo.
export {
  createReconciliationJob,
  type ReconciliationJobEnvironment,
} from './presentation/reconciliation-job';
