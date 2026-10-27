import { randomUUID } from 'node:crypto';
import type { ReactElement, ReactNode } from 'react';
import { PageHeader, RecordList, type RecordAttribute } from '@/design-system/react';
import { adminRoleGate } from '@/features/admin';
import { systemClock } from '@/features/platform';
import type { HomeEditionDetail } from '../application/views';
import {
  authorizationCovers,
  canCorrectEditorial,
  canFinalize,
  canOriginateSecondHome,
  canPublish,
  canWithdraw,
  isBrandInUse,
  isInPreparation,
  type HomeEdition,
} from '../domain/catalog';
import { ianaTimeZones } from '../domain/time-zone';
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
import { CATALOG_ROLE } from './handlers';
import {
  EditHomeEditionForm,
  EditorialCorrectionForm,
  FinalizeHomeEditionForm,
  PublishHomeEditionForm,
  WithdrawHomeEditionForm,
} from './home-edition-forms';
import { HomeEditionContextHeader, loadHomeEdition } from './home-edition-load';
import { HomeEditionMediaSection, ProjectedInvestmentSection } from './home-edition-media-pages';
import { messages } from './i18n/pt-br';
import { Instant } from './instant';
import { Notice } from './notice';
import { SecondHomeForm } from './offer-forms';
import { paths, type StatusKey } from './paths';

const text = messages.homeEdition;

/** Marca em uso e versão aprovada do Home Concept: base de toda transição que expõe ou origina (o command revalida). */
const canAdvance = (detail: HomeEditionDetail, now: Date) =>
  isBrandInUse(detail.partner, now) && detail.currentVersion !== null;

/** Novas Second Homes: definição material finalizada, marca em uso e versão aprovada (BR-025, BR-036). */
const canRegisterSecondHome = (detail: HomeEditionDetail, now: Date) =>
  canOriginateSecondHome(detail.homeEdition) && canAdvance(detail, now);

/** O Home Concept está no site (exposição, marca em uso, versão aprovada)? Só informa a tela; a RLS decide. */
const homeConceptOnSite = (detail: HomeEditionDetail, now: Date) =>
  detail.partner.exposureAuthorizedAt !== null && canAdvance(detail, now);

const stateLead = (homeEdition: HomeEdition) =>
  `${text.materialStates[homeEdition.materialState]} · ${text.visibilities[homeEdition.visibility]}`;

const link = (href: string, label: string, tone: 'primary' | 'secondary') => (
  <a key={href} className={`lx-button lx-button--${tone}`} href={href}>
    {label}
  </a>
);

/** Ações permitidas agora, pelo estado material e pela visibilidade; nenhuma → `undefined`. */
function homeEditionActions(detail: HomeEditionDetail, now: Date): ReactElement | undefined {
  const { homeEdition } = detail;
  const id = homeEdition.id;
  const advance = canAdvance(detail, now);
  const actions = [
    ...(isInPreparation(homeEdition) && isBrandInUse(detail.partner, now)
      ? [link(paths.editHomeEdition(id), text.edit, 'secondary')]
      : []),
    ...(canFinalize(homeEdition) && advance
      ? [link(paths.finalizeHomeEdition(id), text.finalize, 'primary')]
      : []),
    ...(canPublish(homeEdition) && advance
      ? [link(paths.publishHomeEdition(id), text.publish, 'primary')]
      : []),
    ...(canRegisterSecondHome(detail, now)
      ? [link(paths.newSecondHome(id), text.newSecondHome, 'secondary')]
      : []),
    ...(canCorrectEditorial(homeEdition)
      ? [link(paths.correctHomeEdition(id), text.correct, 'secondary')]
      : []),
    ...(canWithdraw(homeEdition)
      ? [link(paths.withdrawHomeEdition(id), text.withdraw, 'secondary')]
      : []),
  ];
  return actions.length === 0 ? undefined : <>{actions}</>;
}

const listOrNone = (items: readonly string[] | null) =>
  items === null || items.length === 0 ? text.notInformed : <TextList items={items} />;

/** Definição material (BR-031, BR-036): imutável depois da finalização. */
function MaterialDefinition({ homeEdition }: { readonly homeEdition: HomeEdition }) {
  const items: RecordAttribute[] = [
    { label: text.typologyLabel, value: homeEdition.typology },
    {
      label: text.capacityLabel,
      value: text.capacity(homeEdition.projectedAreaM2, homeEdition.suites, homeEdition.guestsMax),
    },
  ];
  return (
    <>
      <KeyValues items={items} />
      <ContentGroup label={text.spatialLabel}>{homeEdition.spatialConfiguration}</ContentGroup>
      <ContentGroup label={text.roomsLabel}>{listOrNone(homeEdition.rooms)}</ContentGroup>
      <ContentGroup label={text.amenitiesLabel}>{listOrNone(homeEdition.amenities)}</ContentGroup>
      <ContentGroup label={text.characteristicsLabel}>
        {listOrNone(homeEdition.characteristics)}
      </ContentGroup>
    </>
  );
}

