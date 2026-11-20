import type { DatabaseTransaction } from '@/features/platform';
import type { PrlNightState } from '../application/prl-review';
import { nightStatus, prlHistory, sealedCalendar, type PrlVersion } from '../prl';
import { formatInstant, formatMoney } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';

type Reader = Pick<DatabaseTransaction, 'selectFrom'>;

/** Uma noite selada no calendário do Admin, com os rótulos já formatados no servidor (sem valor calculado no cliente). */
export interface PrlCalendarNight {
  readonly date: string;
  readonly season: 'alta' | 'media';
  readonly status: 'absent' | 'in_force' | 'scheduled_only';
  /** Alguma versão (vigente ou agendada): define se a noite cabe na publicação inicial ou na alteração. */
  readonly hasVersion: boolean;
  readonly inForce: string | null;
  readonly scheduled: string | null;
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
  const nights = calendar.map(({ stayDate, season }) => {
    const own = versions.get(stayDate) ?? [];
    const status = nightStatus(own, now);
    states.set(stayDate, {
      stayDate,
      season,
      inForceMinor: status.inForce?.amountMinor ?? null,
      hasVersion: own.length > 0,
      latestStart: own.at(-1)?.effectiveFrom ?? null,
    });
    return {
      date: stayDate,
      season,
      status:
        status.inForce !== null
          ? 'in_force'
          : status.scheduled.length > 0
            ? 'scheduled_only'
            : 'absent',
      hasVersion: own.length > 0,
      inForce: status.inForce === null ? null : formatMoney(status.inForce.amountMinor),
      scheduled:
        status.scheduled.length === 0
          ? null
          : status.scheduled
              .map((version) =>
                text.scheduled(
                  formatMoney(version.amountMinor),
                  formatInstant(version.effectiveFrom, timezone),
                ),
              )
              .join(' · '),
    } satisfies PrlCalendarNight;
  });
  const months = [...new Set(calendar.map(({ stayDate }) => stayDate.slice(0, 7)))];
  return { nights, months, states, versions };
}
