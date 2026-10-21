import { Evidence, PageHeader, RecordList, type RecordAttribute } from '@/design-system/react';
import { AdminShell, adminRoleGate } from '@/features/admin';
import type { HomeEditionLabel } from '@/features/catalog';
import type { HomeEditionGroup, LocationGroup } from '../application/interest-overview';
import { daysLabel, interestCount, messages } from './i18n/pt-br';
import { interestPaths } from './interest-admin-paths';
import { readInterestOverview } from './interest-overview-read';

/** Papel exercido que a visão exige, como o Catálogo (sem hierarquia, ADR-0008). */
const INTEREST_ROLE = 'admin';

const text = messages.overview;

/**
 * Uma localização pretendida: total por modalidade e, em Co-Owner, cada valor exato de dias informado com a sua
 * contagem (BR-062).
 */
function locationAttributes(location: LocationGroup): RecordAttribute[] {
  return location.modalities.flatMap((group) => [
    { label: text.modalities[group.modality], value: interestCount(group.total) },
    ...group.approxDays.map((item) => ({
      label: daysLabel(text.modalities.co_owner, item.days),
      value: interestCount(item.count),
    })),
  ]);
}

function HomeEditionSection({ group }: { readonly group: HomeEditionGroup<HomeEditionLabel> }) {
  const title = group.label?.homeEditionName ?? text.homeEditionUnavailable;
  const headingId = `interest-home-edition-${group.homeEditionId}`;
  return (
    <section className="lx-page-section" aria-labelledby={headingId}>
      <h2 className="lx-display-s" id={headingId}>
        {title}
      </h2>
      <Evidence
        inline
        items={[
          { label: text.homeConceptLabel, value: group.label?.homeConceptTitle },
          { label: text.brandLabel, value: group.label?.brandName },
          { label: text.totalLabel, value: interestCount(group.total) },
        ]}
      />
      <RecordList
        label={`${text.locationsLabel} ${title}`}
        items={group.locations.map((location) => ({
          id: location.desiredLocation,
          title: location.desiredLocation,
          attributes: locationAttributes(location),
        }))}
      />
      <p className="lx-body">
        <a className="lx-link" href={interestPaths.homeEdition(group.homeEditionId)}>
          {text.openGroup}
        </a>
      </p>
    </section>
  );
}

/** `/admin/interesses` (spec ownership §5): visão agrupada, não destrutiva, só com o papel Admin exercido. */
export async function InterestOverviewPage() {
  const gate = await adminRoleGate(INTEREST_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const groups = await readInterestOverview(gate.session);
  return (
    <AdminShell roles={gate.session.roles} current="interests">
      <div className="lx-container">
        <PageHeader title={text.title} lead={text.lead} />
        {groups.length === 0 ? (
          <section className="lx-page-section">
            <div className="lx-empty">
              <p className="lx-body">{text.empty}</p>
            </div>
          </section>
        ) : (
          <>
            <p className="lx-body">{text.daysNote}</p>
            {groups.map((group) => (
              <HomeEditionSection key={group.homeEditionId} group={group} />
            ))}
          </>
        )}
      </div>
    </AdminShell>
  );
}
