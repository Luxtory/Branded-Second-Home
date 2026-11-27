import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rejectionForConstraint } from '@/features/platform/domain/errors';
import { waitForLockWaiter } from '../support/platform-fixtures';
import { activate, asOperation, connect, openOperation } from '../features/booking/lifecycle-support';
import { asUser } from '../features/calendar/luxtory-selection-support';
import {
  TEST_VALIDITY_MONTHS,
  ageLot,
  attempt,
  creditsHarness,
  insertEntry,
  insertLot,
  lotRow,
  monthsAgo,
  move,
  originate,
  reactivate,
  recordValiditySnapshot,
  secondTitular,
  suspend,
  type CreditTitular,
  type CreditsHarness,
} from '../features/credits/credits-support';
import {
  closeRequest,
  newRequester,
  pricedNights,
  prlForCredits,
  sendRequest,
  writeClosing,
  requestFixture,
  sendGuaranteedRequest,
  type RequestFixture,
} from '../features/luxchange/request-support';
import { cedeRequestNights, writeAcceptance, writeAcceptedTransition } from '../features/luxchange/w22-support';

/**
 * W17 E1 — regras dos Créditos no banco (ADR-0033; ADR-007, TECH-025, TECH-031, TECH-044, TECH-070–072; INV-6). As
 * escritas são as do papel da aplicação com a operação `pending` do command; o banco decide origem, validade, par,
 * command, Membership, representação e saldo. `app.credit_invariant_breaches()` roda no `drop()` de cada banco.
 */
const constraint = (name: string) => expect.objectContaining({ constraint: name });
const denied = expect.objectContaining({ code: '42501' });

