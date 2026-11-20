import type { ReactNode } from 'react';
import { formatMonth, formatNight } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import type { PrlCalendarNight } from './prl-calendar-data';

const DAY_MS = 86_400_000;
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);

function nightLabel(date: string, night: PrlCalendarNight): string {
  const parts = [formatNight(date), text.seasons[night.season]];
  parts.push(
    night.status === 'in_force'
      ? `${text.statusInForce} ${night.inForce ?? ''}`.trim()
      : night.status === 'scheduled_only'
        ? text.statusScheduledOnly
        : text.calendar.absentShort,
  );
  if (night.scheduled !== null && night.status === 'in_force')
    parts.push(text.calendar.scheduledShort);
  return parts.join(' — ');
}

/**
 * Consulta do PRL num mês (W16 E4; REQ-052): o calendário do DS (`.lx-calendar`), só leitura, renderizado no servidor.
 * Cada noite selada diz o próprio estado no nome acessível e leva ao detalhe da noite logo abaixo; a categoria canônica
 * (Alta) aparece como o traço do DS e não é editável.
 */
export function PrlMonthCalendar(props: {
  readonly month: string;
  readonly nights: ReadonlyMap<string, PrlCalendarNight>;
  readonly previous: ReactNode;
  readonly next: ReactNode;
}) {
  const first = `${props.month}-01`;
  const lead = toDate(first).getUTCDay();
  const days: string[] = [];
  for (
    let at = toDate(first).getTime();
    new Date(at).toISOString().startsWith(props.month);
    at += DAY_MS
  )
    days.push(new Date(at).toISOString().slice(0, 10));
  const cells: ReactNode[] = Array.from({ length: lead }, (_, index) => (
    <td key={`lead-${index}`} />
  ));
  for (const date of days) {
    const night = props.nights.get(date);
    const number = <span className="lx-calendar__number">{Number(date.slice(8, 10))}</span>;
    cells.push(
      <td
        key={date}
        data-season={night?.season === 'alta' ? 'alta' : undefined}
        data-state={night?.status === 'in_force' ? 'mine' : undefined}
      >
        {night === undefined ? (
          <span className="lx-calendar__day" aria-disabled="true">
            {number}
            <span className="lx-visually-hidden">{` — ${text.calendar.unsealed}`}</span>
          </span>
        ) : (
          <a
            className="lx-calendar__day"
            href={`#noite-${date}`}
            aria-label={nightLabel(date, night)}
          >
            {number}
            {night.scheduled !== null ? (
              <span className="lx-calendar__mark" aria-hidden="true" />
            ) : null}
          </a>
        )}
      </td>,
    );
  }
  while (cells.length % 7 !== 0) cells.push(<td key={`trail-${cells.length}`} />);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
  const titleId = `prl-consulta-${props.month}`;
  return (
    <div className="lx-calendar">
      <div className="lx-calendar__months">
        <div className="lx-calendar__month">
          <div className="lx-calendar__header">
            {props.previous ?? <span aria-hidden="true" />}
            <h3 className="lx-calendar__title" id={titleId}>
              {formatMonth(props.month)}
            </h3>
            {props.next ?? <span aria-hidden="true" />}
          </div>
          <table className="lx-calendar__table" aria-labelledby={titleId}>
            <thead>
              <tr>
                {text.calendar.weekdays.map(([short, long]) => (
                  <th key={short} scope="col" abbr={long}>
                    {short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>{row}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="lx-calendar__legend" aria-label={text.calendar.legend}>
        <li className="lx-calendar__legend-item">
          <span className="lx-calendar__swatch" aria-hidden="true" />
          {text.calendar.legendAbsent}
        </li>
        <li className="lx-calendar__legend-item">
          <span className="lx-calendar__swatch" aria-hidden="true" data-state="mine" />
          {text.calendar.legendInForce}
        </li>
        <li className="lx-calendar__legend-item">
          <span className="lx-calendar__swatch" aria-hidden="true" data-mark="leap" />
          {text.calendar.legendScheduled}
        </li>
        <li className="lx-calendar__legend-item">
          <span className="lx-calendar__swatch" aria-hidden="true" data-season="alta" />
          {text.calendar.legendAlta}
        </li>
      </ul>
    </div>
  );
}
