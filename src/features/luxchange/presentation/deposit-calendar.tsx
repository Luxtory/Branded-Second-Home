'use client';

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/design-system/react';
import { sumCredits } from '../domain/deposit';
import { confirmDepositAction, previewDepositAction } from './deposit-actions';
import type { DepositFormState, DepositPreviewResponse } from './deposit-form-state';
import {
  dateList,
  dayMonth,
  formatCredits,
  fullDate,
  longDate,
  monthName,
  monthOnly,
} from './deposit-format';
import { applyNotice, nextNoticeChange, NOTICE_RECHECK_MS } from './deposit-notice';
import type { DepositCalendarData, DepositNightView } from './deposit-read';
import { depositMessages as text } from './i18n/deposit-pt-br';

const DAY_MS = 86_400_000;
/** Instante atual pelo relógio ancorado no banco (só em eventos e no relógio da antecedência, nunca na renderização). */
const anchoredNow = (base: { readonly server: number; readonly client: number }) =>
  base.server + (Date.now() - base.client);
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, days: number) =>
  new Date(toDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (month: string, delta: number) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
};
const lastDayOf = (month: string) => addDays(`${shiftMonth(month, 1)}-01`, -1);
const daysOf = (month: string) =>
  Array.from(
    { length: Number(lastDayOf(month).slice(8, 10)) },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );

type Status = DepositNightView['status'] | 'outside';

/** Estados indisponíveis com o número riscado do DS; os demais são só "sem ação" (passado, antecedência). */
const STRUCK: ReadonlySet<Status> = new Set(['ceded', 'booked', 'unavailable', 'committed']);

