import { randomUUID } from 'node:crypto';
import type { ReactElement } from 'react';
import { PageHeader, RecordList, type RecordAttribute } from '@/design-system/react';
import { adminRoleGate } from '@/features/admin';
import { systemClock } from '@/features/platform';
import type { BrandPartnerSummary, HomeConceptSummary } from '../application/views';
import { isBrandInUse, type BrandPartner } from '../domain/catalog';
import { postgresCatalogReader } from '../infrastructure/postgres-catalog-reader';
import { BrandPartnerForm } from './brand-partner-form';
import { readCatalog } from './catalog-read';
import { CatalogNotFound, CatalogPage, isRecordId, KeyValues, StatusNotice } from './catalog-page';
import { CATALOG_ROLE } from './handlers';
import { collectionMessages } from './i18n/collection-pt-br';
import { messages } from './i18n/pt-br';
import { Instant } from './instant';
import { Notice } from './notice';
import { paths, type StatusKey } from './paths';
import { ExposureForm } from './home-concept-forms';
import { TerminationForm } from './termination-form';

const text = messages.brandPartner;

/** Situação da parceria para leitura (a regra é do command; aqui só se mostra). */
function stateValue(partner: Pick<BrandPartner, 'terminatedEffectiveAt'>, now: Date) {
  if (partner.terminatedEffectiveAt === null) return text.active;
  return isBrandInUse(partner, now) ? text.terminationScheduled : text.terminated;
}

function summaryAttributes(partner: BrandPartnerSummary, now: Date): RecordAttribute[] {
  return [
    { label: text.stateLabel, value: stateValue(partner, now) },
    { label: text.homeConceptsLabel, value: partner.homeConceptCount },
    {
      label: text.exposureLabel,
      value: partner.exposureAuthorizedAt === null ? text.exposureMissing : text.exposureAuthorized,
    },
  ];
}

function homeConceptAttributes(homeConcept: HomeConceptSummary): RecordAttribute[] {
  return [
    {
      label: text.homeConceptStateLabel,
      value:
        homeConcept.currentVersion === null
          ? text.homeConceptNotApproved
          : text.homeConceptApproved(homeConcept.currentVersion),
    },
    { label: text.versionsLabel, value: homeConcept.versionCount },
    { label: text.homeEditionsLabel, value: homeConcept.homeEditionCount },
  ];
}