function StateSection({ detail, now }: { readonly detail: HomeEditionDetail; readonly now: Date }) {
  const { homeEdition } = detail;
  const finalization = homeEdition.finalization;
  return (
    <Section id="home-edition-state" title={text.stateTitle}>
      <KeyValues
        items={[
          {
            label: text.materialStateLabel,
            value: text.materialStates[homeEdition.materialState],
          },
          { label: text.visibilityLabel, value: text.visibilities[homeEdition.visibility] },
          ...(finalization === null
            ? []
            : [
                {
                  label: text.finalizedAtLabel,
                  value: <Instant iso={finalization.at.toISOString()} />,
                },
              ]),
          ...(homeEdition.withdrawalBasis === null
            ? []
            : [{ label: text.withdrawalBasisLabel, value: homeEdition.withdrawalBasis }]),
        ]}
      />
      <Notice
        tone="warning"
        title={isInPreparation(homeEdition) ? text.draftNotice : text.finalizedNotice}
      />
      {homeEdition.visibility === 'public' && !homeConceptOnSite(detail, now) ? (
        <Notice tone="warning" title={text.homeConceptHiddenNotice} />
      ) : null}
    </Section>
  );
}

function SecondHomesSection({ detail }: { readonly detail: HomeEditionDetail }) {
  return (
    <Section id="home-edition-second-homes" title={text.secondHomesTitle}>
      {detail.secondHomes.length === 0 ? (
        <Empty message={text.secondHomesEmpty} />
      ) : (
        <RecordList
          label={text.secondHomesTitle}
          items={detail.secondHomes.map(({ secondHome, homeConceptVersion }) => ({
            id: secondHome.id,
            href: paths.secondHome(secondHome.id),
            title: secondHome.label,
            attributes: [
              { label: text.versionLabel, value: text.versionValue(homeConceptVersion) },
              {
                label: text.approvedAtLabel,
                value: <Instant iso={secondHome.commerciallyApprovedAt.toISOString()} />,
              },
              {
                label: text.investorLabel,
                value:
                  secondHome.investorAuthorizationId === null
                    ? text.withoutInvestor
                    : text.withInvestor,
              },
            ],
          }))}
        />
      )}
    </Section>
  );
}

/**
 * `/admin/catalogo/home-editions/[id]`: estado material e visibilidade, definição material, textos editoriais, mídia,
 * média projetada e Second Homes (spec catalog §17.6).
 */
export async function HomeEditionPage({
  id,
  status,
}: {
  readonly id: string;
  readonly status: StatusKey | null;
}) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const { homeEdition, homeConcept } = detail;
  const now = systemClock.now();
  const inUse = isBrandInUse(detail.partner, now);
  return (
    <CatalogPage session={session}>
      <PageHeader
        title={homeEdition.name}
        lead={stateLead(homeEdition)}
        context={{ href: paths.homeConcept(homeConcept.id), label: homeConcept.title }}
        actions={homeEditionActions(detail, now)}
      />
      <StatusNotice status={status} />
      <StateSection detail={detail} now={now} />
      <Section id="home-edition-editorial" title={text.editorialTitle}>
        <KeyValues items={[{ label: text.nameLabel, value: homeEdition.name }]} />
        <ContentGroup label={text.descriptionLabel}>{homeEdition.description}</ContentGroup>
      </Section>
      <Section id="home-edition-material" title={text.materialTitle}>
        <MaterialDefinition homeEdition={homeEdition} />
      </Section>
      <HomeEditionMediaSection detail={detail} inUse={inUse} />
      <ProjectedInvestmentSection detail={detail} now={now} inUse={inUse} />
      <SecondHomesSection detail={detail} />
    </CatalogPage>
  );
}

/** Valores atuais da Home Edition no formato do formulário (listas uma por linha). */
function contentValues(homeEdition: HomeEdition): Record<string, string> {
  const lines = (items: readonly string[] | null) => (items ?? []).join('\n');
  return {
    name: homeEdition.name,
    description: homeEdition.description,
    typology: homeEdition.typology,
    spatial_configuration: homeEdition.spatialConfiguration,
    projected_area_m2: String(homeEdition.projectedAreaM2),
    suites: String(homeEdition.suites),
    guests_max: String(homeEdition.guestsMax),
    rooms: lines(homeEdition.rooms),
    amenities: lines(homeEdition.amenities),
    characteristics: lines(homeEdition.characteristics),
  };
}

