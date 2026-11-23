import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOwnUseCessionPort } from '@/features/booking';
import { createOwnUseLifecycleHandlers } from '@/features/booking/presentation/own-use-lifecycle-handlers';
import { createPostgresCreditStore } from '@/features/credits';
import { createLuxchangeCessionInventory } from '@/features/inventory';
import {
  createDepositCapacityHandler,
  DepositWriteError,
  type DepositCapacityResult,
} from '@/features/luxchange';
import { createPostgresDepositStore } from '@/features/luxchange/infrastructure/postgres-deposit-store';
import type { CommandHandler, DatabaseTransaction } from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  postgresEconomicSnapshotRecorder,
} from '@/features/pricing';
import { activate } from '../booking/lifecycle-support';
import { suspend, reactivate, TEST_VALIDITY_MONTHS } from '../credits/credits-support';
import {
  activeCustody,
  book,
  changePrl,
  coOwnerTitular,
  depositDate,
  depositHarness,
  depositRunner,
  economicFacts,
  expectedCredits,
  publishMultiplier,
  publishPrl,
  type CreditTitular,
  type DepositHarness,
} from './luxchange-support';

/**
 * W20 E4 — concorrência com PostgreSQL real (TECH-053, TECH-054; `03` §12 CONC-10; ADR-0036): cada corrida termina num
 * estado íntegro, sem duplicidade nem efeito parcial; as consultas de invariantes rodam após cada teste.
 */
