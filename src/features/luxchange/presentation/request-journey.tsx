'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { PolicyAcceptance, PolicyTerms } from '@/features/pricing/policy-components';
import { compareCredits, subtractCredits, sumCredits } from '../domain/deposit';
import {
  previewRequestAction,
  submitRequestAction,
  type RequestPreviewResponse,
  type RequestSubmitResponse,
} from './request-actions';
import { dateList, dayMonth, formatCredits, fullDate, longDate } from './deposit-format';
import { datesBetween, formatFee, nextDay } from './request-format';
import { RequestMonth, type MonthDay } from './request-month';
import type { ComplementHomeView, ComplementOptionView, RequestJourneyData } from './request-read';
import { requestMessages as text } from './i18n/request-pt-br';

type Preview = Extract<RequestPreviewResponse, { status: 'ok' }>;

interface RequestShapeInput {
  readonly party_id: string;
  readonly second_home_id: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly complement: readonly (
    | { readonly kind: 'owner_night'; readonly second_home_id: string; readonly stay_date: string }
    | { readonly kind: 'co_owner_booking'; readonly booking_id: string }
  )[];
}

function Fact(props: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
}) {
  return (
    <div className="lx-booking__fact">
      <dt>{props.label}</dt>
      <dd>
        {props.value}
        {props.hint === undefined ? null : <span className="lx-hint"> {props.hint}</span>}
      </dd>
    </div>
  );
}

const credits = (value: string) => text.credits(formatCredits(value));
const monthsOf = (dates: readonly string[]) => [...new Set(dates.map((date) => date.slice(0, 7)))];

/**
 * Seleção do período solicitado (spec §13.5 item 2): primeiro toque marca o início, o segundo fecha o período contínuo;
 * reservas Co-Owner do detentor entram inteiras. Um toque depois de fechado recomeça. Indisponível não diz o motivo.
 */
