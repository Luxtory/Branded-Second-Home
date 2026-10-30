// Superfície pública de servidor do módulo calendar (W10/W11): os jobs `open_exercise` e `close_exercise` e os
// consumidores do outbox do Direito de Uso, registrados pelo platform (spec calendar §5–§6). Fica fora de `index.ts`
// para que o calendário civil continue sem dependências de servidor — o suporte de testes e do E2E o importa
// diretamente.
export {
  createOpenExerciseJob,
  type OpenExerciseJobEnvironment,
} from './presentation/open-exercise-job';
export {
  createCloseExerciseJob,
  type CloseExerciseJobEnvironment,
} from './presentation/close-exercise-job';
export { createUseRightConsumers } from './presentation/use-right-consumers';