describe('W20 — depósito sob concorrência (CONC-10, TECH-053)', () => {
  let d: DepositHarness;
  let owner: CreditTitular;
  let co: CreditTitular;
  const PRL = '70001';

  const body = (homeId: string, nights: readonly string[], prl = PRL, multiplier = '10') => ({
    second_home_id: homeId,
    nights,
    expected_credits: expectedCredits(BigInt(prl) * BigInt(nights.length), multiplier),
    expected_validity_months: TEST_VALIDITY_MONTHS,
  });
  const committed = (outcomes: readonly { status: string }[]) =>
    outcomes.filter((outcome) => outcome.status === 'committed').length;

  beforeAll(async () => {
    d = await depositHarness();
    owner = d.c.titular;
    co = await coOwnerTitular(d);
    const nights = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [depositDate(i), PRL] as const),
    );
    await publishPrl(d, owner.homeId, nights);
    await publishPrl(d, co.homeId, nights);
    await activate(d.c.h, 'own_use_lifecycle');
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  it('[INV-2][TECH-025] mesma noite em dois depósitos simultâneos (chaves diferentes): exatamente um confirma', async () => {
    const run = depositRunner(d, owner);
    const outcomes = await Promise.all([
      run(body(owner.homeId, [depositDate(0)])),
      run(body(owner.homeId, [depositDate(0), depositDate(1)])),
    ]);
    expect(committed(outcomes)).toBe(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      code: 'ERR_CAPACITY_UNAVAILABLE',
    });
  });

  it('[CONC-10] depósito × cancelamento da mesma reserva Co-Owner: exatamente um vence, efeitos coerentes', async () => {
    const bookingId = await book(d, co, depositDate(3), 2);
    const cancel = createOwnUseLifecycleHandlers().cancelOwnUseBooking;
    const run = depositRunner(d, co);
    const [deposit, cancellation] = await Promise.all([
      run(body(co.homeId, [depositDate(3), depositDate(4)])),
      run(
        {
          second_home_id: co.homeId,
          booking_id: bookingId,
          expected_cancellation_class: 'timely',
          expected_first_affected_date: depositDate(3),
        },
        { handler: cancel as unknown as CommandHandler<unknown, never, DatabaseTransaction> },
      ),
    ]);
    expect(committed([deposit, cancellation])).toBe(1);
    const custody = await activeCustody(d.c.h.database.pool, co.homeId, [
      depositDate(3),
      depositDate(4),
    ]);
    const { rows } = await d.c.h.database.pool.query<{ kind: string; restores: number }>(
      `SELECT t.kind, (SELECT count(*)::int FROM app.use_right_ledger l
                        WHERE l.operation_id = t.operation_id AND l.movement = 'restore') AS restores
         FROM app.booking b JOIN app.booking_state_transition t ON t.id = b.last_transition_id WHERE b.id = $1`,
      [bookingId],
    );
    if (deposit.status === 'committed') {
      expect(rows[0]).toEqual({ kind: 'cession', restores: 0 });
      expect(custody.map((row) => row.inventory_origin)).toEqual([
        'luxchange_cession',
        'luxchange_cession',
      ]);
    } else {
      expect(rows[0]).toEqual({ kind: 'cancellation', restores: 2 });
      expect(custody.map((row) => row.holder_kind)).toEqual(['spe_pool', 'spe_pool']);
    }
  });

  it('[INV-1][BR-166] depósito do Owner × reserva de uso próprio na mesma noite: exatamente uma confirma', async () => {
    await activate(d.c.h, 'own_use_booking');
    const [deposit, booking] = await Promise.allSettled([
      depositRunner(d, owner)(body(owner.homeId, [depositDate(6)])),
      book(d, owner, depositDate(6), 1),
    ]);
    const depositWon = deposit.status === 'fulfilled' && deposit.value.status === 'committed';
    const bookingWon = booking.status === 'fulfilled';
    expect(Number(depositWon) + Number(bookingWon)).toBe(1);
  });

  it('[BR-146][TECH-053] depósito × suspensão do Membership: ou deposita antes, ou é recusado depois', async () => {
    const [deposit] = await Promise.all([
      depositRunner(d, owner)(body(owner.homeId, [depositDate(8)])),
      suspend(d.c, owner.partyId),
    ]);
    await reactivate(d.c, owner.partyId);
    if (deposit.status === 'rejected') expect(deposit.code).toBe('ERR_MEMBERSHIP_INELIGIBLE');
    const custody = await activeCustody(d.c.h.database.pool, owner.homeId, [depositDate(8)]);
    expect(custody[0]!.holder_kind).toBe(deposit.status === 'committed' ? 'luxtory' : 'owner');
  });

  it('[REQ-052][BR-182] depósito × alteração do PRL: snapshot com a versão usada, ou recusa por termos alterados', async () => {
    const [deposit, change] = await Promise.all([
      depositRunner(d, owner)(body(owner.homeId, [depositDate(10)])),
      changePrl(d, owner.homeId, { [depositDate(10)]: '80002' }),
    ]);
    expect(change.status).toBe('committed');
    if (deposit.status === 'committed') {
      const { rows } = await d.c.h.database.pool.query<{ amount: string }>(
        `SELECT l.amount_minor::text AS amount FROM app.economic_snapshot_night n JOIN app.prl l ON l.id = n.prl_id
          WHERE n.operation_id = $1`,
        [deposit.operationId],
      );
      expect(rows[0]!.amount).toBe(PRL);
      expect((deposit.result as DepositCapacityResult).credits).toBe(expectedCredits(BigInt(PRL)));
    } else expect(deposit.code).toBe('ERR_DEPOSIT_TERMS_CHANGED');
    // Depois da alteração, o mesmo pedido com os termos antigos é recusado; com os novos, deposita.
    expect(await depositRunner(d, owner)(body(owner.homeId, [depositDate(11)]))).toMatchObject({
      status: 'committed',
    });
  });

  it('[BR-201][TECH-030] depósito × novo multiplicador: lote com a versão do snapshot, ou recusa por termos alterados', async () => {
    const [deposit] = await Promise.all([
      depositRunner(d, owner)(body(owner.homeId, [depositDate(12)])),
      publishMultiplier(d.c, '12'),
    ]);
    if (deposit.status === 'committed') {
      const { rows } = await d.c.h.database.pool.query<{ value: string }>(
        `SELECT p.value FROM app.economic_snapshot_parameter sp JOIN app.parameter p ON p.id = sp.parameter_id
          WHERE sp.operation_id = $1 AND sp.parameter_key = 'credit_multiplier'`,
        [deposit.operationId],
      );
      expect(rows[0]!.value).toBe('10');
    } else expect(deposit.code).toBe('ERR_DEPOSIT_TERMS_CHANGED');
    expect(
      await depositRunner(d, owner)(body(owner.homeId, [depositDate(13)], PRL, '12')),
    ).toMatchObject({ status: 'committed' });
  });

  it('[TECH-054] falha depois do lote e antes do commit: nada persiste (sem lote, snapshot, cessão ou operação)', async () => {
    const before = await economicFacts(d.c.h.database.pool);
    const failing = createDepositCapacityHandler<DatabaseTransaction>({
      store: createPostgresDepositStore(),
      bookings: createOwnUseCessionPort(),
      inventory: { ...createLuxchangeCessionInventory(), cedeNight: async () => false },
      terms: createPostgresEconomicTermsStore(),
      credits: createPostgresCreditStore(),
      snapshots: postgresEconomicSnapshotRecorder,
    });
    const key = randomUUID();
    await expect(
      depositRunner(d, owner)(body(owner.homeId, [depositDate(15)], PRL, '12'), {
        key,
        handler: failing as unknown as CommandHandler<unknown, never, DatabaseTransaction>,
      }),
    ).rejects.toBeInstanceOf(DepositWriteError);
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
    const { rows } = await d.c.h.database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.operation WHERE idempotency_key = $1`,
      [key],
    );
    expect(rows[0]!.n).toBe(0);
  });
});
