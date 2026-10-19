import { describe, expect, it } from 'vitest';
import {
  isPublicIdempotencyKey,
  priorAttempt,
  publicAttempt,
} from '@/features/platform/application/public-idempotency';

// Idempotência de mutações públicas não críticas (ADR-0017): chave UUID, hash canônico e decisão de repetição.
const KEY = '0F8B8A4E-3C1D-4F6A-9B2E-7D5C4B3A2F10';

describe('idempotência pública não crítica (ADR-0017)', () => {
  it('[TECH-056] só UUID é chave pública: chave curta ou previsível colidiria entre visitantes', () => {
    expect(isPublicIdempotencyKey(KEY)).toBe(true);
    expect(isPublicIdempotencyKey(KEY.toLowerCase())).toBe(true);
    expect(isPublicIdempotencyKey('1')).toBe(false);
    expect(isPublicIdempotencyKey('')).toBe(false);
    expect(isPublicIdempotencyKey(`${KEY} `)).toBe(false);
    expect(isPublicIdempotencyKey('0f8b8a4e3c1d4f6a9b2e7d5c4b3a2f10')).toBe(false);
  });

  it('[TECH-056] mesmo conteúdo em qualquer ordem de chaves → mesmo hash; a superfície entra no hash', () => {
    const first = publicAttempt('interest', KEY, { a: 1, b: { c: 2, d: 3 } });
    const reordered = publicAttempt('interest', KEY, { b: { d: 3, c: 2 }, a: 1 });

    expect(first.key).toBe(KEY.toLowerCase());
    expect(first.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered.requestHash).toBe(first.requestHash);
    expect(publicAttempt('other', KEY, { a: 1, b: { c: 2, d: 3 } }).requestHash).not.toBe(
      first.requestHash,
    );
    expect(publicAttempt('interest', KEY, { a: 2 }).requestHash).not.toBe(first.requestHash);
  });

  it('[TECH-056] chave já usada: mesmo hash → repetição; outro hash → conflito', () => {
    const attempt = publicAttempt('interest', KEY, { a: 1 });

    expect(priorAttempt(attempt.requestHash, attempt)).toBe('replayed');
    expect(priorAttempt('0'.repeat(64), attempt)).toBe('conflict');
  });
});
