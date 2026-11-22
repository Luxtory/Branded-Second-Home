import { describe, expect, it, vi } from 'vitest';
import {
  expireCreditLotKey,
  runExpireCreditLots,
} from '@/features/credits/application/expire-credit-lots';
import { captureLogger } from '../../support/capture-logger';

describe('job expire_credit_lots (TECH-090)', () => {
  it('uma chave por lote e execução; já materializado conta como ignorado; falha só vai ao log', async () => {
    const log = captureLogger();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'committed',
        operationId: 'o1',
        result: {},
        replayed: false,
      })
      .mockResolvedValueOnce({
        status: 'rejected',
        operationId: null,
        code: 'ERR_STATE_TRANSITION',
        replayed: false,
      })
      .mockResolvedValueOnce({
        status: 'rejected',
        operationId: null,
        code: 'ERR_PERMISSION',
        replayed: false,
      })
      .mockRejectedValueOnce(new TypeError('boom'));
    const result = await runExpireCreditLots(
      {
        dueLots: async () => ['l1', 'l2', 'l3', 'l4'],
        execute,
        log: log.logger,
        timeBudgetMs: 60_000,
        monotonicMs: () => 0,
      },
      { correlationId: 'corr' },
    );
    expect(result).toEqual({ due: 4, expired: 1, skipped: 1, failed: 2, deferred: 0 });
    expect(execute.mock.calls[0]![0]).toMatchObject({
      actor: { kind: 'system', job: 'expire_credit_lots' },
      idempotencyKey: expireCreditLotKey('l1', 'corr'),
      input: { lot_id: 'l1' },
    });
    expect(JSON.stringify(log.entries())).not.toMatch(/quantity|party/);
  });

  it('orçamento esgotado adia o restante para a próxima execução', async () => {
    const log = captureLogger();
    let clock = 0;
    const result = await runExpireCreditLots(
      {
        dueLots: async () => ['l1', 'l2', 'l3'],
        execute: async () => {
          clock += 100;
          return {
            status: 'committed',
            operationId: 'o',
            result: { lot_id: 'x', entry_id: 'y', quantity: '1' },
            replayed: false,
          };
        },
        log: log.logger,
        timeBudgetMs: 150,
        monotonicMs: () => clock,
      },
      { correlationId: 'corr' },
    );
    expect(result).toEqual({ due: 3, expired: 2, skipped: 0, failed: 0, deferred: 1 });
  });
});
