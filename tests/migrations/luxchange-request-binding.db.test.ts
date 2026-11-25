import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPolicyHandlers } from '@/features/pricing/policies';
import { addDays } from '../features/booking/booking-support';
import { activate, bookNow, connect } from '../features/booking/lifecycle-support';
import {
  creditsHarness,
  originate,
  type CreditsHarness,
  type CreditTitular,
} from '../features/credits/credits-support';
import { activateMembership } from '../features/identity/membership-support';
import { openDepositOperation } from '../features/luxchange/luxchange-support';
import {
  newRequester,
  pricedNights,
  publishNights,
  requestFixture,
  sendRequest,
  writeRequest,
  type RequestFixture,
  type RequestSpec,
} from '../features/luxchange/request-support';
import { staffRunner, type Staff } from '../features/pricing/pricing-support';
import { TEST_POLICIES } from '../features/pricing/policy-fixtures';

/**
 * W21 E1 — vínculos que o papel da aplicação não forja (ADR-0037 §4; TECH-031, TECH-054, TECH-073): operação do envio
 * (command, Titular, party e Second Home), transação do snapshot (`xmin`), política da versão vigente do mecanismo, Fee
 * presente, capacidade solicitada livre e reserva comprometida inteira.
 */
const constraint = (name: string) => expect.objectContaining({ constraint: name });

describe('W21 — vínculos do envio no banco (ADR-0037 §4)', () => {
  let c: CreditsHarness;
  let f: RequestFixture;

  /** Grava o envio na operação de `command` para `homeId` e confirma (o banco decide). */
  async function sendIn(command: string, homeId: string, spec: RequestSpec & { requester: CreditTitular }) {
    const client = await connect(c.h.database.appUrl);
    try {
      await client.query('BEGIN');
      const op = await openDepositOperation(client, spec.requester, homeId, command);
      await writeRequest(client, op, f, spec);
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  }
  async function plain(credits = '500') {
    const r = await newRequester(f);
    const lot = await originate(c, credits, { titular: r });
    const nights = await pricedNights(f, [BigInt(credits) * 10n]);
    return { r, spec: { requester: r, nights, holds: [{ lotId: lot, quantity: credits }] } };
  }

  beforeAll(async () => {
    c = await creditsHarness();
    f = await requestFixture(c);
    await activate(c.h, 'luxchange_deposit', 'own_use_booking');
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('a Request nasce só na operação send_request do solicitante para a Second Home solicitada', async () => {
    const { r, spec } = await plain();
    // Noutro command, nem a política aceita entra no snapshot; sem ela, a própria Request é recusada pelo vínculo.
    await expect(sendIn('create_direct', f.holder.homeId, spec)).rejects.toEqual(
      constraint('economic_snapshot_policy_mechanism'),
    );
    await expect(
      sendIn('create_direct', f.holder.homeId, { ...spec, tamper: { skip: ['policy'] } }),
    ).rejects.toEqual(constraint('luxchange_request_binding'));
    await expect(sendIn('send_request', r.homeId, spec)).rejects.toEqual(constraint('luxchange_request_binding'));
    await sendIn('send_request', f.holder.homeId, spec);
  });

  it('[TECH-031] fatos da Request só na transação do snapshot: operação pendente reaproveitada noutra transação é recusada', async () => {
    const { r, spec } = await plain();
    const first = await connect(c.h.database.appUrl);
    let op = '';
    try {
      await first.query('BEGIN');
      op = await openDepositOperation(first, r, f.holder.homeId, 'send_request');
      await first.query(`INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`, [
        op,
      ]);
      await first.query('COMMIT');
    } finally {
      await first.end();
    }
    const second = await connect(c.h.database.appUrl);
    try {
      await second.query('BEGIN');
      await expect(
        second.query(
          `INSERT INTO app.luxchange_request (id, operation_id, requester_party_id, holder_party_id, holder_holding_id,
             second_home_id, checkin, checkout, credits_required, guarantee_credits, complement_credits)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, 500, 500, 0)`,
          [
            randomUUID(),
            op,
            r.partyId,
            f.holder.partyId,
            f.holder.holdingId,
            f.holder.homeId,
            spec.nights[0],
            addDays(spec.nights[0]!, 1),
          ],
        ),
      ).rejects.toEqual(constraint('luxchange_request_transaction'));
    } finally {
      await second.query('ROLLBACK');
      await second.end();
    }
  });

  it('sem Fee não há Request; política de outro mecanismo não é a aceita no snapshot', async () => {
    const { r, spec } = await plain();
    await expect(sendRequest(f, { ...spec, tamper: { skip: ['fee'] } })).rejects.toEqual(
      constraint('luxchange_request_fee'),
    );
    const admin = { ...c.admin, role: 'admin' } as Staff;
    const published = await staffRunner(c.h).as(admin, createPolicyHandlers().publishPolicy, {
      mechanism: 'luxchange_direct',
      config: TEST_POLICIES.luxchange_direct,
      effective_from: null,
      effective_to: null,
      basis: 'Ata Luxtory W21 (teste)',
    });
    expect(published.status).toBe('committed');
    const { rows } = await c.h.database.pool.query<{ id: string }>(
      `SELECT p.id FROM app.commercial_policy_at('luxchange_direct', now()) p`,
    );
    const client = await connect(c.h.database.appUrl);
    try {
      await client.query('BEGIN');
      const op = await openDepositOperation(client, r, f.holder.homeId, 'send_request');
      await client.query(`INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`, [
        op,
      ]);
      await expect(
        client.query(`INSERT INTO app.economic_snapshot_policy (operation_id, policy_id) VALUES ($1, $2)`, [
          op,
          rows[0]!.id,
        ]),
      ).rejects.toEqual(constraint('economic_snapshot_policy_version'));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('[TECH-023] capacidade Owner solicitada só livre; reserva Co-Owner comprometida só inteira', async () => {
    const { spec } = await plain();
    await bookNow(c.h, f.holder, f.holder.homeId, spec.nights[0]!, addDays(spec.nights[0]!, 1));
    await expect(sendRequest(f, spec)).rejects.toEqual(constraint('custody_request_source'));

    const scenario = await c.h.coOwnerScenario();
    const titular = scenario.titulares[0]!;
    await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
    const co: CreditTitular = { ...titular, homeId: scenario.homeId };
    const booked = f.freshNights(2);
    await publishNights(c, co.homeId, Object.fromEntries(booked.map((night) => [night, 3_000n])));
    const bookingId = await bookNow(c.h, co, co.homeId, booked[0]!, addDays(booked[1]!, 1));
    const requested = await pricedNights(f, [5_000n]);
    const lot = await originate(c, '200', { titular: co });
    await expect(
      sendRequest(f, {
        requester: co,
        nights: requested,
        complement: [
          { kind: 'co_owner_booking', holdingId: co.holdingId, homeId: co.homeId, bookingId, nights: booked.slice(0, 1) },
        ],
        holds: [{ lotId: lot, quantity: '200' }],
      }),
    ).rejects.toEqual(constraint('luxchange_complement_unit_complete'));
  });
});
