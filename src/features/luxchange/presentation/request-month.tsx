'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Icon } from '@/design-system/react';
import type { SeasonTier } from '@/features/pricing';
import { formatCredits, monthName } from './deposit-format';
import { depositMessages } from './i18n/deposit-pt-br';
import { requestMessages as text } from './i18n/request-pt-br';

const DAY_MS = 86_400_000;
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, days: number) =>
  new Date(toDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (month: string, delta: number) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
};
const daysOf = (month: string) => {
  const last = Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8, 10));
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
};

export interface MonthDay {
  /** `on`: pode ser escolhida; `off`: indisponível (riscada); `past`: passada (sem ação, sem risco). */
  readonly status: 'on' | 'off' | 'past';
  readonly credits: string | null;
  readonly season: SeasonTier;
}

/**
 * Um mês da variante de seleção com valor por noite do DS (`.lx-calendar--prl`), com foco itinerante e o estado de cada
 * dia no nome acessível (W21; mesma gramática visual do depósito). Quem chama decide o que um toque seleciona.
 */
export function RequestMonth(props: {
  readonly id: string;
  readonly caption: string;
  readonly months: readonly string[];
  readonly month: string;
  readonly onMonth: (month: string) => void;
  readonly day: (date: string) => MonthDay | undefined;
  readonly selected: ReadonlySet<string>;
  readonly label: (date: string) => string;
  readonly onChoose: (date: string) => void;
  readonly focusDate: string | null;
  readonly onFocusDate: (date: string) => void;
}) {
  const { month, months } = props;
  const gridRef = useRef<HTMLTableElement>(null);
  const pendingFocus = useRef(false);
  const days = daysOf(month);
  const index = months.indexOf(month);
  const focused =
    props.focusDate !== null && props.focusDate.startsWith(month)
      ? props.focusDate
      : (days.find((date) => props.day(date)?.status === 'on') ?? days[0]!);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  });

  const moveFocus = (date: string) => {
    const target = date.slice(0, 7);
    if (!months.includes(target)) return;
    props.onMonth(target);
    props.onFocusDate(date);
    pendingFocus.current = true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const weekday = toDate(date).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekday),
      End: () => addDays(date, 6 - weekday),
      PageUp: () => `${shiftMonth(month, -1)}-01`,
      PageDown: () => `${shiftMonth(month, 1)}-01`,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    moveFocus(move());
  };

  const lead = toDate(`${month}-01`).getUTCDay();
  const cells = [
    ...Array.from({ length: lead }, (_, i) => <td key={`lead-${i}`} />),
    ...days.map((date) => {
      const day = props.day(date);
      const isSelected = props.selected.has(date);
      return (
        <td
          key={date}
          data-tier={day?.season}
          data-selected={isSelected ? '' : undefined}
          data-state={day?.status === 'off' ? 'unavailable' : undefined}
        >
          <button
            className="lx-calendar__day"
            type="button"
            data-date={date}
            tabIndex={date === focused ? 0 : -1}
            aria-label={props.label(date)}
            aria-pressed={day?.status === 'on' ? isSelected : undefined}
            aria-disabled={day?.status === 'on' ? undefined : true}
            onClick={() => {
              props.onFocusDate(date);
              props.onChoose(date);
            }}
            onKeyDown={(event) => onKeyDown(event, date)}
          >
            <span className="lx-calendar__number">{Number(date.slice(8, 10))}</span>
            {day?.credits == null ? null : (
              <>
                <span className="lx-pricing__amount" aria-hidden="true">
                  {formatCredits(day.credits)}
                </span>
                <span className="lx-pricing__dot" aria-hidden="true" />
              </>
            )}
            {isSelected ? <Icon name="check" className="lx-pricing__check" /> : null}
          </button>
        </td>
      );
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(<td key={`trail-${cells.length}`} />);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div className="lx-calendar__months">
      <div className="lx-calendar__month">
        <div className="lx-calendar__header">
          <button
            className="lx-calendar__nav-button"
            type="button"
            aria-label={text.journey.previous}
            disabled={index <= 0}
            onClick={() => props.onMonth(months[index - 1]!)}
          >
            <Icon name="chevron-left" />
          </button>
          <h3 className="lx-calendar__title" id={`${props.id}-mes`} aria-live="polite">
            {monthName(month)}
          </h3>
          <button
            className="lx-calendar__nav-button"
            type="button"
            aria-label={text.journey.next}
            disabled={index >= months.length - 1}
            onClick={() => props.onMonth(months[index + 1]!)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
        <table className="lx-calendar__table" aria-labelledby={`${props.id}-mes`} ref={gridRef}>
          <caption>{props.caption}</caption>
          <thead>
            <tr>
              {depositMessages.calendar.weekdays.map(([short, long]) => (
                <th key={long} scope="col" abbr={long}>
                  {short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
