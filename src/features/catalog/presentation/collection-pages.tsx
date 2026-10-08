import { randomUUID } from 'node:crypto';
import type { ReactElement } from 'react';
import { PageHeader, RecordList, type RecordListItem } from '@/design-system/react';
import { adminRoleGate, type ExercisedAdminSession } from '@/features/admin';
import { systemClock } from '@/features/platform';
import type { ConceptDetail, EditionDetail } from '../application/views';
import { isBrandInUse, type ConceptVersion } from '../domain/catalog';
import {
  basesForModality,
  CATALOG_TERM_KINDS,
  displayRenditions,
  FEATURED_MIN_HEIGHT,
  FEATURED_MIN_WIDTH,
  isCurrentValue,
  supportsFeatured,
  type CatalogTerm,
  type ConceptMedia,
  type EditionReferenceValue,
} from '../domain/collection';
import { runtimeMediaStorage } from '../infrastructure/media-storage';
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
  EndReferenceValueForm,
  MediaApprovalForm,
  MediaWithdrawalForm,
  ReferenceValueForm,
  TermEditForm,
  TermForm,
  type TermOptions,
} from './collection-forms';
import { CATALOG_ROLE } from './handlers';
import { collectionMessages } from './i18n/collection-pt-br';
import { messages } from './i18n/pt-br';
import { Instant } from './instant';
import { formatMoney } from './money';
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

/** Classificação e atributos de uma versão, para pré-preencher a versão nova. */
export function versionCollectionValues(version: ConceptVersion): Record<string, string> {
  const slots = (prefix: string, ids: readonly string[]) =>
    Object.fromEntries(ids.map((id, index) => [`${prefix}_${index + 1}`, id]));
  const number = (value: number | null) => (value === null ? '' : String(value));
  return {
    summary: version.attributes.summary ?? '',
    guests_max: number(version.attributes.guestsMax),
    suites: number(version.attributes.suites),
    built_area_m2: number(version.attributes.builtAreaM2),
    ...slots('lifestyle', version.lifestyleIds),
    ...slots('architectural_style', version.architecturalStyleIds),
  };
}

/** Classificação, resumo e atributos da versão (o que a Coleção mostra). */
export function VersionCollection({
  version,
  terms,
}: {
  readonly version: ConceptVersion;
  readonly terms: readonly CatalogTerm[];
}) {
  const label = (id: string) => terms.find((term) => term.id === id)?.label ?? id;
  const classification = [...version.lifestyleIds, ...version.architecturalStyleIds].map(label);
  const { summary, guestsMax, suites, builtAreaM2 } = version.attributes;
  return (
    <KeyValues
      items={[
        {
          label: text.versionFields.classificationLabel,
          value: classification.length === 0 ? text.versionFields.none : classification.join(' · '),
        },
        {
          label: text.versionFields.attributesLabel,
          value: text.versionFields.attributes(guestsMax, suites, builtAreaM2),
        },
        ...(summary === null ? [] : [{ label: text.versionFields.summaryLabel, value: summary }]),
      ]}
    />
  );
}

const cropLabel = (media: ConceptMedia) =>
  `${text.cover.cropX[media.cropX]} · ${text.cover.cropY[media.cropY]}`;

function mediaItems(detail: ConceptDetail): RecordListItem[] {
  return detail.media.map((media) => ({
    id: media.id,
    href: paths.media(detail.concept.id, media.id),
    title: media.alt,
    attributes: [
      { label: text.cover.stateLabel, value: text.cover.states[media.state] },
      { label: text.cover.sentLabel, value: <Instant iso={media.createdAt.toISOString()} /> },
    ],
  }));
}

/** Seção "Capa" da página do Concept: a vigente, o histórico e o envio. */
export function CoverSection({
  detail,
  inUse,
}: {
  readonly detail: ConceptDetail;
  readonly inUse: boolean;
}) {
  const current = detail.media.find((media) => media.state === 'approved') ?? null;
  return (
    <Section id="concept-cover" title={text.cover.sectionTitle}>
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
          <a className="lx-button lx-button--secondary" href={paths.newCover(detail.concept.id)}>
            {text.cover.upload}
          </a>
        </div>
      ) : null}
    </Section>
  );
}

