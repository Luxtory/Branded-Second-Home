import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, PageHeader, RecordList, type RecordListItem } from '@/design-system/react';
import { adminGate, adminRoleGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, recordAdminRead, unavailableKeys } from '@/features/platform';
import { nightStatus, prlHistory, sealedNightsBetween, type PrlVersion } from '../prl';
import { formatInstant, formatMoney, formatMonth, formatNight } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import { PrlForm } from './prl-form';
import { prlListPath, prlPath } from './prl-paths';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
type SearchParams = Record<string, string | string[] | undefined>;

const shiftMonth = (month: string, delta: number) => {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
};

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
  night: string,
  versions: readonly PrlVersion[],
  now: Date,
  timezone: string,
): RecordListItem {
  const status = nightStatus(versions, now);
  const attributes: { label: string; value: ReactNode }[] = [
    {
      label: text.status,
      value:
        status.inForce !== null
          ? text.statusInForce
          : status.scheduled.length > 0
            ? text.statusScheduledOnly
            : text.statusAbsent,
    },
  ];
  if (status.inForce !== null) {
    attributes.push(
      { label: text.inForceValue, value: formatMoney(status.inForce.amountMinor) },
      { label: text.inForceSince, value: formatInstant(status.inForce.effectiveFrom, timezone) },
    );
  }
  if (status.scheduled.length > 0) {
    attributes.push({
      label: text.scheduledLabel,
      value: status.scheduled
        .map((version) =>
          text.scheduled(
            formatMoney(version.amountMinor),
            formatInstant(version.effectiveFrom, timezone),
          ),
        )
        .join(' · '),
    });
  }
  if (versions.length > 0)
    attributes.push({
      label: text.history,
      value: <History versions={versions} timezone={timezone} />,
    });
  return { id: night, title: formatNight(night), attributes };
}

/**
 * `/admin/prl/[id]` (W16; REQ-013, REQ-052; spec pricing §5): PRL de cada noite selada do mês — ausente, vigente ou
 * agendado —, histórico imutável, publicação inicial (Admin ou Super Admin) e alteração (só Super Admin, BR-181).
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
  const now = new Date();
  const requested = typeof props.searchParams.mes === 'string' ? props.searchParams.mes : '';
  let read: {
    label: string;
    timezone: string;
    month: string | null;
    first: string | null;
    last: string | null;
    nights: readonly string[];
    versions: readonly PrlVersion[];
  } | null;
  try {
    const db = getDatabase();
    const home = await db
      .selectFrom('app.second_home')
      .select(['label', 'timezone'])
      .where('id', '=', props.secondHomeId)
      .executeTakeFirst();
    if (home === undefined) {
      read = null;
    } else {
      const range = await db
        .selectFrom('app.second_home_date')
        .select((eb) => [
          eb.fn.min<string | null>(eb.cast('stay_date', 'text')).as('first'),
          eb.fn.max<string | null>(eb.cast('stay_date', 'text')).as('last'),
        ])
        .where('second_home_id', '=', props.secondHomeId)
        .executeTakeFirstOrThrow();
      const first = range.first?.slice(0, 7) ?? null;
      const last = range.last?.slice(0, 7) ?? null;
      const current = now.toISOString().slice(0, 7);
      const month =
        first === null || last === null
          ? null
          : MONTH.test(requested) && requested >= first && requested <= last
            ? requested
            : current < first
              ? first
              : current > last
                ? last
                : current;
      const from = month === null ? null : `${month}-01`;
      const to = month === null ? null : `${shiftMonth(month, 1)}-01`;
      read = {
        ...home,
        month,
        first,
        last,
        nights:
          from === null || to === null
            ? []
            : await sealedNightsBetween(db, props.secondHomeId, from, to),
        versions:
          from === null || to === null ? [] : await prlHistory(db, props.secondHomeId, from, to),
      };
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
    }
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  if (read === null) notFound();
  const byNight = new Map<string, PrlVersion[]>();
  for (const version of read.versions)
    byNight.set(version.stayDate, [...(byNight.get(version.stayDate) ?? []), version]);
  const done =
    typeof props.searchParams.feito === 'string'
      ? text.doneTitle[props.searchParams.feito]
      : undefined;
  const monthLabel = read.month === null ? '' : formatMonth(read.month);
  const previous =
    read.month !== null && read.first !== null && read.month > read.first
      ? shiftMonth(read.month, -1)
      : null;
  const following =
    read.month !== null && read.last !== null && read.month < read.last
      ? shiftMonth(read.month, 1)
      : null;
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
        <Section
          id="noites"
          title={read.month === null ? text.sealedNone : text.monthTitle(monthLabel)}
        >
          {read.month === null ? null : (
            <>
              <nav aria-label={text.monthNav} className="lx-form__actions">
                {previous === null ? null : (
                  <a
                    className="lx-button lx-button--quiet"
                    href={`${prlPath(props.secondHomeId)}?mes=${previous}`}
                  >
                    {text.previousMonth}
                  </a>
                )}
                {following === null ? null : (
                  <a
                    className="lx-button lx-button--quiet"
                    href={`${prlPath(props.secondHomeId)}?mes=${following}`}
                  >
                    {text.nextMonth}
                  </a>
                )}
              </nav>
              {read.nights.length === 0 ? (
                <p className="lx-body">{text.monthEmpty}</p>
              ) : (
                <RecordList
                  label={text.nightsLabel(monthLabel)}
                  items={read.nights.map((night) =>
                    nightItem(night, byNight.get(night) ?? [], now, read.timezone),
                  )}
                />
              )}
            </>
          )}
        </Section>
        <Section id="publicar-inicial" title={text.initialTitle}>
          <p className="lx-body">{text.initialIntro}</p>
          <PrlForm kind="initial" secondHomeId={props.secondHomeId} idempotencyKey={randomUUID()} />
        </Section>
        <Section id="alterar" title={text.changeTitle}>
          {roles.includes('super_admin') ? (
            <>
              <p className="lx-body">{text.changeIntro}</p>
              <PrlForm
                kind="change"
                secondHomeId={props.secondHomeId}
                idempotencyKey={randomUUID()}
              />
            </>
          ) : (
            <div className="lx-message lx-message--info">
              <Icon name="alert" className="lx-message__icon" />
              <p className="lx-message__title">{text.changeRestricted}</p>
            </div>
          )}
        </Section>
      </div>
    </AdminShell>
  );
}
