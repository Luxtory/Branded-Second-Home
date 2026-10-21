import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  keyedPublicAttempt,
  publicAttempt,
  PublicAttemptUnverifiableError,
} from '@/features/platform/application/public-idempotency';
import type { Database } from '@/features/platform/infrastructure/database/connection';
import {
  claimPublicAttempt,
  findPublicAttempt,
} from '@/features/platform/infrastructure/idempotency/public-idempotency';
import {
  appDatabase,
  deferred,
  TEST_NOW,
  waitForLockWaiter,
} from '../../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../../support/test-database';

const HASH_KEY = { id: 'v1', secret: 's'.repeat(32) };

// Registro genérico da idempotência pública (ADR-0017) em PostgreSQL real, com o papel de aplicação.
describe('idempotência pública não crítica — registro no banco (ADR-0017)', () => {
  let database: TestDatabase;
  let db: Database;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  const claim = (attempt: ReturnType<typeof publicAttempt>) =>
    db.transaction().execute((tx) => claimPublicAttempt(tx, attempt, TEST_NOW));

  it('[TECH-056] chave nova → claimed; mesma chave e conteúdo → replayed; outro conteúdo → conflict', async () => {
    const key = randomUUID();
    const attempt = publicAttempt('widget', key, { n: 1 });

    expect(await findPublicAttempt(db, attempt)).toBeNull();
    expect(await claim(attempt)).toBe('claimed');
    expect(await findPublicAttempt(db, attempt)).toBe('replayed');
    expect(await claim(attempt)).toBe('replayed');
    expect(await claim(publicAttempt('widget', key, { n: 2 }))).toBe('conflict');
    expect(await claim(publicAttempt('other', key, { n: 2 }))).toBe('claimed');
  });

  it('[TECH-100] tentativa chaveada grava HMAC, esquema e id da chave — nunca o segredo (ADR-0018)', async () => {
    const key = randomUUID();
    const attempt = keyedPublicAttempt('widget', key, { n: 1 }, HASH_KEY);

    expect(await claim(attempt)).toBe('claimed');
    const { rows } = await database.pool.query<Record<string, unknown>>(
      `SELECT request_hash, hash_scheme, hash_key_id FROM app.public_idempotency_key
       WHERE surface = 'widget' AND idempotency_key = $1`,
      [key],
    );
    expect(rows).toEqual([
      { request_hash: attempt.requestHash, hash_scheme: 'hmac_sha256', hash_key_id: 'v1' },
    ]);
    expect(JSON.stringify(rows)).not.toContain(HASH_KEY.secret);
    expect(await claim(attempt)).toBe('replayed');
    expect(await claim(keyedPublicAttempt('widget', key, { n: 2 }, HASH_KEY))).toBe('conflict');
  });

  it('[TECH-056] registro legado sha256 e chave desconhecida, verificados pelo esquema do registro', async () => {
    const legacyKey = randomUUID();
    expect(await claim(publicAttempt('widget', legacyKey, { n: 1 }))).toBe('claimed');
    expect(
      await findPublicAttempt(db, keyedPublicAttempt('widget', legacyKey, { n: 1 }, HASH_KEY)),
    ).toBe('replayed');
    expect(
      await findPublicAttempt(db, keyedPublicAttempt('widget', legacyKey, { n: 2 }, HASH_KEY)),
    ).toBe('conflict');

    const rotatedKey = randomUUID();
    expect(await claim(keyedPublicAttempt('widget', rotatedKey, { n: 1 }, HASH_KEY))).toBe(
      'claimed',
    );
    const otherKey = { id: 'v2', secret: 'u'.repeat(32) };
    await expect(
      findPublicAttempt(db, keyedPublicAttempt('widget', rotatedKey, { n: 1 }, otherKey)),
    ).rejects.toThrow(PublicAttemptUnverifiableError);
  });

  it('[TECH-056] rollback do efeito libera a chave: recusa não consome a tentativa', async () => {
    const attempt = publicAttempt('widget', randomUUID(), { n: 1 });

    await expect(
      db.transaction().execute(async (tx) => {
        expect(await claimPublicAttempt(tx, attempt, TEST_NOW)).toBe('claimed');
        throw new Error('efeito de domínio recusado');
      }),
    ).rejects.toThrow('efeito de domínio recusado');

    expect(await findPublicAttempt(db, attempt)).toBeNull();
    expect(await claim(attempt)).toBe('claimed');
  });

  it('[TECH-056] [CONC-12] corrida: a segunda reserva espera o índice único e vira repetição', async () => {
    const attempt = publicAttempt('widget', randomUUID(), { n: 1 });
    const firstClaimed = deferred();
    const releaseFirst = deferred();

    const first = db.transaction().execute(async (tx) => {
      const result = await claimPublicAttempt(tx, attempt, TEST_NOW);
      firstClaimed.resolve();
      await releaseFirst.promise;
      return result;
    });
    await firstClaimed.promise;
    const second = claim(attempt);
    await waitForLockWaiter(database.pool);
    releaseFirst.resolve();

    expect(await first).toBe('claimed');
    expect(await second).toBe('replayed');
    const { rows } = await database.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.public_idempotency_key',
    );
    expect(rows[0]?.n).toBe(1);
  });
});
