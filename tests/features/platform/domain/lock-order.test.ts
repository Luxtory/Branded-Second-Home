import { describe, expect, it } from 'vitest';
import {
  LOCK_CLASSES,
  LOCK_ORDER,
  LockOrderViolation,
  LockSequence,
} from '@/features/platform/domain/lock-order';

const TECH_053_ORDER = [
  'luxchange_request',
  'rental_offer',
  'membership',
  'stake',
  'second_home_date',
  'balance_and_custody',
  'credit_lot',
  'payment',
];

describe('LockSequence (TECH-053)', () => {
  it('[TECH-053] as classes seguem a ordem total do 03', () => {
    expect(LOCK_CLASSES).toEqual(TECH_053_ORDER);
  });

  it('[ADR-0027 §2][ADR-0030][ADR-0032][ADR-0034] reserva, capacidade Luxtory, política, parâmetro e PRL estendem entre as classes 5 e 6; a TECH-053 fica intacta', () => {
    expect(LOCK_ORDER).toEqual([
      ...TECH_053_ORDER.slice(0, 5),
      'booking',
      'luxtory_capacity',
      'commercial_policy',
      'parameter',
      'prl',
      ...TECH_053_ORDER.slice(5),
    ]);
    const selection = new LockSequence();
    selection.claim('second_home_date', [['h', '2027-01-10']]);
    expect(selection.claim('luxtory_capacity', [['h', '2027']])).toHaveLength(1);
    expect(selection.claim('balance_and_custody', [['h', '2027-01-10']])).toHaveLength(1);
    const nomination = new LockSequence();
    nomination.claim('booking', ['b']);
    expect(nomination.claim('parameter', [['guest_rules', 'h']])).toHaveLength(1);
    expect(() => nomination.claim('luxtory_capacity', [['h', '2027']])).toThrow(LockOrderViolation);
    const policyTerms = new LockSequence();
    expect(policyTerms.claim('commercial_policy', ['luxchange_request'])).toHaveLength(1);
    expect(policyTerms.claim('parameter', [['luxchange_fee_rate', 'global']])).toHaveLength(1);
    expect(() => policyTerms.claim('commercial_policy', ['luxplus'])).toThrow(LockOrderViolation);
    const locks = new LockSequence();
    locks.claim('stake', ['s']);
    locks.claim('second_home_date', [['h', '2026-12-01']]);
    expect(locks.claim('booking', ['b'])).toEqual(['b']);
    expect(locks.claim('balance_and_custody', [['h', '2026-12-01']])).toHaveLength(1);
    // W16: parâmetros globais em ordem crescente de chave e depois o PRL da Second Home; nunca o inverso.
    const terms = new LockSequence();
    expect(
      terms.claim('parameter', [
        ['luxchange_fee_rate', 'global'],
        ['credit_multiplier', 'global'],
      ]),
    ).toEqual([
      ['credit_multiplier', 'global'],
      ['luxchange_fee_rate', 'global'],
    ]);
    expect(terms.claim('prl', ['h'])).toEqual(['h']);
    expect(() => terms.claim('parameter', [['request_deadline_hours', 'global']])).toThrow(
      LockOrderViolation,
    );
    const late = new LockSequence();
    late.claim('booking', ['b']);
    expect(() => late.claim('second_home_date', [['h', '2026-12-01']])).toThrow(LockOrderViolation);
  });

  it('[TECH-053] lock de classe anterior depois de uma posterior é rejeitado', () => {
    const locks = new LockSequence();
    locks.claim('stake', ['b']);

    expect(() => locks.claim('membership', ['a'])).toThrow(LockOrderViolation);
  });

  it('[TECH-053] devolve as chaves de uma classe em ordem crescente e sem repetição', () => {
    const locks = new LockSequence();

    expect(locks.claim('stake', ['c', 'a', 'b', 'a'])).toEqual(['a', 'b', 'c']);
  });

  it('[TECH-053] chaves compostas comparam campo a campo (second_home_id, stay_date)', () => {
    const locks = new LockSequence();
    const keys = [
      ['r2', '2027-01-01'],
      ['r1', '2027-01-02'],
      ['r1', '2027-01-01'],
    ] as const;

    expect(locks.claim('second_home_date', keys)).toEqual([
      ['r1', '2027-01-01'],
      ['r1', '2027-01-02'],
      ['r2', '2027-01-01'],
    ]);
  });

  it('[TECH-053] novas chaves da mesma classe precisam continuar crescentes', () => {
    const locks = new LockSequence();
    locks.claim('payment', ['m']);

    expect(locks.claim('payment', ['n', 'z'])).toEqual(['n', 'z']);
    expect(() => locks.claim('payment', ['a'])).toThrow(LockOrderViolation);
    expect(() => locks.claim('payment', ['z'])).toThrow(LockOrderViolation);
  });

  it('classe posterior depois de outra recomeça a comparação de chaves; lista vazia não altera nada', () => {
    const locks = new LockSequence();
    locks.claim('membership', ['z']);

    expect(locks.claim('stake', [])).toEqual([]);
    expect(locks.claim('membership', ['zz'])).toEqual(['zz']);
    expect(locks.claim('stake', ['a'])).toEqual(['a']);
  });
});