function useTargetSelection(data: RequestJourneyData) {
  const byDate = useMemo(() => new Map(data.nights.map((night) => [night.date, night])), [data]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [range, setRange] = useState<readonly string[]>([]);
  const [closed, setClosed] = useState(false);
  const [guidance, setGuidance] = useState<string | null>(null);
  const unitOf = (date: string) => {
    const unit = byDate.get(date)?.unit ?? null;
    return unit === null
      ? [date]
      : data.nights.filter((night) => night.unit === unit).map((night) => night.date);
  };
  const choose = (date: string) => {
    const night = byDate.get(date);
    if (night?.status !== 'requestable') {
      setGuidance(
        night?.status === 'unavailable'
          ? text.journey.unavailableHint(fullDate(date))
          : text.journey.pastHint(fullDate(date)),
      );
      return;
    }
    const unit = unitOf(date);
    if (anchor === null || closed) {
      setAnchor(date);
      setRange(unit);
      setClosed(false);
      setGuidance(unit.length > 1 ? text.journey.unitHint : null);
      return;
    }
    const all = [...unitOf(anchor), ...unit].sort();
    const dates = datesBetween(all[0]!, all.at(-1)!);
    if (dates.every((value) => byDate.get(value)?.status === 'requestable')) {
      setRange(dates);
      setClosed(true);
      setGuidance(null);
    } else {
      setAnchor(date);
      setRange(unit);
      setClosed(false);
      setGuidance(text.journey.selectionInvalid);
    }
  };
  const clear = () => {
    setAnchor(null);
    setRange([]);
    setClosed(false);
    setGuidance(null);
  };
  return { byDate, range, guidance, choose, clear };
}

function TargetCalendar(props: {
  readonly data: RequestJourneyData;
  readonly selection: ReturnType<typeof useTargetSelection>;
}) {
  const { data, selection } = props;
  const months = useMemo(() => monthsOf(data.nights.map((night) => night.date)), [data]);
  const first = data.nights.find((night) => night.status === 'requestable');
  const [month, setMonth] = useState((first ?? data.nights[0])?.date.slice(0, 7) ?? '');
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const selected = useMemo(() => new Set(selection.range), [selection.range]);
  const day = (date: string): MonthDay | undefined => {
    const night = selection.byDate.get(date);
    if (night === undefined)
      return date < data.today ? { status: 'past', credits: null, season: 'media' } : undefined;
    return {
      status: night.status === 'requestable' ? 'on' : night.status === 'past' ? 'past' : 'off',
      credits: night.credits,
      season: night.season,
    };
  };
  const label = (date: string) => {
    const night = selection.byDate.get(date);
    const state = selected.has(date)
      ? text.journey.status.selected
      : text.journey.status[night?.status ?? (date < data.today ? 'past' : 'unavailable')];
    return text.journey.nightLabel(
      longDate(date),
      state,
      night?.credits == null ? null : formatCredits(night.credits),
    );
  };
  return (
    <section className="lx-booking__period" aria-labelledby="solicitacao-datas">
      <div className="lx-booking__intro">
        <h2 id="solicitacao-datas" className="lx-display-s">
          {text.journey.datesHeading}
        </h2>
        <p className="lx-hint">{text.journey.datesHint}</p>
      </div>
      {months.length === 0 ? (
        <p className="lx-body">{text.journey.noHomes}</p>
      ) : (
        <div className="lx-calendar lx-calendar--prl">
          <RequestMonth
            id="solicitacao"
            caption={text.journey.datesCaption}
            months={months}
            month={month}
            onMonth={setMonth}
            day={day}
            selected={selected}
            label={label}
            onChoose={selection.choose}
            focusDate={focusDate}
            onFocusDate={setFocusDate}
          />
          <div className="lx-calendar__selection">
            <p className="lx-hint" aria-live="polite">
              {selection.guidance ??
                (selection.range.length === 0
                  ? text.journey.summaryEmpty
                  : text.journey.selection(
                      dayMonth(selection.range[0]!),
                      dayMonth(selection.range.at(-1)!),
                      selection.range.length,
                    ))}
            </p>
            {selection.range.length === 0 ? null : (
              <button className="lx-calendar__clear" type="button" onClick={selection.clear}>
                {text.journey.clear}
              </button>
            )}
          </div>
          <ul className="lx-calendar__legend lx-pricing" aria-label={text.journey.datesHeading}>
            <li className="lx-calendar__legend-item">
              <span className="lx-calendar__swatch" aria-hidden="true" data-selected="" />
              {text.journey.status.selected}
            </li>
            <li className="lx-calendar__legend-item">
              <span className="lx-calendar__swatch" aria-hidden="true" data-state="unavailable" />
              {text.journey.status.unavailable}
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

/** Datas próprias de uma Second Home para o complemento: noites Owner no calendário; reservas Co-Owner como opções. */
function ComplementHome(props: {
  readonly home: ComplementHomeView;
  readonly picked: ReadonlySet<string>;
  readonly toggle: (option: ComplementOptionView) => void;
}) {
  const { home, picked, toggle } = props;
  const owner = home.options[0]?.kind === 'owner_night';
  const byDate = useMemo(
    () => new Map(home.options.map((option) => [option.stayDate ?? '', option])),
    [home],
  );
  const months = useMemo(
    () => monthsOf([...byDate.keys()].filter((date) => date !== '')),
    [byDate],
  );
  const [month, setMonth] = useState(months[0] ?? '');
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const headingId = `complemento-${home.holdingId}`;
  if (!owner)
    return (
      <fieldset className="lx-choice-group" aria-labelledby={headingId}>
        <legend className="lx-label" id={headingId}>
          {home.label}
        </legend>
        <div className="lx-choice-group__options">
          {home.options.map((option) => (
            <label className="lx-choice" key={option.key} htmlFor={`unidade-${option.key}`}>
              <input
                id={`unidade-${option.key}`}
                type="checkbox"
                checked={picked.has(option.key)}
                onChange={() => toggle(option)}
              />
              <span className="lx-choice__title">
                {text.journey.complementBooking(
                  dayMonth(option.nights[0]!),
                  dayMonth(option.nights.at(-1)!),
                  option.nights.length,
                )}
              </span>
              <span className="lx-choice__desc">
                {text.journey.potential(formatCredits(option.credits))}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  const selected = new Set(
    home.options.filter((option) => picked.has(option.key)).map((option) => option.stayDate!),
  );
  return (
    <div className="lx-calendar lx-calendar--prl" aria-labelledby={headingId} role="group">
      <h3 className="lx-label" id={headingId}>
        {home.label}
      </h3>
      <RequestMonth
        id={headingId}
        caption={text.journey.complementCaption(home.label)}
        months={months}
        month={month}
        onMonth={setMonth}
        day={(date) => {
          const option = byDate.get(date);
          return option === undefined
            ? undefined
            : { status: 'on', credits: option.credits, season: 'media' };
        }}
        selected={selected}
        label={(date) => {
          const option = byDate.get(date);
          return option === undefined
            ? `${longDate(date)}, ${text.journey.status.unavailable}`
            : text.journey.nightLabel(
                longDate(date),
                selected.has(date) ? text.journey.status.selected : text.journey.status.requestable,
                formatCredits(option.credits),
              );
        }}
        onChoose={(date) => {
          const option = byDate.get(date);
          if (option !== undefined) toggle(option);
        }}
        focusDate={focusDate}
        onFocusDate={setFocusDate}
      />
    </div>
  );
}

/**
 * Política da solicitação (PD-009), no corpo da página durante a revisão: os dois regimes sem contradição — até a
 * resposta, sem aceite, a Taxa volta inteira (com a Garantia e as datas); depois do aceite, valem os termos efetivos da
 * versão apresentada (`PolicyTerms`), aceita na revisão.
 */
function PolicySection({ policy }: { readonly policy: Preview['policy'] }) {
  return (
    <section className="lx-booking__period" aria-labelledby="solicitacao-politica-titulo">
      <div className="lx-booking__intro">
        <h2 id="solicitacao-politica-titulo" className="lx-display-s">
          {text.review.policy}
        </h2>
        <p className="lx-hint">{text.review.policyBefore}</p>
      </div>
      <h3 className="lx-label">{text.review.policyAfter}</h3>
      <p className="lx-hint">{text.review.policyAfterHint}</p>
      <PolicyTerms mechanism="luxchange_request" config={policy.config} headingLevel={4} />
    </section>
  );
}

/**
 * Revisão (spec §13.5 itens 3–5; PD-009, PD-012): os termos da prévia do servidor na ordem em que se leem — Créditos
 * necessários, saldo antes do envio, Garantia, Créditos potenciais do complemento (ainda não originados), cobertura,
 * excedente eventual e saldo depois do envio —, a Taxa e o prazo, o aceite da versão apresentada da política, o aceite
 * do complemento e o pagamento seguido do envio. Cobertura nunca aparece como saldo livre.
 */
function Review(props: {
  readonly preview: Preview;
  readonly complement: readonly ComplementOptionView[];
  readonly homes: ReadonlyMap<string, string>;
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly shape: RequestShapeInput;
}) {
  const { preview } = props;
  const q = preview.quote;
  const [acceptedPolicyId, setAcceptedPolicyId] = useState<string | null>(null);
  const [acceptedComplement, setAcceptedComplement] = useState(false);
  const [outcome, setOutcome] = useState<RequestSubmitResponse | null>(null);
  const [pending, startTransition] = useTransition();
  const hasComplement = props.complement.length > 0;
  const hasExcess = compareCredits(q.complement_excess, '0') > 0;
  const available =
    compareCredits(preview.balance, q.guarantee_credits) >= 0
      ? subtractCredits(preview.balance, q.guarantee_credits)
      : '0';
  const ready = acceptedPolicyId === preview.policy.id && (!hasComplement || acceptedComplement);
  const submit = () =>
    startTransition(async () => {
      setOutcome(
        await submitRequestAction({
          shape: props.shape,
          quote: q,
          paymentKey: preview.paymentKey,
          sendKey: preview.sendKey,
          acceptedPolicyId,
          acceptedComplement,
        }),
      );
    });
  const committedDates = props.complement
    .map((option) => `${props.homes.get(option.secondHomeId) ?? ''} ${dateList(option.nights)}`)
    .join('; ');
  const nights = datesBetween(q.checkin, q.checkout);
  return (
    <form
      className="lx-form"
      onChange={(event) => {
        const form = new FormData(event.currentTarget);
        const policy = form.get('accepted_policy_id');
        setAcceptedPolicyId(typeof policy === 'string' ? policy : null);
        setAcceptedComplement(form.get('accepted_complement') === 'on');
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !pending) submit();
      }}
    >
      <dl className="lx-booking__facts">
        <Fact label={text.review.required} value={credits(q.credits_required)} />
        <Fact label={text.review.balance} value={credits(preview.balance)} />
        <Fact
          label={text.review.guarantee}
          value={credits(q.guarantee_credits)}
          hint={text.review.guaranteeHint}
        />
        {hasComplement ? (
          <Fact
            label={text.review.potential}
            value={credits(q.complement_credits)}
            hint={text.review.potentialHint(committedDates)}
          />
        ) : null}
        <Fact
          label={text.review.covered}
          value={credits(q.credits_required)}
          hint={text.review.coveredBreakdown(
            formatCredits(q.guarantee_credits),
            formatCredits(q.complement_consumption),
          )}
        />
        {hasExcess ? (
          <Fact
            label={text.review.excess}
            value={credits(q.complement_excess)}
            hint={text.review.excessHint(q.credit_validity_months)}
          />
        ) : null}
        <Fact label={text.review.available} value={credits(available)} />
      </dl>
      <h3 className="lx-label">{text.review.groupFee}</h3>
      <dl className="lx-booking__facts">
        <Fact
          label={text.review.fee}
          value={formatFee(q.fee_amount_minor)}
          hint={text.review.feeHint}
        />
        <Fact label={text.review.deadline} value={text.hours(q.deadline_hours)} />
      </dl>
      <details className="lx-hint">
        <summary>{text.review.nights}</summary>
        <ul className="lx-booking__issues">
          {q.night_credits.map((value, index) => (
            <li key={nights[index]}>
              {fullDate(nights[index]!)}: {credits(value)}
            </li>
          ))}
        </ul>
      </details>
      <PolicyAcceptance policyId={preview.policy.id} since={preview.policy.since} />
      {hasComplement ? (
        <div className="lx-field">
          <label className="lx-choice" htmlFor="solicitacao-complemento">
            <input
              id="solicitacao-complemento"
              name="accepted_complement"
              type="checkbox"
              required
            />
            <span className="lx-choice__title">{text.review.acceptComplement}</span>
          </label>
        </div>
      ) : null}
      {outcome === null ? null : (
        <p className="lx-booking__outcome" role="alert">
          {outcome.status === 'payment_pending'
            ? text.outcome.payment_pending
            : text.outcome[outcome.reason]}
          {outcome.status === 'refused' && outcome.refunding === true ? (
            <>
              <br />
              {text.review.refunding}
            </>
          ) : null}
        </p>
      )}
      {outcome?.status === 'refused' &&
      (outcome.reason === 'ERR_REQUEST_TERMS_CHANGED' ||
        outcome.reason === 'ERR_POLICY_MISSING' ||
        outcome.refunding === true) ? (
        <button className="lx-button lx-button--quiet" type="button" onClick={props.onRefresh}>
          {text.review.refresh}
        </button>
      ) : (
        <button
          className="lx-button lx-button--primary"
          type="submit"
          disabled={!ready || pending}
          aria-busy={pending || undefined}
        >
          {pending
            ? text.review.sending
            : outcome?.status === 'payment_pending'
              ? text.review.retry
              : text.review.send}
        </button>
      )}
      <button className="lx-button lx-button--quiet" type="button" onClick={props.onBack}>
        {text.review.back}
      </button>
    </form>
  );
}

/**
 * Jornada da Request para uma Second Home (W21 E3; spec luxchange §13.5): datas solicitadas, datas próprias opcionais,
 * prévia do servidor, revisão com os termos do PD-012, aceites e "Pagar a Taxa e enviar". Valores da tela antes da prévia
 * são só estimativa; Créditos potenciais nunca aparecem como saldo; nunca PRL em reais.
 */
export function RequestJourney({ data }: { readonly data: RequestJourneyData }) {
  const selection = useTargetSelection(data);
  const [picked, setPicked] = useState<ReadonlyMap<string, ComplementOptionView>>(new Map());
  const [preview, setPreview] = useState<RequestPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const homes = useMemo(
    () => new Map(data.complement.map((home) => [home.secondHomeId, home.label])),
    [data],
  );
  const ok = preview?.status === 'ok' ? preview : null;
  useEffect(() => {
    if (ok !== null) reviewRef.current?.focus();
  }, [ok]);

  const toggle = (option: ComplementOptionView) => {
    const next = new Map(picked);
    if (next.has(option.key)) next.delete(option.key);
    else next.set(option.key, option);
    setPicked(next);
    setPreview(null);
  };
  const range = selection.range;
  const estimate = sumCredits(range.map((date) => selection.byDate.get(date)?.credits ?? '0'));
  const potential = sumCredits([...picked.values()].map((option) => option.credits));
  const shape: RequestShapeInput = {
    party_id: data.party.partyId,
    second_home_id: data.home.secondHomeId,
    checkin: range[0] ?? '',
    checkout: range.length === 0 ? '' : nextDay(range.at(-1)!),
    complement: [...picked.values()].map((option) =>
      option.kind === 'owner_night'
        ? {
            kind: 'owner_night' as const,
            second_home_id: option.secondHomeId,
            stay_date: option.stayDate!,
          }
        : { kind: 'co_owner_booking' as const, booking_id: option.bookingId! },
    ),
  };
  const blocked = !data.open || !data.party.membershipActive || data.deadlineHours === null;
  const review = async () => {
    setLoading(true);
    try {
      setPreview(await previewRequestAction(shape));
    } catch {
      setPreview({ status: 'refused', reason: 'unavailable' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lx-booking">
      <div className="lx-page-section">
        <TargetCalendar
          data={data}
          selection={{
            ...selection,
            choose: (date) => {
              selection.choose(date);
              setPreview(null);
            },
            clear: () => {
              selection.clear();
              setPreview(null);
            },
          }}
        />
        <section className="lx-booking__period" aria-labelledby="solicitacao-complemento-titulo">
          <div className="lx-booking__intro">
            <h2 id="solicitacao-complemento-titulo" className="lx-display-s">
              {text.journey.complementHeading}
            </h2>
            <p className="lx-hint">{text.journey.complementHint}</p>
          </div>
          {!data.complementOpen ? (
            <p className="lx-body">{text.journey.complementClosed}</p>
          ) : data.complement.length === 0 ? (
            <p className="lx-body">{text.journey.complementEmpty}</p>
          ) : (
            data.complement.map((home) => (
              <ComplementHome
                key={home.holdingId}
                home={home}
                picked={new Set(picked.keys())}
                toggle={toggle}
              />
            ))
          )}
        </section>
        {ok === null ? null : <PolicySection policy={ok.policy} />}
      </div>

      <aside className="lx-booking__summary" aria-labelledby="solicitacao-resumo">
        <h2 id="solicitacao-resumo" className="lx-title" ref={reviewRef} tabIndex={-1}>
          {ok === null ? text.journey.summary : text.review.heading}
        </h2>
        {ok === null ? (
          <>
            <p className="lx-booking__status" role="status">
              {range.length === 0
                ? text.journey.summaryEmpty
                : text.journey.selection(
                    dayMonth(range[0]!),
                    dayMonth(range.at(-1)!),
                    range.length,
                  )}
            </p>
            <dl className="lx-booking__facts">
              <Fact label={text.review.required} value={credits(estimate)} />
              <Fact label={text.review.balance} value={credits(data.balance)} />
              <Fact
                label={text.review.potential}
                value={credits(potential)}
                hint={text.journey.potentialHint}
              />
              <Fact
                label={text.review.deadline}
                value={data.deadlineHours === null ? '—' : text.hours(data.deadlineHours)}
              />
            </dl>
            <p className="lx-booking__footnote">{text.journey.estimated}</p>
            {preview?.status === 'refused' ? (
              <p className="lx-booking__outcome" role="alert">
                {text.outcome[preview.reason]}
              </p>
            ) : null}
            <button
              className="lx-button lx-button--primary"
              type="button"
              disabled={range.length === 0 || blocked || loading}
              aria-busy={loading || undefined}
              onClick={() => void review()}
            >
              {loading ? text.journey.previewing : text.journey.preview}
            </button>
          </>
        ) : (
          <Review
            key={ok.paymentKey}
            preview={ok}
            complement={[...picked.values()]}
            homes={homes}
            shape={shape}
            onBack={() => setPreview(null)}
            onRefresh={() => void review()}
          />
        )}
      </aside>
    </div>
  );
}
