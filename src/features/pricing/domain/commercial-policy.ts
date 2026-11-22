import { Exact, type Currency, type Money } from './money';

/**
 * Políticas comerciais (TECH-032; PD-009, PD-010, REQ-082, REQ-104; ADR-0034; spec pricing §5 "Políticas comerciais").
 * Esquema fechado v1 por mecanismo e avaliação pura: snapshot + evento → efeitos normalizados nos cinco eixos. Nenhum
 * valor é presumido (TECH-001): toda fração é declarada pela política, inclusive zero. O banco aplica o mesmo esquema
 * (`app.commercial_policy_config_valid`).
 */
export const POLICY_MECHANISMS = [
  'luxchange_request',
  'luxchange_direct',
  'luxplus',
  'rental_external',
] as const;
export type PolicyMechanism = (typeof POLICY_MECHANISMS)[number];

export const POLICY_SCHEMA_VERSION = 1;
export const POLICY_AXES = ['capacity', 'credits', 'fee', 'money', 'remuneration'] as const;
export type PolicyAxis = (typeof POLICY_AXES)[number];
export type FractionAxis = Exclude<PolicyAxis, 'capacity'>;

/** Eixos exatos por mecanismo (`03` §7; ADR-0034 §1). */
export const MECHANISM_AXES: Readonly<Record<PolicyMechanism, readonly PolicyAxis[]>> = {
  luxchange_request: ['capacity', 'credits', 'fee'],
  luxchange_direct: ['capacity', 'credits', 'fee'],
  luxplus: ['capacity', 'money'],
  rental_external: ['capacity', 'money', 'remuneration'],
};

/** BR-163: noites não iniciadas voltam à origem econômica imediatamente anterior; nunca configurável. */
export const CAPACITY_RETURN_TO_ORIGIN = 'return_to_origin';
export const MAX_CANCELLATION_TIERS = 5;
export const MAX_NOTICE_HOURS = 8760;
export const POLICY_EVENTS = ['cancellation', 'no_show', 'exception'] as const;
export type PolicyEvent = (typeof POLICY_EVENTS)[number];

/** Fração canônica em [0, 1]: "0", "1" ou "0." com até 6 casas, sem zero à direita (o mesmo regex do banco). */
const FRACTION = /^(0|1|0\.[0-9]{0,5}[1-9])$/;

export type PolicyEffects = Readonly<Partial<Record<PolicyAxis, string>>>;

export interface CancellationTier {
  readonly min_notice_hours: number;
  readonly effects: PolicyEffects;
}

export interface PolicyConfig {
  readonly cancellation: readonly CancellationTier[];
  readonly no_show: PolicyEffects;
  readonly exception: PolicyEffects;
}

/** Motivo de recusa (REQ-104), para a revisão do Admin; o command devolve `ERR_VALIDATION`. */
export type PolicyIssue =
  | 'shape'
  | 'tiers_count'
  | 'tiers_order'
  | 'tiers_last_not_zero'
  | 'notice_range'
  | 'axes'
  | 'capacity_not_origin'
  | 'fraction'
  | 'rental_value_created';

export interface PolicyIssueAt {
  readonly issue: PolicyIssue;
  /** `cancellation.<i>`, `no_show`, `exception` ou `config`. */
  readonly at: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const keys = Object.keys(value).sort();
  const want = [...expected].sort();
  return keys.length === want.length && keys.every((key, i) => key === want[i]);
};

export const isFraction = (value: unknown): value is string =>
  typeof value === 'string' && FRACTION.test(value);

function effectsIssues(
  mechanism: PolicyMechanism,
  effects: unknown,
  at: string,
): readonly PolicyIssueAt[] {
  if (!isPlainObject(effects) || !sameKeys(effects, MECHANISM_AXES[mechanism]))
    return [{ issue: 'axes', at }];
  const issues: PolicyIssueAt[] = [];
  if (effects.capacity !== CAPACITY_RETURN_TO_ORIGIN)
    issues.push({ issue: 'capacity_not_origin', at });
  const fractions = MECHANISM_AXES[mechanism].filter((axis) => axis !== 'capacity');
  if (fractions.some((axis) => !isFraction(effects[axis]))) issues.push({ issue: 'fraction', at });
  else if (
    mechanism === 'rental_external' &&
    new Exact(effects.money as string).plus(effects.remuneration as string).greaterThan(1)
  )
    issues.push({ issue: 'rental_value_created', at });
  return issues;
}

