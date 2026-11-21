import { randomUUID } from 'node:crypto';
import { Icon, PageHeader } from '@/design-system/react';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, unavailableKeys } from '@/features/platform';
import { ECONOMIC_PARAMETER_KEYS, type EconomicParameterKey } from '../domain/parameter';
import { parameterHistory, versionInForce, type ParameterVersionRecord } from '../parameters';
import { adminRoleGate } from './admin-gate';
import { AdminShell } from './admin-shell';
import { displayValue } from './economic-parameter-input';
import { EconomicParameterForm } from './economic-parameter-form';
import { economicParametersMessages as text } from './i18n/economic-parameters-pt-br';

type SearchParams = Record<string, string | string[] | undefined>;

/** Instante em UTC, com o fuso explícito (parâmetros globais não têm fuso de Second Home). */
const utc = (at: Date) =>
  `${at.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' })} (UTC)`;

function ParameterSection({
  parameter,
  versions,
  now,
}: {
  readonly parameter: EconomicParameterKey;
  readonly versions: readonly ParameterVersionRecord[];
  readonly now: Date;
}) {
  const copy = text.keys[parameter];
  const show = (value: string) => displayValue(parameter, value, text);
  const inForce = versionInForce(versions, now);
  const scheduled = versions.filter((version) => version.effectiveFrom.getTime() > now.getTime());
  const status =
    inForce !== null ? text.inForce : scheduled.length > 0 ? text.scheduledOnly : text.absentTitle;
  const facts: [string, string][] = [
    ...(inForce === null
      ? []
      : ([
          [text.since, utc(inForce.effectiveFrom)],
          [
            text.until,
            inForce.effectiveUntil === null ? text.untilOpen : utc(inForce.effectiveUntil),
          ],
        ] as [string, string][])),
    ...scheduled.map(
      (version) =>
        [text.scheduled, text.scheduledEntry(show(version.value), utc(version.effectiveFrom))] as [
          string,
          string,
        ],
    ),
  ];
  return (
    <section className="lx-parameter" aria-labelledby={`${parameter}-titulo`} id={parameter}>
      <div className="lx-parameter__head">
        <h2 className="lx-pricing__title" id={`${parameter}-titulo`}>
          {copy.name}
        </h2>
        <p className="lx-pricing__text">
          {copy.unit}. {copy.about}
        </p>
        <p className="lx-parameter__ref">{text.reference(copy.ref)}</p>
      </div>
      <div className="lx-parameter__status" data-ground="wash">
        <p className="lx-pricing__eyebrow">{status}</p>
        {inForce === null ? (
          <p className="lx-pricing__text">{text.absentEffect}</p>
        ) : (
          <p className="lx-parameter__value">{show(inForce.value)}</p>
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
      <div className="lx-parameter__actions">
        {versions.length === 0 ? null : (
          <details key={`historico-${versions.length}`}>
            <summary className="lx-link">{`${text.history} · ${text.showHistory(versions.length)}`}</summary>
            <ol className="lx-pricing__history">
              {[...versions].reverse().map((version) => (
                <li key={version.id} data-current={version.id === inForce?.id ? '' : undefined}>
                  <strong className="lx-pricing__night-name">{show(version.value)}</strong>
                  <span className="lx-pricing__night-meta">
                    {text.since}: {utc(version.effectiveFrom)} · {text.until}:{' '}
                    {version.effectiveUntil === null ? text.untilOpen : utc(version.effectiveUntil)}
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
        {/* Uma versão nova remonta o formulário fechado e limpo: o retorno fica na mensagem do topo. */}
        <details key={`publicar-${versions.length}`}>
          <summary className="lx-link">{text.publish}</summary>
          <EconomicParameterForm parameter={parameter} idempotencyKey={randomUUID()} />
        </details>
      </div>
    </section>
  );
}

/**
 * `/admin/parametros` (W16; REQ-095; TECH-030; spec admin §14): as seis chaves econômicas globais — ausente, vigente ou
 * agendada —, histórico imutável e publicação de nova versão pelo Admin. Nenhum valor é presumido (TECH-001).
 */
export async function AdminEconomicParametersPage(props: { readonly searchParams: SearchParams }) {
  const gate = await adminRoleGate('admin');
  if (gate.kind === 'blocked') return gate.page;
  const now = new Date();
  let histories: ReadonlyMap<EconomicParameterKey, readonly ParameterVersionRecord[]>;
  try {
    const db = getDatabase();
    histories = new Map(
      await Promise.all(
        ECONOMIC_PARAMETER_KEYS.map(
          async (key) => [key, await parameterHistory(db, key, null)] as const,
        ),
      ),
    );
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  const done =
    typeof props.searchParams.feito === 'string' &&
    (ECONOMIC_PARAMETER_KEYS as readonly string[]).includes(props.searchParams.feito)
      ? text.keys[props.searchParams.feito as EconomicParameterKey].name
      : null;
  return (
    <AdminShell roles={gate.session.roles} current="parameters">
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
            {ECONOMIC_PARAMETER_KEYS.map((parameter) => (
              <ParameterSection
                key={parameter}
                parameter={parameter}
                versions={histories.get(parameter) ?? []}
                now={now}
              />
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
