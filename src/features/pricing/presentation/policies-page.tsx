import { randomUUID } from 'node:crypto';
import { Icon, PageHeader } from '@/design-system/react';
import { adminRoleGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, unavailableKeys } from '@/features/platform';
import { POLICY_MECHANISMS, type PolicyMechanism } from '../domain/commercial-policy';
import {
  policyHistory,
  policyInForce,
  scheduledPolicies,
  type PolicyVersionRecord,
} from '../policies';
import { PolicyForm } from './policy-form';
import { policyFormValues } from './policy-input';
import { PolicyAcceptance, PolicyTerms } from './policy-terms';
import { policiesMessages as text } from './i18n/policies-pt-br';

type SearchParams = Record<string, string | string[] | undefined>;

/** Instante em UTC, com o fuso explícito (políticas são globais por mecanismo). */
const utc = (at: Date) =>
  `${at.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })} (UTC)`;

/** Fim efetivo: o término explícito ou o início da versão seguinte (mesma regra de `app.commercial_policy_at`). */
function until(versions: readonly PolicyVersionRecord[], index: number): string {
  const version = versions[index]!;
  const end = version.effectiveTo ?? versions[index + 1]?.effectiveFrom ?? null;
  return end === null ? text.untilOpen : utc(end);
}

function MechanismSection(props: {
  readonly mechanism: PolicyMechanism;
  readonly versions: readonly PolicyVersionRecord[];
  readonly now: Date;
}) {
  const { mechanism, versions, now } = props;
  const copy = text.mechanisms[mechanism];
  const inForce = policyInForce(versions, now);
  const scheduled = scheduledPolicies(versions, now);
  const status =
    inForce !== null ? text.inForce : scheduled.length > 0 ? text.scheduledOnly : text.absentTitle;
  const facts: [string, string][] = [
    ...(inForce === null
      ? []
      : ([
          [text.since, utc(inForce.effectiveFrom)],
          [text.until, until(versions, versions.indexOf(inForce))],
        ] as [string, string][])),
    ...scheduled.map(
      (version) =>
        [
          text.scheduled,
          `${text.version(version.id)} · ${text.scheduledEntry(utc(version.effectiveFrom))}`,
        ] as [string, string],
    ),
  ];
  const latest = versions.at(-1);
  return (
    <section className="lx-parameter" aria-labelledby={`${mechanism}-titulo`} id={mechanism}>
      <div className="lx-parameter__head">
        <h2 className="lx-pricing__title" id={`${mechanism}-titulo`}>
          {copy.name}
        </h2>
        <p className="lx-pricing__text">{copy.about}</p>
        <p className="lx-parameter__ref">{text.reference}</p>
      </div>
      <div className="lx-parameter__status" data-ground="wash">
        <p className="lx-pricing__eyebrow">{status}</p>
        {inForce === null ? (
          <p className="lx-pricing__text">{text.absentEffect}</p>
        ) : (
          <p className="lx-parameter__value">{text.version(inForce.id)}</p>
        )}
      </div>
      {facts.length === 0 ? null : (
        <dl className="lx-pricing__facts">
          {facts.map(([label, value]) => (
            <div className="lx-pricing__fact" key={`${label}-${value}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {inForce === null ? null : (
        <>
          <PolicyTerms mechanism={mechanism} config={inForce.config} />
          <PolicyAcceptance policyId={inForce.id} since={utc(inForce.effectiveFrom)} preview />
        </>
      )}
      <div className="lx-parameter__actions">
        {versions.length === 0 ? null : (
          <details key={`historico-${versions.length}`}>
            <summary className="lx-link">{`${text.history} · ${text.showHistory(versions.length)}`}</summary>
            <ol className="lx-pricing__history">
              {versions
                .map((version, index) => ({ version, index }))
                .reverse()
                .map(({ version, index }) => (
                  <li key={version.id} data-current={version.id === inForce?.id ? '' : undefined}>
                    <strong className="lx-pricing__night-name">{text.version(version.id)}</strong>
                    <span className="lx-pricing__night-meta">
                      {text.since}: {utc(version.effectiveFrom)} · {text.until}:{' '}
                      {until(versions, index)}
                    </span>
                    <span className="lx-pricing__night-meta">
                      {text.authority}:{' '}
                      {version.authority === 'admin' ? text.authorityAdmin : version.authority} ·{' '}
                      {text.basis}: {version.authorizationRef} · {text.recordedAt}:{' '}
                      {utc(version.createdAt)}
                    </span>
                  </li>
                ))}
            </ol>
          </details>
        )}
        {/* Uma versão nova remonta o formulário fechado; parte da versão mais recente, quando houver. */}
        <details key={`publicar-${versions.length}`}>
          <summary className="lx-link">{text.publish}</summary>
          <PolicyForm
            mechanism={mechanism}
            idempotencyKey={randomUUID()}
            initialValues={
              latest === undefined ? undefined : policyFormValues(mechanism, latest.config)
            }
          />
        </details>
      </div>
    </section>
  );
}

/**
 * `/admin/politicas` (W18; TECH-032, PD-009, REQ-095, REQ-104; spec pricing §5 "Políticas comerciais"): por mecanismo,
 * ausente, vigente ou agendada; a política vigente como o Titular a verá; histórico imutável; publicação pelo Admin.
 * Nenhuma política é presumida (TECH-001).
 */
export async function AdminPoliciesPage(props: { readonly searchParams: SearchParams }) {
  const gate = await adminRoleGate('admin');
  if (gate.kind === 'blocked') return gate.page;
  const now = new Date();
  let histories: ReadonlyMap<PolicyMechanism, readonly PolicyVersionRecord[]>;
  try {
    const db = getDatabase();
    histories = new Map(
      await Promise.all(
        POLICY_MECHANISMS.map(async (m) => [m, await policyHistory(db, m)] as const),
      ),
    );
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  const done =
    typeof props.searchParams.feito === 'string' &&
    (POLICY_MECHANISMS as readonly string[]).includes(props.searchParams.feito)
      ? text.mechanisms[props.searchParams.feito as PolicyMechanism].name
      : null;
  return (
    <AdminShell roles={gate.session.roles} current="policies">
      <div className="lx-container">
        <PageHeader title={text.title} lead={text.lead} />
        {done === null ? null : (
          <div className="lx-page-section">
            <div className="lx-message lx-message--success" role="status">
              <Icon name="check" className="lx-message__icon" />
              <p className="lx-message__title">{`${text.doneTitle}: ${done}`}</p>
              <p className="lx-message__body">{text.doneBody}</p>
            </div>
          </div>
        )}
        <div className="lx-page-section lx-parameters">
          <div className="lx-parameters__grid">
            {POLICY_MECHANISMS.map((mechanism) => (
              <MechanismSection
                key={mechanism}
                mechanism={mechanism}
                versions={histories.get(mechanism) ?? []}
                now={now}
              />
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
