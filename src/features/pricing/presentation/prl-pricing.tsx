'use client';

import { useActionState, useMemo, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon, RecordList } from '@/design-system/react';
import { prlMessages as text } from './i18n/prl-pt-br';
import { prlPublicationAction } from './prl-actions';
import type { PrlCalendarNight } from './prl-calendar-data';
import {
  daysOf,
  MonthNavButton,
  monthName,
  nightDescription,
  nightName,
  PrlLegend,
  PrlMonthCalendar,
  SeasonSwatch,
} from './prl-month-calendar';
import { adjacentMonth } from './prl-months';
import { PrlSelectedNights } from './prl-selected-nights';
import type { SeasonTier } from './prl-seasons';
import {
  addNights,
  ownPriced,
  resetToCommon,
  selectionPayload,
  type PrlSelection,
} from './prl-selection';
import type { PrlFormKind, PrlPublicationState } from './prl-state';

const SEASON_TIERS = ['super_alta', 'alta', 'media'] as const;

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
 * Definir ou alterar preços em lote (W16; REQ-013, REQ-052; spec pricing §5). Calendário do mês à esquerda e painel da
 * seleção à direita (no celular, um depois do outro): seleção individual, do mês ou por temporada, acumulada entre
 * meses. O preço comum vale para toda noite sem preço próprio; preço próprio só pelo campo da noite e só volta ao
 * comum por ação explícita (da noite ou de todas, com a contagem). O painel mostra as exceções do mês e abre a lista
 * completa sob demanda; revisão calculada no servidor antes da confirmação. Só noites elegíveis ao modo aceitam seleção — a inicial não alcança noite com preço e
 * a alteração não alcança noite sem preço —, então uma publicação nunca mistura as duas operações. O cliente não
 * calcula valor econômico: totais e Créditos vêm da revisão no servidor.
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
  const [selected, setSelected] = useState<PrlSelection>(new Map());
  const [common, setCommon] = useState('');
  // Lista completa do mês aberta ou só as exceções; vale para todos os meses até o Admin mudar.
  const [perNight, setPerNight] = useState(false);
  // Noites selecionadas junto ao calendário abertas ou só os meses; sobrevive à revisão e à troca de mês.
  const [pickedOpen, setPickedOpen] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const eligible = (night: PrlCalendarNight | undefined) =>
    night !== undefined && (props.kind === 'initial' ? !night.hasVersion : night.hasVersion);
  const reason = (night: PrlCalendarNight | undefined) =>
    night === undefined
      ? text.calendar.unsealed
      : props.kind === 'initial'
        ? text.calendar.notInitial
        : text.calendar.notChange;

  const add = (dates: readonly string[]) => {
    const { next, added, capped } = addNights(selected, dates, null);
    setSelected(next);
    return { added, capped };
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
      return;
    }
    const { capped } = add([date]);
    setGuidance(capped ? text.selection.capped(0) : '');
  };

  // Aditiva, como "Selecionar mês inteiro" do legado: só acrescenta (nunca desmarca nem muda preço próprio). A temporada
  // é filtro de apresentação: escolhe noites pela temporada visual; o grupo canônico da noite não muda.
  const selectMonth = (tier?: SeasonTier) => {
    const candidates = daysOf(month).filter((date) => {
      const night = byDate.get(date);
      return eligible(night) && (tier === undefined || night?.tier === tier);
    });
    const { added, capped } = add(candidates);
    setGuidance(
      capped
        ? text.selection.capped(added)
        : added === 0 && candidates.length > 0
          ? text.selection.already(candidates.length)
          : text.selection.added(added),
    );
  };

  const remove = (date: string) => {
    const next = new Map(selected);
    next.delete(date);
    setSelected(next);
    setGuidance('');
  };

  // Só meses do calendário da Second Home (lacunas são puladas, inclusive entre exercícios).
  const goToMonth = (target: string | null) => {
    if (target === null || !props.months.includes(target)) return;
    setMonth(target);
    setGuidance('');
  };

  const sorted = [...selected.keys()].sort();
  const inMonth = sorted.filter((date) => date.startsWith(month));
  const own = ownPriced(selected);
  const isOwn = (date: string) => (selected.get(date) ?? null) !== null;
  const ownInMonth = own.filter((date) => date.startsWith(month));
  const rows = perNight ? inMonth : ownInMonth;
  const payload = JSON.stringify(selectionPayload(selected, common));
  const reviewing = state.stage === 'review' && state.review !== null;
  const previousMonth = adjacentMonth(props.months, month, -1);
  const nextMonth = adjacentMonth(props.months, month, 1);
  const hasCommon = common.trim() !== '';

  return (
    <form
      className="lx-form lx-pricing__form"
      action={action}
      noValidate
      aria-label={text.modes[props.kind]}
    >
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
        <>
          <Review state={state} />
          <input type="hidden" name="effective_from" value={state.values.effective_from ?? ''} />
          <input type="hidden" name="basis" value={state.values.basis ?? ''} />
          <ReviewButtons kind={props.kind} />
        </>
      ) : (
        <div className="lx-pricing">
          <div className="lx-pricing__layout">
            <div className="lx-pricing__calendar">
              <PrlMonthCalendar
                id={`prl-${props.kind}`}
                month={month}
                months={props.months}
                byDate={byDate}
                focused={focused}
                focusRequest={focusRequest}
                day={(date, night) => {
                  const isSelected = selected.has(date);
                  const proposed = isSelected ? (selected.get(date) ?? common) : '';
                  const parts = nightDescription(date, night);
                  if (!eligible(night)) parts.push(reason(night));
                  else if (isSelected) {
                    parts.push(text.calendar.selected);
                    if (proposed.trim() !== '')
                      parts.push(text.calendar.proposed(`R$ ${proposed}`));
                    if (isOwn(date)) parts.push(text.calendar.own);
                  }
                  return {
                    label: parts.join(' — '),
                    inert: !eligible(night),
                    pressed: eligible(night) ? isSelected : undefined,
                    selected: isSelected,
                    viewing: false,
                    amount: isSelected
                      ? proposed.trim() === ''
                        ? null
                        : proposed
                      : (night?.inForceShort ?? null),
                  };
                }}
                onActivate={toggle}
                onMove={(date) => {
                  setMonth(date.slice(0, 7));
                  setFocused(date);
                  setFocusRequest((value) => value + 1);
                }}
                onJump={goToMonth}
                previous={
                  <MonthNavButton
                    label={text.previousMonth}
                    direction={-1}
                    disabled={previousMonth === null}
                    onClick={() => goToMonth(previousMonth)}
                  />
                }
                next={
                  <MonthNavButton
                    label={text.nextMonth}
                    direction={1}
                    disabled={nextMonth === null}
                    onClick={() => goToMonth(nextMonth)}
                  />
                }
                legend={<PrlLegend mark="selected" />}
              >
                <div className="lx-calendar__selection">
                  <p role="status">
                    {text.selection.count(selected.size)}
                    {guidance === '' ? '' : ` ${guidance}`}
                  </p>
                </div>
                <div
                  className="lx-pricing__bulk"
                  role="group"
                  aria-labelledby={`prl-${props.kind}-lote`}
                >
                  <p className="lx-pricing__eyebrow" id={`prl-${props.kind}-lote`}>
                    {text.selection.bulkLabel(monthName(month))}
                  </p>
                  <div className="lx-pricing__chips">
                    <button
                      className="lx-pricing__chip"
                      type="button"
                      onClick={() => selectMonth()}
                    >
                      {text.selection.month}
                    </button>
                    {SEASON_TIERS.map((tier) => (
                      <button
                        key={tier}
                        className="lx-pricing__chip"
                        type="button"
                        onClick={() => selectMonth(tier)}
                      >
                        <SeasonSwatch tier={tier} />
                        {text.seasons[tier]}
                      </button>
                    ))}
                  </div>
                </div>
                <PrlSelectedNights
                  id={`prl-${props.kind}`}
                  dates={sorted}
                  month={month}
                  open={pickedOpen}
                  isOwn={isOwn}
                  onToggle={() => setPickedOpen(!pickedOpen)}
                  onRemove={remove}
                  onClear={() => {
                    setSelected(new Map());
                    setPickedOpen(false);
                    setGuidance('');
                  }}
                  onGoTo={goToMonth}
                />
              </PrlMonthCalendar>
            </div>

            <div className="lx-pricing__panel" data-ground="wash">
              <section className="lx-pricing__block" aria-labelledby={`prl-${props.kind}-selecao`}>
                <p className="lx-pricing__eyebrow">{text.modes[props.kind]}</p>
                <h3 className="lx-pricing__title" id={`prl-${props.kind}-selecao`}>
                  {text.selection.title}
                </h3>
                <p className="lx-pricing__text">{text.selection.count(selected.size)}</p>
              </section>

              <div className="lx-pricing__common">
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
                {own.length === 0 ? null : (
                  <p className="lx-pricing__text">
                    {text.selection.split(selected.size - own.length, own.length)}
                  </p>
                )}
                {own.length === 0 || !hasCommon ? null : (
                  <button
                    className="lx-calendar__clear"
                    type="button"
                    onClick={() => {
                      const { next, replaced } = resetToCommon(selected);
                      setSelected(next);
                      setGuidance(text.selection.resetDone(replaced));
                    }}
                  >
                    {text.selection.resetAll(own.length)}
                  </button>
                )}
              </div>

              <section className="lx-pricing__block" aria-labelledby={`prl-${props.kind}-mes`}>
                <h4 className="lx-pricing__eyebrow" id={`prl-${props.kind}-mes`}>
                  {text.selection.thisMonth(monthName(month))}
                </h4>
                {state.fieldErrors.nights ? (
                  <p className="lx-error">
                    <Icon name="alert" className="lx-error__icon" />
                    {text.selection.nightsError}
                  </p>
                ) : null}
                {sorted.length === 0 ? (
                  <p className="lx-pricing__text">{text.selection.empty}</p>
                ) : inMonth.length === 0 ? (
                  <p className="lx-pricing__text">
                    {text.selection.thisMonthNone(monthName(month))}
                  </p>
                ) : (
                  <>
                    {rows.length === 0 ? null : (
                      <ol className="lx-pricing__nights">
                        {rows.map((date) => {
                          const night = byDate.get(date);
                          const owned = isOwn(date);
                          const meta = [night === undefined ? '' : text.seasons[night.tier]];
                          if (props.kind === 'change' && night?.inForce)
                            meta.push(text.selection.current(night.inForce));
                          if (owned) meta.push(text.selection.exception);
                          return (
                            <li className="lx-pricing__night" key={date}>
                              <span className="lx-pricing__night-date">
                                <span className="lx-pricing__night-name">{nightName(date)}</span>
                                <span className="lx-pricing__night-meta">
                                  {meta.filter(Boolean).join(' · ')}
                                </span>
                                {owned ? (
                                  <button
                                    className="lx-calendar__clear"
                                    type="button"
                                    aria-label={text.selection.resetOneFor(nightName(date))}
                                    onClick={() =>
                                      setSelected(resetToCommon(selected, [date]).next)
                                    }
                                  >
                                    {text.selection.resetOne}
                                  </button>
                                ) : null}
                              </span>
                              <input
                                className="lx-input"
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                aria-label={text.selection.amountFor(nightName(date))}
                                value={selected.get(date) ?? common}
                                onChange={(event) =>
                                  setSelected(new Map(selected).set(date, event.target.value))
                                }
                              />
                              <button
                                className="lx-pricing__remove"
                                type="button"
                                aria-label={text.selection.remove(nightName(date))}
                                onClick={() => remove(date)}
                              >
                                <Icon name="close" />
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {perNight || inMonth.length === ownInMonth.length ? null : (
                      <p className="lx-pricing__text">
                        {text.selection.followingInMonth(inMonth.length - ownInMonth.length)}
                      </p>
                    )}
                    <button
                      className="lx-calendar__clear"
                      type="button"
                      aria-expanded={perNight}
                      onClick={() => setPerNight(!perNight)}
                    >
                      {perNight ? text.selection.ownOnly : text.selection.perNight}
                    </button>
                  </>
                )}
              </section>

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
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * Revisão calculada no servidor, do mais importante ao detalhe: a operação (preços iniciais ou alteração), o que muda
 * (noites e PRL total), quando (vigência), com que autoridade e base, a prévia de Créditos e, por noite, a sequência de
 * preços — na alteração, vigente agora, versões futuras e o preço imediatamente anterior à nova vigência → novo.
 */
function Review({ state }: { readonly state: PrlPublicationState }) {
  const review = state.review!;
  const change = review.kind === 'change';
  const total =
    change && review.totalPrevious !== null
      ? text.review.compare(review.totalPrevious, review.totalProposed)
      : review.totalProposed;
  const facts: [string, string][] = [
    [text.review.validity, review.validity],
    [text.review.authority, review.authority],
    [text.review.basis, review.basis],
    [
      text.review.credits,
      review.totalCredits === null
        ? text.review.creditsUnavailable
        : text.review.creditsValue(review.totalCredits),
    ],
  ];
  return (
    <section className="lx-pricing lx-pricing__review" aria-labelledby="prl-revisao">
      <div className="lx-pricing__panel" data-ground="wash">
        <div className="lx-pricing__block">
          <p className="lx-pricing__eyebrow">{text.review.operation[review.kind]}</p>
          <h3 className="lx-pricing__title" id="prl-revisao">
            {text.review.title}
          </h3>
          <p className="lx-pricing__summary">
            {text.review.summary(text.nightsCount(review.lines.length), total)}
          </p>
          {change ? <p className="lx-pricing__text">{text.review.totalChange}</p> : null}
        </div>
        <dl className="lx-pricing__facts">
          {facts.map(([label, value]) => (
            <div className="lx-pricing__fact" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <RecordList
          label={text.review.linesLabel}
          items={review.lines.map((line) => ({
            id: line.date,
            title: line.night,
            attributes: [
              { label: text.season, value: line.season },
              ...(change
                ? [
                    {
                      label: text.review.currentNow,
                      value: line.current ?? text.review.currentNone,
                    },
                  ]
                : []),
              ...(change && line.scheduled.length > 0
                ? [{ label: text.review.scheduled, value: line.scheduled.join(' · ') }]
                : []),
              change && line.previous !== null
                ? {
                    label: text.review.replaces,
                    value: text.review.compare(line.previous, line.proposed),
                  }
                : { label: text.review.value, value: line.proposed },
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
        <p className="lx-pricing__text">{text.review.notice}</p>
      </div>
    </section>
  );
}
