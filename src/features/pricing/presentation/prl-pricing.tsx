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
import { Icon, RecordList } from '@/design-system/react';
import { prlMessages as text } from './i18n/prl-pt-br';
import { prlPublicationAction } from './prl-actions';
import type { PrlCalendarNight } from './prl-calendar-data';
import type { PrlFormKind, PrlPublicationState } from './prl-state';

const DAY_MS = 86_400_000;
const MAX_NIGHTS = 366;
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, days: number) =>
  new Date(toDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (month: string, delta: number) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
};
const lastDayOf = (month: string) => addDays(`${shiftMonth(month, 1)}-01`, -1);
const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    toDate(`${month}-01`),
  );
const nightName = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(date));

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

function ReviewButtons({ kind }: { readonly kind: PrlFormKind }) {
  const { pending } = useFormStatus();
  return (
    <div className="lx-form__actions">
      <button
        className="lx-button lx-button--primary"
        type="submit"
        name="intent"
        value="confirm"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.pending : text.review.confirm[kind]}
      </button>
      <button
        className="lx-button lx-button--quiet"
        type="submit"
        name="intent"
        value="edit"
        disabled={pending}
      >
        {text.review.edit}
      </button>
      {pending ? (
        <p className="lx-visually-hidden" role="status">
          {text.pendingStatus}
        </p>
      ) : null}
    </div>
  );
}

function ReviewSubmit() {
  const { pending } = useFormStatus();
  return (
    <div className="lx-form__actions">
      <button
        className="lx-button lx-button--primary"
        type="submit"
        name="intent"
        value="review"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? text.reviewing : text.selection.review}
      </button>
    </div>
  );
}

