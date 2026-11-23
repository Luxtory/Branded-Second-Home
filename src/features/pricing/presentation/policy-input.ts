import {
  MAX_CANCELLATION_TIERS,
  MAX_NOTICE_HOURS,
  MECHANISM_AXES,
  validatePolicyConfig,
  type FractionAxis,
  type PolicyConfig,
  type PolicyEffects,
  type PolicyIssueAt,
  type PolicyMechanism,
} from '../domain/commercial-policy';
import { CAPACITY_RETURN_TO_ORIGIN } from '../domain/commercial-policy';
import { Exact } from '../domain/money';

/**
 * Formulário de política (W18, `/admin/politicas`) ↔ esquema fechado v1 (ADR-0034 §1). Percentuais em pt-BR (até 4
 * casas) viram frações canônicas; faixa toda em branco é ignorada; nada em branco vira zero (TECH-001): campo vazio de
 * uma faixa preenchida, do no-show ou da exceção é erro.
 */
const PERCENT = /^(?<units>\d{1,3})(?:,(?<decimals>\d{1,4}))?$/;
const HOURS = /^\d{1,4}$/;
const HUNDRED = 100;

export const fractionAxes = (mechanism: PolicyMechanism): readonly FractionAxis[] =>
  MECHANISM_AXES[mechanism].filter((axis): axis is FractionAxis => axis !== 'capacity');

export const tierField = (index: number, name: 'hours' | FractionAxis) => `t${index}_${name}`;
export const eventField = (event: 'no_show' | 'exception', axis: FractionAxis) =>
  `${event}_${axis}`;

/** Percentual pt-BR em [0, 100] → fração canônica; inválido → `null` (nunca arredonda). */
export function percentToFraction(text: string): string | null {
  const match = PERCENT.exec(text.trim());
  if (match?.groups === undefined) return null;
  const percent = new Exact(`${match.groups.units}.${match.groups.decimals ?? '0'}`);
  if (percent.greaterThan(HUNDRED)) return null;
  return percent.dividedBy(HUNDRED).toFixed();
}

/** Fração canônica → percentual pt-BR (para revisão e histórico). */
export const fractionToPercent = (fraction: string): string =>
  new Exact(fraction).times(HUNDRED).toFixed().replace('.', ',');

export interface PolicyFormResult {
  readonly config: PolicyConfig | null;
  /** Campos com erro de formato ou ausentes. */
  readonly fieldErrors: readonly string[];
  /** Regras do esquema (REQ-104) violadas pelo conjunto. */
  readonly issues: readonly PolicyIssueAt[];
}

function effectsFrom(
  mechanism: PolicyMechanism,
  values: Readonly<Record<string, string>>,
  name: (axis: FractionAxis) => string,
  errors: string[],
): PolicyEffects {
  const effects: Record<string, string> = { capacity: CAPACITY_RETURN_TO_ORIGIN };
  for (const axis of fractionAxes(mechanism)) {
    const fraction = percentToFraction(values[name(axis)] ?? '');
    if (fraction === null) errors.push(name(axis));
    else effects[axis] = fraction;
  }
  return effects;
}

/** Monta o documento a partir dos campos; só devolve `config` quando forma e regras estão íntegras. */
export function buildPolicyConfig(
  mechanism: PolicyMechanism,
  values: Readonly<Record<string, string>>,
): PolicyFormResult {
  const errors: string[] = [];
  const tiers: { min_notice_hours: number; effects: PolicyEffects }[] = [];
  for (let i = 0; i < MAX_CANCELLATION_TIERS; i += 1) {
    const names = [tierField(i, 'hours'), ...fractionAxes(mechanism).map((a) => tierField(i, a))];
    if (names.every((name) => (values[name] ?? '').trim() === '')) continue;
    const hoursText = (values[tierField(i, 'hours')] ?? '').trim();
    const hours = HOURS.test(hoursText) ? Number(hoursText) : Number.NaN;
    if (!Number.isInteger(hours) || hours > MAX_NOTICE_HOURS) errors.push(tierField(i, 'hours'));
    tiers.push({
      min_notice_hours: hours,
      effects: effectsFrom(mechanism, values, (axis) => tierField(i, axis), errors),
    });
  }
  if (tiers.length === 0) errors.push(tierField(0, 'hours'));
  const config: PolicyConfig = {
    cancellation: tiers,
    no_show: effectsFrom(mechanism, values, (axis) => eventField('no_show', axis), errors),
    exception: effectsFrom(mechanism, values, (axis) => eventField('exception', axis), errors),
  };
  if (errors.length > 0) return { config: null, fieldErrors: errors, issues: [] };
  const issues = validatePolicyConfig(mechanism, config);
  return { config: issues.length === 0 ? config : null, fieldErrors: [], issues };
}

/** Campos de uma versão publicada (para recomeçar a partir da vigente). */
export function policyFormValues(
  mechanism: PolicyMechanism,
  config: PolicyConfig,
): Record<string, string> {
  const values: Record<string, string> = {};
  config.cancellation.forEach((tier, i) => {
    values[tierField(i, 'hours')] = String(tier.min_notice_hours);
    for (const axis of fractionAxes(mechanism))
      values[tierField(i, axis)] = fractionToPercent(tier.effects[axis] ?? '');
  });
  for (const event of ['no_show', 'exception'] as const)
    for (const axis of fractionAxes(mechanism))
      values[eventField(event, axis)] = fractionToPercent(config[event][axis] ?? '');
  return values;
}