/** `/admin/catalogo/home-editions/[id]/edicao`: edição da preparação (só em `draft`). */
export async function EditHomeEditionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.editHomeEdition;
  const editable =
    isInPreparation(detail.homeEdition) && isBrandInUse(detail.partner, systemClock.now());
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={page.title} lead={page.lead} />
      {editable ? (
        <div className="lx-form">
          <Notice tone="warning" title={messages.homeEditionFields.publicNotice} />
          <EditHomeEditionForm
            homeEditionId={id}
            values={contentValues(detail.homeEdition)}
            idempotencyKey={randomUUID()}
          />
        </div>
      ) : (
        <Notice tone="warning" title={page.unavailable} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/finalizacao`: confirmação da finalização (uma vez, sem volta). */
export async function FinalizeHomeEditionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.finalizeHomeEdition;
  const now = systemClock.now();
  const blocker = !canFinalize(detail.homeEdition)
    ? page.unavailable
    : canAdvance(detail, now)
      ? null
      : page.blocked;
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={page.title} lead={page.lead} />
      <Section id="finalize-material" title={text.materialTitle}>
        <MaterialDefinition homeEdition={detail.homeEdition} />
      </Section>
      {blocker === null ? (
        <div className="lx-form">
          <Notice tone="warning" title={page.warningTitle} body={page.warningBody} />
          <FinalizeHomeEditionForm homeEditionId={id} idempotencyKey={randomUUID()} />
        </div>
      ) : (
        <Notice tone="warning" title={blocker} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/publicacao`: passa a aparecer no site. */
export async function PublishHomeEditionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.publishHomeEdition;
  const now = systemClock.now();
  const blocker = !canPublish(detail.homeEdition)
    ? page.unavailable
    : canAdvance(detail, now)
      ? null
      : page.blocked;
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={page.title} lead={page.lead} />
      {blocker === null ? (
        <div className="lx-form">
          <Notice tone="warning" title={page.notice} />
          {homeConceptOnSite(detail, now) ? null : (
            <Notice tone="warning" title={text.homeConceptHiddenNotice} />
          )}
          <PublishHomeEditionForm homeEditionId={id} idempotencyKey={randomUUID()} />
        </div>
      ) : (
        <Notice tone="warning" title={blocker} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/retirada`: sai do site sem reabrir a definição material. */
export async function WithdrawHomeEditionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.withdrawHomeEdition;
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={page.title} lead={page.lead} />
      {canWithdraw(detail.homeEdition) ? (
        <div className="lx-form">
          <Notice tone="warning" title={page.notice} />
          <WithdrawHomeEditionForm homeEditionId={id} idempotencyKey={randomUUID()} />
        </div>
      ) : (
        <Notice tone="warning" title={page.unavailable} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/correcao-editorial`: nome e/ou descrição de Home Edition finalizada. */
export async function CorrectHomeEditionPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.correctHomeEdition;
  const { homeEdition } = detail;
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={page.title} lead={page.lead} />
      <KeyValues items={[{ label: text.nameLabel, value: homeEdition.name }]} />
      <ContentGroup label={text.descriptionLabel}>{homeEdition.description}</ContentGroup>
      {canCorrectEditorial(homeEdition) ? (
        <EditorialCorrectionForm homeEditionId={id} idempotencyKey={randomUUID()} />
      ) : (
        <Notice tone="warning" title={page.unavailable} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/second-homes/nova`: o registro é a aprovação comercial (BR-025). */
export async function NewSecondHomePage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = messages.newSecondHome;
  const now = systemClock.now();
  const current = detail.currentVersion;
  const valid = detail.investorAuthorizations.filter((authorization) =>
    authorizationCovers(authorization, detail.homeConcept.id, now),
  );
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={page.title} lead={page.lead} />
      {canRegisterSecondHome(detail, now) && current !== null ? (
        <div className="lx-form">
          <p className="lx-body">{page.currentVersion(current.version)}</p>
          <SecondHomeForm
            homeEditionId={detail.homeEdition.id}
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

/** `/admin/catalogo/second-homes/[id]`: Home Edition e versão fixadas, aprovação comercial e Investor. */
export async function SecondHomePage({
  id,
  status,
  actions,
}: {
  readonly id: string;
  readonly status: StatusKey | null;
  readonly actions?: ReactNode;
}) {
  const gate = await adminRoleGate(CATALOG_ROLE);
  if (gate.kind === 'blocked') return gate.page;
  if (!isRecordId(id)) return <CatalogNotFound session={gate.session} />;
  const detail = await readCatalog(gate.session, { type: 'second_home', id }, (tx) =>
    postgresCatalogReader.secondHome(tx, id),
  );
  if (detail === null) return <CatalogNotFound session={gate.session} />;
  const { secondHome, homeEdition, homeConcept, homeConceptVersion, investorAuthorization } =
    detail;
  const page = messages.secondHome;
  return (
    <CatalogPage session={gate.session}>
      <PageHeader
        actions={actions}
        title={secondHome.label}
        lead={`${homeConcept.title} · ${homeEdition.name}`}
        context={{ href: paths.homeEdition(homeEdition.id), label: homeEdition.name }}
      />
      <StatusNotice status={status} />
      <Section id="second-home-summary" title={page.summaryTitle}>
        <KeyValues
          items={[
            { label: page.homeEditionLabel, value: homeEdition.name },
            {
              label: page.homeConceptVersionLabel,
              value: text.versionValue(homeConceptVersion.version),
            },
            {
              label: page.approvedAtLabel,
              value: <Instant iso={secondHome.commerciallyApprovedAt.toISOString()} />,
            },
            { label: page.timezoneLabel, value: secondHome.timezone },
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
