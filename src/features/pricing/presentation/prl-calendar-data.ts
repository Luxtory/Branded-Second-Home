import type { DatabaseTransaction } from '@/features/platform';
import type { PrlNightState } from '../application/prl-review';
import { nightStatus, prlHistory, sealedCalendar, type PrlVersion } from '../prl';
import { formatAmount, formatInstant, formatMoney } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import { seasonTiers, type SeasonTier } from './prl-seasons';

type Reader = Pick<DatabaseTransaction, 'selectFrom'>;

/** Uma noite selada no calendário do Admin, com os rótulos já formatados no servidor (sem valor calculado no cliente). */
export interface PrlCalendarNight {
  readonly date: string;
  /** Grupo canônico de Direito de Uso (calendário selado): governa direitos e limites. */
  readonly season: 'alta' | 'media';
  /** Temporada de apresentação (Super Alta · Alta · Média/Baixa), derivada do grupo e da janela de Carnaval. */
  readonly tier: SeasonTier;
  readonly status: 'absent' | 'in_force' | 'scheduled_only';
  /** Alguma versão (vigente ou agendada): define se a noite cabe na publicação inicial ou na alteração. */
  readonly hasVersion: boolean;
  /** Preço vigente agora ("R$ 1.500,00"), a forma curta para a célula ("1.500,00") e desde quando vale. */
  readonly inForce: string | null;
  readonly inForceShort: string | null;
  readonly inForceSince: string | null;
  /** Versões futuras, já formatadas ("R$ … a partir de …"), em ordem de início. */
  readonly scheduled: readonly string[];
}

export interface PrlCalendarModel {
  readonly nights: readonly PrlCalendarNight[];
  readonly months: readonly string[];
  readonly states: ReadonlyMap<string, PrlNightState>;
  readonly versions: ReadonlyMap<string, readonly PrlVersion[]>;
}

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Calendário selado inteiro da Second Home com o PRL de cada noite no instante (W16 E4; REQ-052). */
export async function loadPrlCalendar(
  db: Reader,
  secondHomeId: string,
  now: Date,
  timezone: string,
): Promise<PrlCalendarModel> {
  const calendar = await sealedCalendar(db, secondHomeId);
  const first = calendar[0]?.stayDate;
  const last = calendar.at(-1)?.stayDate;
  const history =
    first === undefined || last === undefined
      ? []
      : await prlHistory(db, secondHomeId, first, nextDay(last));
  const versions = new Map<string, PrlVersion[]>();
  for (const version of history)
    versions.set(version.stayDate, [...(versions.get(version.stayDate) ?? []), version]);
  const states = new Map<string, PrlNightState>();
  const tierOf = seasonTiers();
  const nights = calendar.map(({ stayDate, season }) => {
    const own = versions.get(stayDate) ?? [];
    const status = nightStatus(own, now);
    const latest = own.at(-1);
    states.set(stayDate, {
      stayDate,
      season,
      inForceMinor: status.inForce?.amountMinor ?? null,
      scheduled: status.scheduled.map((version) => ({
        amountMinor: version.amountMinor,
        effectiveFrom: version.effectiveFrom,
      })),
      hasVersion: own.length > 0,
      latest:
        latest === undefined
          ? null
          : { amountMinor: latest.amountMinor, effectiveFrom: latest.effectiveFrom },
    });
    return {
      date: stayDate,
      season,
      tier: tierOf(stayDate, season),
      status:
        status.inForce !== null
          ? 'in_force'
          : status.scheduled.length > 0
            ? 'scheduled_only'
            : 'absent',
      hasVersion: own.length > 0,
      inForce: status.inForce === null ? null : formatMoney(status.inForce.amountMinor),
      inForceShort: status.inForce === null ? null : formatAmount(status.inForce.amountMinor),
      inForceSince:
        status.inForce === null ? null : formatInstant(status.inForce.effectiveFrom, timezone),
      scheduled: status.scheduled.map((version) =>
        text.scheduled(
          formatMoney(version.amountMinor),
          formatInstant(version.effectiveFrom, timezone),
        ),
      ),
    } satisfies PrlCalendarNight;
  });
  const months = [...new Set(calendar.map(({ stayDate }) => stayDate.slice(0, 7)))];
  return { nights, months, states, versions };
}