describe('W17 — Créditos no banco (ADR-0033)', () => {
  let c: CreditsHarness;
  let other: CreditTitular;
  // Desde a W21 (ADR-0037 §4), toda Garantia lastreia uma Request completa; os movimentos seguintes são os da W17.
  let f: RequestFixture;
  const titular = () => ({ kind: 'titular' as const, titular: c.titular });
  const admin = () => ({ kind: 'admin' as const, admin: c.admin });

  beforeAll(async () => {
    c = await creditsHarness();
    other = await secondTitular(c);
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit');
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  async function sentFor(holder: CreditTitular, quantity: string) {
    const requester = await newRequester(f);
    const lotId = await originate(c, quantity, { titular: requester });
    return sendRequest(f, {
      holder, requester, nights: await pricedNights(f, [prlForCredits(f, quantity)], holder.homeId),
      holds: [{ lotId, quantity }],
    });
  }

  async function acceptedLot(holder: CreditTitular, quantity: string) {
    const sent = await sentFor(holder, quantity);
    const result = await asOperation(c.h.database.appUrl, 'accept_request', { kind: 'titular', titular: holder },
      (client, op) => writeAcceptance(client, op, sent));
    return result.holderLotId;
  }

  describe('originação [INV-6][TECH-025][TECH-031][TECH-044]', () => {
    it('grava validade e instante a partir do snapshot, com a originação escrita pelo banco', async () => {
      const lotId = await acceptedLot(c.titular, '1234.5');
      const lot = await lotRow(c.h.database.pool, lotId);
      expect(lot).toMatchObject({
        party_id: c.titular.partyId,
        quantity: '1234.5',
        held: '0',
        available: '1234.5',
        origin_command: 'accept_request',
      });
      const { rows } = await c.h.database.pool.query<{ ok: boolean; snap: boolean; entries: number }>(
        `SELECT l.expires_at = app.credit_expires_at(s.resolved_at, $2) AS ok,
                l.originated_at = s.resolved_at AS snap,
                (SELECT count(*)::int FROM app.credit_entry e
                  WHERE e.lot_id = l.id AND e.movement = 'originate' AND e.from_bucket = 'external'
                    AND e.quantity = l.quantity AND e.command = 'accept_request') AS entries
           FROM app.credit_lot l JOIN app.economic_snapshot s ON s.operation_id = l.origin_operation_id
          WHERE l.id = $1`,
        [lotId, TEST_VALIDITY_MONTHS],
      );
      expect(rows[0]).toEqual({ ok: true, snap: true, entries: 1 });
    });

    it('aceite de Request origina Créditos ao cedente (a party que age)', async () => {
      const lotId = await acceptedLot(other, '10');
      expect((await lotRow(c.h.database.pool, lotId)).origin_command).toBe('accept_request');
    });

    it('sem snapshot da validade, nenhum lote nasce', async () => {
      await expect(
        attempt(c.h.database.appUrl, 'deposit_capacity', titular(), (client, op) =>
          insertLot(client, op, c.titular.partyId, '5'),
        ),
      ).rejects.toEqual(constraint('credit_lot_snapshot_missing'));
    });

    it.each([
      ['command fora da originação', 'create_direct', false],
      ['party diferente da que age no depósito', 'deposit_capacity', true],
    ])('recusa origem inválida: %s', async (_label, command, otherParty) => {
      await expect(
        attempt(c.h.database.appUrl, command, titular(), async (client, op) => {
          await recordValiditySnapshot(client, op);
          await insertLot(client, op, otherParty ? other.partyId : c.titular.partyId, '5');
        }),
      ).rejects.toEqual(constraint('credit_lot_origin'));
    });

    it('validade, instante e buckets não vêm da entrada (privilégio por coluna)', async () => {
      await expect(
        attempt(c.h.database.appUrl, 'accept_request', titular(), async (client, op) => {
          await recordValiditySnapshot(client, op);
          await client.query(
            `INSERT INTO app.credit_lot (id, party_id, quantity, origin_operation_id, expires_at)
             VALUES ($1, $2, 5, $3, now() + interval '99 years')`,
            [randomUUID(), c.titular.partyId, op],
          );
        }),
      ).rejects.toEqual(denied);
    });

    it('retry na mesma operação não duplica o lote [TECH-025]', async () => {
      const sent = await sentFor(c.titular, '5');
      await expect(
        attempt(c.h.database.appUrl, 'accept_request', titular(), async (client, op) => {
          await writeAcceptedTransition(client, op, sent.requestId);
          await cedeRequestNights(client, op, sent.requestId);
          await insertLot(client, op, c.titular.partyId, '5');
          await insertLot(client, op, c.titular.partyId, '5');
        }),
      ).rejects.toEqual(constraint('credit_lot_origin_unique'));
    });

    it('o servidor não escreve originação nem altera ou apaga lote e ledger', async () => {
      const lotId = await originate(c, '7');
      await expect(
        move(c, 'accept_request', titular(), [
          { lotId, movement: 'originate', from: 'external', to: 'available', quantity: '7' },
        ]),
      ).rejects.toEqual(constraint('credit_entry_origination'));
      const client = await connect(c.h.database.appUrl);
      try {
        await expect(
          client.query(`UPDATE app.credit_lot SET held = 0 WHERE id = $1`, [lotId]),
        ).rejects.toEqual(constraint('credit_lot_ledger_only'));
        await expect(client.query(`DELETE FROM app.credit_entry WHERE lot_id = $1`, [lotId])).rejects.toEqual(
          denied,
        );
        await expect(client.query(`DELETE FROM app.credit_lot WHERE id = $1`, [lotId])).rejects.toEqual(denied);
      } finally {
        await client.end();
      }
      // Nem o dono altera party, quantidade ou validade (TECH-044: expires_at nunca é prorrogado).
      await expect(
        c.h.database.pool.query(
          `UPDATE app.credit_lot SET expires_at = expires_at + interval '1 day' WHERE id = $1`,
          [lotId],
        ),
      ).rejects.toEqual(constraint('credit_lot_immutable'));
      await expect(
        c.h.database.pool.query(`UPDATE app.credit_entry SET quantity = 1 WHERE lot_id = $1`, [lotId]),
      ).rejects.toEqual(denied);
    });
  });

  describe('snapshot [TECH-031]', () => {
    it('instante fora da transação ou versão não vigente é recusado', async () => {
      await expect(
        attempt(c.h.database.appUrl, 'accept_request', titular(), (client, op) =>
          client.query(
            `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, now() - interval '1 second')`,
            [op],
          ),
        ),
      ).rejects.toEqual(constraint('economic_snapshot_instant'));
      await expect(
        attempt(c.h.database.appUrl, 'accept_request', titular(), async (client, op) => {
          await client.query(
            `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
            [op],
          );
          await client.query(
            `INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
             VALUES ($1, 'credit_multiplier', $2)`,
            [op, c.validityId!],
          );
        }),
      ).rejects.toEqual(constraint('economic_snapshot_parameter_version'));
    });

    it('snapshot é imutável', async () => {
      const lotId = await originate(c, '3');
      const { rows } = await c.h.database.pool.query<{ op: string }>(
        `SELECT origin_operation_id AS op FROM app.credit_lot WHERE id = $1`,
        [lotId],
      );
      await expect(
        c.h.database.pool.query(`DELETE FROM app.economic_snapshot_parameter WHERE operation_id = $1`, [rows[0]!.op]),
      ).rejects.toEqual(denied);
    });
  });

  describe('movimentos do TECH-070', () => {
    it('Garantia, liberação, consumo e reversão escrevem os buckets pelo ledger', async () => {
      const party = await secondTitular(c);
      const lotId = await originate(c, '100', { titular: party });
      const withdrawn = await sendGuaranteedRequest(f, lotId, '15', party);
      const accepted = await sendGuaranteedRequest(f, lotId, '25', party);
      expect(await lotRow(c.h.database.pool, lotId)).toMatchObject({ held: '40', available: '60' });
      await closeRequest(f, withdrawn, 'withdraw_request', party);
      const acceptOp = await asOperation(c.h.database.appUrl, 'accept_request', { kind: 'titular', titular: f.holder },
        async (client, op) => {
          await writeAcceptance(client, op, accepted);
          return op;
        });
      const { rows: [consumption] } = await c.h.database.pool.query<{ id: string }>(
        "SELECT id FROM app.credit_entry WHERE operation_id=$1 AND lot_id=$2 AND movement='consume'", [acceptOp, lotId],
      );
      const consumed = consumption!.id;
      expect(await lotRow(c.h.database.pool, lotId)).toMatchObject({ held: '0', consumed: '25', available: '75' });
      await move(c, 'reverse_credit', admin(), [
        { lotId, movement: 'reverse', from: 'consumed', to: 'available', quantity: '5', parent: consumed, basis: 'Correção' },
      ]);
      expect(await lotRow(c.h.database.pool, lotId)).toMatchObject({ consumed: '20', available: '80' });
    });

    it('nada acima do que a Garantia ou o consumo ainda cobre [INV-6]', async () => {
      const party = await secondTitular(c);
      const lotId = await originate(c, '10', { titular: party });
      const sent = await sendGuaranteedRequest(f, lotId, '4', party);
      const [hold] = sent.holdIds;
      const error = await attempt(c.h.database.appUrl, 'withdraw_request', { kind: 'titular', titular: party },
        async (client, op) => {
          await writeClosing(client, op, sent, { skip: ['release', 'fee'] });
          await insertEntry(client, op, { lotId, movement: 'release', from: 'held', to: 'available', quantity: '5', parent: hold });
        },
      ).catch((e: unknown) => e);
      expect(error).toEqual(constraint('credits_parent_exceeded'));
      expect(rejectionForConstraint('credits_parent_exceeded')).toBe('ERR_CREDITS_INSUFFICIENT');
      const [consumed] = await move(c, 'create_direct', { kind: 'titular', titular: party }, [
        { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '6' },
      ]);
      await move(c, 'reverse_credit', admin(), [
        { lotId, movement: 'reverse', from: 'consumed', to: 'available', quantity: '6', parent: consumed, basis: 'Correção' },
      ]);
      await expect(
        move(c, 'reverse_credit', admin(), [
          { lotId, movement: 'reverse', from: 'consumed', to: 'available', quantity: '1', parent: consumed, basis: 'Dupla' },
        ]),
      ).rejects.toEqual(constraint('credits_parent_exceeded'));
    });

    it('gasto acima do disponível falha [INV-6]', async () => {
      const lotId = await originate(c, '10');
      await expect(
        move(c, 'create_direct', titular(), [
          { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '10.01' },
        ]),
      ).rejects.toEqual(constraint('credits_available_nonnegative'));
    });

    it.each([
      ['Garantia de outra party (transferência)', 'send_request', 'other', 'hold'],
      ['consumo direto de outra party', 'create_direct', 'other', 'consume'],
      ['Garantia fora do envio de Request', 'create_direct', 'self', 'hold'],
      ['consumo direto fora do Direct', 'send_request', 'self', 'consume'],
    ])('recusa %s [INV-6]', async (_label, command, who, movement) => {
      const lotId = await originate(c, '10');
      const actor = who === 'other' ? { kind: 'titular' as const, titular: other } : titular();
      await expect(
        move(c, command, actor, [
          { lotId, movement, from: 'available', to: movement === 'hold' ? 'held' : 'consumed', quantity: '1' },
        ]),
      ).rejects.toEqual(constraint('credit_entry_mechanism'));
    });

    it('reversão exige Admin ativo e base registrada', async () => {
      const lotId = await originate(c, '10');
      const [consumed] = await move(c, 'create_direct', titular(), [
        { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '2' },
      ]);
      await expect(
        move(c, 'reverse_credit', titular(), [
          { lotId, movement: 'reverse', from: 'consumed', to: 'available', quantity: '1', parent: consumed, basis: 'x' },
        ]),
      ).rejects.toEqual(constraint('permission_staff_role'));
      await expect(
        move(c, 'reverse_credit', admin(), [
          { lotId, movement: 'reverse', from: 'consumed', to: 'available', quantity: '1', parent: consumed },
        ]),
      ).rejects.toEqual(constraint('credit_entry_basis_required'));
    });

    it('expiração só depois do vencimento', async () => {
      const lotId = await originate(c, '10');
      await expect(
        move(c, 'expire_credit_lots', { kind: 'system' }, [
          { lotId, movement: 'expire', from: 'available', to: 'expired', quantity: '10' },
        ]),
      ).rejects.toEqual(constraint('credit_entry_expiration'));
    });
  });

  describe('validade [TECH-044][TECH-070][TECH-072]', () => {
    it.each([
      ['2026-08-31T15:00:00Z', 24, '2028-08-31T15:00:00Z'],
      ['2028-02-29T03:00:00Z', 12, '2029-02-28T03:00:00Z'],
      ['2027-01-31T00:00:00Z', 1, '2027-02-28T00:00:00Z'],
      ['2027-12-31T23:59:59Z', 2, '2028-02-29T23:59:59Z'],
      ['2099-11-30T10:00:00Z', 3, '2100-02-28T10:00:00Z'],
    ])('%s + %i meses → %s (UTC, último dia válido)', async (from, months, expected) => {
      const { rows } = await c.h.database.pool.query<{ at: Date }>(
        `SELECT app.credit_expires_at($1::timestamptz, $2) AS at`,
        [from, months],
      );
      expect(rows[0]!.at.toISOString()).toBe(new Date(expected).toISOString());
    });

    it('lote vencido é inutilizável antes do job, e o job atrasado não prorroga', async () => {
      const lotId = await originate(c, '10');
      await ageLot(c.h, lotId, monthsAgo(TEST_VALIDITY_MONTHS, 6));
      const before = await lotRow(c.h.database.pool, lotId);
      expect(before.expires_at.getTime()).toBeLessThan(Date.now());
      await expect(
        move(c, 'create_direct', titular(), [
          { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '1' },
        ]),
      ).rejects.toEqual(constraint('credits_lot_expired'));
      await move(c, 'expire_credit_lots', { kind: 'system' }, [
        { lotId, movement: 'expire', from: 'available', to: 'expired', quantity: '10' },
      ]);
      const after = await lotRow(c.h.database.pool, lotId);
      expect(after).toMatchObject({ expired: '10', available: '0' });
      expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
    });

    it('reversão e liberação depois do vencimento vão para expired', async () => {
      const party = await secondTitular(c);
      const lotId = await originate(c, '10', { titular: party });
      const request = await sendGuaranteedRequest(f, lotId, '3', party);
      const [consumed] = await move(c, 'create_direct', { kind: 'titular', titular: party }, [
        { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '4' },
      ]);
      await ageLot(c.h, lotId, monthsAgo(TEST_VALIDITY_MONTHS, 6));
      await expect(
        move(c, 'reverse_credit', admin(), [
          { lotId, movement: 'reverse', from: 'consumed', to: 'available', quantity: '4', parent: consumed, basis: 'x' },
        ]),
      ).rejects.toEqual(constraint('credit_entry_validity_bucket'));
      await move(c, 'reverse_credit', admin(), [
        { lotId, movement: 'reverse', from: 'consumed', to: 'expired', quantity: '4', parent: consumed, basis: 'x' },
      ]);
      // Retirada (W21): encerramento completo; a Garantia do lote vencido volta como expired (TECH-072).
      await closeRequest(f, request, 'withdraw_request', party);
      expect(await lotRow(c.h.database.pool, lotId)).toMatchObject({
        held: '0',
        consumed: '0',
        expired: '7',
        available: '3',
      });
    });

    it('antes do vencimento, reversão para expired é recusada', async () => {
      const lotId = await originate(c, '10');
      const [consumed] = await move(c, 'create_direct', titular(), [
        { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '4' },
      ]);
      await expect(
        move(c, 'reverse_credit', admin(), [
          { lotId, movement: 'reverse', from: 'consumed', to: 'expired', quantity: '4', parent: consumed, basis: 'x' },
        ]),
      ).rejects.toEqual(constraint('credit_entry_validity_bucket'));
    });
  });

  describe('Membership [REQ-053][BR-193–196]', () => {
    it('inelegível bloqueia uso sem pausar validade; reativação restabelece só o saldo válido', async () => {
      const party = await secondTitular(c);
      const valid = await originate(c, '10', { titular: party });
      const lapsing = await originate(c, '5', { titular: party });
      const before = await lotRow(c.h.database.pool, valid);
      await suspend(c, party.partyId);
      const actor = { kind: 'titular' as const, titular: party };
      const error = await move(c, 'create_direct', actor, [
        { lotId: valid, movement: 'consume', from: 'available', to: 'consumed', quantity: '1' },
      ]).catch((e: unknown) => e);
      expect(error).toEqual(constraint('credit_membership_ineligible'));
      expect(rejectionForConstraint('credit_membership_ineligible')).toBe('ERR_MEMBERSHIP_INELIGIBLE');
      // Validade corre durante a suspensão: um dos lotes vence.
      await ageLot(c.h, lapsing, monthsAgo(TEST_VALIDITY_MONTHS, 6));
      await reactivate(c, party.partyId);
      expect((await lotRow(c.h.database.pool, valid)).expires_at).toEqual(before.expires_at);
      await move(c, 'create_direct', actor, [
        { lotId: valid, movement: 'consume', from: 'available', to: 'consumed', quantity: '1' },
      ]);
      await expect(
        move(c, 'create_direct', actor, [
          { lotId: lapsing, movement: 'consume', from: 'available', to: 'consumed', quantity: '1' },
        ]),
      ).rejects.toEqual(constraint('credits_lot_expired'));
      await move(c, 'expire_credit_lots', { kind: 'system' }, [
        { lotId: lapsing, movement: 'expire', from: 'available', to: 'expired', quantity: '5' },
      ]);
    });
  });

  describe('concorrência [CONC-8]', () => {
    it('dois gastos sobre os mesmos Créditos: exatamente um confirma', async () => {
      const lotId = await originate(c, '10');
      const first = await connect(c.h.database.appUrl);
      const second = await connect(c.h.database.appUrl);
      try {
        await first.query('BEGIN');
        await second.query('BEGIN');
        const op1 = await openOperation(first, 'create_direct', titular());
        const op2 = await openOperation(second, 'create_direct', titular());
        await insertEntry(first, op1, { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '7' });
        const racing = insertEntry(second, op2, {
          lotId,
          movement: 'consume',
          from: 'available',
          to: 'consumed',
          quantity: '7',
        }).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        await waitForLockWaiter(c.h.database.pool);
        await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op1]);
        await first.query('COMMIT');
        const outcome = await racing;
        expect(outcome).toEqual({ ok: false, error: constraint('credits_available_nonnegative') });
        await second.query('ROLLBACK');
      } finally {
        await first.end();
        await second.end();
      }
      expect(await lotRow(c.h.database.pool, lotId)).toMatchObject({ consumed: '7', available: '3' });
    });
  });

  describe('K4 e leitura [TECH-052]', () => {
    it('sem a K4, o papel da aplicação não grava lote nem movimento', async () => {
      const lotId = await originate(c, '2');
      await c.h.database.pool.query(`DELETE FROM app.capability_activation WHERE capability = 'credits'`);
      try {
        await expect(attempt(c.h.database.appUrl, 'deposit_capacity', titular(),
          (client, op) => insertLot(client, op, c.titular.partyId, '1'),
        )).rejects.toEqual(constraint('credit_capability_not_activated'));
        await expect(
          move(c, 'create_direct', titular(), [
            { lotId, movement: 'consume', from: 'available', to: 'consumed', quantity: '1' },
          ]),
        ).rejects.toEqual(constraint('credit_capability_not_activated'));
        expect(rejectionForConstraint('credit_capability_not_activated')).toBeNull();
      } finally {
        await c.h.database.pool.query(
          `INSERT INTO app.capability_activation VALUES ('credits', now(), 'test:activation')`,
        );
      }
    });

    it('o Titular lê só os Créditos das parties que representa, sem a base das reversões', async () => {
      await originate(c, '9', { titular: other });
      const own = await asUser<{ party_id: string }>(
        c.h.database.url,
        c.titular.userId,
        'SELECT DISTINCT party_id FROM app.credit_lot',
      );
      expect(own).toEqual([{ party_id: c.titular.partyId }]);
      const entries = await asUser<{ n: number }>(
        c.h.database.url,
        c.titular.userId,
        `SELECT count(*)::int AS n FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
          WHERE l.party_id <> $1`,
        [c.titular.partyId],
      );
      expect(entries).toEqual([{ n: 0 }]);
      await expect(
        asUser(c.h.database.url, c.titular.userId, 'SELECT basis FROM app.credit_entry'),
      ).rejects.toEqual(denied);
      await expect(
        asUser(c.h.database.url, c.titular.userId, 'SELECT * FROM app.economic_snapshot'),
      ).rejects.toEqual(denied);
    });

    it.each([
      ['migrations/20261122120003_credits_ledger.sql', /discard credits/],
      ['migrations/20261122120001_pricing_economic_snapshot.sql', /discard economic snapshots/],
    ])('[TECH-052][TECH-110] rollback recusado com dados gravados: %s', async (file, message) => {
      const down = (await readFile(file, 'utf8')).split('-- migrate:down')[1]!;
      const client = await connect(c.h.database.url);
      try {
        await client.query('BEGIN');
        await expect(client.query(down)).rejects.toThrow(message);
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
    });
  });
});
