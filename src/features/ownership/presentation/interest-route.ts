import { randomUUID } from 'node:crypto';
import {
  BODY_NOT_TEXT,
  BODY_TOO_LARGE,
  errorResponse,
  isDatabaseUnavailable,
  isJsonRequest,
  isSameOrigin,
  pseudonymizeNetwork,
  PublicAttemptUnverifiableError,
  RateLimiterUnavailableError,
  readBoundedText,
  systemClock,
  trustedClientAddress,
  unavailableKeys,
  withRoute,
  type Clock,
  type EnvSource,
  type ErrorCode,
  type RouteContext,
} from '@/features/platform';
import type { InterestFieldIssue } from '../application/interest-input';
import {
  INTEREST_SURFACE,
  registerInterest,
  type InterestRegistration,
} from '../application/register-interest';
import { INTEREST_BODY_MAX_BYTES } from '../domain/interest';
import type { PrivacyNotice } from '../domain/privacy-notice';
import { loadInterestConfig, type InterestAdapters, type InterestConfig } from './interest-config';
import { isInterestCollectionOpen } from './interest-gate';

const HTTP_CREATED = 201;
const NO_STORE = 'no-store';

export interface InterestRouteOptions extends InterestAdapters {
  /** Ambiente lido pela rota (injeção nos testes). */
  readonly env?: EnvSource;
  /** Aviso de Privacidade considerado pelo portão (injeção nos testes; o padrão é o versionado). */
  readonly notice?: PrivacyNotice;
  readonly clock?: Clock;
  readonly newId?: () => string;
}

/** Resultado registrado no log: só códigos de um conjunto fechado, nunca campos, corpo, IP, chave, hash ou contexto. */
type Stage =
  | 'closed'
  | 'configuration'
  | 'origin'
  | 'media_type'
  | 'body'
  | 'network_identity'
  | 'limiter'
  | 'rate_limited'
  | 'database'
  | 'json'
  | 'schema'
  | 'idempotency'
  | 'not_found'
  | 'conflict'
  | 'registered'
  | 'replayed'
  | 'internal';

interface Outcome {
  readonly response: Response;
  readonly stage: Stage;
  readonly reason?: string;
}

const reject = (code: ErrorCode, correlationId: string, stage: Stage, reason?: string) => ({
  response: errorResponse(code, correlationId),
  stage,
  ...(reason === undefined ? {} : { reason }),
});

/** `ERR_VALIDATION` com os campos recusados: só nome e código, nunca o valor enviado (spec ownership §5.1, §14.4). */
async function validationResponse(issues: readonly InterestFieldIssue[], correlationId: string) {
  const base = errorResponse('ERR_VALIDATION', correlationId);
  const body = (await base.json()) as Readonly<Record<string, unknown>>;
  return Response.json({ ...body, fields: issues }, { status: base.status });
}

async function registrationOutcome(
  registration: InterestRegistration,
  correlationId: string,
): Promise<Outcome> {
  switch (registration.status) {
    case 'registered': {
      const headers: Record<string, string> = {};
      if (registration.replayed) headers['idempotency-replayed'] = 'true';
      return {
        response: Response.json({ status: 'registered' }, { status: HTTP_CREATED, headers }),
        stage: registration.replayed ? 'replayed' : 'registered',
      };
    }
    case 'invalid':
      return {
        response: await validationResponse(registration.issues, correlationId),
        stage: 'schema',
      };
    case 'not_found':
      return reject('ERR_NOT_FOUND', correlationId, 'not_found');
    case 'conflict':
      return reject('ERR_IDEMPOTENCY_CONFLICT', correlationId, 'conflict');
  }
}

