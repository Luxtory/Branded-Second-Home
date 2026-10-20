import { randomUUID } from 'node:crypto';
import type { ReactElement } from 'react';
import { PageHeader, RecordList, type RecordListItem } from '@/design-system/react';
import { adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import { systemClock } from '@/features/platform';
import type { HomeConceptDetail } from '../application/views';
import {
  authorizationCovers,
  canApprove,
  currentVersion,
  isBrandInUse,
  type HomeConceptVersion,
  type InvestorAuthorization,
} from '../domain/catalog';
import { postgresCatalogReader } from '../infrastructure/postgres-catalog-reader';
import {
  CatalogNotFound,
  CatalogPage,
  ContentGroup,
  Empty,
  isRecordId,
  KeyValues,
  Section,
  StatusNotice,
  TextList,
} from './catalog-page';
import { readCatalog } from './catalog-read';
import {
  CoverSection,
  CurationSection,
  termOptions,
  VersionCollection,
  versionCollectionValues,
} from './collection-pages';
import { ApprovalForm, HomeConceptForm, VersionForm } from './home-concept-forms';
import { NewHomeEditionForm } from './home-edition-forms';
import { CATALOG_ROLE } from './handlers';
import { messages } from './i18n/pt-br';
import { Instant } from './instant';
import { Notice } from './notice';
import { AuthorizationForm, RevocationForm } from './offer-forms';
import { paths, type StatusKey } from './paths';

const text = messages.homeConcept;

type Loaded = { readonly session: ExercisedAdminSession; readonly detail: HomeConceptDetail };

/** Portão + leitura auditada do Home Concept; bloqueio ou "não encontrado" viram a própria página. */
async function loadHomeConcept(id: string): Promise<Loaded | { readonly page: ReactElement }> {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return { page: gate.page };
  if (!isRecordId(id)) return { page: <CatalogNotFound session={gate.session} /> };
  const detail = await readCatalog(gate.session, { type: 'home_concept', id }, (tx) =>
    postgresCatalogReader.homeConcept(tx, id),
  );
  if (detail === null) return { page: <CatalogNotFound session={gate.session} /> };
  return { session: gate.session, detail };
}

const stateLabel = (current: HomeConceptVersion | null) =>
  current === null ? text.notApproved : text.approved(current.version);

function authorizationState(authorization: InvestorAuthorization, now: Date): string {
  if (authorization.revokedAt !== null) return text.authorizationRevoked;
  if (now < authorization.validFrom) return text.authorizationNotYet;
  return authorizationCovers(authorization, authorization.homeConceptId, now)
    ? text.authorizationValid
    : text.authorizationExpired;
}

/** Ações permitidas agora; marca fora de uso → `undefined`, para o cabeçalho não reservar a área de ações. */
function homeConceptActions(detail: HomeConceptDetail, now: Date): ReactElement | undefined {
  if (!isBrandInUse(detail.partner, now)) return undefined;
  const id = detail.homeConcept.id;
  return (
    <>
      {currentVersion(detail.versions) === null ? null : (
        <a className="lx-button lx-button--primary" href={paths.newHomeEdition(id)}>
          {text.newHomeEdition}
        </a>
      )}
      <a className="lx-button lx-button--secondary" href={paths.newVersion(id)}>
        {text.newVersion}
      </a>
      <a className="lx-button lx-button--secondary" href={paths.newAuthorization(id)}>
        {text.newAuthorization}
      </a>
    </>
  );
}

function VersionContent({
  version,
  detail,
}: {
  readonly version: HomeConceptVersion;
  readonly detail: HomeConceptDetail;
}) {
  return (
    <>
      <VersionCollection version={version} terms={detail.terms} />
      <ContentGroup label={text.essentialLabel}>
        <TextList items={version.essentialElements} />
      </ContentGroup>
      <ContentGroup label={text.premisesLabel}>
        <TextList items={version.preservationPremises} />
      </ContentGroup>
      <ContentGroup label={text.specificationLabel}>{version.specification}</ContentGroup>
    </>
  );
}

function versionItems(detail: HomeConceptDetail, inUse: boolean): RecordListItem[] {
  const current = currentVersion(detail.versions);
  return detail.versions.map((version) => ({
    id: version.id,
    title: text.versionTitle(version.version),
    ...(inUse && canApprove(version, current)
      ? { href: paths.approval(detail.homeConcept.id, version.id) }
      : {}),
    attributes: [
      {
        label: text.versionStateLabel,
        value: version.state === 'approved' ? text.versionApproved : text.versionNotApproved,
      },
      {
        label: version.approval === null ? text.versionRegisteredLabel : text.versionApprovedLabel,
        value: <Instant iso={(version.approval?.approvedAt ?? version.createdAt).toISOString()} />,
      },
    ],
  }));
}

function authorizationItems(detail: HomeConceptDetail, now: Date): RecordListItem[] {
  return detail.investorAuthorizations.map((authorization) => ({
    id: authorization.id,
    title: authorization.instrumentRef,
    ...(authorization.revokedAt === null
      ? { href: paths.revocation(detail.homeConcept.id, authorization.id) }
      : {}),
    attributes: [
      { label: text.authorizationStateLabel, value: authorizationState(authorization, now) },
      {
        label: text.validFromLabel,
        value: <Instant iso={authorization.validFrom.toISOString()} />,
      },
      {
        label: text.validUntilLabel,
        value:
          authorization.validUntil === null ? (
            text.noValidUntil
          ) : (
            <Instant iso={authorization.validUntil.toISOString()} />
          ),
      },
    ],
  }));
}

/** `/admin/catalogo/home-concepts/[id]`: versão vigente, versões, Home Editions e autorizações de Investor. */
export async function HomeConceptPage({
  id,
  status,
}: {
  readonly id: string;
  readonly status: StatusKey | null;
}) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const now = systemClock.now();
  const current = currentVersion(detail.versions);
  const inUse = isBrandInUse(detail.partner, now);
  return (
    <CatalogPage session={session}>
      <PageHeader
        title={detail.homeConcept.title}
        lead={stateLabel(current)}
        context={{ href: paths.brandPartner(detail.partner.id), label: detail.partner.brandName }}
        actions={homeConceptActions(detail, now)}
      />
      <StatusNotice status={status} />
      {inUse ? null : <Notice tone="warning" title={text.blockedNotice} />}
      <Section id="home-concept-current" title={text.currentTitle}>
        {current === null ? (
          <Empty message={text.currentEmpty} />
        ) : (
          <>
            <VersionContent version={current} detail={detail} />
            <ContentGroup label={text.approvalRefsLabel}>
              <TextList items={current.approval?.approvalRefs ?? []} />
            </ContentGroup>
          </>
        )}
      </Section>
      <CoverSection detail={detail} inUse={inUse} />
      <CurationSection detail={detail} inUse={inUse} />
      <Section id="home-concept-versions" title={text.versionsTitle}>
        <RecordList label={text.versionsTitle} items={versionItems(detail, inUse)} />
      </Section>
      <Section id="home-concept-home-editions" title={text.homeEditionsTitle}>
        {detail.homeEditions.length === 0 ? (
          <Empty message={text.homeEditionsEmpty} />
        ) : (
          <RecordList
            label={text.homeEditionsTitle}
            items={detail.homeEditions.map(({ homeEdition, secondHomeCount }) => ({
              id: homeEdition.id,
              href: paths.homeEdition(homeEdition.id),
              title: homeEdition.name,
              attributes: [
                { label: text.typologyLabel, value: homeEdition.typology },
                {
                  label: text.materialStateLabel,
                  value: messages.homeEdition.materialStates[homeEdition.materialState],
                },
                {
                  label: text.visibilityLabel,
                  value: messages.homeEdition.visibilities[homeEdition.visibility],
                },
                { label: text.secondHomesLabel, value: secondHomeCount },
              ],
            }))}
          />
        )}
      </Section>
      <Section id="home-concept-authorizations" title={text.authorizationsTitle}>
        {detail.investorAuthorizations.length === 0 ? (
          <Empty message={text.authorizationsEmpty} />
        ) : (
          <RecordList label={text.authorizationsTitle} items={authorizationItems(detail, now)} />
        )}
      </Section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/brand-partners/[id]/home-concepts/novo`: Home Concept com a versão 1. */
export async function NewHomeConceptPage({ brandPartnerId }: { readonly brandPartnerId: string }) {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  if (!isRecordId(brandPartnerId)) return <CatalogNotFound session={gate.session} />;
  const { detail, terms } = await readCatalog(
    gate.session,
    { type: 'brand_partner', id: brandPartnerId },
    async (tx) => ({
      detail: await postgresCatalogReader.brandPartner(tx, brandPartnerId),
      terms: await postgresCatalogReader.terms(tx),
    }),
  );
  if (detail === null) return <CatalogNotFound session={gate.session} />;
  const page = messages.newHomeConcept;
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        context={{ href: paths.brandPartner(brandPartnerId), label: detail.partner.brandName }}
      />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <HomeConceptForm
          brandPartnerId={brandPartnerId}
          idempotencyKey={randomUUID()}
          terms={termOptions(terms)}
        />
      ) : (
        <Notice tone="warning" title={page.blocked} />
      )}
    </CatalogPage>
  );
}

/** Cabeçalho das páginas de ação de um Home Concept: contexto = o Home Concept. */
function HomeConceptActionHeader({
  detail,
  title,
  lead,
}: {
  readonly detail: HomeConceptDetail;
  readonly title: string;
  readonly lead: string;
}) {
  return (
    <PageHeader
      title={title}
      lead={lead}
      context={{ href: paths.homeConcept(detail.homeConcept.id), label: detail.homeConcept.title }}
    />
  );
}

/** `/admin/catalogo/home-concepts/[id]/versoes/nova`: parte do conteúdo da versão mais recente. */
export async function NewVersionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.newVersion;
  const latest = detail.versions[0];
  const initial: Record<string, string> =
    latest === undefined
      ? {}
      : {
          essential_elements: latest.essentialElements.join('\n'),
          preservation_premises: latest.preservationPremises.join('\n'),
          specification: latest.specification,
          ...versionCollectionValues(latest),
        };
  return (
    <CatalogPage session={session}>
      <HomeConceptActionHeader detail={detail} title={page.title} lead={page.lead} />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <VersionForm
          homeConceptId={id}
          idempotencyKey={randomUUID()}
          initial={initial}
          terms={termOptions(detail.terms)}
        />
      ) : (
        <Notice tone="warning" title={text.blockedNotice} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-concepts/[id]/versoes/[versionId]/aprovacao`: revisão editorial e aprovação. */
export async function ApprovalPage({
  id,
  versionId,
}: {
  readonly id: string;
  readonly versionId: string;
}) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const version = detail.versions.find((candidate) => candidate.id === versionId);
  if (version === undefined) return <CatalogNotFound session={session} />;
  const page = messages.approval;
  const approvable =
    isBrandInUse(detail.partner, systemClock.now()) &&
    canApprove(version, currentVersion(detail.versions));
  return (
    <CatalogPage session={session}>
      <HomeConceptActionHeader
        detail={detail}
        title={page.title(version.version)}
        lead={page.lead}
      />
      <Section id="approval-content" title={text.versionTitle(version.version)}>
        <VersionContent version={version} detail={detail} />
      </Section>
      <Section id="approval-form" title={page.sectionTitle}>
        {approvable ? (
          <div className="lx-form">
            <Notice tone="warning" title={page.notice} />
            <Notice tone="warning" title={page.publicNotice} />
            <ApprovalForm
              homeConceptId={id}
              versionId={version.id}
              version={version.version}
              idempotencyKey={randomUUID()}
            />
          </div>
        ) : (
          <Notice tone="warning" title={page.unavailable} />
        )}
      </Section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-concepts/[id]/home-editions/nova`. */
export async function NewHomeEditionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.newHomeEdition;
  const allowed =
    isBrandInUse(detail.partner, systemClock.now()) && currentVersion(detail.versions) !== null;
  return (
    <CatalogPage session={session}>
      <HomeConceptActionHeader detail={detail} title={page.title} lead={page.lead} />
      {allowed ? (
        <div className="lx-form">
          <Notice tone="warning" title={messages.homeEditionFields.publicNotice} />
          <NewHomeEditionForm homeConceptId={id} idempotencyKey={randomUUID()} />
        </div>
      ) : (
        <Notice tone="warning" title={page.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-concepts/[id]/autorizacoes-investor/nova`. */
export async function NewAuthorizationPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.newAuthorization;
  return (
    <CatalogPage session={session}>
      <HomeConceptActionHeader detail={detail} title={page.title} lead={page.lead} />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <div className="lx-form">
          <p className="lx-small">{page.notice}</p>
          <AuthorizationForm homeConceptId={id} idempotencyKey={randomUUID()} />
        </div>
      ) : (
        <Notice tone="warning" title={text.blockedNotice} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-concepts/[id]/autorizacoes-investor/[authorizationId]/revogacao` (irreversível). */
export async function RevocationPage({
  id,
  authorizationId,
}: {
  readonly id: string;
  readonly authorizationId: string;
}) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const authorization = detail.investorAuthorizations.find((item) => item.id === authorizationId);
  if (authorization === undefined) return <CatalogNotFound session={session} />;
  const page = messages.revocation;
  return (
    <CatalogPage session={session}>
      <HomeConceptActionHeader detail={detail} title={page.title} lead={page.lead} />
      <KeyValues
        items={[
          { label: messages.newAuthorization.refLabel, value: authorization.instrumentRef },
          {
            label: text.authorizationStateLabel,
            value: authorizationState(authorization, systemClock.now()),
          },
        ]}
      />
      {authorization.revokedAt === null ? (
        <div className="lx-form">
          <Notice tone="warning" title={page.warningTitle} body={page.warningBody} />
          <RevocationForm
            homeConceptId={id}
            authorizationId={authorization.id}
            idempotencyKey={randomUUID()}
          />
        </div>
      ) : (
        <Notice tone="warning" title={page.alreadyRevoked} />
      )}
    </CatalogPage>
  );
}
