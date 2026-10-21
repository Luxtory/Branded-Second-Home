import { createHash, createHmac } from 'node:crypto';
import { actorRole, type Actor } from './actor';

// Mesmo conteúdo → mesmo texto, qualquer que seja a ordem das chaves.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
  return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]));
}

/**
 * "Payload" do ADR-006 do `03`: command, parte representada, papel e input validado. Mesma chave com hash diferente
 * → `ERR_IDEMPOTENCY_CONFLICT`.
 */
export function requestHash(command: string, actor: Actor, input: unknown): string {
  return canonicalHash({
    command,
    acting_party_id: actor.kind === 'user' ? actor.actingPartyId : null,
    role: actorRole(actor),
    input,
  });
}

/** SHA-256 (hex) do JSON canônico — chaves ordenadas — de `payload`. */
export function canonicalHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}

/** HMAC-SHA-256 (hex) do mesmo JSON canônico, com `secret` (ADR-0018): derivado pseudonimizado, nunca anônimo. */
export function keyedCanonicalHash(secret: string, payload: unknown): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}
