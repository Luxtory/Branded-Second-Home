import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { Icon, PageHeader } from '@/design-system/react';
import { adminGate, adminRoleGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, recordAdminRead, unavailableKeys } from '@/features/platform';
import type { PrlVersion } from '../prl';
import { formatInstant, formatMoney } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import { loadPrlCalendar, type PrlCalendarModel } from './prl-calendar-data';
import { PrlConsult, type PrlHistoryEntry } from './prl-consult';
import { initialMonth, monthIn } from './prl-months';
import { prlListPath, prlPath } from './prl-paths';
import { PrlPricing } from './prl-pricing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const MODES = ['consultar', 'inicial', 'alteracao'] as const;
type Mode = (typeof MODES)[number];
type SearchParams = Record<string, string | string[] | undefined>;

const param = (params: SearchParams, key: string) =>
  typeof params[key] === 'string' ? (params[key] as string) : '';

/** Histórico imutável de uma noite para leitura: valor, tipo, situação no instante, vigência, autoridade, base, registro. */
function historyEntries(
  versions: readonly PrlVersion[],
  now: Date,
  timezone: string,
): PrlHistoryEntry[] {
  return versions.map((version) => {
    const from = formatInstant(version.effectiveFrom, timezone);
    const state =
      version.effectiveFrom.getTime() > now.getTime()
        ? 'future'
        : version.effectiveTo !== null && version.effectiveTo.getTime() <= now.getTime()
          ? 'past'
          : 'in_force';
    return {
      id: version.id,
      value: formatMoney(version.amountMinor),
      kind: text.kind[version.kind] ?? version.kind,
      state,
      validity:
        version.effectiveTo !== null
          ? text.validityClosed(from, formatInstant(version.effectiveTo, timezone))
          : state === 'future'
            ? text.validityFuture(from)
            : text.validityOpen(from),
      authority: text.authorities[version.authority] ?? version.authority,
      basis: version.authorizationRef,
      recordedAt: formatInstant(version.createdAt, timezone),
    };
  });
}

/**
 * `/admin/prl/[id]` (W16; REQ-013, REQ-052; spec pricing §5): o calendário de preços da Second Home em três modos —
 * consultar (preço vigente, versões futuras e histórico por noite), definir preços iniciais (Admin ou Super Admin) e
 * alterar preços (só Super Admin, BR-181). A temporada canônica só informa; a revisão e a confirmação são do servidor.
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
  const requestedMode = param(props.searchParams, 'modo');
  const mode: Mode =
    (MODES as readonly string[]).includes(requestedMode) &&
    (requestedMode !== 'alteracao' || superAdmin)
      ? (requestedMode as Mode)
      : 'consultar';
  const requestedMonth = param(props.searchParams, 'mes');
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
  // Mês de referência no fuso IANA da Second Home (TECH-040), nunca UTC; só meses do calendário.
  const current = monthIn(now, timezone);
  const month = initialMonth(
    model.months,
    MONTH.test(requestedMonth) ? requestedMonth : '',
    current,
  );
  const done = text.doneTitle[param(props.searchParams, 'feito')];
  const tabs: { mode: Mode; label: string }[] = [
    { mode: 'consultar', label: text.modes.consult },
    { mode: 'inicial', label: text.modes.initial },
    ...(superAdmin ? [{ mode: 'alteracao' as const, label: text.modes.change }] : []),
  ];
  const modeLink = (target: Mode) =>
    `${prlPath(props.secondHomeId)}?modo=${target}&mes=${month ?? current}`;
  const title =
    mode === 'consultar'
      ? text.modes.consult
      : mode === 'inicial'
        ? text.modes.initial
        : text.modes.change;
  const nightsOfMonth =
    month === null ? [] : model.nights.filter((night) => night.date.startsWith(month));
  const requestedNight = param(props.searchParams, 'noite');
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
                  tab.mode === mode
                    ? 'lx-button lx-button--primary'
                    : 'lx-button lx-button--secondary'
                }
                href={modeLink(tab.mode)}
                aria-current={tab.mode === mode ? 'page' : undefined}
              >
                {tab.label}
              </a>
            ))}
          </div>
          {superAdmin ? null : <p className="lx-hint">{text.changeRestricted}</p>}
        </nav>
        <section className="lx-page-section" aria-labelledby="prl-modo">
          <h2 className="lx-visually-hidden" id="prl-modo">
            {title}
          </h2>
          {month === null ? (
            <p className="lx-body">{text.noCalendar}</p>
          ) : mode === 'consultar' ? (
            // Um mês por instância: a troca de mês (link ou teclado) remonta a consulta, e a noite em detalhe e o foco
            // vêm da URL do mês novo, nunca do estado do mês anterior.
            <PrlConsult
              key={month}
              basePath={`${prlPath(props.secondHomeId)}?modo=consultar`}
              months={model.months}
              month={month}
              nights={nightsOfMonth}
              history={Object.fromEntries(
                nightsOfMonth.map((night) => [
                  night.date,
                  historyEntries(model.versions.get(night.date) ?? [], now, timezone),
                ]),
              )}
              initialNight={NIGHT.test(requestedNight) ? requestedNight : null}
              focusOnMount={param(props.searchParams, 'foco') === '1'}
            />
          ) : (
            <>
              <p className="lx-body">{mode === 'inicial' ? text.initialIntro : text.changeIntro}</p>
              <PrlPricing
                kind={mode === 'inicial' ? 'initial' : 'change'}
                secondHomeId={props.secondHomeId}
                idempotencyKey={randomUUID()}
                months={model.months}
                initialMonth={month}
                nights={model.nights}
              />
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