function Submit({ disabled }: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="lx-button lx-button--primary"
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {text.review.confirm}
    </button>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="lx-booking__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Confirmação explícita: a chave nasce na prévia válida; a Server Action revalida tudo e vai ao resultado. */
function ConfirmForm(props: {
  readonly preview: Extract<DepositPreviewResponse, { status: 'ok' }>;
  readonly onRefresh: () => void;
}) {
  const { preview } = props;
  const [accepted, setAccepted] = useState(false);
  const initial: DepositFormState = { key: preview.key ?? '', message: null };
  const [state, action] = useActionState(confirmDepositAction, initial);
  return (
    <form className="lx-booking__confirm" action={action}>
      <input type="hidden" name="second_home_id" value={preview.secondHomeId} />
      <input type="hidden" name="party_id" value={preview.partyId} />
      <input type="hidden" name="nights" value={preview.nights.join(',')} />
      <input
        type="hidden"
        name="expected_night_credits"
        value={preview.nightCredits.map((night) => night.credits).join(',')}
      />
      <input type="hidden" name="expected_credits" value={preview.credits} />
      <input type="hidden" name="expected_validity_months" value={preview.validityMonths} />
      <div className="lx-field">
        <label className="lx-choice" htmlFor="deposito-aceite">
          <input
            id="deposito-aceite"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            required
          />
          <span className="lx-choice__title">{text.review.accept}</span>
        </label>
      </div>
      {state.message === null ? null : (
        <p className="lx-booking__outcome" role="alert">
          {text.outcome[state.message]}
        </p>
      )}
      {state.message === 'ERR_DEPOSIT_TERMS_CHANGED' ? (
        <button className="lx-button lx-button--quiet" type="button" onClick={props.onRefresh}>
          {text.review.refresh}
        </button>
      ) : (
        <Submit disabled={!accepted || preview.key === null} />
      )}
    </form>
  );
}

/**
 * Calendário do depósito (W20; spec luxchange §5.4): a variante de seleção com valor por noite do DS
 * (`.lx-calendar--prl`), um mês por vez, foco itinerante e motivo de cada indisponibilidade ao toque. Owner seleciona
 * noites (consecutivas ou não); Co-Owner seleciona a reserva inteira. O resumo soma os Créditos exatos das noites; a
 * prévia do servidor decide os termos revisados; a confirmação é explícita e vinculante.
 */
export function DepositCalendar({ data }: { readonly data: DepositCalendarData }) {
  const coOwner = data.holding.modality === 'co_owner';
  // Relógio da antecedência (336 h): âncora no instante do banco da leitura + tempo decorrido no aparelho (o relógio do
  // aparelho pode estar errado; só a diferença conta). O command e o banco revalidam com o relógio do banco.
  const [nowMs, setNowMs] = useState(() => Date.parse(data.at));
  const clockBase = useRef<{ readonly server: number; readonly client: number } | null>(null);
  const model = useMemo(() => {
    const nights = applyNotice(data.nights, nowMs);
    const byDate = new Map(nights.map((night) => [night.date, night]));
    const bookings = new Map(data.bookings.map((booking) => [booking.id, booking]));
    const months = [...new Set(data.nights.map((night) => night.date.slice(0, 7)))];
    const years = [...new Set(months.map((value) => value.slice(0, 4)))];
    return { byDate, bookings, months, years };
  }, [data, nowMs]);
  const firstEligible = data.nights.find((night) => night.status === 'eligible');
  const [month, setMonth] = useState(
    (firstEligible ?? data.nights[0])?.date.slice(0, 7) ?? data.today.slice(0, 7),
  );
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [previewState, setPreview] = useState<DepositPreviewResponse | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);

  const status = (date: string): Status => model.byDate.get(date)?.status ?? 'outside';
  // Seleção e revisão valem só enquanto cada noite ainda pode ser depositada agora: a que passou do prazo sai da seleção
  // e a revisão volta ao resumo, com o motivo (nada fica selecionável por informação desatualizada).
  const selected = useMemo(
    () => picked.filter((date) => model.byDate.get(date)?.status === 'eligible'),
    [picked, model],
  );
  const preview =
    previewState?.status === 'ok' &&
    previewState.nights.some((date) => model.byDate.get(date)?.status !== 'eligible')
      ? null
      : previewState;
  const lapsed = selected.length < picked.length || (previewState !== null && preview === null);

  useEffect(() => {
    const base = { server: Date.parse(data.at), client: Date.now() };
    clockBase.current = base;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = anchoredNow(base);
      setNowMs(now);
      schedule(now);
    };
    // Reavalia exatamente no próximo prazo (check-in − 336 h + 1 ms) e, por segurança, a cada minuto.
    const schedule = (now: number) => {
      clearTimeout(timer);
      const next = nextNoticeChange(data.nights, now);
      const wait = next === null ? NOTICE_RECHECK_MS : Math.min(next - now, NOTICE_RECHECK_MS);
      timer = setTimeout(tick, Math.max(0, wait));
    };
    schedule(base.server);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [data]);
  const days = daysOf(month);
  const index = model.months.indexOf(month);
  const focused =
    focusDate !== null && focusDate.startsWith(month)
      ? focusDate
      : (days.find((date) => status(date) === 'eligible') ??
        days.find((date) => status(date) !== 'outside') ??
        days[0]!);

  // Prévia aceita: o foco (e a rolagem, no celular) vai à revisão, que substitui o resumo no mesmo lugar.
  const reviewing = preview?.status === 'ok';
  useEffect(() => {
    if (reviewing) reviewRef.current?.focus();
  }, [reviewing]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  });

  const credits = useMemo(
    () => sumCredits(selected.map((date) => model.byDate.get(date)?.credits ?? '0')),
    [selected, model],
  );

  const unitOf = (date: string): readonly string[] => {
    const bookingId = model.byDate.get(date)?.bookingId ?? null;
    return coOwner && bookingId !== null
      ? (model.bookings.get(bookingId)?.nights ?? [date])
      : [date];
  };
  const explain = (date: string, night = model.byDate.get(date)) => {
    if (night?.status === 'notice') return text.calendar.noticeRule;
    const reason =
      night === undefined
        ? text.calendar.status.unavailable
        : text.calendar.status[night.status === 'eligible' ? 'eligible' : night.status];
    return text.calendar.explain(dayMonth(date), reason);
  };
  const choose = (date: string) => {
    setFocusDate(date);
    // Antecedência conferida no instante do toque (não no último tique do relógio).
    const base = clockBase.current;
    const live = base === null ? nowMs : anchoredNow(base);
    if (live !== nowMs) setNowMs(live);
    // O primeiro toque depois do prazo assume a seleção atual: o aviso de datas retiradas dá lugar ao motivo do toque.
    if (lapsed) {
      setPicked(selected);
      setPreview(null);
    }
    const night = applyNotice(data.nights, live).find((value) => value.date === date);
    if (night?.status !== 'eligible') {
      setGuidance(explain(date, night));
      return;
    }
    const unit = unitOf(date);
    const isOn = selected.includes(date);
    const next = isOn
      ? selected.filter((value) => !unit.includes(value))
      : [...new Set([...selected, ...unit])].sort();
    setPicked(next);
    setPreview(null);
    setStale(false);
    const booking = night?.bookingId == null ? undefined : model.bookings.get(night.bookingId);
    // No celular a célula só mostra um ponto: o toque diz os Créditos da noite (ou da reserva).
    setGuidance(
      isOn
        ? null
        : booking !== undefined
          ? text.calendar.booking(
              dayMonth(booking.checkinDate),
              dayMonth(booking.checkoutDate),
              booking.nights.length,
            )
          : text.calendar.nightCredits(dayMonth(date), formatCredits(night?.credits ?? '0')),
    );
  };
  const moveFocus = (date: string) => {
    const target = date.slice(0, 7);
    if (!model.months.includes(target)) return;
    setMonth(target);
    setFocusDate(date);
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

  const label = (date: string) => {
    const night = model.byDate.get(date);
    if (night === undefined) return `${longDate(date)}, ${text.calendar.status.unavailable}`;
    const parts = [longDate(date), text.calendar.season[night.season]];
    parts.push(
      selected.includes(date)
        ? text.calendar.status.selected
        : text.calendar.status[night.status === 'eligible' ? 'eligible' : night.status],
    );
    if (night.credits !== null) parts.push(text.credits(formatCredits(night.credits)));
    return parts.join(', ');
  };

  const review = async () => {
    setLoading(true);
    setGuidance(null);
    try {
      setPreview(
        await previewDepositAction({ holdingId: data.holding.holdingId, nights: selected }),
      );
    } catch {
      setPreview({ status: 'unavailable' });
    } finally {
      setLoading(false);
    }
  };
  const refresh = () => {
    setStale(true);
    void review();
  };

  const lead = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const cells = [
    ...Array.from({ length: lead }, (_, i) => <td key={`lead-${i}`} />),
    ...days.map((date) => {
      const night = model.byDate.get(date);
      const st = status(date);
      const isSelected = selected.includes(date);
      return (
        <td
          key={date}
          data-tier={night?.season}
          data-selected={isSelected ? '' : undefined}
          data-state={STRUCK.has(st) ? 'unavailable' : undefined}
        >
          <button
            className="lx-calendar__day"
            type="button"
            data-date={date}
            tabIndex={date === focused ? 0 : -1}
            aria-label={label(date)}
            aria-pressed={st === 'eligible' ? isSelected : undefined}
            aria-disabled={st === 'eligible' ? undefined : true}
            onClick={() => choose(date)}
            onKeyDown={(event) => onKeyDown(event, date)}
          >
            <span className="lx-calendar__number">{Number(date.slice(8, 10))}</span>
            {night?.credits == null ? null : (
              <>
                <span className="lx-pricing__amount" aria-hidden="true">
                  {formatCredits(night.credits)}
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

  const blocked =
    !data.open ||
    !data.holding.membershipActive ||
    !data.multiplierPublished ||
    data.validityMonths === null;
  const ok = preview?.status === 'ok' ? preview : null;

  return (
    <div className="lx-booking">
      <section className="lx-booking__period" aria-labelledby="deposito-datas">
        <div className="lx-booking__intro">
          <h2 id="deposito-datas" className="lx-display-s">
            {coOwner ? text.calendar.headingCoOwner : text.calendar.headingOwner}
          </h2>
          <p className="lx-hint">{coOwner ? text.calendar.hintCoOwner : text.calendar.hintOwner}</p>
        </div>
        {data.nights.length === 0 ? (
          <p className="lx-body">{text.calendar.empty}</p>
        ) : (
          <div className="lx-calendar lx-calendar--prl">
            <div className="lx-pricing__jump">
              <div className="lx-field">
                <label className="lx-label" htmlFor="deposito-ir-mes">
                  {text.calendar.jumpMonth}
                </label>
                <div className="lx-select-wrap">
                  <select
                    className="lx-select"
                    id="deposito-ir-mes"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  >
                    {model.months
                      .filter((value) => value.startsWith(month.slice(0, 4)))
                      .map((value) => (
                        <option key={value} value={value}>
                          {monthOnly(value)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {model.years.length < 2 ? null : (
                <div className="lx-field">
                  <label className="lx-label" htmlFor="deposito-ir-ano">
                    {text.calendar.jumpYear}
                  </label>
                  <div className="lx-select-wrap">
                    <select
                      className="lx-select"
                      id="deposito-ir-ano"
                      value={month.slice(0, 4)}
                      onChange={(event) =>
                        // Como na W16: o mesmo mês no outro exercício, se selado; senão, o primeiro selado dele.
                        setMonth(
                          model.months.find(
                            (value) => value === `${event.target.value}-${month.slice(5)}`,
                          ) ??
                            model.months.find((value) => value.startsWith(event.target.value)) ??
                            month,
                        )
                      }
                    >
                      {model.years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="lx-calendar__months">
              <div className="lx-calendar__month">
                <div className="lx-calendar__header">
                  <button
                    className="lx-calendar__nav-button"
                    type="button"
                    aria-label={text.calendar.previous}
                    disabled={index <= 0}
                    onClick={() => setMonth(model.months[index - 1]!)}
                  >
                    <Icon name="chevron-left" />
                  </button>
                  <h3 className="lx-calendar__title" id="deposito-mes" aria-live="polite">
                    {monthName(month)}
                  </h3>
                  <button
                    className="lx-calendar__nav-button"
                    type="button"
                    aria-label={text.calendar.next}
                    disabled={index >= model.months.length - 1}
                    onClick={() => setMonth(model.months[index + 1]!)}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </div>
                <table className="lx-calendar__table" aria-labelledby="deposito-mes" ref={gridRef}>
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
                    {rows.map((row, i) => (
                      <tr key={i}>{row}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="lx-calendar__selection">
              <p className="lx-hint" aria-live="polite">
                {lapsed
                  ? text.calendar.noticeLapsed
                  : (guidance ?? text.calendar.selectedCount(selected.length))}
              </p>
              {selected.length === 0 ? null : (
                <button
                  className="lx-calendar__clear"
                  type="button"
                  onClick={() => {
                    setPicked([]);
                    setPreview(null);
                    setGuidance(null);
                  }}
                >
                  {text.calendar.clear}
                </button>
              )}
            </div>
            {/* `.lx-pricing` só como escopo das amostras de temporada do DS (mesma faixa das células). */}
            <ul className="lx-calendar__legend lx-pricing" aria-label={text.calendar.legend}>
              <li className="lx-calendar__legend-item">
                <span className="lx-calendar__swatch" aria-hidden="true" data-selected="" />
                {text.calendar.legendItems.selected}
              </li>
              <li className="lx-calendar__legend-item">
                <span className="lx-calendar__swatch" aria-hidden="true" data-state="unavailable" />
                {text.calendar.legendItems.unavailable}
              </li>
              <li className="lx-calendar__legend-item">
                <span className="lx-pricing__swatch" aria-hidden="true" data-tier="super_alta" />
                {text.calendar.legendItems.super_alta}
              </li>
              <li className="lx-calendar__legend-item">
                <span className="lx-pricing__swatch" aria-hidden="true" data-tier="alta" />
                {text.calendar.legendItems.alta}
              </li>
              <li className="lx-calendar__legend-item">
                <span className="lx-pricing__swatch" aria-hidden="true" data-tier="media" />
                {text.calendar.legendItems.media}
              </li>
            </ul>
          </div>
        )}
      </section>

      <aside className="lx-booking__summary" aria-labelledby="deposito-resumo">
        <h2 id="deposito-resumo" className="lx-title" ref={reviewRef} tabIndex={-1}>
          {ok === null ? text.summary.heading : text.review.heading}
        </h2>
        {ok === null ? (
          <>
            <p className="lx-booking__status" role="status">
              {selected.length === 0 ? text.summary.empty : text.credits(formatCredits(credits))}
            </p>
            <dl className="lx-booking__facts">
              <Fact
                label={text.summary.dates}
                value={selected.length === 0 ? '—' : dateList(selected)}
              />
              <Fact label={text.summary.nights} value={text.summary.nightsValue(selected.length)} />
              <Fact label={text.summary.receive} value={text.credits(formatCredits(credits))} />
              <Fact
                label={text.summary.balance}
                value={text.credits(formatCredits(data.balance))}
              />
              <Fact
                label={text.summary.potential}
                value={text.credits(formatCredits(sumCredits([data.balance, credits])))}
              />
              <Fact
                label={text.summary.validity}
                value={
                  data.validityMonths === null
                    ? text.summary.validityMissing
                    : text.summary.validityValue(data.validityMonths)
                }
              />
            </dl>
            <p className="lx-booking__footnote">{text.summary.potentialNote}</p>
            {preview !== null && preview.status !== 'ok' ? (
              <p className="lx-booking__outcome" role="alert">
                {preview.status === 'refused'
                  ? text.outcome[preview.reason]
                  : text.outcome[preview.status]}
              </p>
            ) : null}
            <button
              className="lx-button lx-button--primary"
              type="button"
              disabled={selected.length === 0 || blocked || loading}
              aria-busy={loading || undefined}
              onClick={() => void review()}
            >
              {loading ? text.summary.reviewing : text.summary.review}
            </button>
          </>
        ) : (
          <>
            {/* Só com a revisão nova na tela: enquanto ela carrega, segue um único aviso (o da recusa). */}
            {stale && !loading ? (
              <p className="lx-booking__outcome" role="alert">
                {text.review.stale}
              </p>
            ) : null}
            <dl className="lx-booking__facts">
              <Fact label={text.steps.home} value={ok.secondHomeLabel} />
              <Fact label={text.chooser.role} value={text.chooser.roles[ok.modality]} />
              <Fact
                label={text.review.what}
                value={ok.nightCredits.map((night, index) => (
                  <span key={night.date}>
                    {index === 0 ? null : <br />}
                    {text.review.nightLine(fullDate(night.date), formatCredits(night.credits))}
                  </span>
                ))}
              />
              <Fact
                label={text.summary.nights}
                value={text.summary.nightsValue(ok.nights.length)}
              />
              <Fact label={text.review.get} value={text.credits(formatCredits(ok.credits))} />
              <Fact label={text.summary.balance} value={text.credits(formatCredits(ok.balance))} />
              <Fact
                label={text.summary.potential}
                value={text.credits(formatCredits(ok.potential))}
              />
              <Fact
                label={text.summary.validity}
                value={text.summary.validityValue(ok.validityMonths)}
              />
            </dl>
            <h3 className="lx-label">{text.review.consequences}</h3>
            <ul className="lx-booking__issues">
              <li>{coOwner ? text.review.coOwnerEffect : text.review.ownerEffect}</li>
              <li>{text.review.binding}</li>
              <li>{text.review.noFee}</li>
            </ul>
            <ConfirmForm key={ok.key ?? 'closed'} preview={ok} onRefresh={refresh} />
            <button
              className="lx-button lx-button--quiet"
              type="button"
              onClick={() => {
                setPreview(null);
                setStale(false);
              }}
            >
              {text.review.back}
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
