import { canonicalHash, keyedCanonicalHash } from './commands/request-hash';

/**
 * Idempotência de mutações públicas não críticas (ADR-0017; TECH-056, ADR-006 do `03`). Sem conta, o escopo da chave é
 * a superfície da escrita e a chave é um UUID imprevisível do cliente. Fora do pipeline de commands críticos: sem
 * `operation`, `audit_log` de command nem `idempotency_record` — mutação crítica continua só no executor da W1.
 *
 * Esquema do hash por registro (ADR-0018): `sha256` sem chave para conteúdo sem dado pessoal (W5); `hmac_sha256` com
 * chave identificada para conteúdo com dado pessoal (W6). O banco guarda só o id da chave, nunca o segredo.
 */
export type PublicHashScheme = 'sha256' | 'hmac_sha256';

/** Chave do HMAC: o id técnico gravado no registro e o segredo, que nunca sai do servidor. */
export interface PublicHashKey {
  readonly id: string;
  readonly secret: string;
}

/** Hash como gravado no registro: valor, esquema e id da chave (nulo só em `sha256`). */
export interface StoredPublicHash {
  readonly requestHash: string;
  readonly hashScheme: PublicHashScheme;
  readonly hashKeyId: string | null;
}

export interface PublicAttempt extends StoredPublicHash {
  /** Superfície da escrita pública (ex.: `interest`). */
  readonly surface: string;
  /** UUID do cliente, em minúsculas. */
  readonly key: string;
  /** O mesmo conteúdo nos esquemas que esta tentativa sabe verificar: o seu e o legado `sha256`. */
  readonly verifiable: readonly StoredPublicHash[];
}

/** Chave já usada com sucesso: mesmo conteúdo → repetição; outro conteúdo → conflito. */
export type PriorAttempt = 'replayed' | 'conflict';

/** Resultado da reserva da chave na transação do efeito: nova (`claimed`) ou já usada. */
export type PublicAttemptClaim = 'claimed' | PriorAttempt;

/** O registro usa um esquema ou uma chave que esta tentativa não tem: nem repetição nem conflito (falha fechada). */
export class PublicAttemptUnverifiableError extends Error {
  constructor(
    readonly surface: string,
    readonly hashScheme: PublicHashScheme,
    readonly hashKeyId: string | null,
  ) {
    super(
      `public idempotency record is not verifiable with the configured keys (surface ${surface}, scheme ${hashScheme}, key ${hashKeyId ?? '-'})`,
    );
    this.name = 'PublicAttemptUnverifiableError';
  }
}

// Formato 8-4-4-4-12 hexadecimal, como o `format: uuid` do OpenAPI (o navegador gera v4 com `crypto.randomUUID`).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chave aceita numa escrita pública: só UUID — sem ator, chave curta ou previsível colidiria entre visitantes. */
export function isPublicIdempotencyKey(key: string): boolean {
  return UUID.test(key);
}

const sha256Hash = (payload: unknown): StoredPublicHash => ({
  requestHash: canonicalHash(payload),
  hashScheme: 'sha256',
  hashKeyId: null,
});

/** Tentativa com SHA-256 sem chave do conteúdo já validado (ADR-0017 §4) — só para conteúdo sem dado pessoal. */
export function publicAttempt(surface: string, key: string, input: unknown): PublicAttempt {
  const hash = sha256Hash({ surface, input });
  return { surface, key: key.toLowerCase(), ...hash, verifiable: [hash] };
}

/**
 * Tentativa com HMAC-SHA-256 do conteúdo já validado, com a chave identificada (ADR-0018). Verifica também registros
 * legados `sha256` da mesma superfície, pela semântica do ADR-0017.
 */
export function keyedPublicAttempt(
  surface: string,
  key: string,
  input: unknown,
  hashKey: PublicHashKey,
): PublicAttempt {
  const payload = { surface, input };
  const hash: StoredPublicHash = {
    requestHash: keyedCanonicalHash(hashKey.secret, payload),
    hashScheme: 'hmac_sha256',
    hashKeyId: hashKey.id,
  };
  return { surface, key: key.toLowerCase(), ...hash, verifiable: [hash, sha256Hash(payload)] };
}

/**
 * Decide a repetição de uma chave já usada: compara o hash gravado com o do mesmo conteúdo no esquema e na chave
 * daquele registro. Esquema ou chave desconhecidos → `PublicAttemptUnverifiableError`.
 */
export function priorAttempt(stored: StoredPublicHash, attempt: PublicAttempt): PriorAttempt {
  const same = attempt.verifiable.find(
    (hash) => hash.hashScheme === stored.hashScheme && hash.hashKeyId === stored.hashKeyId,
  );
  if (same === undefined) {
    throw new PublicAttemptUnverifiableError(attempt.surface, stored.hashScheme, stored.hashKeyId);
  }
  return same.requestHash === stored.requestHash ? 'replayed' : 'conflict';
}
