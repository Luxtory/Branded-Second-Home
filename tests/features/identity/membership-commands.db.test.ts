import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMembershipConsumers } from '@/features/identity/jobs';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { postgresMembershipGate } from '@/features/identity/infrastructure/postgres-membership';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createMembershipHandlers } from '@/features/identity/presentation/membership-handlers';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  MembershipCheckError,
  systemClock,
  type Actor,
  type CommandGuard,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { CommandRegistry } from '@/features/platform/application/commands/registry';
import { ConsumerRegistry } from '@/features/platform/application/outbox/consumers';
import { dispatchOutbox } from '@/features/platform/application/outbox/dispatcher';
import { createPostgresOutboxStore } from '@/features/platform/infrastructure/outbox/postgres-outbox-store';
import { ownerParty } from '../../support/party-fixtures';
import { deferred, waitForLockWaiter } from '../../support/platform-fixtures';
import {
  bookingHarness,
  revokeDelegation,
  secondRepresentative,
  type BookingHarness,
} from '../booking/booking-support';
import { addAdmin, connect, openOperation, type Admin } from '../booking/lifecycle-support';
import { asUser } from '../calendar/luxtory-selection-support';
import {
  membershipOf,
  rightsFingerprint,
  transitionsOf,
  updateMembership,
} from './membership-support';

const handlers = createMembershipHandlers();
type Handler = CommandHandler<unknown, JsonValue, DatabaseTransaction>;

/** Commands de teste com a coluna "Membership" da TECH-051: um mecanismo `eligible` e um `not_required`. */
const testRegistry = new CommandRegistry([
  ...commandRegistry.list(),
  {
    name: 'test_club_mechanism',
    module: 'luxchange',
    authority: 'titular',
    membership: 'eligible',
    critical: true,
  },
  {
    name: 'test_own_use_like',
    module: 'booking',
    authority: 'titular',
    membership: 'not_required',
    critical: true,
  },
]);

