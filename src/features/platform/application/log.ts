/** Log estruturado visto pela camada de aplicação; o logger JSON de `infrastructure/logger.ts` o satisfaz. */
export interface LogPort {
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}
