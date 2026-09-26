import { describe, expect, it } from 'vitest';
import { idempotencyScope, type Actor } from '@/features/platform/application/commands/actor';
import { requestHash } from '@/features/platform/application/commands/request-hash';

const ADMIN: Actor = { kind: 'user', userId: 'u-1', actingPartyId: 'p-1', role: 'admin' };

describe('idempotência (ADR-006)', () => {
  it('[ADR-006] o hash não depende da ordem das chaves do input', () => {
    const a = requestHash('set_parameter', ADMIN, { key: 'x', value: { b: 1, a: [2, 3] } });
    const b = requestHash('set_parameter', ADMIN, { value: { a: [2, 3], b: 1 }, key: 'x' });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('[ADR-006] command, parte representada, papel e input mudam o hash', () => {
    const base = requestHash('set_parameter', ADMIN, { key: 'x' });

    expect(requestHash('publish_policy', ADMIN, { key: 'x' })).not.toBe(base);
    expect(requestHash('set_parameter', { ...ADMIN, actingPartyId: 'p-2' }, { key: 'x' })).not.toBe(
      base,
    );
    expect(requestHash('set_parameter', { ...ADMIN, role: 'super_admin' }, { key: 'x' })).not.toBe(
      base,
    );
    expect(requestHash('set_parameter', ADMIN, { key: 'y' })).not.toBe(base);
  });

  it('[ADR-006] escopo da chave = ator: usuário ou job', () => {
    expect(idempotencyScope(ADMIN)).toBe('user:u-1');
    expect(idempotencyScope({ kind: 'system', job: 'outbox' })).toBe('system:outbox');
    expect(
      requestHash(
        'reverse_credit',
        { kind: 'system', job: 'expire_credit_lots' },
        { at: new Date(0) },
      ),
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
