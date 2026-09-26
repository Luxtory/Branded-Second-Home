import { z } from 'zod';

/**
 * Variáveis de ambiente lidas pela aplicação — catálogo em docs/reference/environment.md.
 * Só as chaves declaradas aqui são lidas: nenhuma outra é exigida, removida ou alterada.
 */
const envSchema = z.object({
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_GIT_COMMIT_SHA: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .optional(),
});

export type Env = z.infer<typeof envSchema>;
export type EnvSource = Readonly<Record<string, string | undefined>>;

const KNOWN_KEYS = Object.keys(envSchema.shape);

export class EnvValidationError extends Error {
  constructor(readonly invalidKeys: readonly string[]) {
    // Só os nomes das chaves: valores de ambiente nunca entram em mensagens de erro.
    super(`Invalid environment variables: ${invalidKeys.join(', ')}`);
    this.name = 'EnvValidationError';
  }
}

export function loadEnv(source: EnvSource = process.env): Env {
  const picked = Object.fromEntries(
    KNOWN_KEYS.map((key) => [key, source[key] === '' ? undefined : source[key]]),
  );
  const result = envSchema.safeParse(picked);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map((issue) => issue.path.join('.')));
  }
  return result.data;
}
