import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, PageHeader, RecordList, type RecordListItem } from '@/design-system/react';
import { adminGate, adminRoleGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, recordAdminRead, unavailableKeys } from '@/features/platform';
import type { PrlVersion } from '../prl';
import { formatInstant, formatMoney, formatMonth, formatNight } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import { loadPrlCalendar, type PrlCalendarModel, type PrlCalendarNight } from './prl-calendar-data';
import { PrlMonthCalendar } from './prl-month-calendar';
import { adjacentMonth, initialMonth, monthIn } from './prl-months';
import { prlListPath, prlPath } from './prl-paths';
import { PrlPricing } from './prl-pricing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MODES = ['consultar', 'inicial', 'alteracao'] as const;
type Mode = (typeof MODES)[number];
type SearchParams = Record<string, string | string[] | undefined>;

function Section(props: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby={props.id}>
      <h2 className="lx-display-s" id={props.id}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function History({
  versions,
  timezone,
}: {
  readonly versions: readonly PrlVersion[];
  readonly timezone: string;
}) {
  return (
    <details>
      <summary className="lx-link">{text.showHistory(versions.length)}</summary>
      <ol>
        {[...versions].reverse().map((version) => (
          <li className="lx-body" key={version.id}>
            <strong>
              {text.versionTitle(
                formatMoney(version.amountMinor),
                text.kind[version.kind] ?? version.kind,
              )}
            </strong>
            <br />
            {text.validity}:{' '}
            {version.effectiveTo === null
              ? text.validityOpen(formatInstant(version.effectiveFrom, timezone))
              : text.validityClosed(
                  formatInstant(version.effectiveFrom, timezone),
                  formatInstant(version.effectiveTo, timezone),
                )}
            <br />
            {text.authority}: {text.authorities[version.authority] ?? version.authority} ·{' '}
            {text.basis}: {version.authorizationRef} · {text.recordedAt}:{' '}
            {formatInstant(version.createdAt, timezone)}
          </li>
        ))}
      </ol>
    </details>
  );
}

function nightItem(
  night: PrlCalendarNight,
  versions: readonly PrlVersion[],
  timezone: string,
): RecordListItem {
  const attributes: { label: string; value: ReactNode }[] = [
    { label: text.season, value: text.seasons[night.season] },
    {
      label: text.status,
      value:
        night.status === 'in_force'
          ? text.statusInForce
          : night.status === 'scheduled_only'
            ? text.statusScheduledOnly
            : text.statusAbsent,
    },
  ];
  if (night.inForce !== null) attributes.push({ label: text.inForceValue, value: night.inForce });
  if (night.scheduled !== null)
    attributes.push({ label: text.scheduledLabel, value: night.scheduled });
  if (versions.length > 0)
    attributes.push({
      label: text.history,
      value: <History versions={versions} timezone={timezone} />,
    });
  return {
    id: night.date,
    title: <span id={`noite-${night.date}`}>{formatNight(night.date)}</span>,
    attributes,
  };
}

function monthLink(id: string, mode: Mode, month: string) {
  return `${prlPath(id)}?modo=${mode}&mes=${month}`;
}

/**
 * `/admin/prl/[id]` (W16; REQ-013, REQ-052; spec pricing §5): consulta (calendário do mês + detalhe por noite com
 * histórico imutável) separada da publicação (calendário de seleção em lote, com revisão no servidor). Publicação
 * inicial: Admin ou Super Admin; alteração do publicado: só Super Admin (BR-181). Categoria canônica só organiza.
 */
export async function AdminPrlDetailPage(props: {
  readonly secondHomeId: string;
  readonly searchParams: SearchParams;
}) {
  const access = await adminGate();
  if (access.kind === 'blocked') return access.page;
  if (!UUID.test(props.secondHomeId)) notFound();
  const roles = access.session.roles;
  const gate = await adminRoleGate(roles.includes('admin') ? 'admin' : 'super_admin');
  if (gate.kind === 'blocked') return gate.page;
  const superAdmin = roles.includes('super_admin');
  const requestedMode = typeof props.searchParams.modo === 'string' ? props.searchParams.modo : '';
  const mode: Mode =
    (MODES as readonly string[]).includes(requestedMode) &&
    (requestedMode !== 'alteracao' || superAdmin)
      ? (requestedMode as Mode)
      : 'consultar';
  const requestedMonth = typeof props.searchParams.mes === 'string' ? props.searchParams.mes : '';
  const now = new Date();
  let read: { label: string; timezone: string; model: PrlCalendarModel } | null;
  try {
    const db = getDatabase();
    const home = await db
      .selectFrom('app.second_home')
      .select(['label', 'timezone'])
      .where('id', '=', props.secondHomeId)
      .executeTakeFirst();
    read =
      home === undefined
        ? null
        : { ...home, model: await loadPrlCalendar(db, props.secondHomeId, now, home.timezone) };
    if (read !== null)
      // Leitura administrativa é evento próprio do audit_log (TECH-092).
      await recordAdminRead(db, {
        actor: {
          kind: 'user',
          userId: gate.session.userId,
          actingPartyId: null,
          role: gate.session.role,
        },
        objectType: 'prl_history',
        objectId: props.secondHomeId,
        authorizationRef: gate.session.authorizationRef,
        at: now,
      });
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  if (read === null) notFound();
  const { model, timezone } = read;
  // Mês de referência no fuso IANA da Second Home (TECH-040), nunca UTC; só meses selados.
  const current = monthIn(now, timezone);
  const month = initialMonth(
    model.months,
    MONTH.test(requestedMonth) ? requestedMonth : '',
    current,
  );
  const previousMonth = month === null ? null : adjacentMonth(model.months, month, -1);
  const nextMonth = month === null ? null : adjacentMonth(model.months, month, 1);
  const done =
    typeof props.searchParams.feito === 'string'
      ? text.doneTitle[props.searchParams.feito]
      : undefined;
  const nightsOfMonth =
    month === null ? [] : model.nights.filter((night) => night.date.startsWith(month));
  const byDate = new Map(nightsOfMonth.map((night) => [night.date, night]));
  const tabs: { mode: Mode; label: string }[] = [
    { mode: 'consultar', label: text.modes.consult },
    { mode: 'inicial', label: text.modes.initial },
    ...(superAdmin ? [{ mode: 'alteracao' as const, label: text.modes.change }] : []),
  ];
  const navLink = (target: string, label: string, direction: -1 | 1) => (
    <a
      className="lx-calendar__nav-button"
      href={monthLink(props.secondHomeId, 'consultar', target)}
      aria-label={label}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path
          d={direction < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
        />
      </svg>
    </a>
  );
  const years = [...new Set(model.months.map((value) => value.slice(0, 4)))];
  return (
    <AdminShell roles={roles} current="prl">
      <div className="lx-container">
        <PageHeader
          title={text.detailTitle(read.label)}
          lead={text.detailLead}
          context={{ href: prlListPath, label: text.back }}
        />
        {done === undefined ? null : (
          <div className="lx-page-section">
            <div className="lx-message lx-message--success" role="status">
              <Icon name="check" className="lx-message__icon" />
              <p className="lx-message__title">{done}</p>
              <p className="lx-message__body">{text.doneBody}</p>
            </div>
          </div>
        )}
        <nav className="lx-page-section" aria-label={text.modes.label}>
          <div className="lx-form__actions">
            {tabs.map((tab) => (
              <a
                key={tab.mode}
                className={
                  tab.mode === mode ? 'lx-button lx-button--primary' : 'lx-button lx-button--quiet'
                }
                href={monthLink(props.secondHomeId, tab.mode, month ?? current)}
                aria-current={tab.mode === mode ? 'page' : undefined}
              >
                {tab.label}
              </a>
            ))}
          </div>
          {superAdmin ? null : <p className="lx-body">{text.changeRestricted}</p>}
        </nav>
        {month === null ? (
          <Section id="noites" title={text.sealedNone}>
            <p className="lx-body">{text.monthEmpty}</p>
          </Section>
        ) : mode === 'consultar' ? (
          <Section id="noites" title={text.monthTitle(formatMonth(month))}>
            <PrlMonthCalendar
              month={month}
              nights={byDate}
              previous={
                previousMonth === null ? null : navLink(previousMonth, text.previousMonth, -1)
              }
              next={nextMonth === null ? null : navLink(nextMonth, text.nextMonth, 1)}
            />
            {years.length > 1 ? (
              <div className="lx-form__actions" role="group" aria-label={text.calendar.exercises}>
                {years.map((year) => (
                  <a
                    key={year}
                    className="lx-button lx-button--quiet"
                    href={monthLink(
                      props.secondHomeId,
                      'consultar',
                      model.months.find((value) => value.startsWith(year))!,
                    )}
                    aria-current={month.startsWith(year) ? 'true' : undefined}
                  >
                    {text.calendar.exercise(year)}
                  </a>
                ))}
              </div>
            ) : null}
            {nightsOfMonth.length === 0 ? (
              <p className="lx-body">{text.monthEmpty}</p>
            ) : (
              <RecordList
                label={text.nightsLabel(formatMonth(month))}
                items={nightsOfMonth.map((night) =>
                  nightItem(night, model.versions.get(night.date) ?? [], timezone),
                )}
              />
            )}
          </Section>
        ) : (
          <Section
            id={mode === 'inicial' ? 'publicar-inicial' : 'alterar'}
            title={mode === 'inicial' ? text.initialTitle : text.changeTitle}
          >
            <p className="lx-body">{mode === 'inicial' ? text.initialIntro : text.changeIntro}</p>
            <PrlPricing
              kind={mode === 'inicial' ? 'initial' : 'change'}
              secondHomeId={props.secondHomeId}
              idempotencyKey={randomUUID()}
              months={model.months}
              initialMonth={month}
              nights={model.nights}
            />
          </Section>
        )}
      </div>
    </AdminShell>
  );
}
