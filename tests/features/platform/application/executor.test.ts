import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Actor } from '@/features/platform/application/commands/actor';
import {
  createCommandExecutor,
  MembershipCheckError,
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
import {
  CapabilityNotActivatedError,
  CommandRejection,
  type RejectionCode,
} from '@/features/platform/domain/errors';
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
class PrivilegeError extends Error {
  constructor(readonly constraint: string | null) {
    super(constraint ?? 'permission denied');
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

  refusedPrivilege(error: unknown) {
    return error instanceof PrivilegeError ? error.constraint : null;
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

  it('[G-E4-1] limite depois do guard e da consulta de idempotência; replay de chave concluída não consome o limite', async () => {
    const { store, executor } = setup();
    const order: string[] = [];
    const lookup = store.findIdempotency.bind(store);
    vi.spyOn(store, 'findIdempotency').mockImplementation(async (...args) => {
      order.push('lookup');
      return lookup(...args);
    });
    const allowed = vi.fn(async (ref: string | null) => {
      order.push(`quota:${ref}`);
      return 'allowed' as const;
    });
    const first = await executor.execute(
      { ...handler(), consumeQuota: allowed },
      request({ n: 1 }),
    );
    expect(first).toMatchObject({ status: 'committed', replayed: false });
    expect(order).toEqual(['lookup', 'quota:base:test']);
    const limited = vi.fn(async () => 'limited' as const);
    const again = await executor.execute(
      { ...handler(), consumeQuota: limited },
      request({ n: 1 }),
    );
    expect(again).toMatchObject({ status: 'committed', replayed: true, result: { doubled: 2 } });
    expect(limited).not.toHaveBeenCalled();
  });

  it('[G-E4-1] limite esgotado → ERR_RATE_LIMITED; limitador indisponível → ERR_UNAVAILABLE; nada gravado, chave livre', async () => {
    const { store, executor } = setup();
    const reserve = vi.spyOn(store, 'reserve');
    const before = { committed: store.committed.length, rejected: store.rejected.length };
    expect(
      await executor.execute(
        { ...handler(), consumeQuota: async () => 'limited' },
        request({ n: 1 }),
      ),
    ).toEqual({ status: 'rejected', operationId: null, code: 'ERR_RATE_LIMITED', replayed: false });
    expect(
      await executor.execute(
        { ...handler(), consumeQuota: async () => 'unavailable' },
        request({ n: 1 }),
      ),
    ).toEqual({ status: 'rejected', operationId: null, code: 'ERR_UNAVAILABLE', replayed: false });
    expect(
      await executor.execute(
        { ...handler(), consumeQuota: async () => 'parameter_missing' },
        request({ n: 1 }),
      ),
    ).toEqual({
      status: 'rejected',
      operationId: null,
      code: 'ERR_PARAMETER_MISSING',
      replayed: false,
    });
    expect(reserve).not.toHaveBeenCalled();
    expect({ committed: store.committed.length, rejected: store.rejected.length }).toEqual(before);
    // A mesma chave continua utilizável depois da recusa por limite.
    expect(
      await executor.execute(
        { ...handler(), consumeQuota: async () => 'allowed' },
        request({ n: 1 }),
      ),
    ).toMatchObject({ status: 'committed', replayed: false });
    const denied = setup({ guard: { authorize: () => Promise.resolve({ allowed: false }) } });
    const quota = vi.fn(async () => 'allowed' as const);
    expect(
      await denied.executor.execute({ ...handler(), consumeQuota: quota }, request({ n: 1 })),
    ).toMatchObject({ code: 'ERR_PERMISSION' });
    expect(quota).not.toHaveBeenCalled();
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

  it('[TECH-056] 42501 só vira recusa pelo nome exato da lista fechada; o resto é falha técnica (spec booking §10.12)', async () => {
    const { executor, store } = setup();
    const refused = handler(() =>
      Promise.reject(new PrivilegeError('permission_authorization_expired')),
    );
    const prefixOnly = handler(() => Promise.reject(new PrivilegeError('permission_other')));
    const technical = handler(() =>
      Promise.reject(new PrivilegeError('use_right_correction_not_enabled')),
    );
    const unnamed = handler(() => Promise.reject(new PrivilegeError(null)));

    expect(await executor.execute(refused, request({ n: 1 }))).toMatchObject({
      status: 'rejected',
      code: 'ERR_PERMISSION',
      replayed: false,
    });
    expect(await executor.execute(refused, request({ n: 1 }))).toMatchObject({
      code: 'ERR_PERMISSION',
      replayed: true,
    });
    for (const [i, failing] of [prefixOnly, technical, unnamed].entries())
      await expect(executor.execute(failing, request({ n: 1 }, `tech-${i}`))).rejects.toThrow(
        PrivilegeError,
      );
    expect(store.rejected).toHaveLength(1);
  });

  it('[ADR-0027 §5] capability fechada no banco: erro tipado, sem operação, recusa ou evento; a chave fica livre', async () => {
    const { executor, store } = setup();
    const closed = handler(() =>
      Promise.reject(new PrivilegeError('booking_lifecycle_not_activated')),
    );

    await expect(executor.execute(closed, request({ n: 1 }))).rejects.toEqual(
      new CapabilityNotActivatedError('own_use_lifecycle'),
    );
    expect(store.rejected).toHaveLength(0);
    expect(store.committed).toHaveLength(0);
    expect(store.records.size).toBe(0);
    expect(await executor.execute(handler(), request({ n: 1 }))).toMatchObject({
      status: 'committed',
    });
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

describe('verificação do Membership no executor (W15, REQ-011, TECH-050, TECH-051; ADR-0031 §5)', () => {
  const TITULAR: Actor = { kind: 'user', userId: 'u-2', actingPartyId: 'p-2', role: 'titular' };
  const spec = (name: string, membership: 'eligible' | 'not_required' | 'not_applicable') => ({
    name,
    module: 'luxchange' as const,
    authority: 'titular' as const,
    membership,
    critical: true,
  });
  const membershipRegistry = new CommandRegistry([
    spec('test_eligible', 'eligible'),
    spec('test_not_required', 'not_required'),
    spec('test_not_applicable', 'not_applicable'),
  ]);

  /** Gate em memória: devolve as parties fora de `active` e registra as chaves na ordem recebida. */
  function gate(active: readonly string[]) {
    const calls: (readonly string[])[] = [];
    return {
      calls,
      port: {
        ineligible: (_tx: string, partyIds: readonly string[]) => {
          calls.push(partyIds);
          return Promise.resolve(partyIds.filter((party) => !active.includes(party)));
        },
      },
    };
  }

  function membershipSetup(active: readonly string[] | null) {
    const store = new FakeStore();
    const g = gate(active ?? []);
    const executor = createCommandExecutor({
      store,
      guard: allow,
      clock: { now: () => NOW },
      limits: { maxAttempts: 1, lockTimeoutMs: 100 },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registry: membershipRegistry,
      ...(active === null ? {} : { membership: g.port }),
    });
    return { store, gate: g, executor };
  }

  const command = (
    name: string,
    behavior: (
      context: Parameters<CommandHandler<{ n: number }, JsonValue, string>['execute']>[0],
    ) => Promise<void>,
  ): CommandHandler<{ n: number }, JsonValue, string> => ({
    command: name,
    input: z.object({ n: z.number() }),
    async execute(context) {
      await behavior(context);
      context.audit({
        objectType: 'test',
        objectId: 't-1',
        before: null,
        after: { n: context.input.n },
      });
      return { ok: true };
    },
  });
  const asTitular = {
    actor: TITULAR,
    idempotencyKey: 'k-1',
    correlationId: 'c-1',
    input: { n: 1 },
  };

  it('[REQ-011][TECH-050] `eligible` com a party elegível: trava na ordem crescente e confirma', async () => {
    const { executor, gate: g, store } = membershipSetup(['p-1', 'p-2']);
    const outcome = await executor.execute(
      command('test_eligible', (c) => c.requireEligibleMembership(['p-2', 'p-1', 'p-2'])),
      asTitular,
    );
    expect(outcome).toMatchObject({ status: 'committed' });
    expect(g.calls).toEqual([['p-1', 'p-2']]);
    expect(store.committed).toHaveLength(1);
  });

  it('[REQ-011][TECH-050] party não elegível (ou sem Membership) → ERR_MEMBERSHIP_INELIGIBLE, nada gravado', async () => {
    const { executor, store } = membershipSetup(['p-1']);
    const outcome = await executor.execute(
      command('test_eligible', (c) => c.requireEligibleMembership(['p-2'])),
      asTitular,
    );
    expect(outcome).toMatchObject({ status: 'rejected', code: 'ERR_MEMBERSHIP_INELIGIBLE' });
    expect(store.committed).toEqual([]);
  });

  it('[TECH-051] `eligible` que não comprova a party que age falha fechado (só outra party não basta)', async () => {
    for (const behavior of [
      () => Promise.resolve(),
      (c: Parameters<Parameters<typeof command>[1]>[0]) => c.requireEligibleMembership(['p-1']),
    ]) {
      const { executor, store } = membershipSetup(['p-1', 'p-2']);
      await expect(executor.execute(command('test_eligible', behavior), asTitular)).rejects.toThrow(
        MembershipCheckError,
      );
      expect(store.committed).toEqual([]);
    }
  });

  it('[TECH-051][BR-147] `not_required` e `not_applicable` não podem chamar a verificação; sem chamá-la, nada muda', async () => {
    for (const name of ['test_not_required', 'test_not_applicable']) {
      const blocked = membershipSetup(['p-2']);
      await expect(
        blocked.executor.execute(
          command(name, (c) => c.requireEligibleMembership(['p-2'])),
          asTitular,
        ),
      ).rejects.toThrow(MembershipCheckError);
      expect(blocked.gate.calls).toEqual([]);
      // Sem Membership nenhum e sem gate configurado, o command independente de Membership confirma normalmente.
      const plain = membershipSetup(null);
      await expect(
        plain.executor.execute(
          command(name, () => Promise.resolve()),
          asTitular,
        ),
      ).resolves.toMatchObject({
        status: 'committed',
      });
    }
  });

  it('[TECH-051] sem gate configurado, nenhum command `eligible` executa (falha fechada)', async () => {
    const { executor, store } = membershipSetup(null);
    await expect(
      executor.execute(
        command('test_eligible', (c) => c.requireEligibleMembership(['p-2'])),
        asTitular,
      ),
    ).rejects.toThrow(MembershipCheckError);
    expect(store.committed).toEqual([]);
  });

  it('[TECH-053] a verificação depois de uma classe posterior (ex.: stake) viola a ordem de travas', async () => {
    const { executor, gate: g } = membershipSetup(['p-2']);
    await expect(
      executor.execute(
        command('test_eligible', async (c) => {
          c.locks.claim('stake', ['s-1']);
          await c.requireEligibleMembership(['p-2']);
        }),
        asTitular,
      ),
    ).rejects.toThrow(/lock order/);
    expect(g.calls).toEqual([]);
  });
});
