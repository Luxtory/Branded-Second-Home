import { createLogger, type Logger } from '@/features/platform';

/** Logger real com sink em memória: permite afirmar o que foi (e o que não foi) registrado. */
export function captureLogger(): { logger: Logger; entries: () => Record<string, unknown>[] } {
  const lines: string[] = [];
  const logger = createLogger({}, (line) => lines.push(line));
  return {
    logger,
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
