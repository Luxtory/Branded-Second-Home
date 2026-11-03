import { calendarMessages } from './i18n/own-use-pt-br';
import type { OwnUseCalendarData } from './own-use-calendar-read';

const MAX_STAY = 14; // BR-111, TECH-045 (Co-Owner)
const fullDate = (s: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${s}T00:00:00Z`));

/** Direito de Uso compacto e estável (spec booking §7): só o exercício pertinente em linhas; os demais na nota. */
export function OwnUseRights({ data }: { readonly data: OwnUseCalendarData }) {
  const text = calendarMessages.rights;
  const horizon = data.nights.at(-1)?.date;
  if (data.role === 'owner') {
    return (
      <section className="lx-booking__rights" aria-labelledby="direito">
        <h2 id="direito" className="lx-title">
          {text.ownerTitle}
        </h2>
        {horizon === undefined ? null : (
          <p className="lx-booking__footnote">{text.owner(fullDate(horizon))}</p>
        )}
      </section>
    );
  }
  const years = [
    ...new Set(data.windows.filter((w) => !w.isLeapDay).map((w) => w.exerciseYear)),
  ].sort();
  const open = years.filter((year) =>
    data.windows.some((w) => w.exerciseYear === year && !w.isLeapDay && w.open),
  );
  const shown = open.length > 0 ? open : years.slice(0, 1);
  const balance = (year: number, bucket: 'alta' | 'media' | 'leap') =>
    data.balances.find((row) => row.exerciseYear === year && row.bucket === bucket);
  const windowOf = (year: number) =>
    data.windows.find((w) => w.exerciseYear === year && !w.isLeapDay);
  const leapYear = shown.find(
    (year) => open.includes(year) && (balance(year, 'leap')?.remaining ?? 0) > 0,
  );
  const rows: { label: string; value: string }[] = [];
  for (const year of shown) {
    if (!open.includes(year)) {
      const opensOn = windowOf(year)?.opensOn;
      if (opensOn)
        rows.push({ label: text.windowLabel(year), value: text.windowOpens(fullDate(opensOn)) });
      continue;
    }
    const suffix = shown.length > 1 ? ` ${year}` : '';
    for (const bucket of ['alta', 'media'] as const) {
      const row = balance(year, bucket);
      if (row !== undefined)
        rows.push({
          label: `${text.bucket(bucket)}${suffix}`,
          value: text.available(row.remaining, row.granted),
        });
    }
    if (year === leapYear) rows.push({ label: text.leapLabel(year), value: text.leapValue });
  }
  const later = years.flatMap((year) => {
    const opensOn = shown.includes(year) ? null : windowOf(year)?.opensOn;
    return opensOn ? [text.laterWindow(year, fullDate(opensOn))] : [];
  });
  const note = [
    ...(leapYear === undefined ? [] : [text.leapNote(leapYear)]),
    text.stayNote(MAX_STAY, leapYear !== undefined),
    ...later,
    ...(horizon === undefined ? [] : [text.horizon(fullDate(horizon))]),
  ].join(' ');
  return (
    <section className="lx-booking__rights" aria-labelledby="direito">
      <h2 id="direito" className="lx-title">
        {text.coOwnerTitle(shown)}
      </h2>
      {rows.length === 0 ? null : (
        <dl className="lx-booking__facts">
          {rows.map((row) => (
            <div className="lx-booking__fact" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="lx-booking__footnote">{note}</p>
    </section>
  );
}
