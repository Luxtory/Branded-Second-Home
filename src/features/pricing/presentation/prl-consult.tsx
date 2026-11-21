'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { prlMessages as text } from './i18n/prl-pt-br';
import type { PrlCalendarNight } from './prl-calendar-data';
import {
  MonthNavButton,
  monthName,
  nightDescription,
  nightName,
  PrlLegend,
  PrlMonthCalendar,
  SeasonSwatch,
} from './prl-month-calendar';
import { monthSummary } from './prl-month-summary';
import { adjacentMonth } from './prl-months';

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="lx-pricing__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Uma versão do histórico imutável, formatada no servidor; `state` diz se vale agora, se é futura ou se já acabou. */
export interface PrlHistoryEntry {
  readonly id: string;
  readonly value: string;
  readonly kind: string;
  readonly state: 'in_force' | 'future' | 'past';
  readonly validity: string;
  readonly authority: string;
  readonly basis: string;
  readonly recordedAt: string;
}

function NightDetail(props: {
  readonly date: string;
  readonly night: PrlCalendarNight;
  readonly history: readonly PrlHistoryEntry[];
}) {
  const { night } = props;
  const status =
    night.status === 'in_force'
      ? text.statusInForce
      : night.status === 'scheduled_only'
        ? text.statusScheduledOnly
        : text.statusAbsent;
  return (
    <section className="lx-pricing__block" aria-labelledby="prl-noite" aria-live="polite">
      <p className="lx-pricing__eyebrow">{text.nightTitle}</p>
      <h3 className="lx-pricing__title" id="prl-noite">
        {nightName(props.date)}
      </h3>
      <dl className="lx-pricing__facts">
        <div className="lx-pricing__fact">
          <dt>{text.season}</dt>
          <dd className="lx-pricing__season">
            <SeasonSwatch tier={night.tier} />
            {text.seasons[night.tier]}
          </dd>
        </div>
        <div className="lx-pricing__fact">
          <dt>{text.group}</dt>
          <dd>{text.groups[night.season]}</dd>
        </div>
        <div className="lx-pricing__fact">
          <dt>{text.status}</dt>
          <dd>{status}</dd>
        </div>
        {night.inForce === null ? null : (
          <div className="lx-pricing__fact">
            <dt>{text.inForceValue}</dt>
            <dd>
              {night.inForce}
              {night.inForceSince === null ? '' : ` · ${text.inForceSince(night.inForceSince)}`}
            </dd>
          </div>
        )}
        {night.scheduled.length === 0 ? null : (
          <div className="lx-pricing__fact">
            <dt>{text.scheduledLabel}</dt>
            <dd>
              {night.scheduled.map((line) => (
                <span key={line} className="lx-pricing__line">
                  {line}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      {night.status === 'absent' ? (
        <p className="lx-pricing__text">{text.statusAbsentEffect}</p>
      ) : null}
      {props.history.length === 0 ? null : (
        <details className="lx-pricing__details">
          <summary className="lx-link">
            {text.history} · {text.historyCount(props.history.length)}
          </summary>
          <ol className="lx-pricing__history" aria-label={text.historyLabel(nightName(props.date))}>
            {[...props.history].reverse().map((entry) => (
              <li key={entry.id} data-current={entry.state === 'in_force' ? '' : undefined}>
                <strong className="lx-pricing__night-name">
                  {entry.value} · {entry.kind} · {text.historyState[entry.state]}
                </strong>
                <span className="lx-pricing__night-meta">
                  {text.validity}: {entry.validity}
                </span>
                <span className="lx-pricing__night-meta">
                  {text.authority}: {entry.authority} · {text.basis}: {entry.basis} ·{' '}
                  {text.recordedAt} {entry.recordedAt}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

/**
 * Consulta do PRL (W16; REQ-052; spec pricing §5): o mês no calendário — preço vigente na célula, versão futura no canto,
 * temporada no traço — e, ao lado, a noite em detalhe com o histórico sob demanda e o resumo do mês. Trocar de mês
 * recarrega no servidor (uma leitura administrativa por mês); trocar de noite é imediato.
 */
export function PrlConsult(props: {
  readonly basePath: string;
  readonly months: readonly string[];
  readonly month: string;
  readonly nights: readonly PrlCalendarNight[];
  readonly history: Readonly<Record<string, readonly PrlHistoryEntry[]>>;
  readonly initialNight: string | null;
  readonly focusOnMount: boolean;
}) {
  const router = useRouter();
  const byDate = useMemo(
    () => new Map(props.nights.map((night) => [night.date, night])),
    [props.nights],
  );
  const fallback =
    props.nights.find((night) => night.status !== 'absent')?.date ?? props.nights[0]?.date ?? null;
  const [viewing, setViewing] = useState(
    props.initialNight !== null && byDate.has(props.initialNight) ? props.initialNight : fallback,
  );
  const [focused, setFocused] = useState<string | null>(viewing);
  const [focusRequest, setFocusRequest] = useState(props.focusOnMount ? 1 : 0);
  const href = (month: string, night?: string, focus = false) =>
    `${props.basePath}&mes=${month}${night === undefined ? '' : `&noite=${night}`}${focus ? '&foco=1' : ''}`;
  const previous = adjacentMonth(props.months, props.month, -1);
  const next = adjacentMonth(props.months, props.month, 1);
  const summary = monthSummary(props.nights);
  const seasons = summary.tiers
    .map(([tier, total]) => `${total} ${text.seasons[tier]}`)
    .join(' · ');
  const years = [...new Set(props.months.map((value) => value.slice(0, 4)))];
  const viewed = viewing === null ? undefined : byDate.get(viewing);

  return (
    <div className="lx-pricing">
      <div className="lx-pricing__layout">
        <div className="lx-pricing__calendar">
          <PrlMonthCalendar
            id="prl-consulta"
            month={props.month}
            months={props.months}
            byDate={byDate}
            focused={focused}
            focusRequest={focusRequest}
            day={(date, night) => {
              const isViewing = night !== undefined && date === viewing;
              const parts = nightDescription(date, night);
              if (isViewing) parts.push(text.calendar.viewing);
              return {
                label: parts.join(' — '),
                inert: night === undefined,
                pressed: night === undefined ? undefined : isViewing,
                selected: false,
                viewing: isViewing,
                amount: night?.inForceShort ?? null,
              };
            }}
            onActivate={(date) => {
              setFocused(date);
              if (byDate.has(date)) setViewing(date);
            }}
            onMove={(date) => {
              if (!date.startsWith(props.month)) {
                router.push(href(date.slice(0, 7), date, true));
                return;
              }
              setFocused(date);
              setFocusRequest((value) => value + 1);
            }}
            previous={
              previous === null ? (
                <MonthNavButton label={text.previousMonth} direction={-1} disabled />
              ) : (
                <MonthNavButton label={text.previousMonth} direction={-1} href={href(previous)} />
              )
            }
            next={
              next === null ? (
                <MonthNavButton label={text.nextMonth} direction={1} disabled />
              ) : (
                <MonthNavButton label={text.nextMonth} direction={1} href={href(next)} />
              )
            }
            legend={<PrlLegend mark="viewing" />}
          >
            {years.length > 1 ? (
              <nav className="lx-pricing__bulk" aria-labelledby="prl-consulta-exercicios">
                <p className="lx-pricing__eyebrow" id="prl-consulta-exercicios">
                  {text.calendar.exercises}
                </p>
                <div className="lx-pricing__chips">
                  {years.map((year) => (
                    <a
                      key={year}
                      className="lx-pricing__chip"
                      href={href(props.months.find((value) => value.startsWith(year))!)}
                      aria-current={props.month.startsWith(year) ? 'true' : undefined}
                    >
                      {text.calendar.exercise(year)}
                    </a>
                  ))}
                </div>
              </nav>
            ) : null}
          </PrlMonthCalendar>
        </div>
        <div className="lx-pricing__panel" data-ground="wash">
          {viewing === null || viewed === undefined ? (
            <p className="lx-pricing__text">{text.monthEmpty}</p>
          ) : (
            <NightDetail date={viewing} night={viewed} history={props.history[viewing] ?? []} />
          )}
          <section className="lx-pricing__block" aria-labelledby="prl-resumo-mes">
            <h3 className="lx-pricing__eyebrow" id="prl-resumo-mes">
              {text.monthSummaryLabel(monthName(props.month))}
            </h3>
            <dl className="lx-pricing__facts">
              <Fact label={text.monthSummary.nights} value={text.nightsCount(summary.total)} />
              <Fact label={text.monthSummary.seasons} value={seasons} />
            </dl>
            {/* Situação agora: cada noite em uma linha só, somando o total; versões futuras vão à parte. */}
            <h4 className="lx-pricing__subhead">{text.monthSummary.now}</h4>
            <dl className="lx-pricing__facts">
              <Fact
                label={text.monthSummary.inForce}
                value={text.nightsCount(summary.now.inForce)}
              />
              {summary.now.scheduledOnly === 0 ? null : (
                <Fact
                  label={text.monthSummary.scheduledOnly}
                  value={text.nightsCount(summary.now.scheduledOnly)}
                />
              )}
              <Fact label={text.monthSummary.absent} value={text.nightsCount(summary.now.absent)} />
            </dl>
            <h4 className="lx-pricing__subhead">{text.monthSummary.planned}</h4>
            <p className="lx-pricing__text">{text.monthSummary.plannedNote}</p>
            <dl className="lx-pricing__facts">
              <Fact
                label={text.monthSummary.scheduled}
                value={text.nightsCount(summary.scheduled)}
              />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
