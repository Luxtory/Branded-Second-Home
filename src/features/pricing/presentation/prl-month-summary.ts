import type { PrlCalendarNight } from './prl-calendar-data';
import type { SeasonTier } from './prl-seasons';

const TIERS: readonly SeasonTier[] = ['super_alta', 'alta', 'media'];

export interface PrlMonthSummary {
  readonly total: number;
  /** Noites por temporada de apresentação (só as que aparecem no mês). */
  readonly tiers: readonly (readonly [SeasonTier, number])[];
  /** Situação agora: cada noite em exatamente uma linha; as três somam o total. */
  readonly now: {
    readonly inForce: number;
    readonly scheduledOnly: number;
    readonly absent: number;
  };
  /** Noites com versão futura — contadas à parte, porque se sobrepõem à situação agora (vigente + futura). */
  readonly scheduled: number;
}

/** Resumo do mês da consulta do PRL (spec pricing §5): só contagem do que o servidor já classificou. */
export function monthSummary(
  nights: readonly Pick<PrlCalendarNight, 'tier' | 'status' | 'scheduled'>[],
): PrlMonthSummary {
  const count = (test: (night: (typeof nights)[number]) => boolean) => nights.filter(test).length;
  return {
    total: nights.length,
    tiers: TIERS.map((tier) => [tier, count((night) => night.tier === tier)] as const).filter(
      ([, total]) => total > 0,
    ),
    now: {
      inForce: count((night) => night.status === 'in_force'),
      scheduledOnly: count((night) => night.status === 'scheduled_only'),
      absent: count((night) => night.status === 'absent'),
    },
    scheduled: count((night) => night.scheduled.length > 0),
  };
}