function Field(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly error: string | null;
  readonly children: (described: string, invalid: true | undefined) => ReactNode;
}) {
  const hintId = `${props.id}-dica`;
  const errorId = `${props.id}-erro`;
  return (
    <div className="lx-field">
      <label className="lx-label" htmlFor={props.id}>
        {props.label}
      </label>
      <p className="lx-hint" id={hintId}>
        {props.hint}
      </p>
      {props.children(
        props.error ? `${hintId} ${errorId}` : hintId,
        props.error ? true : undefined,
      )}
      {props.error ? (
        <p className="lx-error" id={errorId}>
          <Icon name="alert" className="lx-error__icon" />
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Publicação de PRL em lote (W16 E4; REQ-013, REQ-052): calendário mensal do DS (`.lx-calendar`) com seleção individual,
 * do mês inteiro ou por categoria canônica; valor comum aplicado às noites selecionadas e valores individuais; revisão
 * calculada no servidor antes da confirmação. Só noites elegíveis ao tipo aceitam seleção: a inicial não alcança noite
 * publicada e a alteração não alcança noite sem PRL, então um lote nunca mistura as duas operações.
 */
export function PrlPricing(props: {
  readonly kind: PrlFormKind;
  readonly secondHomeId: string;
  readonly idempotencyKey: string;
  readonly months: readonly string[];
  readonly initialMonth: string;
  readonly nights: readonly PrlCalendarNight[];
}) {
  const [state, action] = useActionState(prlPublicationAction, {
    key: props.idempotencyKey,
    stage: 'edit',
    review: null,
    issues: [],
    fieldErrors: {},
    values: {},
    rejection: null,
  } satisfies PrlPublicationState);
  const byDate = useMemo(
    () => new Map(props.nights.map((night) => [night.date, night])),
    [props.nights],
  );
  const [month, setMonth] = useState(props.initialMonth);
  const [selected, setSelected] = useState<ReadonlyMap<string, string>>(new Map());
  const [common, setCommon] = useState('');
  const [guidance, setGuidance] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const pendingFocus = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const first = props.months[0] ?? month;
  const last = props.months.at(-1) ?? month;
  const years = [...new Set(props.months.map((value) => value.slice(0, 4)))];
  const eligible = (night: PrlCalendarNight | undefined) =>
    night !== undefined && (props.kind === 'initial' ? !night.hasVersion : night.hasVersion);
  const monthDays = Array.from(
    { length: Number(lastDayOf(month).slice(8, 10)) },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
  const focusTarget =
    focused !== null && focused.startsWith(month)
      ? focused
      : (monthDays.find((date) => eligible(byDate.get(date))) ?? monthDays[0]!);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusTarget}"]`)?.focus();
  });

  const reason = (night: PrlCalendarNight | undefined) =>
    night === undefined
      ? text.calendar.unsealed
      : props.kind === 'initial'
        ? text.calendar.notInitial
        : text.calendar.notChange;

  const label = (date: string) => {
    const night = byDate.get(date);
    const parts = [nightName(date)];
    if (night !== undefined) {
      parts.push(text.seasons[night.season]);
      parts.push(
        night.status === 'in_force'
          ? `${text.statusInForce} ${night.inForce ?? ''}`.trim()
          : night.status === 'scheduled_only'
            ? text.statusScheduledOnly
            : text.calendar.absentShort,
      );
      if (night.scheduled !== null && night.status === 'in_force')
        parts.push(text.calendar.scheduledShort);
    }
    if (!eligible(night)) parts.push(reason(night));
    else if (selected.has(date)) parts.push(text.calendar.selected);
    return parts.join(' — ');
  };

  const add = (dates: readonly string[]) => {
    const next = new Map(selected);
    let capped = false;
    for (const date of dates) {
      if (next.has(date)) continue;
      if (next.size >= MAX_NIGHTS) {
        capped = true;
        break;
      }
      next.set(date, common);
    }
    setSelected(next);
    setGuidance(capped ? text.selection.capped : '');
  };

  const toggle = (date: string) => {
    const night = byDate.get(date);
    setFocused(date);
    if (!eligible(night)) {
      setGuidance(`${nightName(date)}: ${reason(night)}`);
      return;
    }
    if (selected.has(date)) {
      const next = new Map(selected);
      next.delete(date);
      setSelected(next);
      setGuidance('');
    } else add([date]);
  };

  const selectMonth = (season?: 'alta' | 'media') =>
    add(
      monthDays.filter((date) => {
        const night = byDate.get(date);
        return eligible(night) && (season === undefined || night?.season === season);
      }),
    );

  const goToMonth = (target: string) => {
    if (target < first || target > last) return;
    setMonth(target);
    setGuidance('');
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
      PageUp: () => `${shiftMonth(date.slice(0, 7), -1)}-01`,
      PageDown: () => `${shiftMonth(date.slice(0, 7), 1)}-01`,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const target = move();
    if (target.slice(0, 7) < first || target.slice(0, 7) > last) return;
    setMonth(target.slice(0, 7));
    setFocused(target);
    pendingFocus.current = true;
  };

  const sorted = [...selected.keys()].sort();
  const payload = JSON.stringify(
    sorted.map((date) => ({ stay_date: date, amount: selected.get(date) ?? '' })),
  );
  const reviewing = state.stage === 'review' && state.review !== null;
  const lead = toDate(`${month}-01`).getUTCDay();
  const cells: ReactNode[] = Array.from({ length: lead }, (_, index) => (
    <td key={`lead-${index}`} />
  ));
  for (const date of monthDays) {
    const night = byDate.get(date);
    const isSelected = selected.has(date);
    cells.push(
      <td
        key={date}
        data-season={night?.season === 'alta' ? 'alta' : undefined}
        data-state={night?.status === 'in_force' ? 'mine' : undefined}
        data-range={isSelected ? 'start' : undefined}
      >
        <button
          className="lx-calendar__day"
          type="button"
          data-date={date}
          tabIndex={date === focusTarget ? 0 : -1}
          aria-label={label(date)}
          aria-pressed={eligible(night) ? isSelected : undefined}
          aria-disabled={eligible(night) ? undefined : true}
          onClick={() => toggle(date)}
          onKeyDown={(event) => onKeyDown(event, date)}
        >
          <span className="lx-calendar__number">{Number(date.slice(8, 10))}</span>
          {night?.scheduled !== null && night !== undefined ? (
            <span className="lx-calendar__mark" aria-hidden="true" />
          ) : null}
        </button>
      </td>,
    );
  }
  while (cells.length % 7 !== 0) cells.push(<td key={`trail-${cells.length}`} />);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
  const titleId = `prl-mes-${props.kind}`;

  return (
    <form className="lx-form" action={action} noValidate aria-label={text.modes[props.kind]}>
      <input type="hidden" name="kind" value={props.kind} />
      <input type="hidden" name="second_home_id" value={props.secondHomeId} />
      <input type="hidden" name="nights" value={payload} />
      {state.rejection === null ? null : (
        <div className="lx-message lx-message--error" role="alert">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">
            {text.rejection[state.rejection] ?? text.rejection.unexpected}
          </p>
          {state.issues.length === 0 ? null : (
            <ul className="lx-message__body">
              {state.issues.map((issue) => (
                <li key={issue.issue}>
                  {text.issues[issue.issue] ?? issue.issue}
                  {issue.nights.length === 0 ? '' : `: ${issue.nights.join(', ')}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {reviewing ? (
        <Review state={state} />
      ) : (
        <>
          <div className="lx-calendar">
            <div className="lx-calendar__grid" ref={gridRef}>
              <div className="lx-calendar__months">
                <div className="lx-calendar__month">
                  <div className="lx-calendar__header">
                    <NavButton
                      label={text.previousMonth}
                      direction={-1}
                      disabled={month <= first}
                      onClick={() => goToMonth(shiftMonth(month, -1))}
                    />
                    <h3 className="lx-calendar__title" id={titleId} aria-live="polite">
                      {monthName(month)}
                    </h3>
                    <NavButton
                      label={text.nextMonth}
                      direction={1}
                      disabled={month >= last}
                      onClick={() => goToMonth(shiftMonth(month, 1))}
                    />
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
                <span className="lx-calendar__swatch" aria-hidden="true" data-range="start" />
                {text.calendar.legendSelected}
              </li>
              <li className="lx-calendar__legend-item">
                <span className="lx-calendar__swatch" aria-hidden="true" data-season="alta" />
                {text.calendar.legendAlta}
              </li>
            </ul>
            <div className="lx-calendar__selection">
              <p role="status">
                {guidance === '' ? text.selection.count(selected.size) : guidance}
              </p>
              <button className="lx-calendar__clear" type="button" onClick={() => selectMonth()}>
                {text.selection.month}
              </button>
              <button
                className="lx-calendar__clear"
                type="button"
                onClick={() => selectMonth('alta')}
              >
                {text.selection.monthAlta}
              </button>
              <button
                className="lx-calendar__clear"
                type="button"
                onClick={() => selectMonth('media')}
              >
                {text.selection.monthMedia}
              </button>
              {selected.size === 0 ? null : (
                <button
                  className="lx-calendar__clear"
                  type="button"
                  onClick={() => {
                    setSelected(new Map());
                    setGuidance('');
                  }}
                >
                  {text.selection.clear}
                </button>
              )}
            </div>
            {years.length > 1 ? (
              <div className="lx-form__actions" role="group" aria-label={text.calendar.exercises}>
                {years.map((year) => (
                  <button
                    key={year}
                    className="lx-button lx-button--quiet"
                    type="button"
                    aria-pressed={month.startsWith(year)}
                    onClick={() =>
                      goToMonth(props.months.find((value) => value.startsWith(year)) ?? month)
                    }
                  >
                    {text.calendar.exercise(year)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Field
            id={`${props.kind}-comum`}
            label={text.selection.common}
            hint={text.selection.commonHint}
            error={null}
          >
            {(described) => (
              <input
                className="lx-input"
                id={`${props.kind}-comum`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={common}
                aria-describedby={described}
                onChange={(event) => setCommon(event.target.value)}
              />
            )}
          </Field>
          <div className="lx-form__actions">
            <button
              className="lx-button lx-button--quiet"
              type="button"
              disabled={selected.size === 0}
              onClick={() => setSelected(new Map(sorted.map((date) => [date, common])))}
            >
              {text.selection.apply}
            </button>
          </div>

          {sorted.length === 0 ? (
            <p className="lx-body">{text.selection.empty}</p>
          ) : (
            <div className="lx-field">
              <p className="lx-label">{text.selection.listTitle(sorted.length)}</p>
              {state.fieldErrors.nights ? (
                <p className="lx-error">
                  <Icon name="alert" className="lx-error__icon" />
                  {text.selection.nightsError}
                </p>
              ) : null}
              <RecordList
                label={text.selection.listTitle(sorted.length)}
                items={sorted.map((date) => {
                  const night = byDate.get(date);
                  return {
                    id: date,
                    title: `${nightName(date)} · ${night === undefined ? '' : text.seasons[night.season]}`,
                    attributes: [
                      ...(props.kind === 'change' && night?.inForce
                        ? [{ label: text.selection.currentLabel, value: night.inForce }]
                        : []),
                      {
                        label: text.selection.amountLabel,
                        value: (
                          <input
                            className="lx-input"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={text.selection.amountFor(nightName(date))}
                            value={selected.get(date) ?? ''}
                            onChange={(event) =>
                              setSelected(new Map(selected).set(date, event.target.value))
                            }
                          />
                        ),
                      },
                      {
                        label: text.selection.removeLabel,
                        value: (
                          <button
                            className="lx-calendar__clear"
                            type="button"
                            aria-label={text.selection.remove(nightName(date))}
                            onClick={() => {
                              const next = new Map(selected);
                              next.delete(date);
                              setSelected(next);
                            }}
                          >
                            {text.selection.removeShort}
                          </button>
                        ),
                      },
                    ],
                  };
                })}
              />
            </div>
          )}

          <Field
            id={`${props.kind}-effective_from`}
            label={text.fields.effective_from}
            hint={text.fields.effectiveFromHint}
            error={state.fieldErrors.effective_from ? text.fields.effectiveFromError : null}
          >
            {(described, invalid) => (
              <input
                className="lx-input"
                id={`${props.kind}-effective_from`}
                name="effective_from"
                type="datetime-local"
                defaultValue={state.values.effective_from ?? ''}
                aria-describedby={described}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <Field
            id={`${props.kind}-basis`}
            label={text.fields.basis}
            hint={text.fields.basisHint}
            error={state.fieldErrors.basis ? text.fields.basisError : null}
          >
            {(described, invalid) => (
              <input
                className="lx-input"
                id={`${props.kind}-basis`}
                name="basis"
                type="text"
                autoComplete="off"
                maxLength={255}
                defaultValue={state.values.basis ?? ''}
                aria-describedby={described}
                aria-invalid={invalid}
              />
            )}
          </Field>
          <ReviewSubmit />
        </>
      )}
      {reviewing ? (
        <>
          <input type="hidden" name="effective_from" value={state.values.effective_from ?? ''} />
          <input type="hidden" name="basis" value={state.values.basis ?? ''} />
          <ReviewButtons kind={props.kind} />
        </>
      ) : null}
    </form>
  );
}

/** Revisão do lote, calculada no servidor: tipo, vigência, datas, vigente × novo, prévia de Créditos e totais. */
function Review({ state }: { readonly state: PrlPublicationState }) {
  const review = state.review!;
  const change = review.kind === 'change';
  return (
    <section className="lx-page-section" aria-labelledby="prl-revisao">
      <h3 className="lx-display-s" id="prl-revisao">
        {text.review.title}
      </h3>
      <dl className="lx-evidence">
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{text.review.kind}</dt>
          <dd className="lx-evidence__value">{text.modes[review.kind]}</dd>
        </div>
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{text.review.validity}</dt>
          <dd className="lx-evidence__value">{review.validity}</dd>
        </div>
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{text.review.nights}</dt>
          <dd className="lx-evidence__value">{text.nightsCount(review.lines.length)}</dd>
        </div>
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{text.review.total}</dt>
          <dd className="lx-evidence__value">
            {change && review.totalCurrent !== null
              ? text.review.compare(review.totalCurrent, review.totalProposed)
              : review.totalProposed}
          </dd>
        </div>
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{text.review.credits}</dt>
          <dd className="lx-evidence__value">
            {review.totalCredits === null
              ? text.review.creditsUnavailable
              : text.review.creditsValue(review.totalCredits)}
          </dd>
        </div>
      </dl>
      <RecordList
        label={text.review.linesLabel}
        items={review.lines.map((line) => ({
          id: line.date,
          title: `${line.night} · ${line.season}`,
          attributes: [
            ...(change && line.current !== null
              ? [{ label: text.review.current, value: line.current }]
              : []),
            { label: change ? text.review.proposed : text.review.value, value: line.proposed },
            ...(line.credits === null
              ? []
              : [
                  {
                    label: text.review.creditsPreview,
                    value: text.review.creditsValue(line.credits),
                  },
                ]),
          ],
        }))}
      />
      <p className="lx-body">{text.review.notice}</p>
    </section>
  );
}
