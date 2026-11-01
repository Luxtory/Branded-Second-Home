'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import type { OwnUsePreview, OwnUsePreviewIssue } from '../application/preview-own-use-booking';
import { createOwnUseBookingAction } from './own-use-actions';
import type { CalendarNight, HoldingBooking, OwnUseCalendarData } from './own-use-calendar-read';
import type { OwnUseBookingMessage, OwnUseBookingState } from './own-use-form-state';
import { ownUsePaths } from './own-use-paths';
import { previewOwnUseBookingAction, type OwnUsePreviewResponse } from './own-use-preview-action';
import { bookingLabels, calendarMessages as text, ownUseMessages } from './i18n/own-use-pt-br';

// Seletor híbrido de período (W12, spec booking §7; contrato visual `lx-calendar` em docs/reference/design-system.md):
// campos de data nativos sincronizados com a grade; 1º toque = entrada, 2º = saída (a noite da saída não é usada,
// PD-002). A grade só mostra fatos do servidor e sugere; a prévia e a confirmação são do servidor (`03` §13).

const LOCALE = 'pt-BR';
const DAY_MS = 86_400_000;
const MAX_STAY = 14; // BR-111, TECH-045 (Co-Owner)
const TWO_MONTHS_REM = 41; // igual à container query do CSS
const ACTIVE_BOOKING_STATES = new Set(['confirmed', 'in_use']);

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY_MS));
const diff = (a: string, b: string) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
const ym = (s: string) => s.slice(0, 7);
const addMonths = (month: string, n: number) => {
  const d = toDate(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
};
const lastDay = (month: string) => add(`${addMonths(month, 1)}-01`, -1);
const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' });
const longDate = (s: string) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(s));
const shortDate = (s: string) =>
  fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(s));
const compactDate = (s: string) =>
  fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(s));
const dayMonth = (s: string) => fmt({ day: '2-digit', month: '2-digit' }).format(toDate(s));
const fullDate = (s: string) =>
  fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(s));
const monthName = (month: string) =>
  fmt({ month: 'long', year: 'numeric' }).format(toDate(`${month}-01`));
const weekdayDay = (s: string) => `${fmt({ weekday: 'short' }).format(toDate(s))}, ${dayMonth(s)}`;

type Status = CalendarNight['status'] | 'outside';

function dateList(dates: readonly string[]): string {
  if (dates.length > 3 && diff(dates[0]!, dates.at(-1)!) === dates.length - 1)
    return text.dates.range(dayMonth(dates[0]!), dayMonth(dates.at(-1)!));
  return text.dates.and(dates.map(dayMonth));
}

/** Resposta da prévia para um par de datas e uma tentativa; "verificando" = datas atuais sem resposta delas. */
interface PreviewAnswer {
  readonly checkin: string;
  readonly checkout: string;
  readonly attempt: number;
  readonly response: OwnUsePreviewResponse;
}

/** Regras de leitura da grade sobre os fatos do servidor (só sugestão; a prévia decide). */
function useCalendarModel(data: OwnUseCalendarData) {
  return useMemo(() => {
    const byDate = new Map(data.nights.map((night) => [night.date, night]));
    const first = data.nights[0]?.date ?? data.today;
    const last = data.nights.at(-1)?.date ?? data.today;
    const active = data.bookings.filter((booking) => ACTIVE_BOOKING_STATES.has(booking.state));
    const status = (s: string): Status => byDate.get(s)?.status ?? 'outside';
    const window = (year: number, leap: boolean) =>
      data.windows.find((entry) => entry.exerciseYear === year && entry.isLeapDay === leap);
    const bookingAt = (s: string): HoldingBooking | undefined =>
      active.find((booking) => s >= booking.checkinDate && s < booking.checkoutDate);
    const runBefore = (s: string) => {
      let n = 0;
      while (status(add(s, -n - 1)) === 'mine') n += 1;
      return n;
    };
    const runFrom = (s: string) => {
      let n = 0;
      while (status(add(s, n)) === 'mine') n += 1;
      return n;
    };
    const stayWith = (start: string, end: string) =>
      data.role === 'co_owner'
        ? runBefore(start) + diff(start, end) + runFrom(end)
        : diff(start, end);
    const validCheckout = (start: string, end: string) => {
      if (end <= start || end > add(last, 1)) return false;
      for (let s = start; s < end; s = add(s, 1)) if (status(s) !== 'available') return false;
      return data.role !== 'co_owner' || stayWith(start, end) <= MAX_STAY;
    };
    const maxCheckout = (start: string): string | null => {
      let best: string | null = null;
      for (let end = add(start, 1); end <= add(last, 1); end = add(end, 1)) {
        if (status(add(end, -1)) !== 'available') break;
        if (data.role === 'co_owner' && stayWith(start, end) > MAX_STAY) break;
        best = end;
      }
      return best;
    };
    return { byDate, first, last, status, window, bookingAt, stayWith, validCheckout, maxCheckout };
  }, [data]);
}

