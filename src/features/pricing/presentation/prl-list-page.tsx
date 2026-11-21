import { PageHeader, RecordList } from '@/design-system/react';
import { adminGate, AdminShell } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { getDatabase, unavailableKeys } from '@/features/platform';
import { prlCoverage, type PrlCoverage } from '../prl';
import { formatNight } from './format';
import { prlMessages as text } from './i18n/prl-pt-br';
import { prlPath } from './prl-paths';

/**
 * `/admin/prl` (W16; REQ-052; spec pricing §5): cobertura do PRL por Second Home — noites seladas, com PRL vigente e com
 * alguma versão. Admin e Super Admin (a alteração do publicado é só do Super Admin, na tela da Second Home).
 */
export async function AdminPrlListPage() {
  const gate = await adminGate();
  if (gate.kind === 'blocked') return gate.page;
  let coverage: readonly PrlCoverage[];
  try {
    coverage = await prlCoverage(getDatabase(), new Date());
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return <AuthUnavailable />;
  }
  return (
    <AdminShell roles={gate.session.roles} current="prl">
      <div className="lx-container">
        <PageHeader title={text.listTitle} lead={text.listLead} />
        <section className="lx-page-section" aria-labelledby="prl-second-homes">
          <h2 className="lx-display-s" id="prl-second-homes">
            {text.listSectionTitle}
          </h2>
          {coverage.length === 0 ? (
            <p className="lx-body">{text.listEmpty}</p>
          ) : (
            <RecordList
              label={text.listLabel}
              items={coverage.map((home) => ({
                id: home.secondHomeId,
                href: prlPath(home.secondHomeId),
                title: home.label,
                attributes: [
                  { label: text.editionLabel, value: home.editionName },
                  {
                    label: text.sealedLabel,
                    value:
                      home.sealedNights === 0
                        ? text.sealedNone
                        : text.nightsCount(home.sealedNights),
                  },
                  ...(home.firstSealed === null || home.lastSealed === null
                    ? []
                    : [
                        {
                          label: text.periodLabel,
                          value: text.period(
                            formatNight(home.firstSealed),
                            formatNight(home.lastSealed),
                          ),
                        },
                      ]),
                  { label: text.inForceLabel, value: text.nightsCount(home.nightsInForce) },
                  { label: text.publishedLabel, value: text.nightsCount(home.nightsPublished) },
                ],
              }))}
            />
          )}
        </section>
      </div>
    </AdminShell>
  );
}
