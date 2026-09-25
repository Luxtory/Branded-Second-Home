// Superfície pública do módulo platform (TECH-011) para os outros slices. O shell (`src/app/`) importa os
// módulos de `presentation/` diretamente.
export type { Clock } from './application/clock';
export { systemClock } from './infrastructure/system-clock';
export { loadEnv, EnvValidationError, type Env, type EnvSource } from './infrastructure/env';
export { createLogger, rootLogger, type Logger, type LogFields } from './infrastructure/logger';
export { withRoute, type RouteContext } from './presentation/route';
export { CORRELATION_HEADER } from './presentation/correlation';
