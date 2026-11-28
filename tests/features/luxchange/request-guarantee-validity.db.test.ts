import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresBillingStore } from '@/features/billing';
import { createOwnUseCessionPort } from '@/features/booking';
import { createPostgresCreditStore } from '@/features/credits';
import { createLuxchangeCessionInventory } from '@/features/inventory';
import {
  createAcceptRequestHandler,
  createRejectRequestHandler,
  createSystemClosingHandler,
  createWithdrawRequestHandler,
} from '@/features/luxchange';
import { createPostgresRequestAcceptanceStore } from '@/features/luxchange/infrastructure/postgres-request-acceptance';
import { createPostgresRequestStore } from '@/features/luxchange/infrastructure/postgres-request-store';
import { dbmate, migrateUp } from '../../../scripts/lib/dbmate.mjs';
import { activate } from '../booking/lifecycle-support';
import {
  ageLot,
  attempt,
  creditsHarness,
  insertEntry,
  lotRow,
  monthsAgo,
  move,
  systemExecutor,
  TEST_VALIDITY_MONTHS,
  type CreditsHarness,
} from '../credits/credits-support';
import { requestApp } from './request-app-support';
import {
  ageRequest,
  newRequester,
  pricedNights,
  requestFixture,
  requestRow,
  sendRequest,
  type RequestFixture,
} from './request-support';
import { fundRequestCredits, writeRejection } from './w22-support';