/** `/admin/catalogo`: Brand Partners (lista de registros, D-W3-2). */
export async function BrandPartnersPage() {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const partners = await readCatalog(gate.session, { type: 'brand_partner', id: '*' }, (tx) =>
    postgresCatalogReader.brandPartners(tx),
  );
  const now = systemClock.now();
  const page = messages.catalog;
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        actions={
          <>
            <a className="lx-button lx-button--primary" href={paths.newBrandPartner}>
              {page.register}
            </a>
            <a className="lx-button lx-button--secondary" href={paths.vocabulary()}>
              {collectionMessages.vocabulary.link}
            </a>
          </>
        }
      />
      <section className="lx-page-section" aria-labelledby="catalog-partners">
        <h2 className="lx-display-s" id="catalog-partners">
          {page.listTitle}
        </h2>
        {partners.length === 0 ? (
          <div className="lx-empty">
            <p className="lx-body">{page.empty}</p>
          </div>
        ) : (
          <RecordList
            label={page.listTitle}
            items={partners.map((partner) => ({
              id: partner.id,
              href: paths.brandPartner(partner.id),
              title: partner.brandName,
              attributes: summaryAttributes(partner, now),
            }))}
          />
        )}
      </section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/brand-partners/nova`. */
export async function NewBrandPartnerPage() {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const page = messages.newBrandPartner;
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        context={{ href: paths.catalog, label: text.contextLink }}
      />
      <BrandPartnerForm idempotencyKey={randomUUID()} />
    </CatalogPage>
  );
}

/** Ações permitidas agora; nenhuma → `undefined`, para o cabeçalho não reservar a área de ações. */
function partnerActions(partner: BrandPartner, now: Date): ReactElement | undefined {
  const inUse = isBrandInUse(partner, now);
  const links = [
    inUse ? (
      <a
        key="home_concept"
        className="lx-button lx-button--primary"
        href={paths.newHomeConcept(partner.id)}
      >
        {text.registerHomeConcept}
      </a>
    ) : null,
    inUse && partner.exposureAuthorizedAt === null ? (
      <a
        key="exposure"
        className="lx-button lx-button--secondary"
        href={paths.exposure(partner.id)}
      >
        {text.registerExposure}
      </a>
    ) : null,
    partner.terminationRegisteredAt === null ? (
      <a
        key="termination"
        className="lx-button lx-button--destructive"
        href={paths.termination(partner.id)}
      >
        {text.registerTermination}
      </a>
    ) : null,
  ].filter((link) => link !== null);
  return links.length === 0 ? undefined : <>{links}</>;
}

function PartnerSummary({ partner }: { readonly partner: BrandPartner }) {
  const items: RecordAttribute[] = [
    ...(partner.terminatedEffectiveAt === null
      ? []
      : [
          {
            label: text.effectiveLabel,
            value: <Instant iso={partner.terminatedEffectiveAt.toISOString()} />,
          },
          { label: text.basisLabel, value: partner.terminationBasis },
        ]),
    {
      label: text.exposureRefLabel,
      value: partner.exposureAuthorizationRef ?? text.exposureMissing,
    },
    ...(partner.exposureAuthorizedAt === null
      ? []
      : [
          {
            label: text.exposureAtLabel,
            value: <Instant iso={partner.exposureAuthorizedAt.toISOString()} />,
          },
        ]),
    { label: text.registeredAtLabel, value: <Instant iso={partner.createdAt.toISOString()} /> },
  ];
  return <KeyValues items={items} />;
}

function TerminationNotice({
  partner,
  now,
}: {
  readonly partner: BrandPartner;
  readonly now: Date;
}) {
  if (partner.terminatedEffectiveAt === null) return null;
  return isBrandInUse(partner, now) ? (
    <Notice tone="warning" title={text.scheduledNoticeTitle} body={text.scheduledNoticeBody} />
  ) : (
    <Notice tone="warning" title={text.terminatedNoticeTitle} body={text.terminatedNoticeBody} />
  );
}

/** `/admin/catalogo/brand-partners/[id]`: situação da parceria e seus Home Concepts. */
export async function BrandPartnerPage({
  id,
  status,
}: {
  readonly id: string;
  readonly status: StatusKey | null;
}) {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  if (!isRecordId(id)) return <CatalogNotFound session={gate.session} />;
  const detail = await readCatalog(gate.session, { type: 'brand_partner', id }, (tx) =>
    postgresCatalogReader.brandPartner(tx, id),
  );
  if (detail === null) return <CatalogNotFound session={gate.session} />;
  const { partner, homeConcepts } = detail;
  const now = systemClock.now();
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={partner.brandName}
        lead={stateValue(partner, now)}
        context={{ href: paths.catalog, label: text.contextLink }}
        actions={partnerActions(partner, now)}
      />
      <StatusNotice status={status} />
      <section className="lx-page-section" aria-labelledby="partner-summary">
        <h2 className="lx-display-s" id="partner-summary">
          {text.summaryTitle}
        </h2>
        <TerminationNotice partner={partner} now={now} />
        <PartnerSummary partner={partner} />
      </section>
      <section className="lx-page-section" aria-labelledby="partner-home-concepts">
        <h2 className="lx-display-s" id="partner-home-concepts">
          {text.homeConceptsTitle}
        </h2>
        {homeConcepts.length === 0 ? (
          <div className="lx-empty">
            <p className="lx-body">{text.homeConceptsEmpty}</p>
          </div>
        ) : (
          <RecordList
            label={text.homeConceptsTitle}
            items={homeConcepts.map((homeConcept) => ({
              id: homeConcept.id,
              href: paths.homeConcept(homeConcept.id),
              title: homeConcept.title,
              attributes: homeConceptAttributes(homeConcept),
            }))}
          />
        )}
      </section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/brand-partners/[id]/encerramento`: confirmação do encerramento (irreversível). */
export async function TerminationPage({ id }: { readonly id: string }) {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  if (!isRecordId(id)) return <CatalogNotFound session={gate.session} />;
  const detail = await readCatalog(gate.session, { type: 'brand_partner', id }, (tx) =>
    postgresCatalogReader.brandPartner(tx, id),
  );
  if (detail === null) return <CatalogNotFound session={gate.session} />;
  const { partner } = detail;
  const page = messages.termination;
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        context={{ href: paths.brandPartner(partner.id), label: partner.brandName }}
      />
      {partner.terminationRegisteredAt === null ? (
        <div className="lx-form">
          <Notice tone="warning" title={page.warningTitle} body={page.warningBody} />
          <p className="lx-small">{page.limitationBody}</p>
          <TerminationForm brandPartnerId={partner.id} idempotencyKey={randomUUID()} />
        </div>
      ) : (
        <Notice tone="warning" title={page.alreadyTerminated} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/brand-partners/[id]/exposicao`: autorização de exposição pública da marca (BR-015). */
export async function ExposurePage({ id }: { readonly id: string }) {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  if (!isRecordId(id)) return <CatalogNotFound session={gate.session} />;
  const detail = await readCatalog(gate.session, { type: 'brand_partner', id }, (tx) =>
    postgresCatalogReader.brandPartner(tx, id),
  );
  if (detail === null) return <CatalogNotFound session={gate.session} />;
  const { partner } = detail;
  const page = messages.exposure;
  const blocked = !isBrandInUse(partner, systemClock.now());
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        context={{ href: paths.brandPartner(partner.id), label: partner.brandName }}
      />
      {partner.exposureAuthorizedAt !== null ? (
        <Notice tone="warning" title={page.alreadyRegistered} />
      ) : blocked ? (
        <Notice tone="warning" title={page.blocked} />
      ) : (
        <div className="lx-form">
          <p className="lx-small">{page.notice}</p>
          <Notice tone="warning" title={page.publicNotice} />
          <ExposureForm brandPartnerId={partner.id} idempotencyKey={randomUUID()} />
        </div>
      )}
    </CatalogPage>
  );
}
