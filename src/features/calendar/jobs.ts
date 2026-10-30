// Superfície pública de servidor do módulo calendar (W10): o job `open_exercise`, registrado pelo platform (spec
// calendar §5). Fica fora de `index.ts` para que o calendário civil continue sem dependências de servidor — o suporte
// de testes e do E2E o importa diretamente.
export {
  createOpenExerciseJob,
  type OpenExerciseJobEnvironment,
} from './presentation/open-exercise-job';
