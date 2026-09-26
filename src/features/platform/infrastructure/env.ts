import { z } from 'zod';

/**
 * Variáveis de ambiente lidas pela aplicação — catálogo em docs/reference/environment.md.
 * Só as chaves declaradas aqui são lidas: nenhuma outra é exigida, removida ou alterada.
 */
const envShape = {
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  VERCEL_GIT_COMMIT_SHA: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .optional(),
  // Ausente = Auth real (Supabase). `test` só local e na CI: recusado quando `VERCEL_ENV` existe (ADR-0005 §7).
  AUTH_MODE: z.enum(['supabase', 'test']).optional(),
};

const envSchema = z.object(envShape).superRefine((env, context) => {
  if (env.AUTH_MODE === 'test' && env.VERCEL_ENV !== undefined) {
    context.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'test auth on Vercel' });
  }
});

export type Env = z.infer<typeof envSchema>;
export type EnvSource = Readonly<Record<string, string | undefined>>;

const KNOWN_KEYS = Object.keys(envShape);

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

const positiveInteger = z.coerce.number().int().positive();

/**
 * Configuração de runtime (W1). Os valores pertencem ao runbook `docs/how-to/operacao.md` (TECH-001): nenhum tem
 * default, e cada função lê só as chaves de que depende.
 */
const runtimeSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  CRON_SECRET: z.string().min(32),
  COMMAND_MAX_ATTEMPTS: positiveInteger,
  COMMAND_LOCK_TIMEOUT_MS: positiveInteger,
  OUTBOX_BATCH_SIZE: positiveInteger,
  // Supabase Auth, só no servidor (W2, ADR-0008). Só a chave publicável: `anon` legada e chaves secretas são recusadas.
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]+$/),
});

export type RuntimeConfig = z.infer<typeof runtimeSchema>;
export type RuntimeKey = keyof RuntimeConfig;

/** Chave obrigatória ausente: a função dependente fica bloqueada com erro explícito (TECH-001). */
export class ConfigurationMissingError extends Error {
  constructor(readonly missingKeys: readonly string[]) {
    super(`Missing required configuration: ${missingKeys.join(', ')}`);
    this.name = 'ConfigurationMissingError';
  }
}

/**
 * Serviço recusado neste ambiente da Vercel: sem staging, Previews não usam o banco nem o Auth do projeto canônico
 * (D3, ADR-0007, ADR-0008). O diagnóstico nomeia só `VERCEL_ENV`.
 */
export class EnvironmentRestrictionError extends Error {
  constructor(
    readonly service: string,
    readonly vercelEnv: string,
  ) {
    super(`${service} is disabled in the ${vercelEnv} environment (ADR-0007)`);
    this.name = 'EnvironmentRestrictionError';
  }
}

/** Lê e valida só `keys`; ausente → `ConfigurationMissingError`, inválida → `EnvValidationError` (sem valores). */
export function loadRuntimeConfig<K extends RuntimeKey>(
  keys: readonly K[],
  source: EnvSource = process.env,
): Pick<RuntimeConfig, K> {
  const missing = keys.filter((key) => source[key] === undefined || source[key] === '');
  if (missing.length > 0) throw new ConfigurationMissingError(missing);
  const values: Partial<Record<RuntimeKey, unknown>> = {};
  const invalid: string[] = [];
  for (const key of keys) {
    const result = runtimeSchema.shape[key].safeParse(source[key]);
    if (result.success) values[key] = result.data;
    else invalid.push(key);
  }
  if (invalid.length > 0) throw new EnvValidationError(invalid);
  // Cada chave pedida foi validada pelo schema do próprio campo logo acima.
  return values as Pick<RuntimeConfig, K>;
}