describe('W15 E3 — operações do Membership e verificação de elegibilidade pelo executor (PostgreSQL real)', () => {
  let h: BookingHarness;
  let admin: Admin;

  const adminActor = (who: Admin): Actor => ({
    kind: 'user',
    userId: who.userId,
    actingPartyId: null,
    role: 'admin',
  });

  /** Guard de produção (TECH-050/051): staff com AAL2 e atribuição ativa lida do banco. */
  const realGuard = (userId: string, assurance: 'aal1' | 'aal2' = 'aal2'): CommandGuard =>
    createAuthorizationGuard({
      session: { userId, assurance },
      staff: createPostgresStaffDirectory(() => h.db),
      grants: createPostgresGrantDirectory(() => h.db),
      delegations: createPostgresDelegationDirectory(() => h.db),
      clock: systemClock,
    });

  const executor = (guard: CommandGuard, options: { gate?: boolean } = {}) =>
    createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard,
      clock: systemClock,
      limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
      log: h.log,
      registry: testRegistry,
      ...(options.gate === false ? {} : { membership: postgresMembershipGate }),
    });

  function run(
    handler: Handler,
    input: Record<string, unknown>,
    options: { who?: Admin; actor?: Actor; guard?: CommandGuard; key?: string } = {},
  ) {
    const who = options.who ?? admin;
    return executor(options.guard ?? realGuard(who.userId)).execute(handler, {
      actor: options.actor ?? adminActor(who),
      idempotencyKey: options.key ?? randomUUID(),
      correlationId: randomUUID(),
      input,
    });
  }
  const change = (handler: unknown, partyId: string, basis = 'Ata Luxtory W15') =>
    run(handler as Handler, { party_id: partyId, basis });

  async function titularParty() {
    return (await h.ownerScenario()).titular;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  describe('quatro operações Admin (REQ-095, TECH-055)', () => {
    it('[REQ-095][TECH-055] ciclo completo pelo executor: resultado do banco, auditoria antes/depois e evento por transição', async () => {
      const { partyId } = await titularParty();
      const steps = [
        [handlers.activateMembership, 'active'],
        [handlers.suspendMembership, 'suspended'],
        [handlers.reactivateMembership, 'active'],
        [handlers.endMembership, 'ended'],
        [handlers.reactivateMembership, 'active'],
      ] as const;
      const operations: string[] = [];
      for (const [handler, state] of steps) {
        const outcome = await change(handler, partyId);
        expect(outcome).toMatchObject({
          status: 'committed',
          result: { party_id: partyId, state },
        });
        if (outcome.status === 'committed') operations.push(outcome.operationId);
      }
      const { rows: audit } = await h.database.pool.query<{
        operation_id: string;
        object_type: string;
        role: string;
        before: { state: string } | null;
        after: { state: string };
      }>(
        `SELECT operation_id, object_type, role, before, after FROM app.audit_log
          WHERE operation_id = ANY($1::uuid[]) ORDER BY id`,
        [operations],
      );
      expect(
        audit.map((row) => [row.object_type, row.role, row.before?.state ?? null, row.after.state]),
      ).toEqual([
        ['membership', 'admin', null, 'active'],
        ['membership', 'admin', 'active', 'suspended'],
        ['membership', 'admin', 'suspended', 'active'],
        ['membership', 'admin', 'active', 'ended'],
        ['membership', 'admin', 'ended', 'active'],
      ]);
      expect(JSON.stringify(audit)).not.toContain('Ata Luxtory');
      const { rows: events } = await h.database.pool.query<{
        dedup_key: string;
        payload: Record<string, unknown>;
      }>(
        `SELECT dedup_key, payload FROM app.outbox WHERE operation_id = ANY($1::uuid[]) ORDER BY occurred_at`,
        [operations],
      );
      expect(events.map((event) => event.dedup_key)).toEqual(
        operations.map((op) => `identity.membership_state_changed:${op}`),
      );
      expect(events.map((event) => [event.payload.from_state, event.payload.to_state])).toEqual([
        [null, 'active'],
        ['active', 'suspended'],
        ['suspended', 'active'],
        ['active', 'ended'],
        ['ended', 'active'],
      ]);
      expect(JSON.stringify(events)).not.toContain('Ata Luxtory');
      expect(
        (await transitionsOf(h.database.pool, partyId)).map((row) => row.operation_id),
      ).toEqual(operations);
    });

    it('[TECH-055][PD-001] transições inválidas, segundo Membership, party inexistente e party sem holding', async () => {
      const { partyId } = await titularParty();
      const rejected = (code: string) => expect.objectContaining({ status: 'rejected', code });
      expect(await change(handlers.suspendMembership, partyId)).toEqual(rejected('ERR_NOT_FOUND'));
      expect(await change(handlers.activateMembership, randomUUID())).toEqual(
        rejected('ERR_NOT_FOUND'),
      );
      expect(await change(handlers.activateMembership, await ownerParty(h.database.pool))).toEqual(
        rejected('ERR_STATE_TRANSITION'),
      );
      await change(handlers.activateMembership, partyId);
      expect(await change(handlers.activateMembership, partyId)).toEqual(
        rejected('ERR_STATE_TRANSITION'),
      );
      expect(await change(handlers.reactivateMembership, partyId)).toEqual(
        rejected('ERR_STATE_TRANSITION'),
      );
      await change(handlers.endMembership, partyId);
      for (const handler of [handlers.suspendMembership, handlers.endMembership])
        expect(await change(handler, partyId)).toEqual(rejected('ERR_STATE_TRANSITION'));
      expect((await membershipOf(h.database.pool, partyId))!.state).toBe('ended');
    });

    it('[TECH-051] base obrigatória, até 255 caracteres, sem forma de dado pessoal; campos extras recusados', async () => {
      const { partyId } = await titularParty();
      for (const input of [
        { party_id: partyId, basis: '   ' },
        { party_id: partyId, basis: 'x'.repeat(256) },
        { party_id: partyId, basis: 'Pedido de fulano@exemplo.test' },
        { party_id: partyId, basis: 'Titular 123.456.789-09' },
        { party_id: partyId, basis: 'Ligar (11) 98765-4321' },
        { party_id: partyId, basis: 'Ata', plan: 'gold' },
        { party_id: 'x', basis: 'Ata' },
      ])
        expect(await run(handlers.activateMembership as Handler, input)).toMatchObject({
          status: 'rejected',
          code: 'ERR_VALIDATION',
        });
      expect(await membershipOf(h.database.pool, partyId)).toBeNull();
    });

    it('[TECH-050][TECH-051] autorização: só Admin com AAL2 e atribuição ativa; o banco revalida a atribuição', async () => {
      const titular = await titularParty();
      const input = { party_id: titular.partyId, basis: 'Ata Luxtory W15' };
      expect(
        await run(handlers.activateMembership as Handler, input, {
          guard: realGuard(admin.userId, 'aal1'),
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
      expect(
        await run(handlers.activateMembership as Handler, input, {
          actor: {
            kind: 'user',
            userId: titular.userId,
            actingPartyId: titular.partyId,
            role: 'titular',
          },
          guard: realGuard(titular.userId),
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_PERMISSION' });
      // Atribuição revogada depois da decisão do guard: o gatilho do banco recusa (permission_staff_role).
      const revoked = await addAdmin(h);
      await h.database.pool.query(
        `SELECT app.revoke_staff_role($1, 'Fim da atribuição de teste')`,
        [revoked.roleId],
      );
      const staleGuard: CommandGuard = {
        authorize: () =>
          Promise.resolve({ allowed: true, authorizationRef: `staff_role:${revoked.roleId}` }),
      };
      expect(
        await run(handlers.activateMembership as Handler, input, {
          who: revoked,
          guard: staleGuard,
        }),
      ).toMatchObject({
        status: 'rejected',
        code: 'ERR_PERMISSION',
      });
      expect(await membershipOf(h.database.pool, titular.partyId)).toBeNull();
    });

    it('[ADR-006] idempotência: mesma chave e payload → replay; payload diferente → ERR_IDEMPOTENCY_CONFLICT', async () => {
      const { partyId } = await titularParty();
      const key = randomUUID();
      const input = { party_id: partyId, basis: 'Ata Luxtory W15' };
      const first = await run(handlers.activateMembership as Handler, input, { key });
      const replay = await run(handlers.activateMembership as Handler, input, { key });
      expect(first).toMatchObject({ status: 'committed', replayed: false });
      expect(replay).toMatchObject({ status: 'committed', replayed: true });
      if (first.status === 'committed' && replay.status === 'committed')
        expect(replay.result).toEqual(first.result);
      expect(
        await run(
          handlers.activateMembership as Handler,
          { ...input, basis: 'Outra ata' },
          { key },
        ),
      ).toMatchObject({
        status: 'rejected',
        code: 'ERR_IDEMPOTENCY_CONFLICT',
      });
      expect(await transitionsOf(h.database.pool, partyId)).toHaveLength(1);
    });

    it('[PD-001][TECH-053] concorrência pelo executor: duas ativações e duas suspensões → exatamente uma de cada', async () => {
      const { partyId } = await titularParty();
      const activations = await Promise.all(
        [1, 2].map(() => change(handlers.activateMembership, partyId)),
      );
      expect(activations.map((outcome) => outcome.status).sort()).toEqual([
        'committed',
        'rejected',
      ]);
      expect(activations.find((outcome) => outcome.status === 'rejected')).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
      const suspensions = await Promise.all(
        [1, 2].map(() => change(handlers.suspendMembership, partyId)),
      );
      expect(suspensions.map((outcome) => outcome.status).sort()).toEqual([
        'committed',
        'rejected',
      ]);
      expect(suspensions.find((outcome) => outcome.status === 'rejected')).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
      expect((await transitionsOf(h.database.pool, partyId)).map((row) => row.to_state)).toEqual([
        'active',
        'suspended',
      ]);
    });

    it('[REQ-050][BR-321] pelo executor, o ciclo não grava nada fora do Membership e da infraestrutura de operação', async () => {
      const { partyId } = await titularParty();
      const infra = ['audit_log', 'audit_seal', 'idempotency_record', 'outbox'];
      const before = await rightsFingerprint(h.database.pool, infra);
      for (const handler of [
        handlers.activateMembership,
        handlers.suspendMembership,
        handlers.endMembership,
        handlers.reactivateMembership,
      ])
        expect(await change(handler, partyId)).toMatchObject({ status: 'committed' });
      expect(await rightsFingerprint(h.database.pool, infra)).toEqual(before);
    });
  });

  describe('notificação (REQ-097, TECH-091)', () => {
    const sweep = () =>
      dispatchOutbox({
        store: createPostgresOutboxStore(h.db),
        consumers: new ConsumerRegistry<DatabaseTransaction>([
          ...createMembershipConsumers({ clock: systemClock }),
        ]),
        clock: systemClock,
        batchSize: 50,
        log: h.log,
      });

    it('[REQ-097][TECH-091] uma notificação por transição, sem duplicata na reentrega, visível a todos os representantes vigentes', async () => {
      const titular = await titularParty();
      const other = await secondRepresentative(h, titular);
      for (const handler of [
        handlers.activateMembership,
        handlers.suspendMembership,
        handlers.endMembership,
      ])
        await change(handler, titular.partyId);
      await sweep();
      await sweep();
      const { rows } = await h.database.pool.query<{ kind: string; data: Record<string, unknown> }>(
        `SELECT kind, data FROM app.notification WHERE recipient_party_id = $1 AND kind = 'identity.membership_changed'
          ORDER BY created_at, id`,
        [titular.partyId],
      );
      expect(rows.map((row) => [row.data.from_state, row.data.to_state])).toEqual([
        [null, 'active'],
        ['active', 'suspended'],
        ['suspended', 'ended'],
      ]);
      expect(
        rows.every((row) => !('basis' in row.data) && !('recipient_party_id' in row.data)),
      ).toBe(true);
      const visible = (userId: string) =>
        asUser<{ kind: string }>(
          h.database.appUrl,
          userId,
          `SELECT kind FROM app.notification WHERE kind = 'identity.membership_changed'`,
        );
      expect(await visible(titular.userId)).toHaveLength(3);
      expect(await visible(other.userId)).toHaveLength(3);
      await revokeDelegation(h, other.userId);
      expect(await visible(other.userId)).toEqual([]);
    });
  });

  describe('verificação de elegibilidade no instante da ação (REQ-011, TECH-050, TECH-053, TECH-054)', () => {
    /** Mecanismo de teste `eligible`: comprova a party que age e, opcionalmente, segura a transação depois da trava. */
    const mechanism = (hold?: Promise<void>): Handler => ({
      command: 'test_club_mechanism',
      input: z.object({}).loose(),
      async execute(context) {
        const party = context.actor.kind === 'user' ? context.actor.actingPartyId : null;
        await context.requireEligibleMembership(party === null ? [] : [party]);
        await hold;
        context.audit({
          objectType: 'test_mechanism',
          objectId: party ?? 'none',
          before: null,
          after: { ok: true },
        });
        return { ok: true };
      },
    });
    const titularGuard: CommandGuard = {
      authorize: () => Promise.resolve({ allowed: true, authorizationRef: 'test:titular' }),
    };
    const act = (partyId: string, userId: string, handler: Handler = mechanism(), gate = true) =>
      executor(titularGuard, { gate }).execute(handler, {
        actor: { kind: 'user', userId, actingPartyId: partyId, role: 'titular' },
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
        input: {},
      });

    it('[REQ-011] sem Membership, suspenso ou encerrado → ERR_MEMBERSHIP_INELIGIBLE; ativo → executa; suspensão entre duas ações bloqueia a segunda', async () => {
      const t = await titularParty();
      expect(await act(t.partyId, t.userId)).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
      await change(handlers.activateMembership, t.partyId);
      expect(await act(t.partyId, t.userId)).toMatchObject({ status: 'committed' });
      await change(handlers.suspendMembership, t.partyId);
      expect(await act(t.partyId, t.userId)).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
      await change(handlers.endMembership, t.partyId);
      expect(await act(t.partyId, t.userId)).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
      await change(handlers.reactivateMembership, t.partyId);
      expect(await act(t.partyId, t.userId)).toMatchObject({ status: 'committed' });
    });

    it('[REQ-011][TECH-053] a ação em curso (FOR SHARE do executor) segura a suspensão do executor até o seu commit', async () => {
      const t = await titularParty();
      await change(handlers.activateMembership, t.partyId);
      const hold = deferred();
      const action = act(t.partyId, t.userId, mechanism(hold.promise));
      // A ação já travou e verificou: o Admin tenta suspender e espera.
      await waitForMembershipCheck();
      let suspended = false;
      const suspension = change(handlers.suspendMembership, t.partyId).then((outcome) => {
        suspended = true;
        return outcome;
      });
      await waitForLockWaiter(h.database.pool);
      expect(suspended).toBe(false);
      hold.resolve();
      expect(await action).toMatchObject({ status: 'committed' });
      expect(await suspension).toMatchObject({
        status: 'committed',
        result: { state: 'suspended' },
      });
      expect(await act(t.partyId, t.userId)).toMatchObject({
        status: 'rejected',
        code: 'ERR_MEMBERSHIP_INELIGIBLE',
      });
    });

    it('[REQ-011][TECH-053] suspensão em curso: a ação do executor espera e, depois do commit, é recusada', async () => {
      const t = await titularParty();
      await change(handlers.activateMembership, t.partyId);
      const writer = await connect(h.database.appUrl);
      try {
        await writer.query('BEGIN');
        const op = await openOperation(writer, 'suspend_membership', { kind: 'admin', admin });
        await updateMembership(writer, op, t.partyId, 'suspended');
        const action = act(t.partyId, t.userId);
        await waitForLockWaiter(h.database.pool);
        await writer.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
        await writer.query('COMMIT');
        expect(await action).toMatchObject({
          status: 'rejected',
          code: 'ERR_MEMBERSHIP_INELIGIBLE',
        });
      } finally {
        await writer.end();
      }
    });

    it('[TECH-051][BR-147] falha fechada: `eligible` sem comprovação ou sem gate; `not_required` não pode verificar — nada confirmado', async () => {
      const t = await titularParty();
      await change(handlers.activateMembership, t.partyId);
      const silent: Handler = {
        command: 'test_club_mechanism',
        input: z.object({}).loose(),
        async execute(context) {
          context.audit({
            objectType: 'test_mechanism',
            objectId: 'silent',
            before: null,
            after: null,
          });
          return { ok: true };
        },
      };
      const ownUseLike: Handler = { ...mechanism(), command: 'test_own_use_like' };
      const committedBefore = await committedTestOperations();
      await expect(act(t.partyId, t.userId, silent)).rejects.toThrow(MembershipCheckError);
      await expect(act(t.partyId, t.userId, mechanism(), false)).rejects.toThrow(
        MembershipCheckError,
      );
      await expect(act(t.partyId, t.userId, ownUseLike)).rejects.toThrow(MembershipCheckError);
      expect(await committedTestOperations()).toBe(committedBefore);
    });
  });

  /** A ação chegou à verificação: há trava `FOR SHARE` (RowShareLock) concedida em `app.membership`. */
  async function waitForMembershipCheck(): Promise<void> {
    for (let i = 0; i < 50; i += 1) {
      const { rows } = await h.database.pool.query<{ held: number }>(
        `SELECT count(*)::int AS held FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
          WHERE c.relname = 'membership' AND l.mode = 'RowShareLock' AND l.granted`,
      );
      if (rows[0]!.held > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the action never reached the Membership check');
  }

  async function committedTestOperations(): Promise<number> {
    const { rows } = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.operation WHERE command LIKE 'test\\_%' AND state = 'committed'`,
    );
    return rows[0]!.n;
  }
});
