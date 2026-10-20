import { randomUUID } from 'node:crypto';
import { RecordList } from '@/design-system/react';
import { systemClock } from '@/features/platform';
import type { HomeEditionDetail } from '../application/views';
import { isBrandInUse } from '../domain/catalog';
import { isCurrentValue, type HomeEditionProjectedInvestment } from '../domain/collection';
import {
  CatalogNotFound,
  CatalogPage,
  ContentGroup,
  Empty,
  KeyValues,
  Section,
  StatusNotice,
} from './catalog-page';
import { EndProjectedInvestmentForm, ProjectedInvestmentForm } from './collection-forms';
import { cropLabel } from './collection-pages';
import {
  HomeEditionMediaApprovalForm,
  HomeEditionMediaForm,
  HomeEditionMediaWithdrawalForm,
} from './home-edition-forms';
import { HomeEditionContextHeader, loadHomeEdition } from './home-edition-load';
import { collectionMessages } from './i18n/collection-pt-br';
import { Instant } from './instant';
import { formatMoney } from './money';
import { Notice } from './notice';
import { paths, type StatusKey } from './paths';

/** Mídia e média projetada da Home Edition no Admin (spec catalog §17.3, §17.4): escrita só pelos commands. */
const media = collectionMessages.homeEditionMedia;
const investment = collectionMessages.projectedInvestment;

/** Seção "Mídia" da página da Home Edition: imagens, renders e plantas, com o envio. */
export function HomeEditionMediaSection({
  detail,
  inUse,
}: {
  readonly detail: HomeEditionDetail;
  readonly inUse: boolean;
}) {
  const id = detail.homeEdition.id;
  return (
    <Section id="home-edition-media" title={media.sectionTitle}>
      <p className="lx-body">{media.lead}</p>
      {detail.media.length === 0 ? (
        <Empty message={media.empty} />
      ) : (
        <RecordList
          label={media.sectionTitle}
          items={detail.media.map((item) => ({
            id: item.id,
            href: paths.homeEditionMedia(id, item.id),
            title: item.alt,
            attributes: [
              { label: media.kindLabel, value: media.kinds[item.kind] },
              { label: media.stateLabel, value: media.states[item.state] },
              { label: media.sentLabel, value: <Instant iso={item.createdAt.toISOString()} /> },
            ],
          }))}
        />
      )}
      {inUse ? (
        <div>
          <a className="lx-button lx-button--secondary" href={paths.newHomeEditionMedia(id)}>
            {media.upload}
          </a>
        </div>
      ) : null}
    </Section>
  );
}

