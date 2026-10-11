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
  // Portão do site público (W4, ADR-0014): em Production, as páginas públicas só abrem com `open` (go-live).
  PUBLIC_SITE: z.literal('open').optional(),
  // Mídia do catálogo (ADR-0015). Ausente = Supabase Storage. `local` (diretório) só local e na CI: recusado na Vercel.
  MEDIA_STORAGE: z.enum(['supabase', 'local']).optional(),
  // Portão da jornada Brand Partners (BP1, spec catalog §14.1), independente de `PUBLIC_SITE`: em Production só abre
  // com `open`; `closed` fecha em qualquer ambiente.
  BRAND_PARTNERS_SITE: z.enum(['open', 'closed']).optional(),
  // Contato Brand Partners (spec catalog §14.6). Ausente = Resend + Upstash reais. `fake` (envio e limitador
  // determinísticos em memória) só local e na CI: recusado na Vercel, inclusive em Preview.
  BRAND_PARTNERS_CONTACT_MODE: z.literal('fake').optional(),
};

const envSchema = z.object(envShape).superRefine((env, context) => {
  if (env.AUTH_MODE === 'test' && env.VERCEL_ENV !== undefined) {
    context.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'test auth on Vercel' });
  }
  if (env.MEDIA_STORAGE === 'local' && env.VERCEL_ENV !== undefined) {
    context.addIssue({ code: 'custom', path: ['MEDIA_STORAGE'], message: 'local media on Vercel' });
  }
  if (env.BRAND_PARTNERS_CONTACT_MODE === 'fake' && env.VERCEL_ENV !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['BRAND_PARTNERS_CONTACT_MODE'],
      message: 'fake contact delivery on Vercel',
    });
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

/** Endereço de e-mail simples, sem CR/LF nem espaços (remetente/destinatário configurados no servidor). */
const mailbox = z.email().max(254);
/** `Nome <email>` ou só o e-mail: o formato do campo `from` do provedor, sem CR/LF. */
const sender = z.union([
  mailbox,
  z
    .string()
    .max(320)
    .regex(/^[^\r\n<>]{1,200} <[^\s<>@]+@[^\s<>@]+>$/),
]);
/** Lista de origens exatas (`https://host[:porta]`), separadas por vírgula; cada uma já na forma canônica. */
const origins = z
  .string()
  .transform((value) => value.split(',').map((item) => item.trim()))
  .pipe(
    z
      .array(
        z.url({ protocol: /^https?$/ }).refine((value) => {
          const url = new URL(value);
          return url.origin === value;
        }),
      )
      .min(1),
  );

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
  // Supabase Storage privado da mídia do catálogo, só no servidor (Wave 4.1, ADR-0015): chave secreta `sb_secret_…`.
  SUPABASE_SECRET_KEY: z.string().regex(/^sb_secret_[A-Za-z0-9_-]+$/),
  MEDIA_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  // `MEDIA_STORAGE=local`: diretório absoluto dos objetos (local e CI).
  MEDIA_LOCAL_DIR: z.string().regex(/^\//),
  // Contato Brand Partners (BP1, spec catalog §14.6; valores no runbook, nenhum default — TECH-001). Secrets só no
  // servidor; Preview usa credenciais e caixa de teste próprias, nunca as de Production.
  RESEND_API_KEY: z.string().regex(/^re_[A-Za-z0-9_-]+$/),
  BRAND_PARTNERS_CONTACT_FROM: sender,
  BRAND_PARTNERS_CONTACT_TO: mailbox,
  UPSTASH_REDIS_REST_URL: z.url({ protocol: /^https$/ }),
  UPSTASH_REDIS_REST_TOKEN: z.string().regex(/^\S{20,}$/),
  // Segredo do HMAC que pseudonimiza a origem de rede nas chaves do limitador; separado de qualquer outro segredo.
  BRAND_PARTNERS_CONTACT_HMAC_SECRET: z.string().min(32),
  BRAND_PARTNERS_ALLOWED_ORIGINS: origins,
  BRAND_PARTNERS_CONTACT_NETWORK_LIMIT: positiveInteger,
  BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS: positiveInteger,
  BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT: positiveInteger,
  BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS: positiveInteger,
  BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS: positiveInteger,
  BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS: positiveInteger,
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
