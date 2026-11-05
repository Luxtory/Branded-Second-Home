import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCreateOwnUseBookingHandler } from '@/features/booking/application/create-own-use-booking';
import { createPostgresBookingStore } from '@/features/booking/infrastructure/postgres-booking-store';
import { createPostgresOwnUseRights, createUseWindowResolver } from '@/features/calendar/booking';
import { createOwnUseInventory } from '@/features/inventory';
import { findUseRightFacts } from '@/features/ownership';
import {
  CapabilityNotActivatedError,
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
  type CommandGuard,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import {
  addDays,
  bookableStart,
  bookingHarness,
  revokeDelegation,
  type BookingHarness,
  type OwnerScenario,
} from './booking-support';

/**
 * Spec booking §10.12 (D1), provado com PostgreSQL real e o executor de produção: o banco recusa por `42501` nomeado e
 * o executor traduz só os nomes da lista fechada; K1 fechada no banco não grava nada; `42501` sem nome segue falha
 * técnica. O guard aceita tudo e o handler pula a própria checagem, para que a decisão seja só do banco (corrida ou
 * forja com a credencial da aplicação).
 */
describe('W13 E2 — recusas do banco na criação da W12 (D1)', () => {
  let h: BookingHarness;
  let owner: OwnerScenario;
  let first: string;

  const allow = (ref: string): CommandGuard => ({
    authorize: () => Promise.resolve({ allowed: true, authorizationRef: ref }),
  });

  function execute<I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
    key: string,
  ) {
    const executor = createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard: allow(`holding:${owner.titular.holdingId}`),
      clock: systemClock,
      limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
      log: h.log,
      registry: commandRegistry,
    });
    return executor.execute(handler, {
      actor: {
        kind: 'user',
        userId: owner.titular.userId,
        actingPartyId: owner.titular.partyId,
        role: 'titular',
      },
      idempotencyKey: key,
      correlationId: randomUUID(),
      input,
    });
  }

  /** Handler real da W12 com um store que pula a checagem indicada (o banco continua conferindo tudo). */
  function w12Handler(skip: { readonly activation?: boolean; readonly representation?: boolean }) {
    const store = createPostgresBookingStore();
    return createCreateOwnUseBookingHandler<DatabaseTransaction>({
      store: {
        ...store,
        isActivated: (tx) => (skip.activation ? Promise.resolve(true) : store.isActivated(tx)),
        lockRepresentation: (tx, input) =>
          skip.representation
            ? Promise.resolve({
                holdingId: owner.titular.holdingId,
                role: 'owner',
                stakeId: null,
              })
            : store.lockRepresentation(tx, input),
      },
      inventory: createOwnUseInventory(),
      rights: createPostgresOwnUseRights(),
      findFacts: findUseRightFacts,
      windowOpensAt: createUseWindowResolver(),
    });
  }

  const traces = async (key: string) => {
    const { rows } = await h.database.pool.query<{ operations: number; records: number }>(
      `SELECT (SELECT count(*)::int FROM app.operation WHERE idempotency_key = $1) AS operations,
              (SELECT count(*)::int FROM app.idempotency_record WHERE idempotency_key = $1) AS records`,
      [key],
    );
    return rows[0]!;
  };
  const bookings = async () =>
    (
      await h.database.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app.booking WHERE second_home_id = $1`,
        [owner.homeId],
      )
    ).rows[0]!.n;

  beforeAll(async () => {
    h = await bookingHarness();
    owner = await h.ownerScenario();
    first = bookableStart().first;
  }, 300_000);
  afterAll(() => h.close());

  it('[ADR-0026][spec booking §10.12] K1 fechada no banco → capability fechada: sem operação, recusa, reserva nem evento', async () => {
    await h.deactivate();
    const key = randomUUID();
    const input = {
      second_home_id: owner.homeId,
      checkin_date: addDays(first, 3),
      checkout_date: addDays(first, 4),
    };

    await expect(execute(w12Handler({ activation: true }), input, key)).rejects.toEqual(
      new CapabilityNotActivatedError('own_use_booking'),
    );
    expect(await traces(key)).toEqual({ operations: 0, records: 0 });
    expect(await bookings()).toBe(0);
    // A chave continua livre: aberta a K1, o mesmo pedido confirma normalmente.
    await h.activate();
    try {
      expect(await execute(w12Handler({}), input, key)).toMatchObject({
        status: 'committed',
        replayed: false,
      });
    } finally {
      await h.deactivate();
    }
  });

  it('[ADR-0026][spec booking §10.12] representação recusada pelo banco (42501 nomeado) → ERR_PERMISSION gravado e repetido', async () => {
    await h.activate();
    try {
      await revokeDelegation(h, owner.titular.userId);
      const key = randomUUID();
      const input = {
        second_home_id: owner.homeId,
        checkin_date: addDays(first, 10),
        checkout_date: addDays(first, 11),
      };
      const before = await bookings();

      expect(await execute(w12Handler({ representation: true }), input, key)).toMatchObject({
        status: 'rejected',
        code: 'ERR_PERMISSION',
        replayed: false,
      });
      expect(await execute(w12Handler({ representation: true }), input, key)).toMatchObject({
        status: 'rejected',
        code: 'ERR_PERMISSION',
        replayed: true,
      });
      expect(await bookings()).toBe(before);
    } finally {
      await h.deactivate();
    }
  });

  it('[spec booking §10.12] 42501 sem nome ("permission denied") segue falha técnica, sem recusa gravada', async () => {
    const forbidden: CommandHandler<{ readonly n: number }, null, DatabaseTransaction> = {
      command: 'create_own_use_booking',
      input: z.strictObject({ n: z.number() }),
      async execute({ tx }) {
        await sql`UPDATE app.booking SET state = state`.execute(tx);
        return null;
      },
    };
    const key = randomUUID();

    await expect(execute(forbidden, { n: 1 }, key)).rejects.toMatchObject({
      code: '42501',
    });
    expect(await traces(key)).toEqual({ operations: 0, records: 0 });
  });
});