/** `/admin/catalogo/home-editions/[id]/midia/nova`. */
export async function NewHomeEditionMediaPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader detail={detail} title={media.newTitle} lead={media.newLead} />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <HomeEditionMediaForm homeEditionId={id} idempotencyKey={randomUUID()} />
      ) : (
        <Notice tone="warning" title={media.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/midia/[mediaId]`: pré-visualização, aprovação e retirada. */
export async function HomeEditionMediaPage({
  id,
  mediaId,
  status,
}: {
  readonly id: string;
  readonly mediaId: string;
  readonly status: StatusKey | null;
}) {
  const loaded = await loadHomeEdition(id, mediaId);
  if ('page' in loaded) return loaded.page;
  const { session, detail, preview } = loaded;
  const item = detail.media.find((candidate) => candidate.id === mediaId);
  if (item === undefined) return <CatalogNotFound session={session} />;
  const inUse = isBrandInUse(detail.partner, systemClock.now());
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader
        detail={detail}
        title={media.detailTitle(media.kinds[item.kind])}
        lead={media.states[item.state]}
      />
      <StatusNotice status={status} />
      <Section id="media-preview" title={media.previewLabel}>
        {preview === null ? null : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização `data:` (ADR-0015); Next/Image injeta estilo inline barrado pela CSP. */}
            <img src={preview.src} alt={item.alt} width={preview.width} height={preview.height} />
          </>
        )}
        <KeyValues
          items={[
            { label: media.kindLabel, value: media.kinds[item.kind] },
            { label: media.altLabel, value: item.alt },
            ...(item.credit === null ? [] : [{ label: media.creditLabel, value: item.credit }]),
            { label: media.focusLabel, value: cropLabel(item) },
            { label: media.sentLabel, value: <Instant iso={item.createdAt.toISOString()} /> },
          ]}
        />
        {item.withdrawal === null ? null : (
          <ContentGroup label={media.basisLabel}>{item.withdrawal.basis}</ContentGroup>
        )}
      </Section>
      {item.state === 'pending' && inUse ? (
        <Section id="media-approve" title={media.approveTitle}>
          <div className="lx-form">
            <Notice tone="warning" title={media.approveNotice} />
            <HomeEditionMediaApprovalForm
              homeEditionId={id}
              mediaId={item.id}
              idempotencyKey={randomUUID()}
            />
          </div>
        </Section>
      ) : null}
      <Section id="media-withdraw" title={media.withdrawTitle}>
        {item.state === 'withdrawn' ? (
          <Notice tone="warning" title={media.closed} />
        ) : (
          <div className="lx-form">
            <Notice tone="warning" title={media.withdrawNotice} />
            <HomeEditionMediaWithdrawalForm
              homeEditionId={id}
              mediaId={item.id}
              idempotencyKey={randomUUID()}
            />
          </div>
        )}
      </Section>
    </CatalogPage>
  );
}

function investmentState(value: HomeEditionProjectedInvestment, now: Date): string {
  if (now < value.validFrom) return investment.future;
  return isCurrentValue(value, now) ? investment.current : investment.ended;
}

const endable = (value: HomeEditionProjectedInvestment, now: Date) =>
  value.validUntil === null && value.validFrom < now;

/** Seção "Média projetada de investimento" da página da Home Edition (BR-034, TECH-033). */
export function ProjectedInvestmentSection({
  detail,
  now,
  inUse,
}: {
  readonly detail: HomeEditionDetail;
  readonly now: Date;
  readonly inUse: boolean;
}) {
  const id = detail.homeEdition.id;
  return (
    <Section id="home-edition-projected-investments" title={investment.sectionTitle}>
      <p className="lx-body">{investment.lead}</p>
      {detail.projectedInvestments.length === 0 ? (
        <Empty message={investment.empty} />
      ) : (
        <RecordList
          label={investment.sectionTitle}
          items={detail.projectedInvestments.map((value) => ({
            id: value.id,
            title: formatMoney(value.amountMinor, value.currency),
            ...(endable(value, now) ? { href: paths.projectedInvestmentEnd(id, value.id) } : {}),
            attributes: [
              { label: investment.stateLabel, value: investmentState(value, now) },
              {
                label: investment.validFromLabel,
                value: <Instant iso={value.validFrom.toISOString()} />,
              },
              {
                label: investment.validUntilLabel,
                value:
                  value.validUntil === null ? (
                    investment.noEnd
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
          <a className="lx-button lx-button--secondary" href={paths.newProjectedInvestment(id)}>
            {investment.new}
          </a>
        </div>
      ) : null}
    </Section>
  );
}

/** `/admin/catalogo/home-editions/[id]/media-projetada/nova`. */
export async function NewProjectedInvestmentPage({ id }: { readonly id: string }) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader
        detail={detail}
        title={investment.newTitle}
        lead={investment.newLead}
      />
      {isBrandInUse(detail.partner, systemClock.now()) ? (
        <ProjectedInvestmentForm homeEditionId={id} idempotencyKey={randomUUID()} />
      ) : (
        <Notice tone="warning" title={investment.blocked} />
      )}
    </CatalogPage>
  );
}

/** `/admin/catalogo/home-editions/[id]/media-projetada/[investmentId]/encerramento` (irreversível). */
export async function EndProjectedInvestmentPage({
  id,
  investmentId,
}: {
  readonly id: string;
  readonly investmentId: string;
}) {
  const loaded = await loadHomeEdition(id);
  if ('page' in loaded) return loaded.page;
  const { session, detail } = loaded;
  const value = detail.projectedInvestments.find((candidate) => candidate.id === investmentId);
  if (value === undefined) return <CatalogNotFound session={session} />;
  const now = systemClock.now();
  return (
    <CatalogPage session={session}>
      <HomeEditionContextHeader
        detail={detail}
        title={investment.endTitle}
        lead={investment.endLead}
      />
      <KeyValues
        items={[
          { label: investment.amountLabel, value: formatMoney(value.amountMinor, value.currency) },
          { label: investment.stateLabel, value: investmentState(value, now) },
        ]}
      />
      {endable(value, now) ? (
        <EndProjectedInvestmentForm
          homeEditionId={id}
          investmentId={value.id}
          idempotencyKey={randomUUID()}
        />
      ) : (
        <Notice tone="warning" title={investment.endUnavailable} />
      )}
    </CatalogPage>
  );
}
