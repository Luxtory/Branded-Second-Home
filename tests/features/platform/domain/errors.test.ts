import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CommandRejection,
  ERROR_CODES,
  REQ_098_CAUSES,
  rejectionForConstraint,
  TECH_056_ERROR_CODES,
} from '@/features/platform/domain/errors';

const technicalSpec = readFileSync('docs/specs/canonical/03-technical-spec.md', 'utf8');

describe('códigos de erro (TECH-056)', () => {
  it('[TECH-056] os códigos mínimos são exatamente os do 03, na mesma ordem', () => {
    const line = technicalSpec.split('\n').find((text) => text.startsWith('`ERR_PERMISSION'));
    const canonical = line?.match(/ERR_[A-Z_]+/g);

    expect(canonical).toEqual([...TECH_056_ERROR_CODES]);
  });

  it('[TECH-056] constraint vira código pelo prefixo do nome; outras não são recusa funcional', () => {
    expect(rejectionForConstraint('occupancy_second_home_date_key')).toBe('ERR_BOOKING_CONFLICT');
    expect(rejectionForConstraint('custody_pair_check')).toBe('ERR_CAPACITY_UNAVAILABLE');
    expect(rejectionForConstraint('balance_non_negative')).toBe('ERR_USE_RIGHT_BALANCE');
    expect(rejectionForConstraint('credits_lot_balance')).toBe('ERR_CREDITS_INSUFFICIENT');
    expect(rejectionForConstraint('operation_actor_check')).toBeNull();
  });

  it('[REQ-098] cada causa funcional do REQ-098 aponta para ao menos um código do TECH-056', () => {
    expect(Object.keys(REQ_098_CAUSES)).toHaveLength(10);
    for (const codes of Object.values(REQ_098_CAUSES)) {
      expect(codes.length).toBeGreaterThan(0);
      for (const code of codes) expect(TECH_056_ERROR_CODES).toContain(code);
    }
  });

  it('códigos são únicos e seguem o padrão ERR_*', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) expect(code).toMatch(/^ERR_[A-Z_]+$/);
  });

  it('CommandRejection carrega só o código', () => {
    const rejection = new CommandRejection('ERR_WINDOW_NOT_OPEN');

    expect(rejection.code).toBe('ERR_WINDOW_NOT_OPEN');
    expect(rejection.name).toBe('CommandRejection');
  });
});
