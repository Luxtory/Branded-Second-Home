'use client';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '@/design-system/react';
import { prlMessages as text } from './i18n/prl-pt-br';
import type { PrlCalendarNight } from './prl-calendar-data';
import { adjacentMonth } from './prl-months';

const DAY_MS = 86_400_000;
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const addDays = (date: string, days: number) =>
  new Date(toDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (month: string, delta: number) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
};
export const lastDayOf = (month: string) => addDays(`${shiftMonth(month, 1)}-01`, -1);
export const daysOf = (month: string) =>
  Array.from(
    { length: Number(lastDayOf(month).slice(8, 10)) },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
export const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    toDate(`${month}-01`),
  );
export const nightName = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(date));

/** Nome acessível da noite: data, temporada e situação do preço (o motivo e a seleção vêm de quem usa a grade). */
export function nightDescription(date: string, night: PrlCalendarNight | undefined): string[] {
  if (night === undefined) return [nightName(date), text.calendar.unsealed];
  const parts = [nightName(date), `${text.season} ${text.seasons[night.tier]}`];
  parts.push(
    night.status === 'in_force'
      ? `${text.statusInForce} ${night.inForce ?? ''}`.trim()
      : night.status === 'scheduled_only'
        ? text.statusScheduledOnly
        : text.calendar.absentShort,
  );
  if (night.scheduled.length > 0 && night.status === 'in_force')
    parts.push(text.calendar.scheduledShort);
  return parts;
}

/** O que a grade mostra em cada dia; quem usa decide seleção, detalhe, elegibilidade e o valor da célula. */
export interface PrlDayView {
  readonly label: string;
  /** Sem ação neste modo: continua focável e, tocado, explica o motivo. */
  readonly inert: boolean;
  readonly pressed: boolean | undefined;
  readonly selected: boolean;
  readonly viewing: boolean;
  readonly amount: string | null;
}

export function MonthNavButton(props: {
  readonly label: string;
  readonly direction: -1 | 1;
  readonly disabled?: boolean;
  readonly href?: string;
  readonly onClick?: () => void;
}) {
  const icon = <Icon name={props.direction < 0 ? 'chevron-left' : 'chevron-right'} />;
  if (props.href !== undefined)
    return (
      <a className="lx-calendar__nav-button" href={props.href} aria-label={props.label}>
        {icon}
      </a>
    );
  return (
    <button
      className="lx-calendar__nav-button"
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {icon}
    </button>
  );
}

/**
 * Mês do PRL (W16; REQ-052; spec pricing §5): o calendário do DS na variante de precificação (`.lx-calendar--prl`),
 * comum à consulta e à publicação. Sete colunas desde 320 px; células proporcionais à largura; foco itinerante (setas,
 * Home/End, PageUp/PageDown) que pula meses fora do calendário da Second Home. Temporada canônica = traço (só informa).
 */
