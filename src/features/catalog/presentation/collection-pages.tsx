import { randomUUID } from 'node:crypto';
import type { ReactElement } from 'react';
import { PageHeader, RecordList, type RecordListItem } from '@/design-system/react';
import { adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import { systemClock } from '@/features/platform';
import type { HomeConceptDetail } from '../application/views';
import { isBrandInUse, type HomeConceptVersion } from '../domain/catalog';
import {
  CATALOG_TERM_KINDS,
  displayRenditions,
  FEATURED_MIN_HEIGHT,
  FEATURED_MIN_WIDTH,
  supportsFeatured,
  type CatalogTerm,
  type CropStep,
} from '../domain/collection';
import { postgresCatalogReader as reader } from '../infrastructure/postgres-catalog-reader';
import {
  CatalogNotFound,
  CatalogPage,
  ContentGroup,
  Empty,
  isRecordId,
  KeyValues,
  Section,
  StatusNotice,
} from './catalog-page';
import { readCatalog } from './catalog-read';
import {
  CoverForm,
  CurationForm,
  MediaApprovalForm,
  MediaWithdrawalForm,
  TermEditForm,
  TermForm,
  type TermOptions,
} from './collection-forms';
import { CATALOG_ROLE } from './handlers';
import { collectionMessages } from './i18n/collection-pt-br';
import { messages } from './i18n/pt-br';
import { Instant } from './instant';
import { previewOf, type Preview } from './media-preview';
import { Notice } from './notice';
import { paths, type StatusKey } from './paths';

/** Telas do Admin da Coleção (spec catalog §13.12): leitura auditada (`admin_read`), escrita só pelos commands. */
const text = collectionMessages;

type Gate = { readonly session: ExercisedAdminSession } | { readonly page: ReactElement };

async function gate(): Promise<Gate> {
  const result = await adminRoleGate(CATALOG_ROLE);
  return result.kind === 'blocked' ? { page: result.page } : { session: result.session };
}

/** Termos ativos de cada vocabulário, como opções das seleções da versão. */
export function termOptions(terms: readonly CatalogTerm[]): TermOptions {
  const of = (kind: CatalogTerm['kind']) =>
    terms
      .filter((term) => term.kind === kind && term.active)
      .map((term) => ({ value: term.id, label: term.label }));
  return { lifestyle: of('lifestyle'), architectural_style: of('architectural_style') };
}

/** Classificação e resumo de uma versão, para pré-preencher a versão nova. */
export function versionCollectionValues(version: HomeConceptVersion): Record<string, string> {
  const slots = (prefix: string, ids: readonly string[]) =>
    Object.fromEntries(ids.map((id, index) => [`${prefix}_${index + 1}`, id]));
  return {
    summary: version.attributes.summary ?? '',
    ...slots('lifestyle', version.lifestyleIds),
    ...slots('architectural_style', version.architecturalStyleIds),
  };
}

/** Classificação e resumo da versão (o que a Coleção mostra do Home Concept). */
export function VersionCollection({
  version,
  terms,
}: {
  readonly version: HomeConceptVersion;
  readonly terms: readonly CatalogTerm[];
}) {
  const label = (id: string) => terms.find((term) => term.id === id)?.label ?? id;
  const classification = [...version.lifestyleIds, ...version.architecturalStyleIds].map(label);
  const { summary } = version.attributes;
  return (
    <KeyValues
      items={[
        {
          label: text.versionFields.classificationLabel,
          value: classification.length === 0 ? text.versionFields.none : classification.join(' · '),
        },
        ...(summary === null ? [] : [{ label: text.versionFields.summaryLabel, value: summary }]),
      ]}
    />
  );
}

/** Foco de uma mídia ("Centro · Topo"), da capa ou da mídia da Home Edition. */
export const cropLabel = (media: { readonly cropX: CropStep; readonly cropY: CropStep }) =>
  `${text.cover.cropX[media.cropX]} · ${text.cover.cropY[media.cropY]}`;

function mediaItems(detail: HomeConceptDetail): RecordListItem[] {
  return detail.media.map((media) => ({
    id: media.id,
    href: paths.media(detail.homeConcept.id, media.id),
    title: media.alt,
    attributes: [
      { label: text.cover.stateLabel, value: text.cover.states[media.state] },
      { label: text.cover.sentLabel, value: <Instant iso={media.createdAt.toISOString()} /> },
    ],
  }));
}

/** Seção "Capa" da página do Home Concept: a vigente, o histórico e o envio. */
export function CoverSection({
  detail,
  inUse,
}: {
  readonly detail: HomeConceptDetail;
  readonly inUse: boolean;
}) {
  const current = detail.media.find((media) => media.state === 'approved') ?? null;
  return (
    <Section id="home-concept-cover" title={text.cover.sectionTitle}>
      {current === null ? (
        <Empty message={text.cover.noCurrent} />
      ) : (
        <KeyValues
          items={[
            { label: text.cover.current, value: current.alt },
            { label: text.cover.focusLabel, value: cropLabel(current) },
          ]}
        />
      )}
      {detail.media.length === 0 ? null : (
        <RecordList label={text.cover.historyLabel} items={mediaItems(detail)} />
      )}
      {inUse ? (
        <div>
          <a
            className="lx-button lx-button--secondary"
            href={paths.newCover(detail.homeConcept.id)}
          >
            {text.cover.upload}
          </a>
        </div>
      ) : null}
    </Section>
  );
}

/** Seção "Curadoria" da página do Home Concept. */
export function CurationSection({
  detail,
  inUse,
}: {
  readonly detail: HomeConceptDetail;
  readonly inUse: boolean;
}) {
  const curation = detail.curation;
  return (
    <Section id="home-concept-curation" title={text.curation.sectionTitle}>
      <KeyValues
        items={[
          {
            label: text.curation.rankLabel,
            value: curation?.rank ?? text.curation.noRank,
          },
          {
            label: text.curation.featuredLabel,
            value: curation?.featured === true ? text.curation.featured : text.curation.notFeatured,
          },
        ]}
      />
      {inUse ? (
        <div>
          <a
            className="lx-button lx-button--secondary"
            href={paths.curation(detail.homeConcept.id)}
          >
            {text.curation.edit}
          </a>
        </div>
      ) : null}
    </Section>
  );
}

/** `/admin/catalogo/vocabularios`: os dois vocabulários e o registro de termo. */
export async function VocabularyPage({ status }: { readonly status: StatusKey | null }) {
  const access = await gate();
  if ('page' in access) return access.page;
  const terms = await readCatalog(access.session, { type: 'catalog_term', id: '*' }, (tx) =>
    reader.terms(tx),
  );
  const page = text.vocabulary;
  return (
    <CatalogPage session={access.session}>
      <PageHeader
        title={page.title}
        lead={page.lead}
        context={{ href: paths.catalog, label: messages.catalog.title }}
      />
      <StatusNotice status={status} />
      {CATALOG_TERM_KINDS.map((kind) => {
        const ofKind = terms.filter((term) => term.kind === kind);
        return (
          <Section key={kind} id={`vocabulary-${kind}`} title={page.kinds[kind]}>
            {ofKind.length === 0 ? (
              <Empty message={page.empty} />
            ) : (
              <RecordList
                label={page.kinds[kind]}
                items={ofKind.map((term) => ({
                  id: term.id,
                  href: paths.term(term.id),
                  title: term.label,
                  attributes: [
                    { label: page.slugLabel, value: term.slug },
                    { label: page.stateLabel, value: term.active ? page.active : page.inactive },
                  ],
                }))}
              />
            )}
          </Section>
        );
      })}
      <Section id="vocabulary-new" title={page.newTitle}>
        <TermForm idempotencyKey={randomUUID()} />
      </Section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/vocabularios/[id]`: renomear ou desativar. */
export async function TermPage({ id }: { readonly id: string }) {
  const access = await gate();
  if ('page' in access) return access.page;
  if (!isRecordId(id)) return <CatalogNotFound session={access.session} />;
  const terms = await readCatalog(access.session, { type: 'catalog_term', id }, (tx) =>
    reader.terms(tx),
  );
  const term = terms.find((candidate) => candidate.id === id);
  if (term === undefined) return <CatalogNotFound session={access.session} />;
  const page = text.vocabulary;
  return (
    <CatalogPage session={access.session}>
      <PageHeader
        title={page.editTitle(term.label)}
        lead={page.editLead}
        context={{ href: paths.vocabulary(), label: page.title }}
      />
      <KeyValues
        items={[
          { label: page.kindLabel, value: page.kinds[term.kind] },
          { label: page.slugLabel, value: term.slug },
        ]}
      />
      <TermEditForm
        termId={term.id}
        label={term.label}
        active={term.active}
        idempotencyKey={randomUUID()}
      />
    </CatalogPage>
  );
}

type HomeConceptLoaded = {
  readonly session: ExercisedAdminSession;
  readonly detail: HomeConceptDetail;
  readonly preview: Preview | null;
};

/** Home Concept (+ a pré-visualização de uma capa) numa só leitura auditada. */
async function loadHomeConcept(
  id: string,
  previewMediaId: string | null = null,
): Promise<HomeConceptLoaded | { readonly page: ReactElement }> {
  const access = await gate();
  if ('page' in access) return access;
  const ids = previewMediaId === null ? [id] : [id, previewMediaId];
  if (!ids.every(isRecordId)) return { page: <CatalogNotFound session={access.session} /> };
  const { detail, rendition } = await readCatalog(
    access.session,
    { type: 'home_concept', id },
    async (tx) => ({
      detail: await reader.homeConcept(tx, id),
      rendition: previewMediaId === null ? null : await reader.mediaPreview(tx, previewMediaId),
    }),
  );
  if (detail === null) return { page: <CatalogNotFound session={access.session} /> };
  return { session: access.session, detail, preview: await previewOf(rendition) };
}

function HomeConceptContextHeader({
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

/** `/admin/catalogo/home-concepts/[id]/capas/nova`. */
export async function NewCoverPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  return (
    <CatalogPage session={session}>
      <HomeConceptContextHeader
        detail={detail}
        title={text.cover.newTitle}
        lead={text.cover.newLead}
      />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <CoverForm homeConceptId={id} idempotencyKey={randomUUID()} />
      ) : (
        <Notice tone="warning" title={text.cover.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-concepts/[id]/capas/[mediaId]`: pré-visualização, aprovação e retirada. */
export async function MediaPage({
  id,
  mediaId,
  status,
}: {
  readonly id: string;
  readonly mediaId: string;
  readonly status: StatusKey | null;
}) {
  const loaded = await loadHomeConcept(id, mediaId);
  if ('page' in loaded) return loaded.page;
  const { session, detail, preview } = loaded;
  const media = detail.media.find((candidate) => candidate.id === mediaId);
  if (media === undefined) return <CatalogNotFound session={session} />;
  const page = text.cover;
  const inUse = isBrandInUse(detail.partner, systemClock.now());
  return (
    <CatalogPage session={session}>
      <HomeConceptContextHeader
        detail={detail}
        title={page.detailTitle}
        lead={page.states[media.state]}
      />
      <StatusNotice status={status} />
      <Section id="media-preview" title={page.previewLabel}>
        {preview === null ? null : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização `data:` (ADR-0015); Next/Image injeta estilo inline barrado pela CSP. */}
            <img src={preview.src} alt={media.alt} width={preview.width} height={preview.height} />
          </>
        )}
        <KeyValues
          items={[
            { label: page.altLabel, value: media.alt },
            ...(media.credit === null ? [] : [{ label: page.creditLabel, value: media.credit }]),
            { label: page.focusLabel, value: cropLabel(media) },
            {
              label: page.sizesLabel,
              value: page.sizes(
                media.renditions.map(
                  (r) =>
                    `${r.role === 'master' ? page.masterLabel : page.displayLabel} ${r.width} × ${r.height} px`,
                ),
              ),
            },
            {
              label: page.usageLabel,
              value: supportsFeatured(displayRenditions(media))
                ? page.usageFeatured
                : page.usageCardOnly(FEATURED_MIN_WIDTH, FEATURED_MIN_HEIGHT),
            },
            { label: page.sentLabel, value: <Instant iso={media.createdAt.toISOString()} /> },
          ]}
        />
        {media.withdrawal === null ? null : (
          <ContentGroup label={page.basisLabel}>{media.withdrawal.basis}</ContentGroup>
        )}
      </Section>
      {media.state === 'pending' && inUse ? (
        <Section id="media-approve" title={page.approveTitle}>
          <div className="lx-form">
            <Notice tone="warning" title={page.approveNotice} />
            <MediaApprovalForm
              homeConceptId={id}
              mediaId={media.id}
              idempotencyKey={randomUUID()}
            />
          </div>
        </Section>
      ) : null}
      <Section id="media-withdraw" title={page.withdrawTitle}>
        {media.state === 'withdrawn' ? (
          <Notice tone="warning" title={page.closed} />
        ) : (
          <div className="lx-form">
            <Notice tone="warning" title={page.withdrawNotice} />
            <MediaWithdrawalForm
              homeConceptId={id}
              mediaId={media.id}
              idempotencyKey={randomUUID()}
            />
          </div>
        )}
      </Section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-concepts/[id]/curadoria`. */
export async function CurationPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = text.curation;
  const cover = detail.media.find((media) => media.state === 'approved') ?? null;
  const coverNote =
    cover === null
      ? page.noCover
      : supportsFeatured(displayRenditions(cover))
        ? null
        : page.coverTooSmall(FEATURED_MIN_WIDTH, FEATURED_MIN_HEIGHT);
  return (
    <CatalogPage session={session}>
      <HomeConceptContextHeader detail={detail} title={page.title} lead={page.lead} />
      {coverNote === null ? null : <Notice tone="warning" title={coverNote} />}
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <CurationForm
          homeConceptId={id}
          rank={detail.curation?.rank ?? null}
          featured={detail.curation?.featured ?? false}
          idempotencyKey={randomUUID()}
        />
      ) : (
        <Notice tone="warning" title={page.blocked} />
      )}
    </CatalogPage>
  );
}
