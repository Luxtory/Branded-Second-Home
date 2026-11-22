import { describe, expect, it } from 'vitest';
import {
  entryDirection,
  entryKind,
  fefoOrder,
  lotSituation,
  walletTotals,
  type WalletLot,
} from '@/features/credits/domain/wallet';

const NOW = new Date('2027-06-15T12:00:00Z');

const lot = (overrides: Partial<WalletLot>): WalletLot => ({
  id: 'lot',
  quantity: '10',
  held: '0',
  consumed: '0',
  expired: '0',
  available: '10',
  originatedAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2027-12-01T00:00:00Z'),
  originCommand: 'deposit_capacity',
  ...overrides,
});

describe('Carteira — estados do REQ-096', () => {
  it('separa disponível, Garantia, consumido e expirado', () => {
    const lots = [
      lot({ id: 'a', held: '2', consumed: '3', available: '5' }),
      lot({ id: 'b', available: '4', quantity: '4' }),
    ];
    expect(walletTotals(lots, true, NOW)).toEqual({
      available: '9',
      membership_blocked: '0',
      held: '2',
      consumed: '3',
      expired: '0',
    });
  });

  it('Membership inelegível: saldo válido vira "Indisponível por Membership", sem sumir [BR-193]', () => {
    expect(walletTotals([lot({})], false, NOW)).toMatchObject({
      available: '0',
      membership_blocked: '10',
    });
    expect(lotSituation(lot({}), false, NOW)).toBe('membership_blocked');
  });

  it('lote vencido antes do job já aparece como expirado [TECH-044]', () => {
    const lapsed = lot({
      expiresAt: new Date('2027-06-15T11:59:59Z'),
      available: '6',
      expired: '1',
      consumed: '3',
    });
    expect(walletTotals([lapsed], true, NOW)).toMatchObject({
      available: '0',
      expired: '7',
      consumed: '3',
    });
    expect(walletTotals([lapsed], false, NOW)).toMatchObject({
      membership_blocked: '0',
      expired: '7',
    });
    expect(lotSituation(lapsed, true, NOW)).toBe('expired');
  });

  it('situação do lote', () => {
    expect(lotSituation(lot({}), true, NOW)).toBe('usable');
    expect(lotSituation(lot({ available: '0', held: '10' }), true, NOW)).toBe('held');
    expect(lotSituation(lot({ available: '0', consumed: '10' }), true, NOW)).toBe('used');
  });

  it('ordem FEFO: vencimento, originação, id [PD-008]', () => {
    const due = new Date('2028-02-29T12:00:00Z');
    const ordered = fefoOrder([
      lot({ id: 'c', expiresAt: new Date('2029-01-01T00:00:00Z') }),
      lot({ id: 'b', expiresAt: due, originatedAt: new Date('2026-08-31T12:00:00Z') }),
      lot({ id: 'a2', expiresAt: due, originatedAt: new Date('2026-08-30T12:00:00Z') }),
      lot({ id: 'a1', expiresAt: due, originatedAt: new Date('2026-08-30T12:00:00Z') }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['a1', 'a2', 'b', 'c']);
  });
});

describe('Extrato — tipo do movimento (REQ-054)', () => {
  it.each([
    ['originate', 'available', 'originated', 'in'],
    ['hold', 'held', 'held', 'out'],
    ['release', 'available', 'released', 'in'],
    ['release', 'expired', 'released_expired', 'neutral'],
    ['consume', 'consumed', 'consumed', 'out'],
    ['expire', 'expired', 'expired', 'out'],
    ['reverse', 'available', 'reversed', 'in'],
    ['reverse', 'expired', 'reversed_expired', 'neutral'],
  ] as const)('%s → %s = %s (%s)', (movement, to, kind, direction) => {
    expect(entryKind(movement, to)).toBe(kind);
    expect(entryDirection(entryKind(movement, to))).toBe(direction);
  });

  it('movimento desconhecido é erro', () => {
    expect(() => entryKind('transfer', 'available')).toThrow(RangeError);
  });
});