function tiersIssues(mechanism: PolicyMechanism, tiers: readonly unknown[]): PolicyIssueAt[] {
  if (tiers.length < 1 || tiers.length > MAX_CANCELLATION_TIERS)
    return [{ issue: 'tiers_count', at: 'cancellation' }];
  const issues: PolicyIssueAt[] = [];
  let previous: number | null = null;
  tiers.forEach((tier, i) => {
    const at = `cancellation.${i}`;
    if (!isPlainObject(tier) || !sameKeys(tier, ['min_notice_hours', 'effects'])) {
      issues.push({ issue: 'shape', at });
      return;
    }
    const hours = tier.min_notice_hours;
    if (
      typeof hours !== 'number' ||
      !Number.isInteger(hours) ||
      hours < 0 ||
      hours > MAX_NOTICE_HOURS
    )
      issues.push({ issue: 'notice_range', at });
    else {
      if (previous !== null && hours >= previous) issues.push({ issue: 'tiers_order', at });
      previous = hours;
    }
    issues.push(...effectsIssues(mechanism, tier.effects, at));
  });
  if (issues.length === 0 && previous !== 0)
    issues.push({ issue: 'tiers_last_not_zero', at: 'cancellation' });
  return issues;
}

/**
 * REQ-104 / BR-163 / INV-6 / TECH-082 no domínio: esquema fechado, eixos exatos do mecanismo, capacidade só à origem,
 * frações em [0, 1], faixas completas e decrescentes, locação sem valor criado. Lista vazia = política válida.
 */
export function validatePolicyConfig(
  mechanism: PolicyMechanism,
  config: unknown,
): readonly PolicyIssueAt[] {
  if (!isPlainObject(config) || !sameKeys(config, POLICY_EVENTS))
    return [{ issue: 'shape', at: 'config' }];
  if (!Array.isArray(config.cancellation)) return [{ issue: 'shape', at: 'cancellation' }];
  return [
    ...tiersIssues(mechanism, config.cancellation),
    ...effectsIssues(mechanism, config.no_show, 'no_show'),
    ...effectsIssues(mechanism, config.exception, 'exception'),
  ];
}

export interface PolicyVersionRef {
  readonly policyId: string;
  readonly mechanism: PolicyMechanism;
  readonly config: PolicyConfig;
}

/**
 * O que formou a operação (TECH-031), só os valores dos eixos do mecanismo: Créditos consumidos (decimal exato), Fee e
 * valor pago (dinheiro) e remuneração do beneficiário (dinheiro). `checkInAt` é o instante do check-in da reserva.
 */
export interface PolicySnapshot {
  readonly mechanism: PolicyMechanism;
  readonly checkInAt: string;
  readonly creditsConsumed?: string;
  readonly feePaid?: Money;
  readonly moneyPaid?: Money;
  readonly remuneration?: Money;
}

export type PolicyEventInput =
  | { readonly type: 'cancellation'; readonly at: string }
  | { readonly type: 'no_show' }
  | { readonly type: 'exception' };

export interface MoneySplit {
  readonly refunded: Money;
  readonly retained: Money;
}

export interface PolicyEvaluation {
  readonly policyId: string;
  readonly mechanism: PolicyMechanism;
  readonly event: PolicyEvent;
  /** Faixa aplicada no cancelamento; `null` nos demais eventos. */
  readonly minNoticeHours: number | null;
  /** BR-163: noites não iniciadas voltam à origem imediatamente anterior (resolvida pelo command, pela custódia). */
  readonly capacity: typeof CAPACITY_RETURN_TO_ORIGIN;
  /** Créditos consumidos revertidos aos lotes de origem (TECH-070) e mantidos; decimais exatos. */
  readonly credits?: { readonly reversed: string; readonly retained: string };
  /** Fee devolvido em dinheiro (TECH-082) e mantido. */
  readonly fee?: MoneySplit;
  readonly money?: MoneySplit;
  /** Remuneração do beneficiário mantida e revertida. */
  readonly remuneration?: { readonly retained: Money; readonly reversed: Money };
}

export class PolicyEvaluationError extends Error {
  constructor(message: string) {
    super(`commercial policy evaluation: ${message}`);
    this.name = 'PolicyEvaluationError';
  }
}

const HOUR_MS = 3_600_000;
const NON_NEGATIVE_DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;

function instant(text: string, name: string): number {
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new PolicyEvaluationError(`${name} is not an instant`);
  return ms;
}

