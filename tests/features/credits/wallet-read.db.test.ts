import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TitularOverview, TitularRepresentationSummary } from '@/features/identity';
import type { MembershipState } from '@/features/identity/domain/membership';
import { readWallet, readWalletSummary } from '@/features/credits/presentation/wallet-read';
import { seedCreditHistory } from '../../support/e2e-acquisition-database.mjs';
import {
  TEST_VALIDITY_MONTHS,
  ageLot,
  creditsHarness,
  monthsAgo,
  originate,
  secondTitular,
  type CreditTitular,
  type CreditsHarness,
} from './credits-support';
import { requestFixture, sendGuaranteedRequest } from '../luxchange/request-support';

/**
 * W17 E3 — leitura da Carteira com o PostgreSQL real e a RLS do `authenticated` (TECH-052): saldo por estado do REQ-096,
 * lotes FEFO (PD-008), extrato com filtro e paginação (REQ-054). As representações vêm de um dublê do identity
 * (`readTitularOverview` tem testes próprios) — inclusive uma party que o usuário NÃO representa, para provar que a RLS,
 * e não a lista, decide o que aparece.
 */
const representation = (
  partyId: string,
  state: MembershipState | null,
): TitularRepresentationSummary => ({
  partyId,
  documentType: 'cpf',
  maskedDocument: '***.123.456-**',
  delegationId: partyId,
  activatedAt: null,
  validUntil: null,
  membership: state === null ? null : { state, changedAt: new Date() },
});

const overviewOf =
  (...representations: TitularRepresentationSummary[]) =>
  async (): Promise<TitularOverview> => ({ representations, pending: [] });

const session = (titular: CreditTitular) => ({
  userId: titular.userId,
  assurance: 'aal1' as const,
});
const FIRST_PAGE = { partyId: null, movement: null, page: 1 } as const;

