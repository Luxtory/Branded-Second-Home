import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Actor } from '@/features/platform/application/commands/actor';
import {
  createCommandExecutor,
  MissingAuditError,
  UnregisteredCommandError,
  type CommandHandler,
} from '@/features/platform/application/commands/executor';
import type {
  AuditRecord,
  CommandGuard,
  CommandStore,
  IdempotencyEntry,
  OperationDraft,
  OutboxEventDraft,
} from '@/features/platform/application/commands/ports';
import { CommandRegistry } from '@/features/platform/application/commands/registry';
import { CommandRejection, type RejectionCode } from '@/features/platform/domain/errors';
import type { JsonValue } from '@/features/platform/domain/json';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const USER: Actor = { kind: 'user', userId: 'u-1', actingPartyId: 'p-1', role: 'admin' };
const registry = new CommandRegistry([
  {
    name: 'test_command',
    module: 'platform',
    authority: 'admin',
    membership: 'not_applicable',
    critical: false,
  },
]);

class TransientError extends Error {}
class ConstraintError extends Error {
  constructor(readonly constraint: string) {
    super(constraint);
  }
}

interface Written {
  draft: OperationDraft;
  audit: readonly AuditRecord[];
  events: readonly OutboxEventDraft[];
}

/** Store em memória: a "transação" só publica o que gravou se `work` terminar sem erro. */
class FakeStore implements CommandStore<string> {
  readonly records = new Map<string, IdempotencyEntry>();
  readonly committed: Written[] = [];
  readonly rejected: OperationDraft[] = [];
  transientFailures = 0;
  // Simula outra transação que comita a mesma chave no instante da reserva ou da recusa.
  concurrentWinner: IdempotencyEntry | null = null;
  private staged: IdempotencyEntry | null = null;

  findIdempotency(scope: string, key: string) {
    return Promise.resolve(this.records.get(`${scope}|${key}`) ?? null);
  }

  async transaction<T>(_lockTimeoutMs: number, work: (tx: string) => Promise<T>): Promise<T> {
    if (this.transientFailures > 0) {
      this.transientFailures -= 1;
      throw new TransientError('deadlock');
    }
    const result = await work('tx');
    return result;
  }

  reserve(_tx: string, draft: OperationDraft) {
    if (this.concurrentWinner !== null) {
      this.records.set(`${draft.scope}|${draft.idempotencyKey}`, this.concurrentWinner);
      return Promise.resolve(false);
    }
    this.staged = {
      command: draft.command,
      requestHash: draft.requestHash,
      requestHashKeyId: draft.requestHashKeyId,
      operationId: draft.id,
      response: null,
    };
    return Promise.resolve(true);
  }

  complete(
    _tx: string,
    draft: OperationDraft,
    result: JsonValue,
    audit: readonly AuditRecord[],
    events: readonly OutboxEventDraft[],
  ) {
    const staged = {
      ...(this.staged as IdempotencyEntry),
      response: { outcome: 'committed' as const, result },
    };
    this.records.set(`${draft.scope}|${draft.idempotencyKey}`, staged);
    this.committed.push({ draft, audit, events });
    return Promise.resolve();
  }

  recordRejection(draft: OperationDraft, code: RejectionCode) {
    if (this.concurrentWinner !== null) {
      this.records.set(`${draft.scope}|${draft.idempotencyKey}`, this.concurrentWinner);
      return Promise.resolve(false);
    }
    this.records.set(`${draft.scope}|${draft.idempotencyKey}`, {
      command: draft.command,
      requestHash: draft.requestHash,
      requestHashKeyId: draft.requestHashKeyId,
      operationId: draft.id,
      response: { outcome: 'rejected', code },
    });
    this.rejected.push(draft);
    return Promise.resolve(true);
  }

  isTransient(error: unknown) {
    return error instanceof TransientError;
  }

  violatedConstraint(error: unknown) {
    return error instanceof ConstraintError ? error.constraint : null;
  }
}

const allow: CommandGuard = {
  authorize: () => Promise.resolve({ allowed: true, authorizationRef: 'base:test' }),
};

function setup(options: { guard?: CommandGuard; maxAttempts?: number } = {}) {
  const store = new FakeStore();
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let id = 0;
  const executor = createCommandExecutor({
    store,
    guard: options.guard ?? allow,
    clock: { now: () => NOW },
    limits: { maxAttempts: options.maxAttempts ?? 3, lockTimeoutMs: 100 },
    log,
    registry,
    newId: () => `op-${(id += 1)}`,
  });
  return { store, log, executor };
}