describe('W22 — validade da Garantia na escrita do ledger', () => {
  let c: CreditsHarness;
  let f: RequestFixture;
  const db = () => c.h.db;
  const pool = () => c.h.database.pool;
  const original = createPostgresCreditStore();

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
  }, 240_000);
  afterAll(async () => c?.h.close());
  afterEach(async () => {
    const { rows } = await pool().query(`SELECT invariant FROM app.credit_invariant_breaches()
      UNION ALL SELECT invariant FROM app.booking_invariant_breaches()
      UNION ALL SELECT invariant FROM app.luxchange_invariant_breaches()`);
    expect(rows).toEqual([]);
  });

  async function seed(nights: readonly string[]) {
    const requester = await newRequester(f);
    const lot = await fundRequestCredits(f, requester, '500');
    const request = await sendRequest(f, {
      requester,
      holder: f.holder,
      nights,
      holds: [{ lotId: lot, quantity: '500' }],
    });
    return { requester, lot, request };
  }

  it.each([
    ['withdraw_request', 'cancelled_pre_accept', 'withdrawn'],
    ['reject_request', 'declined', 'declined'],
    ['expire_requests', 'expired', 'expired'],
    ['accept_request', 'cancelled_pre_accept', 'capacity_unavailable'],
  ] as const)(
    '[REQ-063][PD-006][TECH-071] %s encerra na primeira chamada se o lote vencer após a leitura',
    async (kind, state, reason) => {
      const nights = await pricedNights(f, [5_000n]);
      const winner = kind === 'accept_request' ? await seed(nights) : null;
      const target = await seed(nights);
      const { requestId, operationId: sentBy } = target.request;
      if (kind === 'expire_requests') await ageRequest(f, requestId);

      // Preserve just the validity from a real pre-expiry read. Age the fixture deterministically, then use
      // the real locks, current balances, clock and INSERT for the command. No timing window in the test runner.
      const [before] = await db()
        .transaction()
        .execute((tx) => original.lockOpenEntries(tx, sentBy, 'hold'));
      expect(before).toMatchObject({ lotId: target.lot, valid: true });
      await ageLot(c.h, target.lot, monthsAgo(TEST_VALIDITY_MONTHS, 1));
      const staleValidity = <T extends { lotId: string; valid: boolean }>(entry: T): T => {
        if (entry.lotId !== target.lot) return entry;
        expect(entry.valid).toBe(false);
        return { ...entry, valid: before!.valid };
      };
      const attempts: string[] = [];
      const credits: typeof original = {
        ...original,
        async lockOpenEntries(tx, op, movement) {
          return (await original.lockOpenEntries(tx, op, movement)).map(staleValidity);
        },
        async lockAcceptanceLots(tx, ops, complement) {
          const locked = await original.lockAcceptanceLots(tx, ops, complement);
          return { ...locked, holds: locked.holds.map(staleValidity) };
        },
        async insertEntries(tx, op, entries) {
          const release = entries.find((entry) => entry.lotId === target.lot);
          if (release) {
            attempts.push(op);
            expect(release).toMatchObject({
              movement: 'release',
              to: 'available',
              quantity: '500',
            });
            const { rows } = await sql<{ expired: boolean }>`
            SELECT expires_at <= clock_timestamp() AS expired FROM app.credit_lot
              WHERE id=${target.lot}::uuid`.execute(tx);
            expect(rows).toEqual([{ expired: true }]);
          }
          return original.insertEntries(tx, op, entries);
        },
      };
      const app = requestApp(f);
      const billing = createPostgresBillingStore(db());
      const close = { store: createPostgresRequestStore(), credits, billing };
      const key = randomUUID();
      const execute = () => {
        if (winner !== null)
          return app.executorFor(f.holder, 2)(
            createAcceptRequestHandler({
              store: createPostgresRequestAcceptanceStore(),
              bookings: createOwnUseCessionPort(),
              inventory: createLuxchangeCessionInventory(),
              credits,
              billing,
            }),
            {
              request_id: winner.request.requestId,
              party_id: f.holder.partyId,
              expected_credits: '500',
            },
            key,
          );
        if (kind === 'expire_requests')
          return systemExecutor(c).execute(createSystemClosingHandler('expire_requests', close), {
            actor: { kind: 'system', job: 'expire_requests' },
            input: { request_id: requestId },
            idempotencyKey: key,
            correlationId: randomUUID(),
          });
        const reject = kind === 'reject_request';
        const actor = reject ? f.holder : target.requester;
        return app.executorFor(actor, 2)(
          reject ? createRejectRequestHandler(close) : createWithdrawRequestHandler(close),
          { request_id: requestId, party_id: actor.partyId },
          key,
        );
      };

      const result = await execute();
      expect(result).toMatchObject({ status: 'committed', replayed: false });
      expect(await execute()).toEqual({ ...result, replayed: true });
      expect(attempts).toEqual([result.operationId]);
      expect(await requestRow(pool(), requestId)).toMatchObject({ state });
      expect(await lotRow(pool(), target.lot)).toMatchObject({
        held: '0',
        expired: '500',
        available: '0',
      });
      expect(
        (
          await pool().query(
            `SELECT from_bucket, to_bucket, quantity::text, operation_id
      FROM app.credit_entry WHERE parent_entry_id=$1`,
            [target.request.holdIds[0]],
          )
        ).rows,
      ).toEqual([
        {
          from_bucket: 'held',
          to_bucket: 'expired',
          quantity: '500',
          operation_id: result.operationId,
        },
      ]);
      expect(
        (
          await pool().query(
            `SELECT to_state, reason, operation_id FROM app.luxchange_request_transition
      WHERE request_id=$1`,
            [requestId],
          )
        ).rows,
      ).toEqual([{ to_state: state, reason, operation_id: result.operationId }]);
      expect(
        (
          await pool().query(
            `SELECT v.operation_id, r.state, r.amount_minor = f.amount_minor
      AND r.currency = f.currency AS full FROM app.fee_charge f
      JOIN app.fee_charge_reversal v ON v.fee_charge_id=f.id
      JOIN app.refund r ON r.payment_id=f.payment_id AND r.operation_id=v.operation_id
      WHERE f.id=$1`,
            [target.request.feeChargeId],
          )
        ).rows,
      ).toEqual([{ operation_id: result.operationId, state: 'pending', full: true }]);
      expect(
        (
          await pool().query(
            `SELECT
      (SELECT count(*)::int FROM app.booking WHERE opened_by_operation=$1) AS bookings,
      (SELECT count(*)::int FROM app.booking_state_transition WHERE operation_id=$1) AS booking_transitions,
      (SELECT count(*)::int FROM app.date_custody WHERE opened_by_operation=$1) AS new_custody,
      (SELECT count(*)::int FROM app.date_custody WHERE closed_by_operation=$1) AS closed_custody,
      (SELECT count(*)::int FROM app.date_occupancy WHERE opened_by_operation=$1) AS occupancy,
      (SELECT count(*)::int FROM app.date_occupancy WHERE released_by_operation=$1) AS released,
      (SELECT count(*)::int FROM app.use_right_ledger WHERE operation_id=$1) AS use_rights`,
            [result.operationId],
          )
        ).rows,
      ).toEqual([
        {
          bookings: winner ? 1 : 0,
          booking_transitions: 0,
          new_custody: winner ? 1 : 0,
          closed_custody: winner ? 1 : 0,
          occupancy: winner ? 1 : 0,
          released: 0,
          use_rights: 0,
        },
      ]);
      if (winner) {
        expect(await requestRow(pool(), winner.request.requestId)).toMatchObject({
          state: 'accepted',
        });
        expect(await lotRow(pool(), winner.lot)).toMatchObject({ held: '0', consumed: '500' });
      }
    },
  );

  it('[TECH-071] 23514 permanece definitivo se o lote válido for liberado para expired', async () => {
    const target = await seed(await pricedNights(f, [5_000n]));
    const attempts: string[] = [];
    const credits: typeof original = {
      ...original,
      async insertEntries(tx, op, entries) {
        expect(entries).toEqual([
          expect.objectContaining({ movement: 'release', to: 'available' }),
        ]);
        attempts.push(op);
        return original.insertEntries(
          tx,
          op,
          entries.map((entry) => ({ ...entry, to: 'expired' })),
        );
      },
    };
    await expect(
      requestApp(f).executorFor(f.holder, 2)(
        createRejectRequestHandler({
          store: createPostgresRequestStore(),
          credits,
          billing: createPostgresBillingStore(db()),
        }),
        { request_id: target.request.requestId, party_id: f.holder.partyId },
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'credit_entry_validity_bucket',
    });
    expect(attempts).toHaveLength(1);
    expect((await pool().query('SELECT id FROM app.operation WHERE id=$1', attempts)).rows).toEqual(
      [],
    );
    expect(await requestRow(pool(), target.request.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(pool(), target.lot)).toMatchObject({ held: '500', expired: '0' });
  });

  it('[TECH-071][PD-006] exige encerramento, vínculo e quantidade autorizados mesmo após o vencimento', async () => {
    const target = await seed(await pricedNights(f, [5_000n]));
    await ageLot(c.h, target.lot, monthsAgo(TEST_VALIDITY_MONTHS, 1));
    const appUrl = c.h.database.appUrl;
    const holder = { kind: 'titular', titular: f.holder } as const;
    const release = {
      lotId: target.lot,
      parent: target.request.holdIds[0]!,
      movement: 'release',
      from: 'held',
      to: 'available',
      quantity: '500',
    };
    await expect(
      attempt(appUrl, 'reject_request', holder, (client, op) => insertEntry(client, op, release)),
    ).rejects.toMatchObject({ code: '23514', constraint: 'credit_entry_mechanism' });
    for (const [input, constraint] of [
      [{ ...release, parent: randomUUID() }, 'credit_entry_parent'],
      [{ ...release, quantity: '501' }, 'credits_parent_exceeded'],
      [{ ...release, from: 'available' }, 'credit_entry_movement_pair'],
    ] as const) {
      await expect(
        attempt(appUrl, 'reject_request', holder, (client, op) =>
          writeRejection(client, op, target.request, {
            release: async () => {
              await insertEntry(client, op, input);
            },
          }),
        ),
      ).rejects.toMatchObject({ code: '23514', constraint });
    }
    expect(await requestRow(pool(), target.request.requestId)).toMatchObject({ state: 'pending' });
    expect(await lotRow(pool(), target.lot)).toMatchObject({ held: '500', expired: '0' });
  });

  it('[TECH-070][TECH-071] preserva o bucket estrito de reverse e veda consume depois da validade', async () => {
    const requester = await newRequester(f);
    const lotId = await fundRequestCredits(f, requester, '500');
    const titular = { kind: 'titular', titular: requester } as const;
    const spend = { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '1' };
    const [parent] = await move(c, 'create_direct', titular, [spend]);
    const appUrl = c.h.database.appUrl;
    const reverseTo = (to: string) =>
      attempt(appUrl, 'reverse_credit', { kind: 'admin', admin: c.admin }, (client, op) =>
        insertEntry(client, op, {
          lotId,
          parent: parent!,
          movement: 'reverse',
          from: 'consumed',
          to,
          quantity: '1',
          basis: 'Teste W22',
        }),
      );
    const wrongBucket = { code: '23514', constraint: 'credit_entry_validity_bucket' };
    await expect(reverseTo('expired')).rejects.toMatchObject(wrongBucket);
    await ageLot(c.h, lotId, monthsAgo(TEST_VALIDITY_MONTHS, 1));
    await expect(reverseTo('available')).rejects.toMatchObject(wrongBucket);
    await expect(
      attempt(appUrl, 'create_direct', titular, (client, op) => insertEntry(client, op, spend)),
    ).rejects.toMatchObject({ code: '23514', constraint: 'credits_lot_expired' });
    expect(await lotRow(pool(), lotId)).toMatchObject({
      consumed: '1',
      available: '499',
      expired: '0',
    });
  });

  it('[TECH-110] down restaura a função da 73 e up reaplica só o corpo, preservando histórico e atributos', async () => {
    await seed(await pricedNights(f, [5_000n]));
    const readFunction = async () =>
      (
        await pool().query<{ body: string; attributes: unknown }>(`SELECT
        p.prosrc AS body, to_jsonb(p) - 'prosrc' AS attributes
        FROM pg_catalog.pg_proc p WHERE p.oid='app.credit_entry_write()'::regprocedure`)
      ).rows[0]!;
    const readHistory = async () =>
      (
        await pool().query(`SELECT to_jsonb(e) AS entry
      FROM app.credit_entry e ORDER BY id`)
      ).rows;
    const file73 = readFileSync('migrations/20261126164050_luxchange_request_accept.sql', 'utf8');
    const body73 = file73.match(
      /CREATE OR REPLACE FUNCTION app\.credit_entry_write\(\) RETURNS trigger\n[^]*?\nAS \$\$([^]*?)\$\$;/,
    )?.[1];
    const patched = await readFunction();
    const before = await readHistory();
    expect(body73).toBeDefined();
    expect(before.length).toBeGreaterThan(0);
    expect(patched.body).not.toBe(body73);
    const url = c.h.database.url;
    await dbmate(['rollback'], { url });
    try {
      expect(await readFunction()).toEqual({ body: body73, attributes: patched.attributes });
      expect(await readHistory()).toEqual(before);
    } finally {
      await migrateUp(url);
    }
    expect(await readFunction()).toEqual(patched);
    expect(await readHistory()).toEqual(before);
  });
});