export function PrlMonthCalendar(props: {
  readonly id: string;
  readonly month: string;
  readonly months: readonly string[];
  readonly byDate: ReadonlyMap<string, PrlCalendarNight>;
  readonly focused: string | null;
  /** Foco pedido por teclado ou navegação: a grade o aplica depois de renderizar. */
  readonly focusRequest: number;
  readonly day: (date: string, night: PrlCalendarNight | undefined) => PrlDayView;
  readonly onActivate: (date: string) => void;
  readonly onMove: (date: string) => void;
  readonly previous: ReactNode;
  readonly next: ReactNode;
  readonly legend: ReactNode;
  readonly children?: ReactNode;
}) {
  const gridRef = useRef<HTMLTableElement>(null);
  const days = daysOf(props.month);
  const focusTarget =
    props.focused !== null && props.focused.startsWith(props.month)
      ? props.focused
      : (days.find((date) => !props.day(date, props.byDate.get(date)).inert) ?? days[0]!);

  useEffect(() => {
    if (props.focusRequest === 0) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusTarget}"]`)?.focus();
    // Só um novo pedido de foco move o foco; trocar de noite com o mouse não rouba o foco de outro controle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusRequest]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const weekday = toDate(date).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekday),
      End: () => addDays(date, 6 - weekday),
      PageUp: () => `${adjacentMonth(props.months, props.month, -1) ?? props.month}-01`,
      PageDown: () => `${adjacentMonth(props.months, props.month, 1) ?? props.month}-01`,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    let target = move();
    if (!props.months.includes(target.slice(0, 7))) {
      // Caiu num mês fora do calendário: vai ao mês vizinho nessa direção (primeiro ou último dia), se houver.
      const direction = target < date ? -1 : 1;
      const neighbour = adjacentMonth(props.months, props.month, direction);
      if (neighbour === null) return;
      target = direction > 0 ? `${neighbour}-01` : lastDayOf(neighbour);
    }
    props.onMove(target);
  };

  const lead = toDate(`${props.month}-01`).getUTCDay();
  const cells: ReactNode[] = Array.from({ length: lead }, (_, index) => (
    <td key={`lead-${index}`} />
  ));
  for (const date of days) {
    const night = props.byDate.get(date);
    const view = props.day(date, night);
    cells.push(
      <td
        key={date}
        data-tier={night?.tier}
        data-prl={night?.status === 'in_force' ? 'in_force' : undefined}
        data-selected={view.selected ? '' : undefined}
        data-viewing={view.viewing ? '' : undefined}
      >
        <button
          className="lx-calendar__day"
          type="button"
          data-date={date}
          tabIndex={date === focusTarget ? 0 : -1}
          aria-label={view.label}
          aria-pressed={view.pressed}
          aria-disabled={view.inert ? true : undefined}
          onClick={() => props.onActivate(date)}
          onKeyDown={(event) => onKeyDown(event, date)}
        >
          <span className="lx-calendar__number">{Number(date.slice(8, 10))}</span>
          {view.amount === null ? null : (
            <span className="lx-pricing__amount" aria-hidden="true">
              {view.amount}
            </span>
          )}
          {night?.status === 'in_force' ? (
            <span className="lx-pricing__dot" aria-hidden="true" />
          ) : null}
          {night !== undefined && night.scheduled.length > 0 ? (
            <span className="lx-pricing__future" aria-hidden="true" />
          ) : null}
          {view.selected ? <Icon name="check" className="lx-pricing__check" /> : null}
        </button>
      </td>,
    );
  }
  while (cells.length % 7 !== 0) cells.push(<td key={`trail-${cells.length}`} />);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
  const titleId = `${props.id}-titulo`;
  return (
    <div className="lx-calendar lx-calendar--prl">
      <div className="lx-calendar__months">
        <div className="lx-calendar__month">
          <div className="lx-calendar__header">
            {props.previous}
            <h3 className="lx-calendar__title" id={titleId} aria-live="polite">
              {monthName(props.month)}
            </h3>
            {props.next}
          </div>
          <table className="lx-calendar__table" aria-labelledby={titleId} ref={gridRef}>
            <caption>{text.calendar.caption}</caption>
            <thead>
              <tr>
                {text.calendar.weekdays.map(([short, long]) => (
                  <th key={long} scope="col" abbr={long}>
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
      {props.legend}
      {props.children}
    </div>
  );
}

const TIERS = ['super_alta', 'alta', 'media'] as const;

/** Faixa da temporada (cor + espessura), a mesma da célula, para legenda e botões de seleção. */
export function SeasonSwatch({ tier }: { readonly tier: (typeof TIERS)[number] }) {
  return <span className="lx-pricing__swatch" aria-hidden="true" data-tier={tier} />;
}

/**
 * Legenda em dois grupos independentes: a temporada (faixa colorida, mais grossa quanto mais alta) e o preço com a
 * seleção ou o detalhe. Nenhuma cor serve aos dois grupos.
 */
export function PrlLegend({ mark }: { readonly mark: 'selected' | 'viewing' }) {
  return (
    <div className="lx-pricing__legends">
      <div className="lx-pricing__legend">
        <p className="lx-pricing__eyebrow" id={`prl-legenda-temporada-${mark}`}>
          {text.calendar.legendSeasons}
        </p>
        <ul className="lx-calendar__legend" aria-labelledby={`prl-legenda-temporada-${mark}`}>
          {TIERS.map((tier) => (
            <li className="lx-calendar__legend-item" key={tier}>
              <SeasonSwatch tier={tier} />
              {text.seasons[tier]}
            </li>
          ))}
        </ul>
      </div>
      <div className="lx-pricing__legend">
        <p className="lx-pricing__eyebrow" id={`prl-legenda-preco-${mark}`}>
          {text.calendar.legendPrice}
        </p>
        <ul className="lx-calendar__legend" aria-labelledby={`prl-legenda-preco-${mark}`}>
          <li className="lx-calendar__legend-item">
            <span className="lx-calendar__swatch" aria-hidden="true" />
            {text.calendar.legendAbsent}
          </li>
          <li className="lx-calendar__legend-item">
            <span className="lx-calendar__swatch" aria-hidden="true" data-prl="in_force" />
            {text.calendar.legendInForce}
          </li>
          <li className="lx-calendar__legend-item">
            <span className="lx-calendar__swatch" aria-hidden="true" data-prl="future" />
            {text.calendar.legendScheduled}
          </li>
          {mark === 'selected' ? (
            <li className="lx-calendar__legend-item">
              <span className="lx-calendar__swatch" aria-hidden="true" data-selected="" />
              {text.calendar.legendSelected}
            </li>
          ) : (
            <li className="lx-calendar__legend-item">
              <span className="lx-calendar__swatch" aria-hidden="true" data-viewing="" />
              {text.calendar.legendViewing}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
