import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../booking/booking-support';
import {
  activate,
  bookNow,
  connect,
  openException,
  openOperation,
} from '../booking/lifecycle-support';
import {
  creditsHarness,
  lotRow,
  reactivate,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { activateMembership, updateMembership } from '../identity/membership-support';
import { openDepositOperation } from './luxchange-support';
import {
  ageRequest,
  newRequester,
  pricedNights,
  requestFixture,
  requestRow,
  sendRequest,
  writeClosing,
  writeRequest,
  type RequestFixture,
  type SentRequest,
} from './request-support';
import {
  fundRequestCredits,
  writeAcceptance,
  writeAcceptedTransition,
  writeRejection,
} from './w22-support';

type Session = { client: pg.Client; pid: number };

describe('W22 — concorrência do aceite em PostgreSQL [TECH-053][REQ-063]', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  const db = () => c.h.database;
  const sessions: Session[] = [];

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'own_use_booking', 'own_use_lifecycle', 'luxchange_deposit');
  }, 240_000);

  afterEach(async () => {
    // Disconnecting releases pending transactions even when an assertion fails at a barrier.
    await Promise.all(sessions.splice(0).map(({ client }) => client.end()));
    for (const name of ['booking', 'luxchange', 'credit'] as const) {
      const result = await db().pool.query(`SELECT * FROM app.${name}_invariant_breaches()`);
      expect(result.rows, name).toEqual([]);
    }
  });
  afterAll(async () => c?.h.close());

  async function session(): Promise<Session> {
    const client = await connect(db().appUrl);
    const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const s = { client, pid: rows[0]!.pid };
    sessions.push(s);
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '20s'");
    return s;
  }

  async function commit(s: Session, operation: string): Promise<void> {
    await s.client.query("UPDATE app.operation SET state = 'committed' WHERE id = $1", [operation]);
    await s.client.query('COMMIT');
  }

  // PostgreSQL identifies the exact blocked backend and its blocker. The observer does not hold any business lock.
  async function releaseAfterWait<T>(
    first: Session,
    operation: string,
    second: Session,
    work: Promise<T>,
  ) {
    const outcome = work.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    try {
      await expect
        .poll(
          async () =>
            (
              await db().pool.query<{ blocked: boolean }>(
                'SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked',
                [first.pid, second.pid],
              )
            ).rows[0]?.blocked,
          { timeout: 12_000, interval: 25 },
        )
        .toBe(true);
    } catch (error) {
      await first.client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
    await commit(first, operation);
    return outcome;
  }

  // Ordered SQL locks that the command will acquire in E2. The rescan runs as a separate READ COMMITTED statement.
  async function accept(
    s: Session,
    op: string,
    winner: SentRequest,
    rivals: readonly SentRequest[] = [],
    options: { closeRivals?: boolean } = {},
  ) {
    const ids = [winner, ...rivals].map((r) => r.requestId);
    await s.client.query(
      'SELECT id FROM app.luxchange_request WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [ids],
    );
    const stakes = await s.client.query<{ id: string }>(
      `SELECT DISTINCT h.stake_id AS id FROM app.holding h
         WHERE h.stake_id IS NOT NULL AND h.id IN
          (SELECT holder_holding_id FROM app.luxchange_request WHERE id=$1
           UNION SELECT holding_id FROM app.luxchange_request_complement_unit WHERE request_id=$1)
         ORDER BY id`,
      [winner.requestId],
    );
    const members = await s.client.query<{ id: string }>(
      `SELECT holder_party_id AS id FROM app.luxchange_request WHERE id=$1
       UNION SELECT requester_party_id FROM app.luxchange_request WHERE id=$1 ORDER BY id`,
      [winner.requestId],
    );
    for (const member of members.rows)
      await s.client.query('SELECT app.assert_credit_membership($1)', [member.id]);
    for (const stake of stakes.rows)
      await s.client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('app.stake:' || $1::text, 0))",
        [stake.id],
      );
    const nights = await s.client.query<{ home: string; night: string }>(
      `SELECT second_home_id AS home, stay_date::text AS night FROM app.luxchange_request_night WHERE request_id=$1
       UNION SELECT second_home_id, stay_date::text FROM app.luxchange_request_complement_night WHERE request_id=$1
       ORDER BY 1, 2`,
      [winner.requestId],
    );
    for (const n of nights.rows)
      await s.client.query('SELECT app.lock_night($1,$2,false)', [n.home, n.night]);
    await s.client.query('SELECT app.luxchange_request_accept_rescan($1,$2::uuid[])', [
      winner.requestId,
      ids,
    ]);
    const bookings = await s.client.query<{ id: string }>(
      `SELECT booking_id AS id FROM app.luxchange_request_night WHERE request_id=$1 AND booking_id IS NOT NULL
       UNION SELECT booking_id FROM app.luxchange_request_complement_unit WHERE request_id=$1 AND booking_id IS NOT NULL
       ORDER BY id`,
      [winner.requestId],
    );
    for (const b of bookings.rows)
      await s.client.query('SELECT app.lock_booking($1,false)', [b.id]);
    return writeAcceptance(s.client, op, winner, options.closeRivals === false ? [] : rivals);
  }

  const holderOperation = (s: Session, holder = f.holder) =>
    openOperation(s.client, 'accept_request', { kind: 'titular', titular: holder });

  async function guaranteed(nights: readonly string[], holder = f.holder) {
    const requester = await newRequester(f);
    const lotId = await fundRequestCredits(f, requester, '500');
    const spec = { requester, holder, nights, holds: [{ lotId, quantity: '500' }] };
    return { requester, lotId, spec };
  }

  async function effects(operation: string) {
    const { rows } = await db().pool.query(
      `SELECT
         (SELECT count(*)::int FROM app.operation WHERE id=$1) AS operation,
         (SELECT count(*)::int FROM app.luxchange_request_transition WHERE operation_id=$1) AS transitions,
         (SELECT count(*)::int FROM app.credit_lot WHERE origin_operation_id=$1) AS lots,
         (SELECT count(*)::int FROM app.credit_entry WHERE operation_id=$1) AS entries,
         (SELECT count(*)::int FROM app.booking WHERE opened_by_operation=$1) AS bookings,
         (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation=$1) AS occupations,
         (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=$1 OR closed_by_operation=$1) AS custodies,
         (SELECT count(*)::int FROM app.settlement WHERE operation_id=$1) AS settlements,
         (SELECT count(*)::int FROM app.fee_charge_reversal WHERE operation_id=$1) AS reversals,
         (SELECT count(*)::int FROM app.refund WHERE operation_id=$1) AS refunds`,
      [operation],
    );
    return rows[0];
  }
  const none = {
    operation: 0,
    transitions: 0,
    lots: 0,
    entries: 0,
    bookings: 0,
    occupations: 0,
    custodies: 0,
    settlements: 0,
    reversals: 0,
    refunds: 0,
  };

  it('reverte a primeira transação quando a barreira não observa bloqueio', async () => {
    const first = await session();
    const op = await openOperation(first.client, 'expire_requests', { kind: 'system' });
    const second = await session();

    await expect(
      releaseAfterWait(first, op, second, second.client.query('SELECT 1')),
    ).rejects.toThrow();

    expect(await effects(op)).toEqual(none);
  });

  it('[REQ-060][TECH-071] usa Créditos de um depósito W20 na Garantia da Request', async () => {
    const { requester, lotId, spec } = await guaranteed(await pricedNights(f, [5_000n]));
    const sent = await sendRequest(f, spec);

    expect((await requestRow(db().pool, sent.requestId)).state).toBe('pending');
    expect(await lotRow(db().pool, lotId)).toMatchObject({
      party_id: requester.partyId,
      origin_command: 'deposit_capacity',
      held: '500',
      available: '0',
    });
  });

  async function assertSingleRefund(r: SentRequest, op: string) {
    const { rows } = await db().pool.query(
      `SELECT x.state, x.amount_minor = f.amount_minor AND x.currency = f.currency AS full,
              v.operation_id = $2 AND x.operation_id = $2 AS linked
       FROM app.fee_charge f JOIN app.fee_charge_reversal v ON v.fee_charge_id=f.id
       JOIN app.refund x ON x.payment_id=f.payment_id WHERE f.id=$1`,
      [r.feeChargeId, op],
    );
    expect(rows).toEqual([{ state: 'pending', full: true, linked: true }]);
  }

  it('[CONC-4][EC-8] dois aceites aguardam a mesma Request; só uma operação produz efeitos', async () => {
    const { spec } = await guaranteed(await pricedNights(f, [5_000n]));
    const winner = await sendRequest(f, spec);
    const first = await session();
    const op = await holderOperation(first);
    await accept(first, op, winner);
    const second = await session();
    const other = await holderOperation(second);
    const result = await releaseAfterWait(first, op, second, accept(second, other, winner));
    expect(result).toMatchObject({ ok: false, error: { code: '23514' } });
    await second.client.query('ROLLBACK');
    expect(await effects(other)).toEqual(none);
    expect(await effects(op)).toMatchObject({
      transitions: 1,
      bookings: 1,
      lots: 1,
      settlements: 1,
      refunds: 0,
    });
  });

  it('[CONC-4][REQ-063] Requests concorrentes: um aceite encerra as duas concorrentes e devolve cada Fee uma vez', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const a = await guaranteed(nights);
    const b = await guaranteed(nights);
    const d = await guaranteed(nights);
    const winner = await sendRequest(f, a.spec);
    const lost = await sendRequest(f, b.spec);
    const other = await sendRequest(f, d.spec);
    const first = await session();
    const op = await holderOperation(first);
    await accept(first, op, winner, [lost, other]);
    const second = await session();
    const rivalOp = await holderOperation(second);
    expect(
      await releaseAfterWait(first, op, second, accept(second, rivalOp, lost, [winner, other])),
    ).toMatchObject({ ok: false, error: { code: '23514' } });
    await second.client.query('ROLLBACK');
    expect(await effects(rivalOp)).toEqual(none);
    expect(await effects(op)).toMatchObject({
      transitions: 3,
      settlements: 1,
      lots: 1,
      bookings: 1,
      refunds: 2,
      reversals: 2,
    });
    expect(await lotRow(db().pool, a.lotId)).toMatchObject({ consumed: '500', held: '0' });
    for (const [r, lot] of [
      [lost, b.lotId],
      [other, d.lotId],
    ] as const) {
      expect(await requestRow(db().pool, r.requestId)).toMatchObject({
        state: 'cancelled_pre_accept',
        closure_reason: 'capacity_unavailable',
      });
      expect(await lotRow(db().pool, lot)).toMatchObject({
        available: '500',
        held: '0',
        consumed: '0',
      });
      await assertSingleRefund(r, op);
      const { rows } = await db().pool.query(
        `SELECT w.request_id FROM app.luxchange_request_transition t
         JOIN app.date_custody c ON c.id=t.evidence_id AND t.evidence_kind='custody'
         JOIN app.luxchange_request_transition w ON w.operation_id=c.closed_by_operation AND w.to_state='accepted'
         WHERE t.request_id=$1`,
        [r.requestId],
      );
      expect(rows).toEqual([{ request_id: winner.requestId }]);
    }
  });

  it('[REQ-063][TECH-024] envio já travou a noite: revarredura gera 40001 e reverte a operação inteira', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const { spec } = await guaranteed(nights);
    const winner = await sendRequest(f, spec);
    const other = await guaranteed(nights);
    const sender = await session();
    const sending = await openDepositOperation(
      sender.client,
      other.requester,
      f.holder.homeId,
      'send_request',
    );
    const rival = await writeRequest(sender.client, sending, f, other.spec);
    const accepter = await session();
    const op = await holderOperation(accepter);
    expect(
      await releaseAfterWait(sender, sending, accepter, accept(accepter, op, winner)),
    ).toMatchObject({ ok: false, error: { code: '40001' } });
    expect((await accepter.client.query('COMMIT')).command).toBe('ROLLBACK');
    expect(await effects(op)).toEqual(none);
    for (const r of [winner, rival])
      expect((await requestRow(db().pool, r.requestId)).state).toBe('pending');

    expect(await lotRow(db().pool, other.lotId)).toMatchObject({ held: '500', consumed: '0' });
  });

  it('recusa snapshot fixo para que o aceite não ignore um envio que acabou de confirmar', async () => {
    const winner = await sendRequest(f, (await guaranteed(await pricedNights(f, [5_000n]))).spec);
    const s = await session();
    await s.client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const op = await holderOperation(s);
    await expect(writeAcceptedTransition(s.client, op, winner.requestId)).rejects.toMatchObject({
      code: '23514',
      constraint: 'luxchange_request_accept_isolation',
    });
    expect((await s.client.query('COMMIT')).command).toBe('ROLLBACK');
    expect(await effects(op)).toEqual(none);
  });

  it('[REQ-063][TECH-024] aceite primeiro: o gatilho do envio aguarda a noite e recusa a custódia cedida', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const winner = await sendRequest(f, (await guaranteed(nights)).spec);
    const rival = await guaranteed(nights);
    const accepter = await session();
    const op = await holderOperation(accepter);
    await accept(accepter, op, winner);
    const sender = await session();
    const sending = await openDepositOperation(
      sender.client,
      rival.requester,
      f.holder.homeId,
      'send_request',
    );
    expect(
      await releaseAfterWait(
        accepter,
        op,
        sender,
        writeRequest(sender.client, sending, f, rival.spec),
      ),
    ).toMatchObject({ ok: false, error: { code: '23514' } });
    await sender.client.query('ROLLBACK');
    expect(await effects(sending)).toEqual(none);
    expect(await lotRow(db().pool, rival.lotId)).toMatchObject({ available: '500', held: '0' });
  });

  it('[TECH-024] concorrente conhecida omitida: só o COMMIT recusa, com violação permanente', async () => {
    const nights = await pricedNights(f, [5_000n]);
    const winner = await sendRequest(f, (await guaranteed(nights)).spec);
    const rival = await sendRequest(f, (await guaranteed(nights)).spec);
    const s = await session();
    const op = await holderOperation(s);
    await accept(s, op, winner, [rival], { closeRivals: false });
    await expect(commit(s, op)).rejects.toMatchObject({
      code: '23514',
      message: 'acceptance leaves no pending Request on its ceded nights',
    });
    expect(await effects(op)).toEqual(none);
    for (const r of [winner, rival])
      expect((await requestRow(db().pool, r.requestId)).state).toBe('pending');
  });

  it.each(['withdraw_request', 'reject_request', 'expire_requests'] as const)(
    '[CONC-5][PD-006] %s primeiro exclui o aceite',
    async (command) => {
      const a = await guaranteed(await pricedNights(f, [5_000n]));
      const winner = await sendRequest(f, a.spec);
      if (command === 'expire_requests') await ageRequest(f, winner.requestId);
      const first = await session();
      const closing = await openOperation(
        first.client,
        command,
        command === 'expire_requests'
          ? { kind: 'system' }
          : { kind: 'titular', titular: command === 'reject_request' ? f.holder : a.requester },
      );
      if (command === 'reject_request') await writeRejection(first.client, closing, winner);
      else await writeClosing(first.client, closing, winner);
      const second = await session();
      const op = await holderOperation(second);
      expect(
        await releaseAfterWait(first, closing, second, accept(second, op, winner)),
      ).toMatchObject({ ok: false, error: { code: '23514' } });
      await second.client.query('ROLLBACK');
      expect(await effects(op)).toEqual(none);
      expect(await lotRow(db().pool, a.lotId)).toMatchObject({ available: '500', held: '0' });
      await assertSingleRefund(winner, closing);
    },
  );

  it.each(['withdraw_request', 'expire_requests'] as const)(
    '[CONC-5][PD-006] aceite primeiro exclui %s',
    async (command) => {
      const { requester, lotId, spec } = await guaranteed(await pricedNights(f, [5_000n]));
      const winner = await sendRequest(f, spec);
      const first = await session();
      const op = await holderOperation(first);
      await accept(first, op, winner);
      const second = await session();
      const closing = await openOperation(
        second.client,
        command,
        command === 'expire_requests'
          ? { kind: 'system' }
          : { kind: 'titular', titular: requester },
      );
      expect(
        await releaseAfterWait(first, op, second, writeClosing(second.client, closing, winner)),
      ).toMatchObject({
        ok: false,
        error: { code: '23514', constraint: 'conflict_luxchange_request_closed' },
      });
      expect((await second.client.query('COMMIT')).command).toBe('ROLLBACK');
      expect(await effects(closing)).toEqual(none);
      expect(await effects(op)).toMatchObject({ transitions: 1, settlements: 1, refunds: 0 });
      expect(await lotRow(db().pool, lotId)).toMatchObject({ held: '0', consumed: '500' });
    },
  );

  it.each(['holder', 'requester'] as const)(
    '[EC-17][REQ-064] suspensão do %s durante o aceite',
    async (role) => {
      const holder = await newRequester(f);
      const requester = await newRequester(f);
      const lotId = await fundRequestCredits(f, requester, '500');
      const nights = await pricedNights(f, [5_000n], holder.homeId);
      const winner = await sendRequest(f, {
        holder,
        requester,
        nights,
        holds: [{ lotId, quantity: '500' }],
      });
      const partyId = role === 'holder' ? holder.partyId : requester.partyId;
      const first = await session();
      const op = await holderOperation(first, holder);
      await accept(first, op, winner);
      const second = await session();
      const suspension = await openOperation(second.client, 'suspend_membership', {
        kind: 'admin',
        admin: c.admin,
      });
      expect(
        await releaseAfterWait(
          first,
          op,
          second,
          updateMembership(second.client, suspension, partyId, 'suspended'),
        ),
      ).toMatchObject({ ok: true, value: 1 });
      await commit(second, suspension);
      expect((await requestRow(db().pool, winner.requestId)).state).toBe('accepted');
      expect(await effects(op)).toMatchObject({ lots: 1, settlements: 1 });
      await reactivate(c, partyId);
    },
  );

  it('[CONC-18] exceção no complemento Co-Owner primeiro: o aceite aguarda e relê o estado da reserva', async () => {
    const scenario = await c.h.coOwnerScenario();
    const requester: CreditTitular = { ...scenario.titulares[0]!, homeId: scenario.homeId };
    await activateMembership(db().appUrl, c.admin, requester.partyId);
    const nights = await pricedNights(f, [6_000n], requester.homeId);
    const booking = await bookNow(
      c.h,
      requester,
      requester.homeId,
      nights[0]!,
      addDays(nights[0]!, 1),
    );
    const winner = await sendRequest(f, {
      requester,
      nights: await pricedNights(f, [5_000n]),
      holds: [],
      complement: [
        {
          kind: 'co_owner_booking',
          holdingId: requester.holdingId,
          homeId: requester.homeId,
          nights,
          bookingId: booking,
        },
      ],
    });
    const first = await session();
    const exception = await openOperation(first.client, 'open_exception', {
      kind: 'admin',
      admin: c.admin,
    });
    await openException(first.client, exception, booking, 'operational');
    const second = await session();
    const op = await holderOperation(second);
    expect(
      await releaseAfterWait(first, exception, second, accept(second, op, winner)),
    ).toMatchObject({ ok: false, error: { code: '23514' } });
    await second.client.query('ROLLBACK');
    expect(await effects(op)).toEqual(none);
    expect((await requestRow(db().pool, winner.requestId)).state).toBe('pending');
    expect(
      (await db().pool.query('SELECT state FROM app.booking WHERE id=$1', [booking])).rows,
    ).toEqual([{ state: 'in_exception' }]);
  });
});
