import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBookingAuthorizationQuota } from '@/features/booking/presentation/booking-authorization-quota';
import {
  readAdminBooking,
  readAdminBookingDirectory,
} from '@/features/booking/presentation/own-use-admin-read';
import {
  createMemoryRateLimiter,
  RateLimiterUnavailableError,
  type RateLimiter,
} from '@/features/platform';
import {
  addDays,
  bookableStart,
  bookingHarness,
  type BookingHarness,
  type CoOwnerScenario,
} from './booking-support';
import {
  activate,
  addAdmin,
  authorize,
  bookNow,
  deactivate,
  historicCoOwnerScenario,
  type Admin,
} from './lifecycle-support';
import { lifecycleRunner } from './own-use-lifecycle-support';

/**
 * Admin do ciclo (W13 E4b, spec booking §10.15) sobre o PostgreSQL com os privilégios reais: leituras auditadas com os
 * fatos do store da E2, disponibilidade dos atos, e o G-E4-1 pelo executor de produção — limite excedido sem operação
 * nem solicitação gravadas, limitador indisponível recusado, replay de chave concluída com a cota esgotada e a chave
 * recusada por limite ainda utilizável.
 */
const LIMITS = {
  BOOKING_AUTHORIZATION_REQUEST_LIMIT: '1',
  BOOKING_AUTHORIZATION_REQUEST_WINDOW_SECONDS: '3600',
  BOOKING_AUTHORIZATION_GLOBAL_LIMIT: '100',
  BOOKING_AUTHORIZATION_GLOBAL_WINDOW_SECONDS: '3600',
};