type Behavior = (
  context: Parameters<CommandHandler<{ n: number }, JsonValue, string>['execute']>[0],
) => Promise<JsonValue>;

function handler(behavior?: Behavior): CommandHandler<{ n: number }, JsonValue, string> {
  return {
    command: 'test_command',
    input: z.object({ n: z.number() }),
    secondHomeId: () => 'r-1',
    execute:
      behavior ??
      ((context) => {
        context.audit({
          objectType: 'widget',
          objectId: 'w-1',
          before: null,
          after: { nome: 'x', n: context.input.n },
        });
        context.emit({
          type: 'platform.widget_changed',
          dedupKey: `w-1:${context.operationId}`,
          payload: { email: 'a@b.c' },
        });
        return Promise.resolve({ doubled: context.input.n * 2 });
      }),
  };
}

const request = (input: unknown, idempotencyKey = 'key-1') => ({
  actor: USER,
  idempotencyKey,
  correlationId: 'corr-1',
  input,
});

describe('executor de commands (TECH-054)', () => {
  it('[ADR-0021] contexto recebe somente authorizationRef da decisão do servidor', async () => {
    const { executor } = setup();
    const outcome = await executor.execute(
      handler(async (context) => {
        context.audit({ objectType: 'widget', objectId: 'w', before: null, after: null });
        return { authorizationRef: context.authorizationRef };
      }),
      request({ n: 1, authorizationRef: 'staff_role:forged' }),
    );
    expect(outcome).toMatchObject({ result: { authorizationRef: 'base:test' } });
  });

  it('[ADR-0021] preflight opt-in após guard e antes de idempotência, incluindo replay', async () => {
    const { executor, store } = setup();
    await executor.execute(handler(), request({ n: 1 }));
    const lookup = vi.spyOn(store, 'findIdempotency');
    const reserve = vi.spyOn(store, 'reserve');
    const unavailable = new Error('closed');
    const assertAvailable = vi.fn(() => {
      throw unavailable;
    });
    await expect(
      executor.execute({ ...handler(), assertAvailable }, request({ n: 1 })),
    ).rejects.toBe(unavailable);
    expect(assertAvailable).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(store.committed).toHaveLength(1);
    expect(store.rejected).toHaveLength(0);
  });

  it('[ADR-0021] guard negando nunca chama preflight; callback assíncrono termina antes do lookup', async () => {
    const denied = setup({ guard: { authorize: () => Promise.resolve({ allowed: false }) } });
    const assertAvailable = vi.fn();
    expect(
      await denied.executor.execute({ ...handler(), assertAvailable }, request({ n: 1 })),
    ).toMatchObject({ code: 'ERR_PERMISSION' });
    expect(assertAvailable).not.toHaveBeenCalled();
    const allowed = setup();
    const order: string[] = [];
    const lookup = allowed.store.findIdempotency.bind(allowed.store);
    vi.spyOn(allowed.store, 'findIdempotency').mockImplementation(async (...args) => {
      order.push('lookup');
      return lookup(...args);
    });
    await allowed.executor.execute(
      {
        ...handler(),
        assertAvailable: async () => {
          await Promise.resolve();
          order.push('available');
        },
      },
      request({ n: 1 }),
    );
    expect(order).toEqual(['available', 'lookup']);
  });

  it('[REQ-015] comita com operation, auditoria e eventos; antes/depois e payload sem dado pessoal bruto', async () => {
    const { store, executor } = setup();

    const outcome = await executor.execute(handler(), request({ n: 2 }));

    expect(outcome).toEqual({
      status: 'committed',
      operationId: 'op-1',
      result: { doubled: 4 },
      replayed: false,
    });
    const [written] = store.committed;
    expect(written?.draft).toMatchObject({
      command: 'test_command',
      secondHomeId: 'r-1',
      authorizationRef: 'base:test',
      at: NOW,
    });
    expect(written?.audit).toEqual([
      { objectType: 'widget', objectId: 'w-1', before: null, after: { nome: '[redacted]', n: 2 } },
    ]);
    expect(written?.events[0]?.payload).toEqual({ email: '[redacted]' });
  });

  it('[ADR-006] mesma chave e mesmo payload repetem a resposta sem nova operação', async () => {
    const { store, executor } = setup();
    await executor.execute(handler(), request({ n: 2 }));

    const replay = await executor.execute(handler(), request({ n: 2 }));

    expect(replay).toEqual({
      status: 'committed',
      operationId: 'op-1',
      result: { doubled: 4 },
      replayed: true,
    });
    expect(store.committed).toHaveLength(1);
  });

  it('[ADR-006] mesma chave com payload diferente → ERR_IDEMPOTENCY_CONFLICT', async () => {
    const { executor } = setup();
    await executor.execute(handler(), request({ n: 2 }));

    const conflict = await executor.execute(handler(), request({ n: 3 }));

    expect(conflict).toMatchObject({
      status: 'rejected',
      code: 'ERR_IDEMPOTENCY_CONFLICT',
      operationId: null,
    });
  });

  it('input inválido, chave inválida e guard negando recusam antes de qualquer escrita', async () => {
    const deny: CommandGuard = { authorize: () => Promise.resolve({ allowed: false }) };
    const { store, executor } = setup();
    const denied = setup({ guard: deny });

    expect(await executor.execute(handler(), request({ n: 'x' }))).toMatchObject({
      code: 'ERR_VALIDATION',
    });
    expect(await executor.execute(handler(), request({ n: 1 }, 'chave com espaço'))).toMatchObject({
      code: 'ERR_VALIDATION',
    });
    expect(await denied.executor.execute(handler(), request({ n: 1 }))).toMatchObject({
      code: 'ERR_PERMISSION',
    });
    expect(store.records.size + denied.store.records.size).toBe(0);
  });

  it('[REQ-098] recusa do handler grava a operação como falha e o replay repete a recusa', async () => {
    const { store, executor } = setup();
    const refusing = handler(() => Promise.reject(new CommandRejection('ERR_WINDOW_NOT_OPEN')));

    const first = await executor.execute(refusing, request({ n: 1 }));
    const replay = await executor.execute(handler(), request({ n: 1 }));

    expect(first).toEqual({
      status: 'rejected',
      operationId: 'op-1',
      code: 'ERR_WINDOW_NOT_OPEN',
      replayed: false,
    });
    expect(replay).toEqual({
      status: 'rejected',
      operationId: 'op-1',
      code: 'ERR_WINDOW_NOT_OPEN',
      replayed: true,
    });
    expect(store.rejected).toHaveLength(1);
    expect(store.committed).toHaveLength(0);
  });

  it('[TECH-056] violação de constraint conhecida vira recusa; desconhecida propaga', async () => {
    const { executor } = setup();
    const occupancy = handler(() => Promise.reject(new ConstraintError('occupancy_unique')));
    const unknown = handler(() => Promise.reject(new ConstraintError('operation_actor_check')));

    expect(await executor.execute(occupancy, request({ n: 1 }))).toMatchObject({
      code: 'ERR_BOOKING_CONFLICT',
    });
    await expect(executor.execute(unknown, request({ n: 1 }, 'key-2'))).rejects.toThrow(
      ConstraintError,
    );
  });

  it('[TECH-053] deadlock/timeout refaz com a mesma chave até o limite', async () => {
    const retried = setup({ maxAttempts: 3 });
    retried.store.transientFailures = 2;
    const exhausted = setup({ maxAttempts: 2 });
    exhausted.store.transientFailures = 5;

    expect(await retried.executor.execute(handler(), request({ n: 1 }))).toMatchObject({
      status: 'committed',
      operationId: 'op-1',
    });
    expect(retried.log.warn).toHaveBeenCalledTimes(2);
    expect(await exhausted.executor.execute(handler(), request({ n: 1 }))).toMatchObject({
      code: 'ERR_UNAVAILABLE',
    });
    expect(exhausted.log.error).toHaveBeenCalledWith(
      'command retries exhausted',
      expect.objectContaining({ attempt: 2 }),
    );
  });

  it('chave reservada por outra transação: devolve o resultado dela, sem efeito próprio', async () => {
    const { store, executor } = setup();
    const winner = handler();
    store.concurrentWinner = {
      command: 'test_command',
      requestHash: '',
      requestHashKeyId: null,
      operationId: 'op-winner',
      response: { outcome: 'committed', result: { doubled: 2 } },
    };
    // O hash do vencedor é o mesmo desta requisição: mesma chave, mesmo payload.
    const probe = setup();
    await probe.executor.execute(winner, request({ n: 1 }));
    const [probeRecord] = probe.store.records.values();
    store.concurrentWinner = {
      ...store.concurrentWinner,
      requestHash: probeRecord?.requestHash ?? '',
    };

    const committedRace = await executor.execute(winner, request({ n: 1 }));
    const rejectedRace = await executor.execute(
      handler(() => Promise.reject(new CommandRejection('ERR_CAPACITY_UNAVAILABLE'))),
      request({ n: 1 }, 'key-2'),
    );

    expect(committedRace).toEqual({
      status: 'committed',
      operationId: 'op-winner',
      result: { doubled: 2 },
      replayed: true,
    });
    expect(rejectedRace).toMatchObject({
      status: 'committed',
      operationId: 'op-winner',
      replayed: true,
    });
    expect(store.committed).toHaveLength(0);
  });

  it('[REQ-015] command sem registro de auditoria não comita', async () => {
    const { store, executor } = setup();

    await expect(
      executor.execute(
        handler(() => Promise.resolve(null)),
        request({ n: 1 }),
      ),
    ).rejects.toThrow(MissingAuditError);
    expect(store.committed).toHaveLength(0);
  });

  it('[TECH-051] handler de command fora do registro é recusado', async () => {
    const { executor } = setup();

    await expect(
      executor.execute({ ...handler(), command: 'drop_everything' }, request({ n: 1 })),
    ).rejects.toThrow(UnregisteredCommandError);
  });

  it('registro de idempotência sem resposta é corrupção, nunca replay', async () => {
    const { store, executor } = setup();
    store.records.set('user:u-1|key-1', {
      command: 'test_command',
      requestHash: 'x',
      requestHashKeyId: null,
      operationId: 'op-x',
      response: null,
    });
    const probe = setup();
    await probe.executor.execute(handler(), request({ n: 1 }));
    const [record] = probe.store.records.values();
    store.records.set('user:u-1|key-1', {
      command: 'test_command',
      requestHash: record?.requestHash ?? '',
      requestHashKeyId: null,
      operationId: 'op-x',
      response: null,
    });

    await expect(executor.execute(handler(), request({ n: 1 }))).rejects.toThrow(
      /without response/,
    );
  });

  describe('[ADR-0020] hash de idempotência pseudonimizado por chave (rotação)', () => {
    // Pseudônimo de teste: a "chave" entra no valor — trocar a chave muda o pseudônimo, como no HMAC real.
    const keys = new Set(['h1', 'h2']);
    const fingerprinted = (active: string) => ({
      ...handler(),
      fingerprint: {
        activeKeyId: () => active,
        payload: (input: { n: number }, keyId: string) => {
          if (!keys.has(keyId)) throw new Error(`key ${keyId} unavailable`);
          return { n: `${keyId}:${input.n}` };
        },
      },
    });

    it('[ADR-0020] mesma chave + mesmo payload depois da troca da chave ativa → replay; o registro guarda a chave', async () => {
      const { store, executor } = setup();

      const first = await executor.execute(fingerprinted('h1'), request({ n: 1 }));
      const replay = await executor.execute(fingerprinted('h2'), request({ n: 1 }));

      expect(first).toMatchObject({ status: 'committed', replayed: false });
      expect(replay).toMatchObject({ status: 'committed', replayed: true, result: { doubled: 2 } });
      expect([...store.records.values()][0]).toMatchObject({ requestHashKeyId: 'h1' });
      expect(store.committed).toHaveLength(1);
    });

    it('[ADR-0020] payload realmente diferente depois da rotação → ERR_IDEMPOTENCY_CONFLICT', async () => {
      const { executor } = setup();
      await executor.execute(fingerprinted('h1'), request({ n: 1 }));

      await expect(executor.execute(fingerprinted('h2'), request({ n: 2 }))).resolves.toMatchObject(
        {
          status: 'rejected',
          code: 'ERR_IDEMPOTENCY_CONFLICT',
        },
      );
    });

    it('[ADR-0020] chave histórica fora do anel → falha fechada, nunca replay falso', async () => {
      const { executor } = setup();
      await executor.execute(fingerprinted('h1'), request({ n: 1 }));
      keys.delete('h1');

      await expect(executor.execute(fingerprinted('h2'), request({ n: 1 }))).rejects.toThrow(
        /key h1 unavailable/,
      );
      keys.add('h1');
    });
  });
});
