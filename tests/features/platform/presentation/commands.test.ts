import { describe, expect, it, vi } from 'vitest';
import { commandResponse, idempotencyKey } from '@/features/platform/presentation/commands';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const options = (afterCommit = vi.fn()) => ({
  correlationId: 'corr-12345678',
  successStatus: 201,
  log,
  afterCommit,
});

describe('resposta HTTP de command (TECH-056, ADR-006)', () => {
  it('[TECH-056] commit novo devolve o resultado e agenda o outbox (TECH-091)', async () => {
    const afterCommit = vi.fn();
    const response = commandResponse(
      { status: 'committed', operationId: 'op', result: { id: 'x' }, replayed: false },
      options(afterCommit),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('idempotency-replayed')).toBeNull();
    await expect(response.json()).resolves.toEqual({ id: 'x' });
    expect(afterCommit).toHaveBeenCalledWith(log);
  });

  it('[ADR-006] repetição devolve a mesma resposta marcada, sem novo disparo', async () => {
    const afterCommit = vi.fn();
    const response = commandResponse(
      { status: 'committed', operationId: 'op', result: { id: 'x' }, replayed: true },
      options(afterCommit),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('idempotency-replayed')).toBe('true');
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('[REQ-098] recusa vira o schema Error com a causa em pt-BR e o status do código', async () => {
    const response = commandResponse(
      { status: 'rejected', operationId: null, code: 'ERR_PERMISSION', replayed: false },
      options(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'ERR_PERMISSION',
      correlation_id: 'corr-12345678',
    });
  });

  it('[TECH-056] Idempotency-Key ausente vira chave vazia (o executor recusa com ERR_VALIDATION)', () => {
    expect(idempotencyKey(new Request('http://x.test'))).toBe('');
    expect(
      idempotencyKey(new Request('http://x.test', { headers: { 'Idempotency-Key': 'k-1' } })),
    ).toBe('k-1');
  });
});
