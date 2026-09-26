import { describe, expect, it } from 'vitest';
import {
  LOCK_CLASSES,
  LockOrderViolation,
  LockSequence,
} from '@/features/platform/domain/lock-order';

const TECH_053_ORDER = [
  'luxchange_request',
  'rental_offer',
  'membership',
  'stake',
  'residence_date',
  'balance_and_custody',
  'credit_lot',
  'payment',
];

describe('LockSequence (TECH-053)', () => {
  it('[TECH-053] as classes seguem a ordem total do 03', () => {
    expect(LOCK_CLASSES).toEqual(TECH_053_ORDER);
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

  it('[TECH-053] chaves compostas comparam campo a campo (residence_id, stay_date)', () => {
    const locks = new LockSequence();
    const keys = [
      ['r2', '2027-01-01'],
      ['r1', '2027-01-02'],
      ['r1', '2027-01-01'],
    ] as const;

    expect(locks.claim('residence_date', keys)).toEqual([
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
