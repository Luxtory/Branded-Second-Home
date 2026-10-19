import { canonicalHash } from './commands/request-hash';

/**
 * Idempotência de mutações públicas não críticas (ADR-0017; TECH-056, ADR-006 do `03`). Sem conta, o escopo da chave é
 * a superfície da escrita e a chave é um UUID imprevisível do cliente. Fora do pipeline de commands críticos: sem
 * `operation`, `audit_log` de command nem `idempotency_record` — mutação crítica continua só no executor da W1.
 */
export interface PublicAttempt {
  /** Superfície da escrita pública (ex.: `interest`). */
  readonly surface: string;
  /** UUID do cliente, em minúsculas. */
  readonly key: string;
  /** SHA-256 do conteúdo validado e normalizado. */
  readonly requestHash: string;
}

/** Chave já usada com sucesso: mesmo conteúdo → repetição; outro conteúdo → conflito. */
export type PriorAttempt = 'replayed' | 'conflict';

/** Resultado da reserva da chave na transação do efeito: nova (`claimed`) ou já usada. */
export type PublicAttemptClaim = 'claimed' | PriorAttempt;

// Formato 8-4-4-4-12 hexadecimal, como o `format: uuid` do OpenAPI (o navegador gera v4 com `crypto.randomUUID`).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chave aceita numa escrita pública: só UUID — sem ator, chave curta ou previsível colidiria entre visitantes. */
export function isPublicIdempotencyKey(key: string): boolean {
  return UUID.test(key);
}

/** Tentativa com a chave normalizada e o hash canônico da superfície e da entrada já validada. */
export function publicAttempt(surface: string, key: string, input: unknown): PublicAttempt {
  return { surface, key: key.toLowerCase(), requestHash: canonicalHash({ surface, input }) };
}

/** Decide a repetição de uma chave já usada, comparando o hash gravado com o da tentativa. */
export function priorAttempt(storedHash: string, attempt: PublicAttempt): PriorAttempt {
  return storedHash === attempt.requestHash ? 'replayed' : 'conflict';
}