/** Seção "Curadoria" da página do Concept. */
export function CurationSection({
  detail,
  inUse,
}: {
  readonly detail: ConceptDetail;
  readonly inUse: boolean;
}) {
  const curation = detail.curation;
  return (
    <Section id="concept-curation" title={text.curation.sectionTitle}>
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
          <a className="lx-button lx-button--secondary" href={paths.curation(detail.concept.id)}>
            {text.curation.edit}
          </a>
        </div>
      ) : null}
    </Section>
  );
}

function valueState(value: EditionReferenceValue, now: Date): string {
  if (now < value.validFrom) return text.referenceValues.future;
  return isCurrentValue(value, now) ? text.referenceValues.current : text.referenceValues.ended;
}

const endable = (value: EditionReferenceValue, now: Date) =>
  value.validUntil === null && value.validFrom < now;

/** Seção "Valores de referência" da página da Edition (BR-031, TECH-033). */
export function ReferenceValuesSection({
  detail,
  now,
  inUse,
}: {
  readonly detail: EditionDetail;
  readonly now: Date;
  readonly inUse: boolean;
}) {
  const page = text.referenceValues;
  return (
    <Section id="edition-reference-values" title={page.sectionTitle}>
      <p className="lx-body">{page.lead}</p>
      {detail.referenceValues.length === 0 ? (
        <Empty message={page.empty} />
      ) : (
        <RecordList
          label={page.sectionTitle}
          items={detail.referenceValues.map((value) => ({
            id: value.id,
            title: `${page.bases[value.basis]} — ${formatMoney(value.amountMinor, value.currency)}`,
            ...(endable(value, now)
              ? { href: paths.referenceValueEnd(detail.edition.id, value.id) }
              : {}),
            attributes: [
              { label: page.stateLabel, value: valueState(value, now) },
              {
                label: page.validFromLabel,
                value: <Instant iso={value.validFrom.toISOString()} />,
              },
              {
                label: page.validUntilLabel,
                value:
                  value.validUntil === null ? (
                    page.noEnd
                  ) : (
                    <Instant iso={value.validUntil.toISOString()} />
                  ),
              },
            ],
          }))}
        />
      )}
      {inUse ? (
        <div>
          <a
            className="lx-button lx-button--secondary"
            href={paths.newReferenceValue(detail.edition.id)}
          >
            {page.new}
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

type ConceptLoaded = {
  readonly session: ExercisedAdminSession;
  readonly detail: ConceptDetail;
  readonly preview: Preview | null;
};

interface Preview {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/** Concept (+ a pré-visualização de uma capa) numa só leitura auditada. */
async function loadConcept(
  id: string,
  previewMediaId: string | null = null,
): Promise<ConceptLoaded | { readonly page: ReactElement }> {
  const access = await gate();
  if ('page' in access) return access;
  const ids = previewMediaId === null ? [id] : [id, previewMediaId];
  if (!ids.every(isRecordId)) return { page: <CatalogNotFound session={access.session} /> };
  const { detail, rendition } = await readCatalog(
    access.session,
    { type: 'concept', id },
    async (tx) => ({
      detail: await reader.concept(tx, id),
      rendition: previewMediaId === null ? null : await reader.mediaPreview(tx, previewMediaId),
    }),
  );
  if (detail === null) return { page: <CatalogNotFound session={access.session} /> };
  // Bytes do Storage, fora da transação; a CSP admite `img-src data:` — nenhuma rota nem URL pública para pendentes.
  const bytes = rendition === null ? null : await runtimeMediaStorage.get(rendition.storageKey);
  const preview =
    rendition === null || bytes === null
      ? null
      : {
          src: `data:${rendition.contentType};base64,${Buffer.from(bytes).toString('base64')}`,
          width: rendition.width,
          height: rendition.height,
        };
  return { session: access.session, detail, preview };
}

function ConceptContextHeader({
  detail,
  title,
  lead,
}: {
  readonly detail: ConceptDetail;
  readonly title: string;
  readonly lead: string;
}) {
  return (
    <PageHeader
      title={title}
      lead={lead}
      context={{ href: paths.concept(detail.concept.id), label: detail.concept.title }}
    />
  );
}

/** `/admin/catalogo/concepts/[id]/capas/nova`. */
export async function NewCoverPage({ id }: { readonly id: string }) {
  const loaded = await loadConcept(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  return (
    <CatalogPage session={session}>
      <ConceptContextHeader detail={detail} title={text.cover.newTitle} lead={text.cover.newLead} />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <CoverForm conceptId={id} idempotencyKey={randomUUID()} />
      ) : (
        <Notice tone="warning" title={text.cover.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/concepts/[id]/capas/[mediaId]`: pré-visualização, aprovação e retirada. */
export async function MediaPage({
  id,
  mediaId,
  status,
}: {
  readonly id: string;
  readonly mediaId: string;
  readonly status: StatusKey | null;
}) {
  const loaded = await loadConcept(id, mediaId);
  if ('page' in loaded) return loaded.page;
  const { session, detail, preview } = loaded;
  const media = detail.media.find((candidate) => candidate.id === mediaId);
  if (media === undefined) return <CatalogNotFound session={session} />;
  const page = text.cover;
  const inUse = isBrandInUse(detail.partner, systemClock.now());
  return (
    <CatalogPage session={session}>
      <ConceptContextHeader
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
            <MediaApprovalForm conceptId={id} mediaId={media.id} idempotencyKey={randomUUID()} />
          </div>
        </Section>
      ) : null}
      <Section id="media-withdraw" title={page.withdrawTitle}>
        {media.state === 'withdrawn' ? (
          <Notice tone="warning" title={page.closed} />
        ) : (
          <div className="lx-form">
            <Notice tone="warning" title={page.withdrawNotice} />
            <MediaWithdrawalForm conceptId={id} mediaId={media.id} idempotencyKey={randomUUID()} />
          </div>
        )}
      </Section>
    </CatalogPage>
  );
}

/** `/admin/catalogo/concepts/[id]/curadoria`. */
export async function CurationPage({ id }: { readonly id: string }) {
  const loaded = await loadConcept(id);
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
      <ConceptContextHeader detail={detail} title={page.title} lead={page.lead} />
      {coverNote === null ? null : <Notice tone="warning" title={coverNote} />}
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <CurationForm
          conceptId={id}
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

type EditionLoaded = { readonly session: ExercisedAdminSession; readonly detail: EditionDetail };

async function loadEdition(id: string): Promise<EditionLoaded | { readonly page: ReactElement }> {
  const access = await gate();
  if ('page' in access) return access;
  if (!isRecordId(id)) return { page: <CatalogNotFound session={access.session} /> };
  const detail = await readCatalog(access.session, { type: 'edition', id }, (tx) =>
    reader.edition(tx, id),
  );
  if (detail === null) return { page: <CatalogNotFound session={access.session} /> };
  return { session: access.session, detail };
}

function EditionContextHeader({
  detail,
  title,
  lead,
}: {
  readonly detail: EditionDetail;
  readonly title: string;
  readonly lead: string;
}) {
  return (
    <PageHeader
      title={title}
      lead={lead}
      context={{
        href: paths.edition(detail.edition.id),
        label: messages.edition.title(detail.concept.title, detail.edition.region),
      }}
    />
  );
}

/** `/admin/catalogo/editions/[id]/valores/novo`. */
export async function NewReferenceValuePage({ id }: { readonly id: string }) {
  const loaded = await loadEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const page = text.referenceValues;
  return (
    <CatalogPage session={session}>
      <EditionContextHeader detail={detail} title={page.newTitle} lead={page.newLead} />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <ReferenceValueForm
          editionId={id}
          bases={basesForModality(detail.edition.modality)}
          idempotencyKey={randomUUID()}
        />
      ) : (
        <Notice tone="warning" title={page.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/editions/[id]/valores/[valueId]/encerramento` (irreversível). */
export async function EndReferenceValuePage({
  id,
  valueId,
}: {
  readonly id: string;
  readonly valueId: string;
}) {
  const loaded = await loadEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const value = detail.referenceValues.find((candidate) => candidate.id === valueId);
  if (value === undefined) return <CatalogNotFound session={session} />;
  const page = text.referenceValues;
  const now = systemClock.now();
  return (
    <CatalogPage session={session}>
      <EditionContextHeader detail={detail} title={page.endTitle} lead={page.endLead} />
      <KeyValues
        items={[
          { label: page.basisLabel, value: page.bases[value.basis] },
          { label: page.amountLabel, value: formatMoney(value.amountMinor, value.currency) },
          { label: page.stateLabel, value: valueState(value, now) },
        ]}
      />
      {endable(value, now) ? (
        <EndReferenceValueForm editionId={id} valueId={value.id} idempotencyKey={randomUUID()} />
      ) : (
        <Notice tone="warning" title={page.endUnavailable} />
      )}
    </CatalogPage>
  );
}
