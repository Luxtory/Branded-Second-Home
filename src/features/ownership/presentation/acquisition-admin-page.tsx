import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { PageHeader, RecordList } from '@/design-system/react';
import { AdminShell, adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import { readPartyDirectory, readPartySummary } from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import { readAcquisitionAdmin, type AcquisitionAdminView } from './acquisition-admin-read';
import { AcquisitionForms, AcquisitionSuccess } from './acquisition-forms';
import type { MaskedPartyOption } from './acquisition-form-state';
import { assertAcquisitionWritesAvailable } from './acquisition-gate';
import { AcquisitionFacts, AcquisitionNotice, AcquisitionSection } from './acquisition-ui';
import { InitialDrawAdminSection } from './initial-draw-admin-section';
import { acquisitionMessages as text } from './i18n/acquisition-pt-br';
const path = (id: string) => `/admin/catalogo/second-homes/${id}`;
const partyPath = (id: string) => `/admin/pessoas-e-empresas/${id}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function Shell({
  session,
  children,
}: {
  readonly session: ExercisedAdminSession;
  readonly children: ReactNode;
}) {
  return (
    <AdminShell roles={session.roles} current="catalog">
      <div className="lx-container">{children}</div>
    </AdminShell>
  );
}
function available(): boolean {
  try {
    assertAcquisitionWritesAvailable();
    return true;
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return false;
  }
}
const partyLink = (id: string, parties: readonly MaskedPartyOption[]) => (
  <a className="lx-link" href={partyPath(id)}>
    {parties.find((party) => party.id === id)?.maskedDocument ?? id}
  </a>
);

function RecordedFacts({
  view,
  parties,
}: {
  readonly view: AcquisitionAdminView;
  readonly parties: readonly MaskedPartyOption[];
}) {
  const fact = view.acquisition;
  return (
    <>
      {fact === null ? null : (
        <AcquisitionSection id="acquisition-facts" title={text.formalized}>
          <AcquisitionFacts
            items={[
              { label: text.location, value: fact.location },
              {
                label: text.modality,
                value: fact.modality === 'owner' ? text.owner : text.coOwner,
              },
              { label: text.startDate, value: fact.date },
              { label: text.basis, value: fact.basis_ref },
              ...(fact.configuration_id === null
                ? []
                : [
                    {
                      label: text.configuration,
                      value: text.configurationName(fact.configuration_id),
                    },
                  ]),
              ...(view.spe === null
                ? []
                : [{ label: text.spe, value: partyLink(view.spe.party_id, parties) }]),
              ...(fact.initial_allocation_id === null
                ? []
                : [
                    {
                      label: text.allocationSelected,
                      value: text.allocationTitle(
                        view.allocations.find(
                          (allocation) => allocation.id === fact.initial_allocation_id,
                        )!.version,
                      ),
                    },
                  ]),
            ]}
          />
          {fact.modality === 'owner' ? <p className="lx-hint">{text.noStakes}</p> : null}
          <RecordList
            label={text.holding}
            items={view.holdings.map((holding) => ({
              id: holding.id,
              href: partyPath(holding.party_id),
              title:
                parties.find((party) => party.id === holding.party_id)?.maskedDocument ??
                holding.party_id,
              attributes: [
                {
                  label: text.modality,
                  value: holding.role === 'owner' ? text.owner : text.coOwner,
                },
                {
                  label: text.participation,
                  value: text.participationValue(holding.participation_bps),
                },
              ],
            }))}
          />
          {view.ledger.length === 0 ? null : (
            <div className="lx-content-group">
              <h3 className="lx-label">{text.grants}</h3>
              <ul className="lx-list">
                {view.ledger.map((grant) => (
                  <li key={grant.id}>
                    {text.grant(
                      grant.allocation_position,
                      grant.exercise_year,
                      grant.bucket,
                      grant.quantity,
                      grant.source,
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AcquisitionSection>
      )}
      {view.allocations.length === 0 ? null : (
        <AcquisitionSection id="allocation-records" title={text.allocationRecords}>
          <RecordList
            label={text.allocation}
            items={view.allocations.map((allocation) => ({
              id: allocation.id,
              title: text.allocationTitle(allocation.version),
              attributes: [
                {
                  label: text.configuration,
                  value: text.configurationName(allocation.configuration_id),
                },
                { label: text.startDate, value: allocation.date },
                { label: text.basis, value: allocation.basis_ref },
                { label: text.luxtoryAlta, value: allocation.luxtory_alta },
                { label: text.luxtoryMedia, value: allocation.luxtory_media },
                ...view.grants
                  .filter((grant) => grant.initial_allocation_id === allocation.id)
                  .map((grant) => ({
                    label: text.technicalPosition(grant.position),
                    value: `${grant.alta} / ${grant.media}`,
                  })),
              ],
            }))}
          />
        </AcquisitionSection>
      )}
      <AcquisitionSection id="administration-records" title={text.administrationRecords}>
        {view.coverages.length === 0 ? (
          <p className="lx-body">{text.noCoverages}</p>
        ) : (
          <RecordList
            label={text.administration}
            items={view.coverages.map((coverage) => ({
              id: coverage.id,
              title: text.coverageTitle(coverage.from, coverage.until),
              attributes: [
                { label: text.provider, value: partyLink(coverage.provider_party_id, parties) },
                {
                  label: text.scope,
                  value:
                    coverage.scope === 'full_luxtory_administration'
                      ? text.fullScope
                      : text.professionalScope,
                },
                { label: text.basis, value: coverage.basis_ref },
                ...(coverage.replaces_id === null
                  ? []
                  : [{ label: text.replaced, value: coverage.replaces_id }]),
              ],
            }))}
          />
        )}
      </AcquisitionSection>
      {view.started === null ? null : (
        <AcquisitionSection id="operation-record" title={text.started}>
          <AcquisitionFacts
            items={[
              { label: text.effectiveDate, value: view.started.date },
              { label: text.basis, value: view.started.basis_ref },
            ]}
          />
          <p className="lx-hint">{text.noCalendar}</p>
        </AcquisitionSection>
      )}
    </>
  );
}
export async function AcquisitionAdminPage({
  id,
  registered = null,
}: {
  readonly id: string;
  readonly registered?: string | null;
}) {
  const gate = await adminRoleGate('admin');
  if (gate.kind === 'blocked') return gate.page;
  if (!uuid.test(id))
    return (
      <Shell session={gate.session}>
        <PageHeader title={text.notFound} />
      </Shell>
    );
  let view: Awaited<ReturnType<typeof readAcquisitionAdmin>>;
  let parties: readonly MaskedPartyOption[];
  const open = available();
  try {
    view = await readAcquisitionAdmin(gate.session, id, { registeredOperationId: registered });
    const directory = open && view !== null ? await readPartyDirectory(gate.session) : [];
    const referenced =
      view === null
        ? []
        : [
            ...new Set([
              ...view.holdings.map((holding) => holding.party_id),
              ...view.coverages.map((coverage) => coverage.provider_party_id),
              ...(view.spe === null ? [] : [view.spe.party_id]),
            ]),
          ];
    const extra = await Promise.all(
      referenced
        .filter((partyId) => !directory.some((party) => party.id === partyId))
        .map((partyId) => readPartySummary(gate.session, partyId)),
    );
    parties = [...directory, ...extra.filter((party) => party !== null)].map((party) => ({
      id: party.id,
      documentType: party.documentType,
      maskedDocument: party.maskedDocument,
    }));
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return (
      <Shell session={gate.session}>
        <PageHeader title={text.title} context={{ href: path(id), label: text.back }} />
        <AcquisitionNotice>{text.readUnavailable}</AcquisitionNotice>
      </Shell>
    );
  }
  if (view === null)
    return (
      <Shell session={gate.session}>
        <PageHeader title={text.notFound} />
      </Shell>
    );
  const { origin } = view;
  return (
    <Shell session={gate.session}>
      <PageHeader
        title={text.title}
        lead={`${origin.label} · ${text.lead}`}
        context={{ href: path(id), label: text.back }}
      />
      {view.registrationConfirmed ? <AcquisitionSuccess key={registered} /> : null}
      {open ? null : <AcquisitionNotice>{text.unavailable}</AcquisitionNotice>}
      <AcquisitionSection id="commercial-origin" title={text.context}>
        <AcquisitionFacts
          items={[
            { label: text.home, value: origin.label },
            { label: text.concept, value: origin.homeConcept },
            { label: text.edition, value: origin.homeEdition },
            { label: text.version, value: text.originVersion(origin.version) },
            { label: text.timezone, value: origin.timezone },
          ]}
        />
      </AcquisitionSection>
      <RecordedFacts view={view} parties={parties} />
      {view.acquisition?.modality === 'co_owner' ? (
        <InitialDrawAdminSection session={gate.session} secondHomeId={id} />
      ) : null}
      <AcquisitionSection id="configurations" title={text.configurations}>
        <p className="lx-hint">{text.configurationHint}</p>
        <RecordList
          label={text.configurations}
          items={view.configurations.map((config) => ({
            id: String(config.id),
            title: text.configurationName(config.id),
            attributes: [
              {
                label: text.configuration,
                value: text.configurationSummary(
                  config.participation_bps,
                  config.alta,
                  config.media,
                  config.annual_days,
                  config.luxtory_alta,
                  config.luxtory_media,
                ),
              },
            ],
          }))}
        />
      </AcquisitionSection>
      {open ? (
        <AcquisitionForms
          homeId={id}
          parties={parties}
          configurations={view.configurations}
          allocations={view.allocations}
          coverages={view.coverages}
          baseDate={view.acquisition?.date ?? null}
          formalized={view.acquisition !== null}
          started={view.started !== null}
          keys={{
            formalize: randomUUID(),
            allocation: randomUUID(),
            administration: randomUUID(),
            start: randomUUID(),
          }}
        />
      ) : null}
    </Shell>
  );
}