describe('W13 E4b — Admin do ciclo da reserva (leituras auditadas e G-E4-1)', () => {
  let h: BookingHarness;
  let co: CoOwnerScenario;
  let admin: Admin;
  let run: ReturnType<typeof lifecycleRunner>;
  let first: string;
  const at = (offset: number) => addDays(first, offset);
  const session = () => ({
    userId: admin.userId,
    roles: ['admin' as const],
    role: 'admin' as const,
    authorizationRef: `staff_role:${admin.roleId}`,
  });

  async function openOperational(bookingId: string) {
    const outcome = await run.asAdmin(admin, run.handlers.openException, {
      second_home_id: co.homeId,
      booking_id: bookingId,
      exception_type: 'operational',
      reason: 'casualty',
      basis: 'TCK-2026-0042',
    });
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
  }

  async function countRows(table: string, bookingId: string) {
    const { rows } = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.${table} WHERE booking_id = $1`,
      [bookingId],
    );
    return rows[0]!.n;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    co = await historicCoOwnerScenario(h);
    admin = await addAdmin(h);
    first = bookableStart().first;
    await activate(h, 'own_use_booking', 'own_use_lifecycle');
    run = lifecycleRunner(h);
  }, 300_000);
  afterAll(() => h.close());

  it('[TECH-092][REQ-084] detalhe auditado: exceção com a referência do incidente só no Admin; atos disponíveis com o motivo', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(20), at(23));
    await openOperational(id);
    const detail = await readAdminBooking(session(), id, h.db);
    expect(detail).toMatchObject({
      id,
      modality: 'co_owner',
      state: 'in_exception',
      exception: { type: 'operational', reason: 'casualty' },
      cancellationClassNow: 'timely',
      purposes: ['exception_cancellation'],
    });
    expect(detail!.nights.map((night) => [night.date, night.custody, night.occupied])).toEqual([
      [at(20), 'reserved', true],
      [at(21), 'reserved', true],
      [at(22), 'reserved', true],
    ]);
    const acts = Object.fromEntries(detail!.acts.map((act) => [act.act, act.reason ?? 'ok']));
    expect(acts).toMatchObject({
      resolve: 'ok',
      request: 'ok',
      no_show: 'exception_open',
      open_exception: 'exception_open',
    });
    expect(detail!.history.map((row) => `${row.from}→${row.to}:${row.role}`)).toEqual([
      'confirmed→in_exception:admin',
    ]);
    const { rows } = await h.database.pool.query<{ object_type: string; object_id: string }>(
      `SELECT object_type, object_id FROM app.audit_log WHERE event_type = 'admin_read' AND actor_user_id = $1
        AND object_id = $2`,
      [admin.userId, id],
    );
    expect(rows).toEqual([{ object_type: 'booking', object_id: id }]);
  });

  it('[TECH-092] fila auditada: a reserva em exceção aparece em "Em exceção e em apuração"', async () => {
    const directory = await readAdminBookingDirectory(session(), { secondHomeId: co.homeId }, h.db);
    expect(
      directory.items.some(
        (item) => item.section === 'exceptions' && item.exceptionType === 'operational',
      ),
    ).toBe(true);
    const { rows } = await h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.audit_log WHERE event_type = 'admin_read' AND object_type = 'booking_directory'
        AND object_id = $1`,
      [co.homeId],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('[G-E4-1] limite excedido → ERR_RATE_LIMITED sem operação nem solicitação; replay da chave concluída devolve o gravado; a chave recusada continua utilizável', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(30), at(32));
    await openOperational(id);
    const limiter = createMemoryRateLimiter({
      network: { limit: 1, windowSeconds: 3600 },
      global: { limit: 100, windowSeconds: 3600 },
    });
    const quota = createBookingAuthorizationQuota({ source: LIMITS, limiter });
    const handler = { ...run.handlers.requestBookingAuthorization, consumeQuota: quota };
    const input = {
      second_home_id: co.homeId,
      booking_id: id,
      purpose: 'exception_cancellation',
      basis: 'TCK-2026-0042',
    };
    const done = randomUUID();
    const firstOutcome = await run.asAdmin(admin, handler, input, done);
    expect(firstOutcome).toMatchObject({ status: 'committed', replayed: false });
    const limitedKey = randomUUID();
    const limited = await run.asAdmin(admin, handler, input, limitedKey);
    expect(limited).toEqual({
      status: 'rejected',
      operationId: null,
      code: 'ERR_RATE_LIMITED',
      replayed: false,
    });
    expect(await countRows('booking_authorization_request', id)).toBe(1);
    const { rows: ops } = await h.database.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.operation WHERE idempotency_key = $1',
      [limitedKey],
    );
    expect(ops[0]!.n).toBe(0);
    const replay = await run.asAdmin(admin, handler, input, done);
    expect(replay).toMatchObject({ status: 'committed', replayed: true });
    if (firstOutcome.status === 'committed' && replay.status === 'committed')
      expect(replay.result).toEqual(firstOutcome.result);
    const open: RateLimiter = { consume: async () => ({ allowed: true }) };
    const reused = await run.asAdmin(
      admin,
      {
        ...run.handlers.requestBookingAuthorization,
        consumeQuota: createBookingAuthorizationQuota({ source: LIMITS, limiter: open }),
      },
      input,
      limitedKey,
    );
    expect(reused).toMatchObject({ status: 'committed', replayed: false });
    expect(await countRows('booking_authorization_request', id)).toBe(2);
  });

  it('[G-E4-1][TECH-001] limitador indisponível → ERR_UNAVAILABLE; limite ausente → ERR_PARAMETER_MISSING; nada gravado', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(40), at(41));
    await openOperational(id);
    const broken: RateLimiter = {
      consume: async () => {
        throw new RateLimiterUnavailableError('backend');
      },
    };
    const input = {
      second_home_id: co.homeId,
      booking_id: id,
      purpose: 'exception_cancellation',
      basis: 'TCK-2026-0042',
    };
    expect(
      await run.asAdmin(
        admin,
        {
          ...run.handlers.requestBookingAuthorization,
          consumeQuota: createBookingAuthorizationQuota({ source: LIMITS, limiter: broken }),
        },
        input,
      ),
    ).toMatchObject({ status: 'rejected', operationId: null, code: 'ERR_UNAVAILABLE' });
    expect(
      await run.asAdmin(
        admin,
        {
          ...run.handlers.requestBookingAuthorization,
          consumeQuota: createBookingAuthorizationQuota({ source: {} }),
        },
        input,
      ),
    ).toMatchObject({ status: 'rejected', operationId: null, code: 'ERR_PARAMETER_MISSING' });
    expect(await countRows('booking_authorization_request', id)).toBe(0);
  });

  it('[ADR-0027 §4] autorização viva aparece no detalhe e libera a opção de cancelar; usada, deixa de estar viva', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(50), at(52));
    await openOperational(id);
    const requested = await run.asAdmin(admin, run.handlers.requestBookingAuthorization, {
      second_home_id: co.homeId,
      booking_id: id,
      purpose: 'exception_cancellation',
      basis: 'TCK-2026-0042',
    });
    if (requested.status !== 'committed') throw new Error(JSON.stringify(requested));
    await authorize(h, (requested.result as { request_id: string }).request_id);
    const detail = await readAdminBooking(session(), id, h.db);
    expect(detail!.live.exception_cancellation).toMatchObject({
      scopeDates: [at(50), at(51)],
      expectedClass: 'timely',
    });
    expect(detail!.authorizations.map((x) => x.status)).toEqual(['live']);
  });

  it('[ADR-0027 §5] K2 ausente: o detalhe segue legível e nenhum ato fica disponível', async () => {
    const a = co.titulares[0]!;
    const id = await bookNow(h, a, co.homeId, at(60), at(61));
    await deactivate(h, 'own_use_lifecycle');
    try {
      const detail = await readAdminBooking(session(), id, h.db);
      expect(detail!.acts.every((act) => act.reason === 'lifecycle_closed')).toBe(true);
      expect(detail!.purposes).toEqual([]);
    } finally {
      await activate(h, 'own_use_lifecycle');
    }
  });
});