/** Antecedência em horas inteiras (piso) até o check-in; a última faixa (0) cobre também o evento após o check-in. */
export function cancellationTier(
  tiers: readonly CancellationTier[],
  checkInAt: string,
  at: string,
): CancellationTier {
  const notice = Math.floor((instant(checkInAt, 'checkInAt') - instant(at, 'at')) / HOUR_MS);
  const tier = tiers.find((candidate) => notice >= candidate.min_notice_hours) ?? tiers.at(-1);
  if (tier === undefined) throw new PolicyEvaluationError('policy has no cancellation tier');
  return tier;
}

/** Parcela devolvida com HALF_UP uma única vez (TECH-033); a mantida é a diferença exata. */
function splitMoney(total: Money, fraction: string): MoneySplit {
  if (total.amountMinor < 0n) throw new PolicyEvaluationError('amount must not be negative');
  const refunded = BigInt(
    new Exact(total.amountMinor.toString())
      .times(fraction)
      .toDecimalPlaces(0, Exact.ROUND_HALF_UP)
      .toFixed(0),
  );
  const currency: Currency = total.currency;
  return {
    refunded: { amountMinor: refunded, currency },
    retained: { amountMinor: total.amountMinor - refunded, currency },
  };
}

function required<T>(value: T | undefined, axis: PolicyAxis): T {
  if (value === undefined) throw new PolicyEvaluationError(`snapshot lacks the ${axis} value`);
  return value;
}

function snapshotAxesMatch(snapshot: PolicySnapshot): boolean {
  const axes = MECHANISM_AXES[snapshot.mechanism];
  const present: Record<FractionAxis, boolean> = {
    credits: snapshot.creditsConsumed !== undefined,
    fee: snapshot.feePaid !== undefined,
    money: snapshot.moneyPaid !== undefined,
    remuneration: snapshot.remuneration !== undefined,
  };
  return (Object.keys(present) as FractionAxis[]).every(
    (axis) => present[axis] === axes.includes(axis),
  );
}

/**
 * Avaliação determinística (TECH-032; ADR-0034 §5): só os efeitos declarados na política para o evento (PD-010 na
 * exceção), nos eixos do mecanismo. Mecanismo divergente, política fora do esquema ou snapshot incompleto → erro: nada
 * é presumido nem avaliado pela metade.
 */
export function evaluatePolicy(
  policy: PolicyVersionRef,
  snapshot: PolicySnapshot,
  event: PolicyEventInput,
): PolicyEvaluation {
  if (policy.mechanism !== snapshot.mechanism)
    throw new PolicyEvaluationError('policy and snapshot belong to different mechanisms');
  if (validatePolicyConfig(policy.mechanism, policy.config).length > 0)
    throw new PolicyEvaluationError('policy does not satisfy the closed schema');
  if (!snapshotAxesMatch(snapshot))
    throw new PolicyEvaluationError('snapshot values do not match the mechanism axes');
  instant(snapshot.checkInAt, 'checkInAt');
  const tier =
    event.type === 'cancellation'
      ? cancellationTier(policy.config.cancellation, snapshot.checkInAt, event.at)
      : null;
  const effects =
    tier?.effects ?? (event.type === 'no_show' ? policy.config.no_show : policy.config.exception);
  const axes = MECHANISM_AXES[policy.mechanism];
  const result: {
    -readonly [K in keyof PolicyEvaluation]: PolicyEvaluation[K];
  } = {
    policyId: policy.policyId,
    mechanism: policy.mechanism,
    event: event.type,
    minNoticeHours: tier?.min_notice_hours ?? null,
    capacity: CAPACITY_RETURN_TO_ORIGIN,
  };
  if (axes.includes('credits')) {
    const consumed = required(snapshot.creditsConsumed, 'credits');
    if (!NON_NEGATIVE_DECIMAL.test(consumed))
      throw new PolicyEvaluationError('credits must be a canonical non-negative decimal');
    const reversed = new Exact(consumed).times(effects.credits as string);
    result.credits = {
      reversed: reversed.toFixed(),
      retained: new Exact(consumed).minus(reversed).toFixed(),
    };
  }
  if (axes.includes('fee'))
    result.fee = splitMoney(required(snapshot.feePaid, 'fee'), effects.fee as string);
  if (axes.includes('money'))
    result.money = splitMoney(required(snapshot.moneyPaid, 'money'), effects.money as string);
  if (axes.includes('remuneration')) {
    const split = splitMoney(
      required(snapshot.remuneration, 'remuneration'),
      effects.remuneration as string,
    );
    result.remuneration = { retained: split.refunded, reversed: split.retained };
  }
  return result;
}
