import { randomUUID } from 'node:crypto';
import type { ReactElement } from 'react';
import { PageHeader, RecordList } from '@/design-system/react';
import { adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import { systemClock } from '@/features/platform';
import type { EditionDetail } from '../application/views';
import { authorizationCovers, isBrandInUse } from '../domain/catalog';
import { ianaTimeZones } from '../domain/time-zone';
import { postgresCatalogReader } from '../infrastructure/postgres-catalog-reader';
import {
  CatalogNotFound,
  CatalogPage,
  Empty,
  isRecordId,
  KeyValues,
  Section,
  StatusNotice,
} from './catalog-page';
import { readCatalog } from './catalog-read';
import { ReferenceValuesSection } from './collection-pages';
import { CATALOG_ROLE } from './handlers';
import { messages } from './i18n/pt-br';
import { Instant } from './instant';
import { Notice } from './notice';
import { ResidenceForm } from './offer-forms';
import { paths, type StatusKey } from './paths';

const text = messages.edition;

type Loaded = { readonly session: ExercisedAdminSession; readonly detail: EditionDetail };

async function loadEdition(id: string): Promise<Loaded | { readonly page: ReactElement }> {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return { page: gate.page };
  if (!isRecordId(id)) return { page: <CatalogNotFound session={gate.session} /> };
  const detail = await readCatalog(gate.session, { type: 'edition', id }, (tx) =>
    postgresCatalogReader.edition(tx, id),
  );
  if (detail === null) return { page: <CatalogNotFound session={gate.session} /> };
  return { session: gate.session, detail };
}

/** Novas Residences exigem a parceria ativa e uma versão aprovada (o command revalida). */
const canRegister = (detail: EditionDetail, now: Date) =>
  isBrandInUse(detail.partner, now) && detail.currentVersion !== null;

/** `/admin/catalogo/editions/[id]`: condições comerciais e Residences. */
export async function EditionPage({
  id,
  status,
}: {
  readonly id: string;
  readonly status: StatusKey | null;
}) {
  const loaded = await loadEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const { edition, concept } = detail;
  const now = systemClock.now();
  const allowed = canRegister(detail, now);
  return (
    <CatalogPage session={session}>
      <PageHeader
        title={text.title(concept.title, edition.region)}
        lead={messages.modality[edition.modality]}
        context={{ href: paths.concept(concept.id), label: concept.title }}
        actions={
          allowed ? (
            <a className="lx-button lx-button--primary" href={paths.newResidence(edition.id)}>
              {text.newResidence}
            </a>
          ) : undefined
        }
      />
      <StatusNotice status={status} />
      {allowed ? null : <Notice tone="warning" title={text.blocked} />}
      <Section id="edition-conditions" title={text.conditionsTitle}>
        <p className="lx-body">{edition.commercialConditions}</p>
      </Section>
      <ReferenceValuesSection detail={detail} now={now} inUse={isBrandInUse(detail.partner, now)} />
      <Section id="edition-residences" title={text.residencesTitle}>
        {detail.residences.length === 0 ? (
          <Empty message={text.residencesEmpty} />
        ) : (
          <RecordList
            label={text.residencesTitle}
            items={detail.residences.map(({ residence, conceptVersion }) => ({
              id: residence.id,
              href: paths.residence(residence.id),
              title: residence.label,
              attributes: [
                { label: text.versionLabel, value: text.versionValue(conceptVersion) },
                {
                  label: text.approvedAtLabel,
                  value: <Instant iso={residence.commerciallyApprovedAt.toISOString()} />,
                },
                {
                  label: text.investorLabel,
                  value:
                    residence.investorAuthorizationId === null
                      ? text.withoutInvestor
                      : text.withInvestor,
                },
              ],
            }))}
          />
        )}
      </Section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/editions/[id]/residences/nova`: o registro é a aprovação comercial (BR-025). */
export async function NewResidencePage({ id }: { readonly id: string }) {
  const loaded = await loadEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.newResidence;
  const now = systemClock.now();
  const current = detail.currentVersion;
  const valid = detail.investorAuthorizations.filter((authorization) =>
    authorizationCovers(authorization, detail.concept.id, now),
  );
  return (
    <CatalogPage session={session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        context={{
          href: paths.edition(detail.edition.id),
          label: text.title(detail.concept.title, detail.edition.region),
        }}
      />
      {canRegister(detail, now) && current !== null ? (
        <div className="lx-form">
          <p className="lx-body">{page.currentVersion(current.version)}</p>
          <ResidenceForm
            editionId={detail.edition.id}
            idempotencyKey={randomUUID()}
            timeZones={ianaTimeZones()}
            authorizations={valid.map((authorization) => ({
              value: authorization.id,
              label: authorization.instrumentRef,
            }))}
          />
        </div>
      ) : (
        <Notice tone="warning" title={text.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/residences/[id]`: versão fixada, aprovação comercial e Investor. */
export async function ResidencePage({
  id,
  status,
}: {
  readonly id: string;
  readonly status: StatusKey | null;
}) {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  if (!isRecordId(id)) return <CatalogNotFound session={gate.session} />;
  const detail = await readCatalog(gate.session, { type: 'residence', id }, (tx) =>
    postgresCatalogReader.residence(tx, id),
  );
  if (detail === null) return <CatalogNotFound session={gate.session} />;
  const { residence, edition, concept, conceptVersion, investorAuthorization } = detail;
  const page = messages.residence;
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={residence.label}
        lead={text.title(concept.title, edition.region)}
        context={{
          href: paths.edition(edition.id),
          label: text.title(concept.title, edition.region),
        }}
      />
      <StatusNotice status={status} />
      <Section id="residence-summary" title={page.summaryTitle}>
        <KeyValues
          items={[
            {
              label: page.conceptVersionLabel,
              value: text.versionValue(conceptVersion.version),
            },
            {
              label: page.approvedAtLabel,
              value: <Instant iso={residence.commerciallyApprovedAt.toISOString()} />,
            },
            { label: page.timezoneLabel, value: residence.timezone },
            { label: page.modalityLabel, value: messages.modality[edition.modality] },
            {
              label: page.investorLabel,
              value: investorAuthorization?.instrumentRef ?? page.noInvestor,
            },
          ]}
        />
      </Section>
    </CatalogPage>
  );
}
