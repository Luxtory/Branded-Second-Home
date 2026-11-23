import {
  BODY_NOT_TEXT,
  BODY_TOO_LARGE,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  errorResponse,
  hasAllowedOrigin,
  isJsonRequest,
  isSameOrigin,
  isSecondHomeDevelopmentSiteOpen,
  loadEnv,
  loadRuntimeConfig,
  pseudonymizeNetwork,
  RateLimiterUnavailableError,
  readBoundedText,
  trustedClientAddress,
  unavailableKeys,
  withRoute,
  type EnvSource,
  type ErrorCode,
  type RateLimiter,
  type RouteContext,
} from '@/features/platform';
import type { ContactMailer } from '../application/brand-partner-contact';
import { submitSecondHomeDevelopmentContact } from '../application/second-home-development-contact';
import { createFakeContactMailer } from '../infrastructure/fake-contact-mailer';
import { createResendContactMailer } from '../infrastructure/resend-contact-mailer';
import { secondHomeDevelopmentContactEmailText } from './i18n/second-home-development-contact-pt-br';

const BODY_MAX_BYTES = 32 * 1024;
const SHARED_KEYS = [
  'BRAND_PARTNERS_CONTACT_HMAC_SECRET',
  'BRAND_PARTNERS_ALLOWED_ORIGINS',
  'BRAND_PARTNERS_CONTACT_NETWORK_LIMIT',
  'BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS',
  'BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT',
  'BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS',
] as const;
const LIVE_KEYS = [
  'RESEND_API_KEY',
  'BRAND_PARTNERS_CONTACT_FROM',
  'SECOND_HOME_DEVELOPMENT_CONTACT_TO',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS',
  'BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS',
] as const;

interface ContactAdapters {
  readonly mailer: ContactMailer;
  readonly limiter: RateLimiter;
}

// Estado local/CI isolado dos outros contatos públicos. loadEnv recusa esse modo na Vercel.
let fakeAdapters: ContactAdapters | undefined;

function readConfiguration(source: EnvSource) {
  const env = loadEnv(source);
  const shared = loadRuntimeConfig(SHARED_KEYS, source);
  const namespace = `luxtory:second-home-development-contact:${env.VERCEL_ENV ?? 'local'}`;
  const policies = {
    network: {
      limit: shared.BRAND_PARTNERS_CONTACT_NETWORK_LIMIT,
      windowSeconds: shared.BRAND_PARTNERS_CONTACT_NETWORK_WINDOW_SECONDS,
    },
    global: {
      limit: shared.BRAND_PARTNERS_CONTACT_GLOBAL_LIMIT,
      windowSeconds: shared.BRAND_PARTNERS_CONTACT_GLOBAL_WINDOW_SECONDS,
    },
  };
  const config = {
    env,
    namespace,
    origins: shared.BRAND_PARTNERS_ALLOWED_ORIGINS,
    hmacSecret: shared.BRAND_PARTNERS_CONTACT_HMAC_SECRET,
  };
  if (env.BRAND_PARTNERS_CONTACT_MODE === 'fake') {
    fakeAdapters ??= {
      mailer: createFakeContactMailer(),
      limiter: createMemoryRateLimiter(policies),
    };
    return { ...config, ...fakeAdapters };
  }
  const live = loadRuntimeConfig(LIVE_KEYS, source);
  return {
    ...config,
    mailer: createResendContactMailer({
      apiKey: live.RESEND_API_KEY,
      from: live.BRAND_PARTNERS_CONTACT_FROM,
      to: live.SECOND_HOME_DEVELOPMENT_CONTACT_TO,
      timeoutMs: live.BRAND_PARTNERS_CONTACT_SEND_TIMEOUT_MS,
    }),
    limiter: createUpstashRateLimiter({
      url: live.UPSTASH_REDIS_REST_URL,
      token: live.UPSTASH_REDIS_REST_TOKEN,
      namespace,
      policies,
      timeoutMs: live.BRAND_PARTNERS_CONTACT_LIMITER_TIMEOUT_MS,
    }),
  };
}

interface RouteOptions extends Partial<ContactAdapters> {
  readonly env?: EnvSource;
}

/** Borda pública do contato Development (TECH-057, TECH-100, catalog §23). */
export function createSecondHomeDevelopmentContactRoute({
  env,
  mailer,
  limiter,
}: RouteOptions = {}) {
  return async (request: Request, { correlationId, log }: RouteContext): Promise<Response> => {
    const started = performance.now();
    const finish = (response: Response, stage: string, reason?: string) => {
      response.headers.set('cache-control', 'no-store');
      const level = response.status >= 500 ? 'error' : 'info';
      log[level]('second home development contact', {
        event: 'second_home_development_contact',
        stage,
        status: response.status,
        duration_ms: Math.round(performance.now() - started),
        ...(reason === undefined ? {} : { reason }),
      });
      return response;
    };
    const reject = (code: ErrorCode, stage: string, reason?: string) =>
      finish(errorResponse(code, correlationId), stage, reason);

    try {
      const source = env ?? process.env;
      if (!isSecondHomeDevelopmentSiteOpen(source)) return reject('ERR_NOT_FOUND', 'closed');
      const config = readConfiguration(source);
      if (!hasAllowedOrigin(request, config.origins) || !isSameOrigin(request)) {
        return reject('ERR_PERMISSION', 'origin');
      }
      if (!isJsonRequest(request)) return reject('ERR_UNSUPPORTED_MEDIA_TYPE', 'media_type');
      const text = await readBoundedText(request, BODY_MAX_BYTES);
      if (text === BODY_TOO_LARGE) return reject('ERR_PAYLOAD_TOO_LARGE', 'body');
      if (text === BODY_NOT_TEXT) return reject('ERR_VALIDATION', 'body');

      const address = trustedClientAddress(request, config.env);
      if (address === null) return reject('ERR_UNAVAILABLE', 'network_identity');
      const networkKey = pseudonymizeNetwork(address, config.hmacSecret, config.namespace);
      const decision = await (limiter ?? config.limiter).consume(networkKey);
      if (!decision.allowed) {
        const response = errorResponse('ERR_RATE_LIMITED', correlationId);
        response.headers.set('retry-after', String(decision.retryAfterSeconds));
        return finish(response, 'rate_limited');
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return reject('ERR_VALIDATION', 'json');
      }
      const submission = await submitSecondHomeDevelopmentContact(
        body,
        request.headers.get('idempotency-key'),
        mailer ?? config.mailer,
        config.namespace,
        secondHomeDevelopmentContactEmailText,
      );
      switch (submission.status) {
        case 'accepted':
          return finish(Response.json({ status: 'accepted' }, { status: 202 }), 'accepted');
        case 'invalid':
          return reject('ERR_VALIDATION', 'validation');
        case 'refused':
          return reject('ERR_PERMISSION', 'honeypot');
        case 'conflict':
          return reject('ERR_IDEMPOTENCY_CONFLICT', 'conflict');
        case 'unavailable':
          return reject('ERR_UNAVAILABLE', 'provider', submission.reason);
      }
    } catch (error) {
      const keys = unavailableKeys(error);
      if (keys !== null) return reject('ERR_UNAVAILABLE', 'configuration', keys.join(','));
      if (error instanceof RateLimiterUnavailableError) {
        return reject('ERR_UNAVAILABLE', 'limiter', error.reason);
      }
      // Erros inesperados podem conter campos do contato ou credenciais do provedor.
      return reject('ERR_INTERNAL', 'internal');
    }
  };
}

export const createSecondHomeDevelopmentContact = withRoute(
  createSecondHomeDevelopmentContactRoute(),
);
