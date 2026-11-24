import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  consumeCredits,
  consumeHold,
  createPostgresCreditStore,
  createReverseCreditHandler,
  holdCredits,
  originateCreditLot,
  releaseHold,
  type Movement,
} from '@/features/credits';
import {
  createExpireCreditLotHandler,
  runExpireCreditLots,
} from '@/features/credits/application/expire-credit-lots';
import { dueCreditLots } from '@/features/credits/infrastructure/due-credit-lots';
import {
  CapabilityNotActivatedError,
  type CommandHandler,
  type DatabaseTransaction,
} from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  postgresEconomicSnapshotRecorder,
  resolveEconomicTerms,
} from '@/features/pricing';
import { staffRunner } from '../pricing/pricing-support';
import {
  TEST_VALIDITY_MONTHS,
  ageLot,
  creditsHarness,
  lotRow,
  monthsAgo,
  originate,
  secondTitular,
  suspend,
  systemExecutor,
  titularExecutor,
  type CreditTitular,
  type CreditsHarness,
} from './credits-support';

/**
 * W17 E2 — mecanismos dos Créditos pelo executor real (TECH-054): guard do Titular, Membership no executor e no banco,
 * travas na ordem da TECH-053. Os handlers de teste usam os commands do registro que as waves seguintes implementarão
 * (W20–W23) e só chamam as funções do slice `credits`.
 */
const store = createPostgresCreditStore();
const deps = { store };
const homeScope = z.strictObject({ second_home_id: z.uuid() });

type Tx = DatabaseTransaction;
type MovementsResult = { readonly movements: readonly { lot: string; quantity: string }[] };
const summary = (movements: readonly Movement[]): MovementsResult => ({
  movements: movements.map((movement) => ({ lot: movement.lotId, quantity: movement.quantity })),
});

function scoped<I extends { second_home_id: string }>(
  command: string,
  input: z.ZodType<I>,
  body: CommandHandler<I, MovementsResult, Tx>['execute'],
): CommandHandler<I, MovementsResult, Tx> {
  return {
    command,
    input,
    secondHomeId: (value) => value.second_home_id,
    scope: (value) => ({ type: 'second_home', id: value.second_home_id }),
    async execute(context) {
      context.audit({ objectType: 'credit_test', objectId: command, before: null, after: null });
      return body(context);
    },
  };
}

const partyOf = (actor: { kind: string; actingPartyId?: string | null }) => actor.actingPartyId!;

// Originação genérica pelo aceite (W17); a originação por depósito exige o depósito inteiro desde a W20 (ADR-0036) e é
// provada em tests/features/luxchange. A autoridade "detentor" chega com a W22: guard de teste explícito.
const originateHandler = scoped(
  'accept_request',
  homeScope.extend({ quantity: z.string() }),
  async ({ input, tx, locks, operationId, actor, requireEligibleMembership }) => {
    const party = partyOf(actor as { kind: string; actingPartyId: string });
    await requireEligibleMembership([party]);
    const terms = await resolveEconomicTerms(tx, locks, createPostgresEconomicTermsStore(), {
      parameters: ['credit_validity_months'],
    });
    const lot = await originateCreditLot(
      { tx, locks, operationId },
      { store, snapshots: postgresEconomicSnapshotRecorder },
      { partyId: party, quantity: input.quantity, terms },
    );
    return { movements: [{ lot: lot.lotId, quantity: lot.quantity }] };
  },
);

const directHandler = scoped(
  'create_direct',
  homeScope.extend({ quantity: z.string() }),
  async ({ input, tx, locks, operationId, actor, requireEligibleMembership }) => {
    const party = partyOf(actor as { kind: string; actingPartyId: string });
    await requireEligibleMembership([party]);
    return summary(
      await consumeCredits({ tx, locks, operationId }, deps, {
        partyId: party,
        quantity: input.quantity,
      }),
    );
  },
);

const holdHandler = scoped(
  'send_request',
  homeScope.extend({ quantity: z.string(), cover_until: z.string() }),
  async ({ input, tx, locks, operationId, actor, requireEligibleMembership }) => {
    const party = partyOf(actor as { kind: string; actingPartyId: string });
    await requireEligibleMembership([party]);
    return summary(
      await holdCredits({ tx, locks, operationId }, deps, {
        partyId: party,
        quantity: input.quantity,
        coverUntil: input.cover_until,
      }),
    );
  },
);

const acceptHandler = scoped(
  'accept_request',
  homeScope.extend({ hold_operation_id: z.uuid() }),
  async ({ input, tx, locks, operationId, actor, requireEligibleMembership }) => {
    await requireEligibleMembership([partyOf(actor as { kind: string; actingPartyId: string })]);
    return summary(
      await consumeHold({ tx, locks, operationId }, deps, {
        holdOperationId: input.hold_operation_id,
      }),
    );
  },
);

