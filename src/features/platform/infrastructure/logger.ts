import type { Clock } from '../application/clock';
import { systemClock } from './system-clock';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, unknown>>;
export type LogSink = (line: string, level: LogLevel) => void;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

// Defesa em profundidade: PII e segredos nunca vão para logs (TECH-100), mesmo por engano do chamador.
const SENSITIVE_KEY =
  /^(cpf|cnpj|document|documento|email|e-mail|phone|telefone|name|nome|password|senha|token|secret|authorization|cookie)$/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 5;

function sanitize(value: unknown, depth: number): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1),
    ]),
  );
}

const consoleSink: LogSink = (line, level) => {
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
};

/** Logger JSON estruturado: uma linha por evento, com `correlation_id` herdado via `child`. */
export function createLogger(
  base: LogFields = {},
  sink: LogSink = consoleSink,
  clock: Clock = systemClock,
): Logger {
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const entry = { time: clock.now().toISOString(), level, msg: message, ...base, ...fields };
    sink(JSON.stringify(sanitize(entry, 0)), level);
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child: (fields) => createLogger({ ...base, ...fields }, sink, clock),
  };
}

export const rootLogger = createLogger();
