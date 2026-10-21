import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isPublicIdempotencyKey,
  keyedPublicAttempt,
  priorAttempt,
  publicAttempt,
  PublicAttemptUnverifiableError,
  type PublicHashKey,
} from '@/features/platform/application/public-idempotency';

// Idempotência de mutações públicas não críticas (ADR-0017): chave UUID, hash canônico e decisão de repetição; desde a
// W6, hash chaveado com o esquema e a chave identificados por registro (ADR-0018).
const ATTEMPT_ID = '0F8B8A4E-3C1D-4F6A-9B2E-7D5C4B3A2F10';
const KEY_V1: PublicHashKey = { id: 'v1', secret: 's'.repeat(32) };
const OTHER_SECRET: PublicHashKey = { id: 'v1', secret: 't'.repeat(32) };
// JSON canônico (chaves ordenadas) de `{ surface: 'interest', input: { a: 1 } }`.
const CANONICAL = '{"input":{"a":1},"surface":"interest"}';

describe('idempotência pública não crítica (ADR-0017)', () => {
  it('[TECH-056] só UUID é chave pública: chave curta ou previsível colidiria entre visitantes', () => {
    expect(isPublicIdempotencyKey(ATTEMPT_ID)).toBe(true);
    expect(isPublicIdempotencyKey(ATTEMPT_ID.toLowerCase())).toBe(true);
    expect(isPublicIdempotencyKey('1')).toBe(false);
    expect(isPublicIdempotencyKey('')).toBe(false);
    expect(isPublicIdempotencyKey(`${ATTEMPT_ID} `)).toBe(false);
    expect(isPublicIdempotencyKey('0f8b8a4e3c1d4f6a9b2e7d5c4b3a2f10')).toBe(false);
  });

  it('[TECH-056] mesmo conteúdo em qualquer ordem de chaves → mesmo hash; a superfície entra no hash', () => {
    const first = publicAttempt('interest', ATTEMPT_ID, { a: 1, b: { c: 2, d: 3 } });
    const reordered = publicAttempt('interest', ATTEMPT_ID, { b: { d: 3, c: 2 }, a: 1 });

    expect(first.key).toBe(ATTEMPT_ID.toLowerCase());
    expect(first.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered.requestHash).toBe(first.requestHash);
    expect(publicAttempt('other', ATTEMPT_ID, { a: 1, b: { c: 2, d: 3 } }).requestHash).not.toBe(
      first.requestHash,
    );
    expect(publicAttempt('interest', ATTEMPT_ID, { a: 2 }).requestHash).not.toBe(first.requestHash);
  });

  it('[TECH-056] chave já usada: mesmo hash → repetição; outro hash → conflito', () => {
    const attempt = publicAttempt('interest', ATTEMPT_ID, { a: 1 });
    const stored = {
      requestHash: attempt.requestHash,
      hashScheme: 'sha256',
      hashKeyId: null,
    } as const;

    expect(priorAttempt(stored, attempt)).toBe('replayed');
    expect(priorAttempt({ ...stored, requestHash: '0'.repeat(64) }, attempt)).toBe('conflict');
  });
});

describe('hash chaveado com esquema por registro (ADR-0018)', () => {
  it('[TECH-100] sem chave, o esquema é SHA-256 do JSON canônico, sem identificador de chave (W5)', () => {
    const attempt = publicAttempt('interest', ATTEMPT_ID, { a: 1 });

    expect(attempt.hashScheme).toBe('sha256');
    expect(attempt.hashKeyId).toBeNull();
    expect(attempt.requestHash).toBe(createHash('sha256').update(CANONICAL).digest('hex'));
  });

  it('[TECH-100] com chave, o hash é HMAC-SHA-256 hexadecimal do mesmo JSON canônico, com o id da chave', () => {
    const attempt = keyedPublicAttempt('interest', ATTEMPT_ID, { a: 1 }, KEY_V1);

    expect(attempt.key).toBe(ATTEMPT_ID.toLowerCase());
    expect(attempt.hashScheme).toBe('hmac_sha256');
    expect(attempt.hashKeyId).toBe('v1');
    expect(attempt.requestHash).toBe(
      createHmac('sha256', KEY_V1.secret).update(CANONICAL).digest('hex'),
    );
    expect(attempt.requestHash).not.toBe(
      publicAttempt('interest', ATTEMPT_ID, { a: 1 }).requestHash,
    );
    expect(keyedPublicAttempt('interest', ATTEMPT_ID, { a: 1 }, OTHER_SECRET).requestHash).not.toBe(
      attempt.requestHash,
    );
  });

  it('[TECH-056] registro HMAC da mesma chave: mesmo conteúdo → repetição; outro conteúdo → conflito', () => {
    const attempt = keyedPublicAttempt('interest', ATTEMPT_ID, { a: 1 }, KEY_V1);
    const stored = {
      requestHash: attempt.requestHash,
      hashScheme: 'hmac_sha256',
      hashKeyId: 'v1',
    } as const;
    const changed = keyedPublicAttempt('interest', ATTEMPT_ID, { a: 2 }, KEY_V1);

    expect(priorAttempt(stored, attempt)).toBe('replayed');
    expect(priorAttempt(stored, changed)).toBe('conflict');
  });

  it('[TECH-056] registro legado SHA-256 (W5) mantém a semântica do ADR-0017 numa tentativa chaveada', () => {
    const legacy = publicAttempt('interest', ATTEMPT_ID, { a: 1 });
    const stored = {
      requestHash: legacy.requestHash,
      hashScheme: 'sha256',
      hashKeyId: null,
    } as const;

    expect(priorAttempt(stored, keyedPublicAttempt('interest', ATTEMPT_ID, { a: 1 }, KEY_V1))).toBe(
      'replayed',
    );
    expect(priorAttempt(stored, keyedPublicAttempt('interest', ATTEMPT_ID, { a: 2 }, KEY_V1))).toBe(
      'conflict',
    );
  });

  it('[TECH-056] chave do registro desconhecida → não verificável: nunca repetição nem conflito', () => {
    const attempt = keyedPublicAttempt('interest', ATTEMPT_ID, { a: 1 }, KEY_V1);
    const rotated = {
      requestHash: attempt.requestHash,
      hashScheme: 'hmac_sha256',
      hashKeyId: 'v2',
    } as const;

    expect(() => priorAttempt(rotated, attempt)).toThrow(PublicAttemptUnverifiableError);
    expect(() =>
      priorAttempt(
        { ...rotated, hashKeyId: 'v1' },
        publicAttempt('interest', ATTEMPT_ID, { a: 1 }),
      ),
    ).toThrow(PublicAttemptUnverifiableError);
  });

  it('[TECH-100] a tentativa não expõe o segredo', () => {
    const attempt = keyedPublicAttempt('interest', ATTEMPT_ID, { a: 1 }, KEY_V1);

    expect(JSON.stringify(attempt)).not.toContain(KEY_V1.secret);
  });
});