const withdrawHandler = scoped(
  'withdraw_request',
  homeScope.extend({ hold_operation_id: z.uuid() }),
  async ({ input, tx, locks, operationId }) =>
    summary(
      await releaseHold({ tx, locks, operationId }, deps, {
        holdOperationId: input.hold_operation_id,
      }),
    ),
);

const nextYear = new Date().getUTCFullYear() + 1;
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('W17 — mecanismos dos Créditos (ADR-0033)', () => {
  let c: CreditsHarness;

  beforeAll(async () => {
    c = await creditsHarness();
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  async function freshParty(): Promise<CreditTitular> {
    return secondTitular(c);
  }

  async function committed<R>(
    outcome: Promise<{ status: string; result?: R; code?: string }>,
  ): Promise<R> {
    const value = await outcome;
    if (value.status !== 'committed') throw new Error(`expected commit, got ${value.code}`);
    return value.result as R;
  }

  describe('originação [TECH-025][TECH-031][TECH-044]', () => {
    it('persiste o snapshot da validade na mesma operação e um retry não duplica o lote', async () => {
      const party = await freshParty();
      const run = titularExecutor(c, party, { requestGuard: true });
      const key = randomUUID();
      const input = { second_home_id: party.homeId, quantity: '250.75' };
      const first = await run(originateHandler, input, key);
      const second = await run(originateHandler, input, key);
      expect(first).toMatchObject({ status: 'committed', replayed: false });
      expect(second).toMatchObject({ status: 'committed', replayed: true });
      const { rows } = await c.h.database.pool.query<{ lots: number; versions: string[] }>(
        `SELECT count(DISTINCT l.id)::int AS lots, array_agg(sp.parameter_id::text) AS versions
           FROM app.credit_lot l
           JOIN app.economic_snapshot_parameter sp ON sp.operation_id = l.origin_operation_id
          WHERE l.party_id = $1`,
        [party.partyId],
      );
      expect(rows[0]).toEqual({ lots: 1, versions: [c.validityId] });
    });

    it('sem Membership elegível, nada é originado nem gasto', async () => {
      const party = await freshParty();
      await originate(c, '10', { titular: party });
      await suspend(c, party.partyId);
      const run = titularExecutor(c, party, { requestGuard: true });
      expect(
        await run(originateHandler, { second_home_id: party.homeId, quantity: '1' }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_MEMBERSHIP_INELIGIBLE' });
      expect(
        await run(directHandler, { second_home_id: party.homeId, quantity: '1' }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_MEMBERSHIP_INELIGIBLE' });
    });
  });

  describe('FEFO [PD-008]', () => {
    it('consome o lote que vence antes; em empate, o de originação mais antiga', async () => {
      const party = await freshParty();
      // 31/08 e 30/08 do ano anterior + 18 meses → ambos vencem no último dia de fevereiro do ano seguinte (empate).
      const tiedLate = await originate(c, '10', { titular: party });
      const tiedEarly = await originate(c, '10', { titular: party });
      const later = await originate(c, '10', { titular: party });
      await ageLot(c.h, tiedLate, new Date(Date.UTC(nextYear - 2, 7, 31, 12)));
      await ageLot(c.h, tiedEarly, new Date(Date.UTC(nextYear - 2, 7, 30, 12)));
      const [a, b] = [
        await lotRow(c.h.database.pool, tiedLate),
        await lotRow(c.h.database.pool, tiedEarly),
      ];
      expect(a.expires_at).toEqual(b.expires_at);
      expect(a.expires_at.getUTCMonth()).toBe(1);
      const result = await committed<MovementsResult>(
        titularExecutor(c, party)(directHandler, { second_home_id: party.homeId, quantity: '25' }),
      );
      expect(result.movements).toEqual([
        { lot: tiedEarly, quantity: '10' },
        { lot: tiedLate, quantity: '10' },
        { lot: later, quantity: '5' },
      ]);
      expect(TEST_VALIDITY_MONTHS).toBe(18);
    });

    it('saldo insuficiente → ERR_CREDITS_INSUFFICIENT, sem movimento', async () => {
      const party = await freshParty();
      const lot = await originate(c, '3', { titular: party });
      expect(
        await titularExecutor(c, party)(directHandler, {
          second_home_id: party.homeId,
          quantity: '3.5',
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_CREDITS_INSUFFICIENT' });
      expect((await lotRow(c.h.database.pool, lot)).available).toBe('3');
    });

    it('lote vencido não entra no FEFO antes do job [TECH-044]', async () => {
      const party = await freshParty();
      const lapsed = await originate(c, '5', { titular: party });
      await ageLot(c.h, lapsed, monthsAgo(TEST_VALIDITY_MONTHS, 6));
      expect(
        await titularExecutor(c, party)(directHandler, {
          second_home_id: party.homeId,
          quantity: '1',
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_CREDITS_INSUFFICIENT' });
    });
  });

  describe('Garantia [TECH-071][EC-6]', () => {
    it('só lotes que cobrem o prazo da Request; cobertura insuficiente com saldo suficiente → ERR_CREDIT_HOLD_INVALID', async () => {
      const party = await freshParty();
      const soon = await originate(c, '8', { titular: party });
      const late = await originate(c, '4', { titular: party });
      // Vence em ~1 mês: não cobre uma Request com prazo em 45 dias.
      await ageLot(c.h, soon, monthsAgo(TEST_VALIDITY_MONTHS - 1));
      const run = titularExecutor(c, party);
      const cover = { second_home_id: party.homeId, cover_until: inDays(45) };
      expect(await run(holdHandler, { ...cover, quantity: '6' })).toMatchObject({
        status: 'rejected',
        code: 'ERR_CREDIT_HOLD_INVALID',
      });
      expect(await run(holdHandler, { ...cover, quantity: '13' })).toMatchObject({
        status: 'rejected',
        code: 'ERR_CREDITS_INSUFFICIENT',
      });
      const held = await committed<MovementsResult>(run(holdHandler, { ...cover, quantity: '4' }));
      expect(held.movements).toEqual([{ lot: late, quantity: '4' }]);
      // Prazo curto: o lote que vence antes volta a ser o primeiro (FEFO).
      const short = await committed<MovementsResult>(
        run(holdHandler, { second_home_id: party.homeId, cover_until: inDays(2), quantity: '2' }),
      );
      expect(short.movements).toEqual([{ lot: soon, quantity: '2' }]);
    });

    it('aceite consome a Garantia; retirada libera — para expired se o lote venceu [TECH-072]', async () => {
      const requester = await freshParty();
      const holder = await freshParty();
      const lotA = await originate(c, '10', { titular: requester });
      const run = titularExecutor(c, requester);
      const runRequester = titularExecutor(c, requester, { requestGuard: true });
      const hold1 = await run(holdHandler, {
        second_home_id: requester.homeId,
        cover_until: inDays(1),
        quantity: '6',
      });
      expect(hold1.status).toBe('committed');
      const accepted = await committed<MovementsResult>(
        titularExecutor(c, holder, { requestGuard: true })(acceptHandler, {
          second_home_id: holder.homeId,
          hold_operation_id: hold1.operationId!,
        }),
      );
      expect(accepted.movements).toEqual([{ lot: lotA, quantity: '6' }]);
      expect(await lotRow(c.h.database.pool, lotA)).toMatchObject({ held: '0', consumed: '6' });

      const hold2 = await run(holdHandler, {
        second_home_id: requester.homeId,
        cover_until: inDays(1),
        quantity: '3',
      });
      await ageLot(c.h, lotA, monthsAgo(TEST_VALIDITY_MONTHS, 6));
      await committed(
        runRequester(withdrawHandler, {
          second_home_id: requester.homeId,
          hold_operation_id: hold2.operationId!,
        }),
      );
      expect(await lotRow(c.h.database.pool, lotA)).toMatchObject({ held: '0', expired: '3' });
      // Nada mais reservado por essa operação.
      expect(
        await runRequester(withdrawHandler, {
          second_home_id: requester.homeId,
          hold_operation_id: hold2.operationId!,
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_STATE_TRANSITION' });
    });
  });

  describe('concorrência [CONC-8]', () => {
    it('dois Direct sobre os mesmos Créditos: exatamente um confirma', async () => {
      const party = await freshParty();
      await originate(c, '10', { titular: party });
      const run = titularExecutor(c, party);
      const input = { second_home_id: party.homeId, quantity: '7' };
      const outcomes = await Promise.all([run(directHandler, input), run(directHandler, input)]);
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['committed', 'rejected']);
      expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
        code: 'ERR_CREDITS_INSUFFICIENT',
      });
    });
  });

  describe('K7 luxchange_exchange [ADR-0036 §7]', () => {
    it('com a K4 ligada e a K7 fechada, Direct e aceite ficam fechados: nada é gasto nem originado', async () => {
      const party = await freshParty();
      await originate(c, '10', { titular: party });
      await c.h.database.pool.query(
        `DELETE FROM app.capability_activation WHERE capability = 'luxchange_exchange'`,
      );
      try {
        const run = titularExecutor(c, party, { requestGuard: true });
        for (const [handler, input] of [
          [directHandler, { second_home_id: party.homeId, quantity: '1' }],
          [originateHandler, { second_home_id: party.homeId, quantity: '1' }],
        ] as const)
          await expect(run(handler, input)).rejects.toBeInstanceOf(CapabilityNotActivatedError);
        const { rows } = await c.h.database.pool.query<{ lots: number; entries: number }>(
          `SELECT (SELECT count(*)::int FROM app.credit_lot WHERE party_id = $1) AS lots,
                  (SELECT count(*)::int FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
                    WHERE l.party_id = $1) AS entries`,
          [party.partyId],
        );
        expect(rows[0]).toEqual({ lots: 1, entries: 1 });
      } finally {
        await c.h.database.pool.query(
          `INSERT INTO app.capability_activation VALUES ('luxchange_exchange', now(), 'test:activation')`,
        );
      }
    });
  });

  describe('reverse_credit [TECH-070][TECH-051]', () => {
    const reverse = createReverseCreditHandler(deps);

    it('antes do vencimento volta a available; depois, expired; nunca acima do consumido', async () => {
      const party = await freshParty();
      const lot = await originate(c, '10', { titular: party });
      await committed(
        titularExecutor(c, party)(directHandler, { second_home_id: party.homeId, quantity: '6' }),
      );
      const { rows } = await c.h.database.pool.query<{ id: string }>(
        `SELECT id FROM app.credit_entry WHERE lot_id = $1 AND movement = 'consume'`,
        [lot],
      );
      const entry = rows[0]!.id;
      const admin = { ...c.admin, role: 'admin' as const };
      const staff = staffRunner(c.h);
      const basis = 'Correção registrada pela Luxtory';
      expect(
        await staff.as(admin, reverse, { consumption_entry_id: entry, quantity: '2', basis }),
      ).toMatchObject({ status: 'committed', result: { to: 'available', quantity: '2' } });
      expect(
        await staff.as(admin, reverse, { consumption_entry_id: entry, quantity: '4.01', basis }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_CREDITS_INSUFFICIENT' });
      await ageLot(c.h, lot, monthsAgo(TEST_VALIDITY_MONTHS, 6));
      expect(
        await staff.as(admin, reverse, { consumption_entry_id: entry, quantity: '4', basis }),
      ).toMatchObject({ status: 'committed', result: { to: 'expired' } });
      expect(await lotRow(c.h.database.pool, lot)).toMatchObject({
        consumed: '0',
        expired: '4',
        available: '6',
      });
      expect(
        await staff.as(admin, reverse, {
          consumption_entry_id: randomUUID(),
          quantity: '1',
          basis,
        }),
      ).toMatchObject({ status: 'rejected', code: 'ERR_NOT_FOUND' });
    });
  });

  describe('job expire_credit_lots [TECH-090][TECH-044]', () => {
    it('materializa a expiração sem prorrogar; segunda execução não muda nada', async () => {
      const party = await freshParty();
      const lot = await originate(c, '9', { titular: party });
      await ageLot(c.h, lot, monthsAgo(TEST_VALIDITY_MONTHS, 40));
      const before = await lotRow(c.h.database.pool, lot);
      const executor = systemExecutor(c);
      const handler = createExpireCreditLotHandler(deps);
      const run = () =>
        runExpireCreditLots(
          {
            dueLots: () => dueCreditLots(c.h.db),
            execute: (request) => executor.execute(handler, request),
            log: c.h.log,
            timeBudgetMs: 60_000,
            monotonicMs: () => performance.now(),
          },
          { correlationId: randomUUID() },
        );
      const first = await run();
      expect(first).toMatchObject({ failed: 0, deferred: 0 });
      expect(first.expired).toBeGreaterThanOrEqual(1);
      const after = await lotRow(c.h.database.pool, lot);
      expect(after).toMatchObject({ expired: '9', available: '0' });
      expect(after.expires_at).toEqual(before.expires_at);
      expect(await run()).toMatchObject({ due: 0, expired: 0, failed: 0 });
    });
  });
});

describe('W17 — parâmetro ausente [TECH-001]', () => {
  let c: CreditsHarness;
  beforeAll(async () => {
    c = await creditsHarness({ validityMonths: null });
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  it('sem credit_validity_months vigente → ERR_PARAMETER_MISSING; nada é presumido', async () => {
    expect(
      await titularExecutor(c, c.titular, { requestGuard: true })(originateHandler, {
        second_home_id: c.titular.homeId,
        quantity: '1',
      }),
    ).toMatchObject({ status: 'rejected', code: 'ERR_PARAMETER_MISSING' });
    const { rows } = await c.h.database.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.credit_lot',
    );
    expect(rows[0]!.n).toBe(0);
  });
});