function Submit({ disabled }: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="lx-button lx-button--primary"
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {text.summary.confirm}
    </button>
  );
}

/** Confirmação: a chave nasce na prévia válida (ADR-0026 D6); a Server Action revalida tudo e redireciona. */
function ConfirmForm(props: {
  readonly idempotencyKey: string | null;
  readonly secondHomeId: string;
  readonly partyId: string;
  readonly checkin: string | null;
  readonly checkout: string | null;
  readonly enabled: boolean;
}) {
  const initial: OwnUseBookingState = { key: props.idempotencyKey ?? '', message: null };
  const [state, action] = useActionState(createOwnUseBookingAction, initial);
  const message: OwnUseBookingMessage | null = state.message;
  return (
    <form className="lx-booking__confirm" action={action}>
      <input type="hidden" name="second_home_id" value={props.secondHomeId} />
      <input type="hidden" name="party_id" value={props.partyId} />
      <input type="hidden" name="checkin_date" value={props.checkin ?? ''} />
      <input type="hidden" name="checkout_date" value={props.checkout ?? ''} />
      {message === null ? null : (
        <p className="lx-booking__outcome" role="alert">
          {ownUseMessages.outcome[message]}{' '}
          {state.bookingId === undefined ? null : (
            <a className="lx-link" href={ownUsePaths.booking(state.bookingId)}>
              {text.summary.viewBooking}
            </a>
          )}
        </p>
      )}
      <Submit disabled={!props.enabled || props.idempotencyKey === null} />
    </form>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="lx-booking__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Calendário interativo de uso próprio + resumo com prévia do servidor e confirmação (cliente). */
export function OwnUseCalendar({ data }: { readonly data: OwnUseCalendarData }) {
  const model = useCalendarModel(data);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const startMonth = ym(
    model.byDate.has(data.today) || data.today > model.first ? data.today : model.first,
  );
  const [count, setCount] = useState(1);
  const [anchor, setAnchor] = useState(startMonth);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [checkin, setCheckin] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [restartDate, setRestartDate] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewAnswer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const role = data.role;
  const phase = checkin !== null && checkout === null ? 'checkout' : 'checkin';

  // Um mês no celular, dois quando cabem (o container decide, como o CSS).
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      setCount(root.clientWidth >= TWO_MONTHS_REM * rem ? 2 : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const minMonth = ym(model.first > data.today ? model.first : data.today);
  const maxMonth = addMonths(ym(model.last), 1 - count);
  const shownAnchor =
    anchor < minMonth
      ? minMonth
      : anchor > maxMonth
        ? maxMonth < minMonth
          ? minMonth
          : maxMonth
        : anchor;
  const months = Array.from({ length: count }, (_, i) => addMonths(shownAnchor, i));
  const visibleFirst = `${months[0]!}-01`;
  const visibleLast = lastDay(months.at(-1)!);
  const focused =
    focusDate !== null && focusDate >= visibleFirst && focusDate <= visibleLast
      ? focusDate
      : checkin !== null && checkin >= visibleFirst && checkin <= visibleLast
        ? checkin
        : data.today >= visibleFirst && data.today <= visibleLast
          ? data.today
          : visibleFirst;

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  });

  // Prévia do servidor sempre que as duas datas existem; a resposta antiga nunca vale para datas novas.
  useEffect(() => {
    if (checkin === null || checkout === null) return undefined;
    let current = true;
    previewOwnUseBookingAction({
      holdingId: data.holdingId,
      checkinDate: checkin,
      checkoutDate: checkout,
    })
      .then((response) => {
        if (current) setPreview({ checkin, checkout, attempt, response });
      })
      .catch(() => {
        if (current)
          setPreview({ checkin, checkout, attempt, response: { status: 'unavailable' } });
      });
    return () => {
      current = false;
    };
  }, [checkin, checkout, data.holdingId, attempt]);

  const status = model.status;
  const statusText = useCallback(
    (s: string, st: Status) => {
      if (st === 'mine') return text.status.mine(role);
      if (st === 'started') return text.status.started;
      if (st === 'outside') return text.status.outside;
      if (st === 'leap-other') return text.status.leapOther(Number(s.slice(0, 4)));
      if (st === 'closed') {
        const night = model.byDate.get(s);
        const opens =
          night === undefined
            ? undefined
            : model.window(night.exerciseYear, night.isLeapDay)?.opensOn;
        const year = Number(s.slice(0, 4));
        return opens ? text.status.closed(year, fullDate(opens)) : text.status.closedUnknown(year);
      }
      return st === 'available' ? text.status.available : text.status.unavailable;
    },
    [model, role],
  );
  const selectable = (s: string) => {
    const st = status(s);
    if (phase === 'checkout' && checkin !== null)
      return (
        s === checkin || model.validCheckout(checkin, s) || (s < checkin && st === 'available')
      );
    return st === 'available';
  };
  const limitReason = (limit: string) => {
    const st = status(limit);
    if (st === 'available' && role === 'co_owner') return text.selection.reasonMax(MAX_STAY);
    if (st === 'mine') return text.selection.reasonMine(dayMonth(limit), role);
    if (st === 'closed') return text.selection.reasonClosed(Number(limit.slice(0, 4)));
    if (st === 'leap-other') return text.selection.reasonLeap(Number(limit.slice(0, 4)));
    if (st === 'outside') return text.selection.reasonOutside;
    return text.selection.reasonUnavailable(dayMonth(limit));
  };
  const bookingDetail = (booking: HoldingBooking) => {
    const parts = [text.selection.bookingHolder(role)];
    const channel = bookingLabels.channel(booking.channel, role);
    if (channel !== null) parts.push(channel);
    parts.push(
      text.selection.bookingPeriod(
        dayMonth(booking.checkinDate),
        dayMonth(booking.checkoutDate),
        diff(booking.checkinDate, booking.checkoutDate),
      ),
    );
    const state = bookingLabels.state(booking.state);
    if (state !== null) parts.push(state);
    return text.selection.booking(parts);
  };
  const explain = (s: string) => {
    const st = status(s);
    const booking = st === 'mine' ? model.bookingAt(s) : undefined;
    if (booking !== undefined) return bookingDetail(booking);
    if (phase === 'checkout' && checkin !== null && s > checkin && st !== 'started') {
      const limit = model.maxCheckout(checkin);
      if (limit !== null)
        return text.selection.limit(dayMonth(checkin), dayMonth(limit), limitReason(limit));
    }
    if (st === 'leap-other') return text.selection.leapOtherTap(dayMonth(s), statusText(s, st));
    return text.selection.dayStatus(dayMonth(s), statusText(s, st));
  };
  const dayLabel = (s: string) => {
    const st = status(s);
    const night = model.byDate.get(s);
    const parts = [longDate(s)];
    if (role === 'co_owner' && night !== undefined) {
      if (night.isLeapDay && st !== 'leap-other') parts.push(text.status.leapMine);
      else parts.push(text.rights.bucket(night.season));
    }
    parts.push(statusText(s, st));
    if (phase === 'checkout' && checkin !== null) {
      if (st !== 'available' && model.validCheckout(checkin, s))
        parts.push(text.status.canBeCheckout);
      if (s > checkin && st === 'available' && !model.validCheckout(checkin, s))
        parts.push(text.status.notCheckout);
    }
    if (s === checkin) parts.push(text.status.checkinSelected);
    else if (s === checkout) parts.push(text.status.checkoutSelected);
    else if (checkin !== null && checkout !== null && s > checkin && s < checkout)
      parts.push(text.status.nightSelected);
    return parts.join(', ');
  };

  const select = (start: string | null, end: string | null) => {
    setGuidance(null);
    setRestartDate(null);
    setCheckin(start);
    setCheckout(end);
    if (start !== null) setFocusDate(start);
  };
  const choose = (s: string) => {
    if (!selectable(s)) {
      setGuidance(explain(s));
      setRestartDate(
        phase === 'checkout' && checkin !== null && s > checkin && status(s) === 'available'
          ? s
          : null,
      );
      return;
    }
    if (phase === 'checkout' && checkin !== null) {
      if (s === checkin) select(null, null);
      else if (model.validCheckout(checkin, s)) select(checkin, s);
      else select(s, null);
    } else select(s, null);
    setFocusDate(s);
    pendingFocus.current = true;
  };
  const moveFocus = (s: string) => {
    if (s < `${minMonth}-01` || s > lastDay(ym(model.last))) return;
    setGuidance(null);
    setRestartDate(null);
    setFocusDate(s);
    if (s < visibleFirst) setAnchor(ym(s));
    else if (s > visibleLast) setAnchor(addMonths(ym(s), 1 - count));
    pendingFocus.current = true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, s: string) => {
    const weekday = toDate(s).getUTCDay();
    const sameDayIn = (month: string) => {
      const day = Math.min(Number(s.slice(8, 10)), Number(lastDay(month).slice(8, 10)));
      return `${month}-${String(day).padStart(2, '0')}`;
    };
    const moves: Record<string, () => string> = {
      ArrowLeft: () => add(s, -1),
      ArrowRight: () => add(s, 1),
      ArrowUp: () => add(s, -7),
      ArrowDown: () => add(s, 7),
      Home: () => add(s, -weekday),
      End: () => add(s, 6 - weekday),
      PageUp: () => sameDayIn(addMonths(ym(s), event.shiftKey ? -12 : -1)),
      PageDown: () => sameDayIn(addMonths(ym(s), event.shiftKey ? 12 : 1)),
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    moveFocus(move());
  };
  const fromInputs = (start: string, end: string) => {
    setGuidance(null);
    setRestartDate(null);
    setCheckin(start === '' ? null : start);
    setCheckout(end === '' ? null : end);
    if (start !== '') {
      setFocusDate(start);
      setAnchor(ym(start));
    }
  };

  const selectionLine = (() => {
    if (guidance !== null) return guidance;
    if (checkin !== null && checkout === null) {
      const limit = model.maxCheckout(checkin);
      const bounded = limit !== null && limit < add(model.last, 1);
      return text.selection.checkinChosen(weekdayDay(checkin), bounded ? dayMonth(limit) : null);
    }
    if (checkin !== null && checkout !== null && checkout > checkin)
      return text.selection.chosen(dayMonth(checkin), dayMonth(checkout), diff(checkin, checkout));
    return '';
  })();

  return (
    <div className="lx-booking">
      <section className="lx-booking__period" aria-labelledby="periodo">
        <div className="lx-booking__intro">
          <h2 id="periodo" className="lx-display-s">
            {text.period.title}
          </h2>
          <p className="lx-hint" id="periodo-hint">
            {text.period.hint}
          </p>
        </div>
        <div className="lx-booking__dates">
          <div className="lx-field">
            <label className="lx-label" htmlFor="entrada">
              {text.period.checkin}
            </label>
            <input
              className="lx-input"
              id="entrada"
              type="date"
              min={model.first}
              max={model.last}
              value={checkin ?? ''}
              aria-describedby="periodo-hint"
              onChange={(event) => fromInputs(event.target.value, checkout ?? '')}
            />
          </div>
          <div className="lx-field">
            <label className="lx-label" htmlFor="saida">
              {text.period.checkout}
            </label>
            <input
              className="lx-input"
              id="saida"
              type="date"
              min={add(model.first, 1)}
              max={add(model.last, 1)}
              value={checkout ?? ''}
              aria-describedby="periodo-hint"
              onChange={(event) => fromInputs(checkin ?? '', event.target.value)}
            />
          </div>
        </div>
        <div className="lx-calendar">
          <div className="lx-calendar__grid" ref={rootRef}>
            <p className="lx-visually-hidden" aria-live="polite">
              {text.grid.showing(text.dates.and(months.map(monthName)))}
            </p>
            <div className="lx-calendar__months">
              {months.map((month, index) => (
                <Month
                  key={month}
                  month={month}
                  previous={
                    index === 0 ? (
                      <NavButton
                        label={text.grid.previousMonth}
                        direction={-1}
                        disabled={shownAnchor <= minMonth}
                        onClick={() => {
                          setGuidance(null);
                          setRestartDate(null);
                          setAnchor(addMonths(shownAnchor, -1));
                        }}
                      />
                    ) : null
                  }
                  next={
                    index === months.length - 1 ? (
                      <NavButton
                        label={text.grid.nextMonth}
                        direction={1}
                        disabled={shownAnchor >= maxMonth}
                        onClick={() => {
                          setGuidance(null);
                          setRestartDate(null);
                          setAnchor(addMonths(shownAnchor, 1));
                        }}
                      />
                    ) : null
                  }
                  note={windowNote(month)}
                  renderDay={(s, day) => {
                    const st = status(s);
                    const night = model.byDate.get(s);
                    let range: 'start' | 'end' | 'night' | undefined;
                    if (s === checkin) range = 'start';
                    else if (s === checkout) range = 'end';
                    else if (checkin !== null && checkout !== null && s > checkin && s < checkout)
                      range = 'night';
                    const showSeason =
                      role === 'co_owner' && night?.season === 'alta' && !night.isLeapDay;
                    const leapMark =
                      role === 'co_owner' && night?.isLeapDay === true && st !== 'leap-other';
                    const stateAttr =
                      st === 'available' ? undefined : st === 'started' ? 'past' : st;
                    return (
                      <td
                        key={s}
                        data-state={stateAttr}
                        data-season={showSeason ? 'alta' : undefined}
                        data-range={range}
                      >
                        <button
                          className="lx-calendar__day"
                          type="button"
                          tabIndex={s === focused ? 0 : -1}
                          data-date={s}
                          aria-label={dayLabel(s)}
                          aria-disabled={selectable(s) ? undefined : true}
                          onClick={() => choose(s)}
                          onKeyDown={(event) => onKeyDown(event, s)}
                        >
                          <span className="lx-calendar__number">{day}</span>
                          {leapMark ? (
                            <span className="lx-calendar__mark" aria-hidden="true" />
                          ) : null}
                        </button>
                      </td>
                    );
                  }}
                />
              ))}
            </div>
          </div>
          <div className="lx-calendar__selection">
            <p role="status">{selectionLine}</p>
            {restartDate === null ? null : (
              <button
                className="lx-calendar__clear"
                type="button"
                onClick={() => {
                  select(restartDate, null);
                  pendingFocus.current = true;
                }}
              >
                {text.selection.restart(dayMonth(restartDate))}
              </button>
            )}
            {checkin === null && checkout === null ? null : (
              <button
                className="lx-calendar__clear"
                type="button"
                onClick={() => {
                  select(null, null);
                  document.getElementById('entrada')?.focus();
                }}
              >
                {text.selection.clear}
              </button>
            )}
          </div>
          {legend(months)}
        </div>
      </section>
      {summary()}
    </div>
  );

  function windowNote(month: string): string | null {
    if (role !== 'co_owner') return null;
    const year = Number(month.slice(0, 4));
    const entry = model.window(year, false);
    if (entry === undefined || entry.open) return null;
    return entry.opensOn === null ? null : text.grid.windowNote(year, fullDate(entry.opensOn));
  }

  function legend(shown: readonly string[]) {
    const visible = shown.flatMap((month) => {
      const first = `${month}-01`;
      return Array.from({ length: diff(first, add(lastDay(month), 1)) }, (_, i) => add(first, i));
    });
    const nights = visible
      .map((s) => model.byDate.get(s))
      .filter((night): night is CalendarNight => night !== undefined);
    const items: { label: string; attrs: Record<string, string> }[] = [
      { label: text.legend.available, attrs: {} },
      { label: text.legend.unavailable, attrs: { 'data-state': 'unavailable' } },
      { label: text.legend.mine(role), attrs: { 'data-state': 'mine' } },
      { label: text.legend.selected, attrs: { 'data-range': 'start' } },
    ];
    if (role === 'co_owner' && nights.some((night) => night.season === 'alta' && !night.isLeapDay))
      items.push({ label: text.legend.season, attrs: { 'data-season': 'alta' } });
    if (
      role === 'co_owner' &&
      nights.some((night) => night.isLeapDay && night.status !== 'leap-other')
    )
      items.push({ label: text.legend.leap, attrs: { 'data-mark': 'leap' } });
    return (
      <ul className="lx-calendar__legend" aria-label={text.legend.label}>
        {items.map((item) => (
          <li className="lx-calendar__legend-item" key={item.label}>
            <span className="lx-calendar__swatch" aria-hidden="true" {...item.attrs} />
            {item.label}
          </li>
        ))}
      </ul>
    );
  }

  function summary() {
    const done =
      preview !== null &&
      preview.checkin === checkin &&
      preview.checkout === checkout &&
      preview.attempt === attempt
        ? preview
        : null;
    const response = done?.response;
    const result = response?.status === 'ok' ? response.preview : null;
    let headline: string = text.summary.idle;
    if (checkin !== null && checkout === null) headline = text.summary.needCheckout;
    else if (checkin === null && checkout !== null) headline = text.summary.needCheckin;
    else if (checkin !== null && checkout !== null) {
      if (response === undefined) headline = text.summary.checking;
      else if (response.status === 'ok')
        headline = response.preview.ok ? text.summary.ok : text.summary.notOk;
      else if (response.status === 'forbidden') headline = text.summary.forbidden;
      else if (response.status === 'unauthenticated') headline = text.summary.signIn;
      else if (response.status === 'invalid') headline = text.issues.order;
      else headline = text.summary.failed;
    }
    const issues = result === null ? [] : issueTexts(result);
    return (
      <aside className="lx-booking__summary" aria-labelledby="resumo">
        <h2 id="resumo" className="lx-title">
          {text.summary.title}
        </h2>
        <p className="lx-booking__status" role="status">
          {headline}
        </p>
        {result === null || checkin === null || checkout === null ? null : (
          <dl className="lx-booking__facts">{facts(result, checkin, checkout)}</dl>
        )}
        {issues.length === 0 ? null : (
          <ul className="lx-booking__issues">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {response?.status === 'unavailable' ? (
          <>
            <p className="lx-hint">{text.summary.failedDetail}</p>
            <button
              className="lx-button lx-button--quiet"
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {text.summary.retry}
            </button>
          </>
        ) : null}
        <p className="lx-hint">{text.summary.note}</p>
        <ConfirmForm
          key={response?.status === 'ok' ? (response.key ?? 'invalid') : 'none'}
          idempotencyKey={response?.status === 'ok' ? response.key : null}
          secondHomeId={data.secondHomeId}
          partyId={data.partyId}
          checkin={checkin}
          checkout={checkout}
          enabled={result?.ok === true}
        />
      </aside>
    );
  }

  function facts(result: OwnUsePreview, start: string, end: string): ReactNode[] {
    const rows: ReactNode[] = [];
    const period =
      start.slice(0, 4) === end.slice(0, 4)
        ? `${text.summary.periodValue(compactDate(start), compactDate(end))} · ${start.slice(0, 4)}`
        : text.summary.periodValue(shortDate(start), shortDate(end));
    rows.push(<Fact key="period" label={text.summary.period} value={period} />);
    if (result.nights.length > 0)
      rows.push(
        <Fact
          key="nights"
          label={text.summary.nights}
          value={text.summary.nightsValue(result.nights.length, dateList(result.nights))}
        />,
      );
    if (result.ok && role === 'co_owner') {
      for (const usage of result.usage) {
        const granted = data.balances.find(
          (balance) =>
            balance.exerciseYear === usage.exerciseYear && balance.bucket === usage.bucket,
        )?.granted;
        rows.push(
          <Fact
            key={`${usage.exerciseYear}:${usage.bucket}`}
            label={text.summary.usageLabel(usage.bucket, usage.exerciseYear)}
            value={text.summary.usageValue(
              usage.bucket,
              usage.nights,
              usage.remaining - usage.nights,
              granted ?? null,
            )}
          />,
        );
      }
      if (result.stay > result.nights.length)
        rows.push(
          <Fact
            key="stay"
            label={text.summary.stay}
            value={text.summary.stayValue(result.stay, MAX_STAY)}
          />,
        );
    }
    return rows;
  }

  function issueTexts(result: OwnUsePreview): string[] {
    const messages = result.issues.map((issue) => issueText(issue));
    const blocking = result.issues.some((issue) =>
      ['own_booking', 'unavailable', 'window', 'leap_not_attributed', 'stay_length'].includes(
        issue.code,
      ),
    );
    const started = result.issues.some((issue) => issue.code === 'started');
    if (blocking && !started && checkin !== null) {
      const limit = status(checkin) === 'available' ? model.maxCheckout(checkin) : null;
      messages.push(
        limit === null
          ? text.issues.otherCheckin
          : text.issues.suggestion(dayMonth(checkin), dayMonth(limit)),
      );
    }
    return messages;
  }

  /** A janela no fuso da Second Home, como a leitura a entregou (a prévia traz o instante; o dia civil vem dos dados). */
  function opensOn(year: number, instant: string | null): string | null {
    if (instant === null) return null;
    const entry = data.windows.find(
      (candidate) => candidate.exerciseYear === year && candidate.opensAt === instant,
    );
    return entry?.opensOn === null || entry === undefined ? null : fullDate(entry.opensOn);
  }

  function issueText(issue: OwnUsePreviewIssue): string {
    switch (issue.code) {
      case 'order':
        return text.issues.order;
      case 'outside':
        return text.issues.outside(fullDate(model.last));
      case 'started':
        return text.issues.started(dateList(issue.dates), issue.dates.length, dayMonth(data.today));
      case 'own_booking':
        return text.issues.ownBooking(dateList(issue.dates), role);
      case 'unavailable':
        return text.issues.unavailable(dateList(issue.dates), issue.dates.length);
      case 'window':
        return text.issues.window(issue.exerciseYear, opensOn(issue.exerciseYear, issue.opensAt));
      case 'leap_not_attributed':
        return text.issues.leap(Number(issue.date.slice(0, 4)));
      case 'balance':
        return text.issues.balance(issue.bucket, issue.exerciseYear, issue.needed, issue.remaining);
      case 'stay_length':
        return text.issues.stay(issue.stay, MAX_STAY, issue.adjacent);
    }
  }
}

function NavButton(props: {
  readonly label: string;
  readonly direction: -1 | 1;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="lx-calendar__nav-button"
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path
          d={props.direction < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      </svg>
    </button>
  );
}

function Month(props: {
  readonly month: string;
  readonly previous: ReactNode;
  readonly next: ReactNode;
  readonly note: string | null;
  readonly renderDay: (s: string, day: number) => ReactNode;
}) {
  const { month } = props;
  const first = `${month}-01`;
  const lead = toDate(first).getUTCDay();
  const days = diff(first, add(lastDay(month), 1));
  const cells: ReactNode[] = Array.from({ length: lead }, (_, i) => <td key={`lead-${i}`} />);
  for (let d = 0; d < days; d += 1) cells.push(props.renderDay(add(first, d), d + 1));
  while (cells.length % 7 !== 0) cells.push(<td key={`trail-${cells.length}`} />);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const titleId = `mes-${month}`;
  return (
    <div className="lx-calendar__month">
      <div className="lx-calendar__header">
        {props.previous ?? <span aria-hidden="true" />}
        <h3 className="lx-calendar__title" id={titleId}>
          {monthName(month)}
        </h3>
        {props.next ?? <span aria-hidden="true" />}
      </div>
      {props.note === null ? null : <p className="lx-calendar__note">{props.note}</p>}
      <table className="lx-calendar__table" aria-labelledby={titleId}>
        <thead>
          <tr>
            {text.grid.weekdays.map(([short, long]) => (
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
  );
}
