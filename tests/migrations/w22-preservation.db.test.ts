import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { databaseBefore, differences, migrationDown, snapshot } from '../support/catalog-snapshot';
import { createTestDatabase, type TestDatabase } from '../support/test-database';
import { activate, asOperation, deactivate } from '../features/booking/lifecycle-support';
import { creditsHarness } from '../features/credits/credits-support';
import { requestFixture, requestRow, sendGuaranteedRequest } from '../features/luxchange/request-support';
import { fundRequestCredits, writeAcceptance, writeRejection } from '../features/luxchange/w22-support';

const W22 = '20261126164050_luxchange_request_accept';

async function bookingColumns(db: TestDatabase) {
  return (await db.pool.query(
    `SELECT attname, attnotnull, format_type(atttypid,atttypmod) AS type
     FROM pg_attribute WHERE attrelid='app.booking'::regclass AND attnum>0 AND NOT attisdropped
     ORDER BY attnum`,
  )).rows;
}

async function indexes(db: TestDatabase) {
  return (await db.pool.query(
    "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='app' ORDER BY indexname",
  )).rows;
}

async function receivedViewSecurity(db: TestDatabase) {
  return (await db.pool.query(
    `SELECT reloptions, relacl::text, relowner::regrole::text AS owner
       FROM pg_class WHERE oid='app.luxchange_request_received'::regclass`,
  )).rows;
}

describe('W22 — reversibilidade e preservação [TECH-052][TECH-110]', () => {
  let historical: Awaited<ReturnType<typeof databaseBefore>>;
  let up: string;
  let down: string;

  beforeAll(async () => {
    historical = await databaseBefore(W22);
    up = (await readFile(new URL(`../../migrations/${W22}.sql`, import.meta.url), 'utf8')).split('-- migrate:down')[0]!;
    down = await migrationDown(W22);
  });
  afterAll(async () => historical?.dispose());

  it('73 sem ativação; down restaura funções, políticas, colunas, índices e grants da W21 e up os recompõe', async () => {
    const subject = await createTestDatabase();
    try {
      const current = await snapshot(subject);
      const columns = await bookingColumns(subject);
      const beforeIndexes = await indexes(subject);
      const viewSecurity = await receivedViewSecurity(historical.database);
      expect(viewSecurity).toMatchObject([{ reloptions: ['security_barrier=true'] }]);
      expect(await receivedViewSecurity(subject)).toEqual(viewSecurity);
      expect((await subject.pool.query('SELECT capability FROM app.capability_activation')).rows).toEqual([]);
      expect(columns).toEqual(expect.arrayContaining([
        expect.objectContaining({ attname: 'holding_id', attnotnull: false }),
        expect.objectContaining({ attname: 'party_id', attnotnull: false }),
      ]));
      await subject.pool.query(down);
      expect(differences(await snapshot(historical.database), await snapshot(subject))).toEqual([]);
      expect(await bookingColumns(subject)).toEqual(await bookingColumns(historical.database));
      expect(await indexes(subject)).toEqual(await indexes(historical.database));
      expect(await receivedViewSecurity(subject)).toEqual(viewSecurity);
      await subject.pool.query(up);
      expect(differences(current, await snapshot(subject))).toEqual([]);
      expect(await bookingColumns(subject)).toEqual(columns);
      expect(await indexes(subject)).toEqual(beforeIndexes);
      expect(await receivedViewSecurity(subject)).toEqual(viewSecurity);
    } finally {
      await subject.drop();
    }
  });

  it('K7 impede o down mesmo sem Request ou reserva', async () => {
    const subject = await createTestDatabase();
    try {
      await activate({ database: subject }, 'luxchange_exchange');
      const before = await snapshot(subject);
      await expect(subject.pool.query(down)).rejects.toThrow(/rollback/i);
      expect(differences(before, await snapshot(subject))).toEqual([]);
      expect((await subject.pool.query('SELECT capability FROM app.capability_activation')).rows)
        .toEqual([{ capability: 'luxchange_exchange' }]);
    } finally {
      await subject.drop();
    }
  });

  it.each(['pending', 'accepted', 'declined'] as const)('down com Request %s preserva seus fatos econômicos', async state => {
    const c = await creditsHarness();
    try {
      const f = await requestFixture(c);
      await activate(c.h, 'luxchange_deposit');
      const lot = await fundRequestCredits(f, c.titular, '500');
      const sent = await sendGuaranteedRequest(f, lot, '500');
      if (state !== 'pending') {
        const command = state === 'accepted' ? 'accept_request' : 'reject_request';
        await asOperation(c.h.database.appUrl, command, { kind: 'titular', titular: f.holder }, async (client, op) => {
          if (state === 'accepted') await writeAcceptance(client, op, sent);
          else await writeRejection(client, op, sent);
        });
      }
      await deactivate(c.h, 'luxchange_exchange');
      const before = await snapshot(c.h.database);
      const facts = async () => (await c.h.database.pool.query(
        `SELECT (SELECT count(*) FROM app.credit_entry) AS credits, (SELECT count(*) FROM app.booking) AS bookings,
          (SELECT count(*) FROM app.settlement) AS settled, (SELECT count(*) FROM app.fee_charge_reversal) AS reversed,
          (SELECT count(*) FROM app.refund) AS refunds, (SELECT count(*) FROM app.date_custody) AS custodies,
          (SELECT count(*) FROM app.date_occupancy) AS occupancies`,
      )).rows;
      const ledger = await facts();
      if (state === 'pending') {
        await c.h.database.pool.query(down);
        expect(differences(await snapshot(historical.database), await snapshot(c.h.database))).toEqual([]);
      } else {
        await expect(c.h.database.pool.query(down)).rejects.toThrow(/rollback/i);
        expect(differences(before, await snapshot(c.h.database))).toEqual([]);
      }
      expect((await requestRow(c.h.database.pool, sent.requestId)).state).toBe(state);
      expect(await facts()).toEqual(ledger);
    } finally {
      await c.h.close();
    }
  }, 120_000);
});