describe('Carteira — leitura sob RLS [REQ-053][REQ-054][PD-008]', () => {
  let c: CreditsHarness;
  let other: CreditTitular;
  let expiredLot: string;
  let heldLot: string;
  let otherLot: string;

  beforeAll(async () => {
    c = await creditsHarness();
    other = await secondTitular(c);
    expiredLot = await originate(c, '10');
    heldLot = await originate(c, '2.5');
    otherLot = await originate(c, '7', { titular: other });
    // Vencido antes do job: inutilizável e exibido como Expirado sem movimento de expiração (TECH-044) — e, por isso,
    // fora do FEFO da Garantia.
    await ageLot(c.h, expiredLot, monthsAgo(TEST_VALIDITY_MONTHS, 1));
    // Desde a W21 (ADR-0037 §4), a Garantia lastreia uma Request completa.
    await sendGuaranteedRequest(await requestFixture(c), heldLot, '1');
  }, 240_000);
  afterAll(async () => {
    await c?.h.close();
  });

  const deps = (overview: ReturnType<typeof overviewOf>) => ({ db: c.h.db, overview });

  it('saldo por estado, lotes FEFO e extrato da party representada [REQ-053][REQ-054][PD-008]', async () => {
    const view = await readWallet(
      session(c.titular),
      FIRST_PAGE,
      deps(overviewOf(representation(c.titular.partyId, 'active'))),
    );
    expect(view).not.toBeNull();
    expect(view!.totals).toEqual({
      available: '1.5',
      membership_blocked: '0',
      held: '1',
      consumed: '0',
      expired: '10',
    });
    expect(view!.lots.map((lot) => [lot.id, lot.situation])).toEqual([
      [expiredLot, 'expired'],
      [heldLot, 'usable'],
    ]);
    expect(view!.lots[1]).toMatchObject({
      quantity: '2.5',
      available: '1.5',
      held: '1',
      originCommand: 'deposit_capacity',
    });
    // Mais recente primeiro: a Garantia, depois as originações (a do lote envelhecido é a mais antiga).
    expect(view!.statement.items.map((entry) => [entry.kind, entry.lotId, entry.quantity])).toEqual(
      [
        ['held', heldLot, '1'],
        ['originated', heldLot, '2.5'],
        ['originated', expiredLot, '10'],
      ],
    );
    expect(view!.statement.items[0]).toMatchObject({ command: 'send_request' });
    expect(view!.statement.items.every((entry) => entry.operationId.length === 36)).toBe(true);
    expect(view!.statement).toMatchObject({ total: 3, page: 1, pages: 1, movement: null });
    expect(view!.statement.items.some((entry) => entry.lotId === otherLot)).toBe(false);
  });

  it('filtro por tipo e página fora do intervalo ajustada à última [REQ-054]', async () => {
    const overview = overviewOf(representation(c.titular.partyId, 'active'));
    const held = await readWallet(
      session(c.titular),
      { partyId: null, movement: 'hold', page: 1 },
      deps(overview),
    );
    expect(held!.statement.items.map((entry) => entry.kind)).toEqual(['held']);
    const none = await readWallet(
      session(c.titular),
      { partyId: null, movement: 'reverse', page: 9 },
      deps(overview),
    );
    expect(none!.statement).toMatchObject({ items: [], total: 0, page: 1, pages: 1 });
    const beyond = await readWallet(
      session(c.titular),
      { partyId: null, movement: null, page: 7 },
      deps(overview),
    );
    expect(beyond!.statement).toMatchObject({ page: 1, total: 3 });
    expect(beyond!.statement.items).toHaveLength(3);
  });

  it('Membership não vigente: saldo válido indisponível, validade e Garantia preservadas [REQ-053][REQ-096]', async () => {
    const view = await readWallet(
      session(c.titular),
      FIRST_PAGE,
      deps(overviewOf(representation(c.titular.partyId, 'suspended'))),
    );
    expect(view!.membershipActive).toBe(false);
    expect(view!.totals).toMatchObject({ available: '0', membership_blocked: '1.5', held: '1' });
    expect(view!.lots.map((lot) => lot.situation)).toEqual(['expired', 'membership_blocked']);
    const none = await readWallet(
      session(c.titular),
      FIRST_PAGE,
      deps(overviewOf(representation(c.titular.partyId, null))),
    );
    expect(none!.totals.membership_blocked).toBe('1.5');
  });

  it('a RLS decide: party não representada não mostra lote nem movimento [TECH-052]', async () => {
    const view = await readWallet(
      session(c.titular),
      { partyId: other.partyId, movement: null, page: 1 },
      deps(
        overviewOf(
          representation(c.titular.partyId, 'active'),
          representation(other.partyId, 'active'),
        ),
      ),
    );
    expect(view!.party.partyId).toBe(other.partyId);
    expect(view!.lots).toEqual([]);
    expect(view!.statement).toMatchObject({ items: [], total: 0 });
    const own = await readWallet(
      session(other),
      { partyId: other.partyId, movement: null, page: 1 },
      deps(overviewOf(representation(other.partyId, 'active'))),
    );
    expect(own!.lots.map((lot) => lot.id)).toEqual([otherLot]);
  });

  it('party pedida que não está entre as representadas → a primeira; sem representação → null', async () => {
    const view = await readWallet(
      session(c.titular),
      { partyId: other.partyId, movement: null, page: 1 },
      deps(overviewOf(representation(c.titular.partyId, 'active'))),
    );
    expect(view!.party.partyId).toBe(c.titular.partyId);
    await expect(
      readWallet(session(c.titular), FIRST_PAGE, deps(overviewOf())),
    ).resolves.toBeNull();
  });

  it('resumo da Área: disponível somado; sem lote visível → null', async () => {
    await expect(
      readWalletSummary(
        session(c.titular),
        deps(
          overviewOf(
            representation(c.titular.partyId, 'active'),
            representation(other.partyId, 'active'),
          ),
        ),
      ),
    ).resolves.toEqual({ available: '1.5' });
    const fresh = await secondTitular(c);
    await expect(
      readWalletSummary(session(fresh), deps(overviewOf(representation(fresh.partyId, 'active')))),
    ).resolves.toBeNull();
    await expect(readWalletSummary(session(fresh), deps(overviewOf()))).resolves.toBeNull();
  });

  it('histórico do fixture E2E respeita os invariantes do ledger [INV-6]', async () => {
    const fresh = await secondTitular(c);
    const client = await c.h.database.pool.connect();
    try {
      await client.query('BEGIN');
      const { lotA, lotB, lotC } = await seedCreditHistory(client, fresh.partyId);
      await client.query('SET LOCAL session_replication_role = origin');
      // Sem snapshot de propósito (datas do fixture; o E2E da W16 exige a validade "Ausente"): só TECH-044 fica de fora.
      const { rows: breaches } = await client.query<{ invariant: string }>(
        `SELECT invariant FROM app.credit_invariant_breaches() WHERE invariant <> 'TECH-044/validity'`,
      );
      expect(breaches).toEqual([]);
      const { rows } = await client.query<{ id: string; available: string; valid: boolean }>(
        `SELECT id, trim_scale(available)::text AS available, now() < expires_at AS valid FROM app.credit_lot WHERE party_id = $1`,
        [fresh.partyId],
      );
      expect(new Map(rows.map((row) => [row.id, [row.available, row.valid]]))).toEqual(
        new Map([
          [lotA, ['89', true]],
          [lotB, ['0', false]],
          [lotC, ['12.25', false]],
        ]),
      );
      const { rows: entries } = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
          WHERE l.party_id = $1`,
        [fresh.partyId],
      );
      expect(entries[0]!.total).toBe('27');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
