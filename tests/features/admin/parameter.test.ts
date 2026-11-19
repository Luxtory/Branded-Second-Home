import { describe, expect, it } from 'vitest';
import { successorConflict, versionInForce } from '@/features/admin/domain/parameter';

const at = (iso: string) => new Date(iso);

describe('parâmetros só por inserção (TECH-030, ADR-0030 §3)', () => {
  const now = at('2027-01-10T12:00:00Z');

  it('[REQ-095][D3] sucessora: nunca no passado, nunca no início ou antes do último, nunca antes de término explícito', () => {
    expect(successorConflict(null, now, now)).toBeNull();
    expect(successorConflict(null, at('2027-01-10T11:59:59Z'), now)).toBe('retroactive');
    const open = { effectiveFrom: at('2027-01-11T00:00:00Z'), effectiveTo: null };
    expect(successorConflict(open, at('2027-01-11T00:00:00Z'), now)).toBe('overlap');
    expect(successorConflict(open, at('2027-01-10T18:00:00Z'), now)).toBe('overlap');
    expect(successorConflict(open, at('2027-01-12T00:00:00Z'), now)).toBeNull();
    const bounded = {
      effectiveFrom: at('2027-01-11T00:00:00Z'),
      effectiveTo: at('2027-01-20T00:00:00Z'),
    };
    expect(successorConflict(bounded, at('2027-01-19T23:59:59.999Z'), now)).toBe('overlap');
    expect(successorConflict(bounded, at('2027-01-20T00:00:00Z'), now)).toBeNull();
    expect(successorConflict(bounded, at('2027-02-01T00:00:00Z'), now)).toBeNull();
  });

  it('[REQ-095][TECH-001] vigente: maior início até o instante, respeitando término explícito; lacuna = ausente', () => {
    const versions = [
      { id: 'v1', effectiveFrom: at('2027-01-01T00:00:00Z'), effectiveTo: null },
      {
        id: 'v2',
        effectiveFrom: at('2027-02-01T00:00:00Z'),
        effectiveTo: at('2027-03-01T00:00:00Z'),
      },
      { id: 'v3', effectiveFrom: at('2027-04-01T00:00:00Z'), effectiveTo: null },
    ];
    expect(versionInForce(versions, at('2026-12-31T23:59:59Z'))).toBeNull();
    expect(versionInForce(versions, at('2027-01-15T00:00:00Z'))?.id).toBe('v1');
    expect(versionInForce(versions, at('2027-02-01T00:00:00Z'))?.id).toBe('v2');
    expect(versionInForce(versions, at('2027-03-01T00:00:00Z'))).toBeNull();
    expect(versionInForce(versions, at('2027-04-01T00:00:00Z'))?.id).toBe('v3');
    expect(versionInForce([], now)).toBeNull();
  });
});
