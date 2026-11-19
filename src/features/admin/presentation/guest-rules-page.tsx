import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, PageHeader, RecordList } from '@/design-system/react';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, unavailableKeys } from '@/features/platform';
import { parameterHistory, versionInForce, type ParameterVersionRecord } from '../parameters';
import { adminRoleGate } from './admin-gate';
import { AdminShell } from './admin-shell';
import { GuestRulesForm } from './guest-rules-form';
import { guestRulesMessages as text } from './i18n/guest-rules-pt-br';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchParams = Record<string, string | string[] | undefined>;
const homePath = (id: string) => `/admin/catalogo/second-homes/${id}`;
const instantOf = (at: Date, timeZone: string) =>
  at.toLocaleString('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' });

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

/** Texto em parágrafos, sempre como texto (nunca HTML). */
function RulesText({ value }: { readonly value: string }) {
  return (
    <>
      {value
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '')
        .map((paragraph, index) => (
          <p className="lx-body" key={index}>
            {paragraph.split('\n').map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        ))}
    </>
  );
}

function History({
  versions,
  timezone,
}: {
  readonly versions: readonly ParameterVersionRecord[];
  readonly timezone: string;
}) {
  if (versions.length === 0) return <p className="lx-body">{text.historyNone}</p>;
  return (
    <RecordList
      label={text.historyTitle}
      items={[...versions].reverse().map((version) => ({
        id: version.id,
        title: text.version(instantOf(version.effectiveFrom, timezone)),
        attributes: [
          {
            label: text.until,
            value:
              version.effectiveUntil === null
                ? text.untilOpen
                : instantOf(version.effectiveUntil, timezone),
          },
          {
            label: text.authority,
            value: version.authority === 'admin' ? text.authorityAdmin : version.authority,
          },
          { label: text.basis, value: version.authorizationRef },
          { label: text.publishedAt, value: instantOf(version.createdAt, timezone) },
          {
            label: text.text,
            value: (
              <details>
                <summary className="lx-link">{text.showText}</summary>
                <RulesText value={version.value} />
              </details>
            ),
          },
        ],
      }))}
    />
  );
}

/**
 * `/admin/catalogo/second-homes/[id]/regras-de-convidados` (W14; REQ-095; TECH-030; spec admin §13): versão em vigor,
 * histórico imutável com autoridade, base e vigência, e a publicação de nova versão.
 */
export async function AdminGuestRulesPage(props: {
  readonly secondHomeId: string;
  readonly searchParams: SearchParams;
}) {
  const gate = await adminRoleGate('admin');
  if (gate.kind === 'blocked') return gate.page;
  if (!UUID.test(props.secondHomeId)) notFound();
  const now = new Date();
  let read: { label: string; timezone: string; versions: readonly ParameterVersionRecord[] } | null;
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
        : { ...home, versions: await parameterHistory(db, 'guest_rules', props.secondHomeId) };
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  if (read === null) notFound();
  const inForce = versionInForce(read.versions, now);
  return (
    <AdminShell roles={gate.session.roles} current="catalog">
      <div className="lx-container">
        <PageHeader
          title={text.title}
          lead={text.lead(read.label)}
          context={{ href: homePath(props.secondHomeId), label: text.back }}
        />
        {props.searchParams.feito === '1' ? (
          <div className="lx-page-section">
            <div className="lx-message lx-message--success" role="status">
              <Icon name="check" className="lx-message__icon" />
              <p className="lx-message__title">{text.doneTitle}</p>
              <p className="lx-message__body">{text.doneBody}</p>
            </div>
          </div>
        ) : null}
        <Section id="em-vigor" title={text.inForceTitle}>
          {inForce === null ? (
            <div className="lx-message lx-message--info">
              <Icon name="alert" className="lx-message__icon" />
              <p className="lx-message__title">{text.noneTitle}</p>
              <p className="lx-message__body">{text.noneBody}</p>
            </div>
          ) : (
            <>
              <p className="lx-body">
                {text.version(instantOf(inForce.effectiveFrom, read.timezone))}
              </p>
              <RulesText value={inForce.value} />
            </>
          )}
        </Section>
        <Section id="historico" title={text.historyTitle}>
          <History versions={read.versions} timezone={read.timezone} />
        </Section>
        <Section id="publicar" title={text.formTitle}>
          <p className="lx-body">{text.formIntro}</p>
          <GuestRulesForm
            secondHomeId={props.secondHomeId}
            idempotencyKey={randomUUID()}
            backHref={homePath(props.secondHomeId)}
          />
        </Section>
      </div>
    </AdminShell>
  );
}
