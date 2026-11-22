import { describe, expect, it } from 'vitest';
import {
  buildPolicyConfig,
  eventField,
  fractionToPercent,
  percentToFraction,
  policyFormValues,
  tierField,
} from '@/features/pricing/presentation/policy-input';
import { TEST_POLICIES } from './policy-fixtures';

describe('formulário de política (W18; TECH-001, REQ-082, REQ-104)', () => {
  it('[TECH-033] percentual pt-BR ↔ fração canônica, sem arredondar', () => {
    expect(percentToFraction('35')).toBe('0.35');
    expect(percentToFraction('12,3457')).toBe('0.123457');
    expect(percentToFraction('100')).toBe('1');
    expect(percentToFraction('0')).toBe('0');
    for (const bad of ['', '100,01', '-1', '1.5', '12,34567', 'abc'])
      expect(percentToFraction(bad)).toBeNull();
    expect(fractionToPercent('0.123457')).toBe('12,3457');
    expect(fractionToPercent('1')).toBe('100');
  });

  it('[REQ-082] campos em branco nunca viram zero: faixa parcial, no-show ou exceção vazios são erros', () => {
    const result = buildPolicyConfig('luxplus', { [tierField(0, 'hours')]: '0' });
    expect(result.config).toBeNull();
    expect(result.fieldErrors).toEqual(
      expect.arrayContaining([
        tierField(0, 'money'),
        eventField('no_show', 'money'),
        eventField('exception', 'money'),
      ]),
    );
    expect(buildPolicyConfig('luxplus', {}).fieldErrors).toContain(tierField(0, 'hours'));
  });

  it('[REQ-104] a montagem passa pelas regras do esquema (última faixa com 0 hora)', () => {
    const values = {
      [tierField(0, 'hours')]: '24',
      [tierField(0, 'money')]: '50',
      [eventField('no_show', 'money')]: '0',
      [eventField('exception', 'money')]: '100',
    };
    expect(buildPolicyConfig('luxplus', values)).toMatchObject({
      config: null,
      issues: [{ issue: 'tiers_last_not_zero', at: 'cancellation' }],
    });
  });

  it('[TECH-032] ida e volta: os campos de uma versão publicada remontam o mesmo documento', () => {
    for (const mechanism of [
      'luxchange_request',
      'luxchange_direct',
      'luxplus',
      'rental_external',
    ] as const) {
      const values = policyFormValues(mechanism, TEST_POLICIES[mechanism]);
      expect(buildPolicyConfig(mechanism, values)).toEqual({
        config: TEST_POLICIES[mechanism],
        fieldErrors: [],
        issues: [],
      });
    }
  });
});
