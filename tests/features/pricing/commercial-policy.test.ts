import { describe, expect, it } from 'vitest';
import {
  CAPACITY_RETURN_TO_ORIGIN,
  evaluatePolicy,
  PolicyEvaluationError,
  POLICY_MECHANISMS,
  validatePolicyConfig,
  type PolicyMechanism,
  type PolicySnapshot,
} from '@/features/pricing';
import { publishPolicyInput } from '@/features/pricing/policies';
import { policyInForce, scheduledPolicies } from '@/features/pricing/policies';
import { policyVigencyConflict } from '@/features/pricing/domain/policy-vigency';
import { INVALID_POLICIES, RENTAL_DISTINCT_BASES, TEST_POLICIES } from './policy-fixtures';

const CHECK_IN = '2027-03-10T17:00:00.000Z';
const hoursBefore = (hours: number) =>
  new Date(Date.parse(CHECK_IN) - hours * 3_600_000).toISOString();
const brl = (amountMinor: bigint) => ({ amountMinor, currency: 'BRL' as const });

const SNAPSHOTS: Readonly<Record<PolicyMechanism, PolicySnapshot>> = {
  luxchange_request: {
    mechanism: 'luxchange_request',
    checkInAt: CHECK_IN,
    creditsConsumed: '1234.5678',
    feePaid: brl(10_001n),
  },
  luxchange_direct: {
    mechanism: 'luxchange_direct',
    checkInAt: CHECK_IN,
    creditsConsumed: '10',
    feePaid: brl(999n),
  },
  luxplus: { mechanism: 'luxplus', checkInAt: CHECK_IN, moneyPaid: brl(150_005n) },
  rental_external: {
    mechanism: 'rental_external',
    checkInAt: CHECK_IN,
    moneyPaid: brl(200_000n),
    remuneration: brl(160_001n),
  },
};

const policy = (mechanism: PolicyMechanism) => ({
  policyId: `policy-${mechanism}`,
  mechanism,
  config: TEST_POLICIES[mechanism],
});

describe('Políticas comerciais — esquema fechado (TECH-032, REQ-104, REQ-082)', () => {
  it.each(POLICY_MECHANISMS)('[TECH-032] política de teste válida para %s', (mechanism) => {
    expect(validatePolicyConfig(mechanism, TEST_POLICIES[mechanism])).toEqual([]);
  });

  it.each(INVALID_POLICIES)('[REQ-104] recusa: %s', (_label, mechanism, config) => {
    expect(validatePolicyConfig(mechanism, config).length).toBeGreaterThan(0);
    expect(
      publishPolicyInput.safeParse({
        mechanism,
        config,
        effective_from: null,
        effective_to: null,
        basis: 'Ata Luxtory W18',
      }).success,
    ).toBe(false);
  });

  it('[REQ-104] a política de um mecanismo não serve a outro (eixos exatos)', () => {
    expect(validatePolicyConfig('luxplus', TEST_POLICIES.luxchange_request)).not.toEqual([]);
    expect(validatePolicyConfig('rental_external', TEST_POLICIES.luxplus)).not.toEqual([]);
  });

  it('[REQ-104] motivos legíveis para a revisão do Admin', () => {
    const [capacity] = INVALID_POLICIES;
    expect(validatePolicyConfig(capacity![1], capacity![2])).toEqual([
      { issue: 'capacity_not_origin', at: 'no_show' },
    ]);
    expect(validatePolicyConfig('luxchange_request', null)).toEqual([
      { issue: 'shape', at: 'config' },
    ]);
  });
});