async function handleInterest(
  request: Request,
  correlationId: string,
  source: EnvSource,
  options: InterestRouteOptions,
): Promise<Outcome> {
  let config: InterestConfig;
  try {
    if (!isInterestCollectionOpen(source, options.notice)) {
      return reject('ERR_NOT_FOUND', correlationId, 'closed');
    }
    config = loadInterestConfig(source, options);
  } catch (error) {
    // Ambiente inválido ou incompleto: falha fechada, nomeando só as chaves.
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    return reject('ERR_UNAVAILABLE', correlationId, 'configuration', keys.join(','));
  }
  if (!isSameOrigin(request)) return reject('ERR_PERMISSION', correlationId, 'origin');
  if (!isJsonRequest(request)) {
    return reject('ERR_UNSUPPORTED_MEDIA_TYPE', correlationId, 'media_type');
  }
  const text = await readBoundedText(request, INTEREST_BODY_MAX_BYTES);
  if (text === BODY_TOO_LARGE) return reject('ERR_PAYLOAD_TOO_LARGE', correlationId, 'body');
  if (text === BODY_NOT_TEXT) return reject('ERR_VALIDATION', correlationId, 'body');
  // O limitador conta toda tentativa que chegou até aqui e roda antes de qualquer acesso ao banco.
  const address = trustedClientAddress(request, config.env);
  if (address === null) return reject('ERR_UNAVAILABLE', correlationId, 'network_identity');
  let decision;
  try {
    decision = await config.limiter.consume(
      pseudonymizeNetwork(address, config.hmacSecret, INTEREST_SURFACE),
    );
  } catch (error) {
    if (!(error instanceof RateLimiterUnavailableError)) throw error;
    return reject('ERR_UNAVAILABLE', correlationId, 'limiter', error.reason);
  }
  if (!decision.allowed) {
    const limited = errorResponse('ERR_RATE_LIMITED', correlationId);
    limited.headers.set('retry-after', String(decision.retryAfterSeconds));
    return { response: limited, stage: 'rate_limited' };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reject('ERR_VALIDATION', correlationId, 'json');
  }
  const registration = await registerInterest(body, request.headers.get('idempotency-key') ?? '', {
    targets: config.targets,
    store: config.store,
    clock: options.clock ?? systemClock,
    newId: options.newId ?? randomUUID,
    hashKey: config.hashKey,
    contextKeys: config.contextKeys,
  });
  return registrationOutcome(registration, correlationId);
}

/**
 * Banco inalcançável, configuração recusada ou registro de idempotência não verificável (ADR-0018): `503` sem detalhe
 * e sem efeito; o resto é erro interno. O log leva só o nome do erro, nunca a mensagem do banco (que traz a linha).
 */
function failureOutcome(error: unknown, correlationId: string): Outcome {
  const keys = unavailableKeys(error);
  if (keys !== null)
    return reject('ERR_UNAVAILABLE', correlationId, 'configuration', keys.join(','));
  if (error instanceof PublicAttemptUnverifiableError) {
    return reject('ERR_UNAVAILABLE', correlationId, 'idempotency', 'hash_key_unavailable');
  }
  if (isDatabaseUnavailable(error)) {
    return reject('ERR_UNAVAILABLE', correlationId, 'database', 'unavailable');
  }
  return reject(
    'ERR_INTERNAL',
    correlationId,
    'internal',
    error instanceof Error ? error.name : 'unknown',
  );
}

/**
 * `POST /v1/interests` (OpenAPI `createInterest`, spec ownership §5 e §14), sem o `withRoute` (injeção nos testes).
 * Portões e configuração → origem → tipo e corpo → limitador → schema, contexto e chave → idempotência → alvo público →
 * registro com revalidação. Toda resposta é `no-store`, sem CORS. Erros nunca sobem crus ao `withRoute`: o log leva só
 * etapa, código e duração.
 */
export function createInterestRoute(options: InterestRouteOptions = {}) {
  return async (request: Request, { correlationId, log }: RouteContext): Promise<Response> => {
    const started = performance.now();
    let outcome: Outcome;
    try {
      outcome = await handleInterest(request, correlationId, options.env ?? process.env, options);
    } catch (error) {
      outcome = failureOutcome(error, correlationId);
    }
    const { response, stage, reason } = outcome;
    response.headers.set('cache-control', NO_STORE);
    const fields = {
      event: 'interest_registration',
      stage,
      status: response.status,
      duration_ms: Math.round(performance.now() - started),
      ...(reason === undefined ? {} : { reason }),
    };
    if (response.status >= 500) log.error('interest registration failed', fields);
    else log.info('interest registration', fields);
    return response;
  };
}

/** Handler de produção do `POST /v1/interests`, com correlação (`withRoute`). */
export const createInterest = withRoute(createInterestRoute());