describe('Políticas comerciais — avaliação determinística (TECH-032, PD-009, PD-010, TECH-033)', () => {
  it('[TECH-032][BR-163] cancelamento escolhe a faixa pela antecedência; capacidade sempre à origem', () => {
    const p = policy('luxchange_request');
    const s = SNAPSHOTS.luxchange_request;
    const early = evaluatePolicy(p, s, { type: 'cancellation', at: hoursBefore(700) });
    expect(early).toMatchObject({
      event: 'cancellation',
      minNoticeHours: 700,
      capacity: CAPACITY_RETURN_TO_ORIGIN,
      credits: { reversed: '1234.5678', retained: '0' },
    });
    // 10 001 × 0,35 = 3 500,35 → HALF_UP uma vez = 3 500; mantido por diferença.
    expect(early.fee).toEqual({ refunded: brl(3500n), retained: brl(6501n) });
    const mid = evaluatePolicy(p, s, { type: 'cancellation', at: hoursBefore(699.5) });
    expect(mid.minNoticeHours).toBe(50);
    expect(mid.credits).toEqual({ reversed: '493.82712', retained: '740.74068' });
    const late = evaluatePolicy(p, s, { type: 'cancellation', at: hoursBefore(49.99) });
    expect(late.minNoticeHours).toBe(0);
    const afterCheckIn = evaluatePolicy(p, s, { type: 'cancellation', at: hoursBefore(-5) });
    expect(afterCheckIn).toMatchObject({ minNoticeHours: 0, credits: { reversed: '0' } });
  });

  it('[PD-009] no-show aplica os efeitos declarados para no-show', () => {
    const result = evaluatePolicy(policy('rental_external'), SNAPSHOTS.rental_external, {
      type: 'no_show',
    });
    expect(result).toEqual({
      policyId: 'policy-rental_external',
      mechanism: 'rental_external',
      event: 'no_show',
      minNoticeHours: null,
      capacity: CAPACITY_RETURN_TO_ORIGIN,
      money: { refunded: brl(0n), retained: brl(200_000n) },
      // 160 001 × 0,5 = 80 000,5 → HALF_UP = 80 001 mantido.
      remuneration: { retained: brl(80_001n), reversed: brl(80_000n) },
    });
  });

  it('[PD-010] exceção aplica só os efeitos da política vinculada, nos eixos do mecanismo', () => {
    const result = evaluatePolicy(policy('luxplus'), SNAPSHOTS.luxplus, { type: 'exception' });
    // 150 005 × 0,333333 = 50 001,61… → 50 002.
    expect(result).toEqual({
      policyId: 'policy-luxplus',
      mechanism: 'luxplus',
      event: 'exception',
      minNoticeHours: null,
      capacity: CAPACITY_RETURN_TO_ORIGIN,
      money: { refunded: brl(50_002n), retained: brl(100_003n) },
    });
    expect(result).not.toHaveProperty('credits');
    expect(result).not.toHaveProperty('fee');
  });

  it('[TECH-032] mesmos dados, mesmo resultado (sem relógio implícito)', () => {
    const run = () =>
      evaluatePolicy(policy('luxchange_direct'), SNAPSHOTS.luxchange_direct, {
        type: 'cancellation',
        at: hoursBefore(1),
      });
    expect(run()).toEqual(run());
    expect(run().credits).toEqual({ reversed: '1.23457', retained: '8.76543' });
  });

  it('[REQ-082] nada é presumido: mecanismo divergente, snapshot incompleto ou política inválida falham', () => {
    expect(() =>
      evaluatePolicy(policy('luxplus'), SNAPSHOTS.luxchange_request, { type: 'no_show' }),
    ).toThrow(PolicyEvaluationError);
    const withoutFee: PolicySnapshot = { ...SNAPSHOTS.luxchange_request, feePaid: undefined };
    expect(() =>
      evaluatePolicy(policy('luxchange_request'), withoutFee, { type: 'no_show' }),
    ).toThrow(PolicyEvaluationError);
    expect(() =>
      evaluatePolicy(
        policy('luxplus'),
        { ...SNAPSHOTS.luxplus, creditsConsumed: '1' },
        { type: 'no_show' },
      ),
    ).toThrow(PolicyEvaluationError);
    expect(() =>
      evaluatePolicy(
        { ...policy('luxchange_request'), config: INVALID_POLICIES[0]![2] as never },
        SNAPSHOTS.luxchange_request,
        { type: 'no_show' },
      ),
    ).toThrow(PolicyEvaluationError);
    expect(() =>
      evaluatePolicy(policy('luxchange_request'), SNAPSHOTS.luxchange_request, {
        type: 'cancellation',
        at: 'ontem',
      }),
    ).toThrow(PolicyEvaluationError);
  });
});

describe('Locação — bases econômicas distintas (BR-253, BR-260, PD-010, REQ-104)', () => {
  const rental = (gross: bigint, net: bigint): PolicySnapshot => ({
    mechanism: 'rental_external',
    checkInAt: CHECK_IN,
    moneyPaid: brl(gross),
    remuneration: brl(net),
  });
  const distinct = {
    policyId: 'policy-distinct',
    mechanism: 'rental_external' as const,
    config: RENTAL_DISTINCT_BASES,
  };

  it('[REQ-104] frações de bases distintas não se somam: 50% do bruto devolvido + 75% do líquido mantido é válido', () => {
    expect(validatePolicyConfig('rental_external', RENTAL_DISTINCT_BASES)).toEqual([]);
  });

  it('[BR-253][BR-260][PD-010] bruto R$ 10.000, líquido R$ 6.000: retém R$ 5.000 e mantém R$ 4.500 ao Titular, sem valor criado', () => {
    const result = evaluatePolicy(distinct, rental(1_000_000n, 600_000n), { type: 'exception' });
    expect(result.money).toEqual({ refunded: brl(500_000n), retained: brl(500_000n) });
    expect(result.remuneration).toEqual({ retained: brl(450_000n), reversed: brl(150_000n) });
  });

  it('[PD-010][REQ-082] a conferência usa os valores: remuneração mantida acima do retido do locatário é recusada', () => {
    // Sem deduções (líquido = bruto): 75% de R$ 10.000 = R$ 7.500 > R$ 5.000 retidos → compensação não prevista.
    expect(() =>
      evaluatePolicy(distinct, rental(1_000_000n, 1_000_000n), { type: 'exception' }),
    ).toThrow(PolicyEvaluationError);
  });

  it('[BR-253][BR-260] receita líquida acima do bruto é snapshot inválido', () => {
    expect(() =>
      evaluatePolicy(policy('rental_external'), rental(100n, 101n), { type: 'no_show' }),
    ).toThrow(PolicyEvaluationError);
  });
});

describe('Políticas comerciais — vigência (TECH-030)', () => {
  const at = (iso: string) => new Date(iso);
  const v1 = { effectiveFrom: at('2027-01-01T00:00:00Z'), effectiveTo: null };
  const v2 = { effectiveFrom: at('2027-06-01T00:00:00Z'), effectiveTo: at('2027-09-01T00:00:00Z') };

  it('[TECH-030] nunca retroativa, sempre depois de todos os inícios e de término explícito', () => {
    const now = at('2027-02-01T00:00:00Z');
    expect(policyVigencyConflict(null, at('2027-01-31T00:00:00Z'), now)).toBe('retroactive');
    expect(policyVigencyConflict(null, now, now)).toBeNull();
    expect(policyVigencyConflict(v1, at('2027-01-01T00:00:00Z'), at('2026-12-01T00:00:00Z'))).toBe(
      'overlap',
    );
    expect(policyVigencyConflict(v2, at('2027-08-01T00:00:00Z'), now)).toBe('overlap');
    expect(policyVigencyConflict(v2, at('2027-09-01T00:00:00Z'), now)).toBeNull();
  });

  it('[TECH-030] vigente e agendadas pela mesma regra do banco', () => {
    expect(policyInForce([v1, v2], at('2027-05-31T23:59:59Z'))).toBe(v1);
    expect(policyInForce([v1, v2], at('2027-06-01T00:00:00Z'))).toBe(v2);
    expect(policyInForce([v1, v2], at('2027-09-01T00:00:00Z'))).toBeNull();
    expect(policyInForce([v1], at('2026-12-31T00:00:00Z'))).toBeNull();
    expect(scheduledPolicies([v1, v2], at('2027-02-01T00:00:00Z'))).toEqual([v2]);
  });
});
