import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader, RecordList } from '@/design-system/react';
import { AuthUnavailable, TitularShell, requireTitularSession } from '@/features/identity';
import { getDatabase, unavailableKeys, withUserRead } from '@/features/platform';
import { BOOKING_SECTIONS } from '../application/own-use-booking-sections';
import {
  cancellationPreview,
  termsChange,
  type CancellationPreview,
  type PreviewNight,
  type SubmittedTerms,
  type TermsChange,
} from '../application/own-use-cancellation-preview';
import { microsFromMillis, type CancellationClass } from '../domain/own-use-lifecycle';
import { bookingLabels, bookingsMessages, notificationMessages } from './i18n/own-use-pt-br';
import {
  bookingDetailMessages as detailText,
  bookingListMessages as listText,
  cancellationMessages as text,
  exceptionMessages,
  lifecycleLabels,
  lifecycleNotificationMessages,
  nightsText,
} from './i18n/own-use-lifecycle-pt-br';
import { OwnUseCancelForm } from './own-use-cancel-form';
import {
  civilToday,
  dateFromMicros,
  dateList,
  dayMonth,
  fullDate,
  instantIn,
  listRange,
  nightsBetween,
  periodRange,
  shortDate,
  shortInstantIn,
} from './own-use-lifecycle-format';
import {
  readTitularBooking,
  readTitularBookingList,
  readTitularCancellation,
  type TitularBookingDetail,
} from './own-use-lifecycle-read';
import { notificationCopy } from './own-use-notification-copy';
import { ownUsePaths } from './own-use-paths';
import { Disclosure, Facts, Message, Section } from './own-use-ui';

/**
 * Telas do ciclo da reserva na Área do Titular (W13 E4b; spec booking §10.15; referência visual E4a v2.1): lista por
 * seção, detalhe com imóvel/situação/período no cabeçalho, prévia do cancelamento pela consequência e central de avisos.
 * Toda regra vem do servidor (leituras e `cancellationPreview`); aqui só composição de `lx-*` existentes.
 */
const AREA = '/titular';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;
const param = (params: SearchParams, name: string) => {
  const value = params[name];
  return typeof value === 'string' ? value : null;
};

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

const nightsOf = (booking: TitularBookingDetail) => booking.nights.length;
const typeOf = (booking: { readonly channel: string; readonly modality: 'owner' | 'co_owner' }) =>
  bookingLabels.channel(booking.channel, booking.modality) ?? bookingLabels.missing;
const bucketParts = (nights: readonly PreviewNight[]) =>
  (['alta', 'media', 'leap'] as const).flatMap((bucket) => {
    const count = nights.filter((night) => night.bucket === bucket).length;
    return count === 0 ? [] : [`${lifecycleLabels.buckets[bucket]} ${count}`];
  });
const previewOf = (booking: TitularBookingDetail, now: Date): CancellationPreview =>
  cancellationPreview({
    modality: booking.modality,
    state: booking.state,
    exceptionType: booking.exception?.type ?? null,
    nights: booking.nights,
    balances: booking.balances,
    lifecycleOpen: booking.lifecycleOpen,
    at: microsFromMillis(now.getTime()),
  });

/** Aviso fixo da exceção aberta (sem `role`: não é região viva). */
function ExceptionNotice({
  booking,
  preview,
}: {
  readonly booking: TitularBookingDetail;
  readonly preview: CancellationPreview;
}) {
  const exception = booking.exception;
  if (exception === null || preview.kind === 'suspended') return null;
  if (exception.type === 'operational')
    return (
      <Message
        kind="info"
        title={exceptionMessages.operationalTitle(
          fullDate(civilToday(exception.openedAt, booking.timezone)),
          lifecycleLabels.reasons[exception.reason ?? ''] ?? '',
        )}
        body={
          booking.modality === 'owner'
            ? exceptionMessages.operationalBodyOwner
            : exceptionMessages.operationalBody
        }
      />
    );
  return (
    <Message
      kind="info"
      title={exceptionMessages.reviewTitle(
        fullDate(civilToday(exception.openedAt, booking.timezone)),
      )}
      body={
        booking.modality === 'owner'
          ? exceptionMessages.reviewBodyOwner
          : exceptionMessages.reviewBodyCoOwner
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------------------------------------------

/** `/titular/reservas`: seções pelo período e pela transição registrada; situação sempre a gravada (REQ-096). */
export async function TitularBookingListPage() {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const items = await orUnavailable(() => readTitularBookingList(session.userId));
  if (items === 'unavailable') return <AuthUnavailable />;
  const text = bookingsMessages;
  return (
    <TitularShell>
      <PageHeader
        title={text.title}
        lead={text.lead}
        context={{ href: AREA, label: text.backToArea }}
      />
      {items.length === 0 ? (
        <Section id="titular-bookings" title={text.title} hidden>
          <p className="lx-body">{text.empty}</p>
        </Section>
      ) : (
        BOOKING_SECTIONS.map((section) => {
          const rows = items.filter((item) => item.section === section);
          if (rows.length === 0) return null;
          const title = lifecycleLabels.sections[section];
          return (
            <Section key={section} id={`reservas-${section}`} title={title}>
              <RecordList
                label={title}
                items={rows.map((row) => ({
                  id: row.id,
                  href: ownUsePaths.booking(row.id),
                  title: row.label,
                  attributes: [
                    {
                      label: listText.period,
                      value: listText.periodValue(
                        listRange(row.checkinDate, row.checkoutDate),
                        nightsBetween(row.checkinDate, row.checkoutDate),
                      ),
                    },
                    { label: listText.state, value: lifecycleLabels.display[row.display] },
                    { label: listText.type, value: typeOf(row) },
                  ],
                }))}
              />
            </Section>
          );
        })
      )}
    </TitularShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------------------------------------------

function CancelledNotice({ booking }: { readonly booking: TitularBookingDetail }) {
  const n = booking.releasedNights;
  const body =
    booking.modality === 'owner'
      ? detailText.cancelledOwner(n)
      : booking.cancellationClass === 'timely'
        ? detailText.cancelledTimely(n)
        : detailText.cancelledLate(n);
  return <Message kind="success" title={detailText.cancelledTitle} body={body} live="status" />;
}

function CancellationSection({
  booking,
  preview,
}: {
  readonly booking: TitularBookingDetail;
  readonly preview: CancellationPreview;
}) {
  if (booking.state === 'cancelled') {
    const rows: (readonly [string, ReactNode])[] = [];
    if (booking.cancelledAt !== null)
      rows.push([
        detailText.cancelledAt,
        `${shortInstantIn(booking.cancelledAt, booking.timezone)} ${lifecycleLabels.local}`,
      ]);
    if (booking.cancellationClass !== null)
      rows.push([
        detailText.classification,
        booking.cancellationClass === 'timely' ? detailText.classTimely : detailText.classLate,
      ]);
    rows.push([detailText.releasedNights, String(booking.releasedNights)]);
    return (
      <Section id="cancelamento" title={detailText.cancellation}>
        <div className="lx-booking__rights">
          <Facts rows={rows} />
        </div>
      </Section>
    );
  }
  if (preview.kind === 'not_cancellable') return null;
  if (preview.kind === 'suspended')
    return (
      <Section id="proximo-passo" title={detailText.nextStep}>
        <p className="lx-body">{detailText.suspendedNext}</p>
        <p className="lx-body">
          <a className="lx-button lx-button--secondary" href={ownUsePaths.notifications}>
            {detailText.viewNotifications}
          </a>
        </p>
      </Section>
    );
  if (preview.kind === 'nothing_left')
    return (
      <Section id="cancelamento" title={detailText.cancellation}>
        <p className="lx-body">
          {text.nothingLeftTitle}. {text.nothingLeftBody}
        </p>
      </Section>
    );
  const deadline =
    preview.timelyUntil === null
      ? null
      : instantIn(dateFromMicros(preview.timelyUntil), booking.timezone);
  const body =
    deadline === null
      ? detailText.owner
      : preview.cancellationClass === 'timely'
        ? detailText.timelyCoOwner(deadline)
        : detailText.lateCoOwner(deadline);
  return (
    <Section id="cancelamento" title={detailText.cancellation}>
      <p className="lx-body">{body}</p>
      <p className="lx-body">
        <a className="lx-button lx-button--secondary" href={ownUsePaths.cancellation(booking.id)}>
          {detailText.viewConditions}
        </a>
      </p>
    </Section>
  );
}

/** `/titular/reservas/[bookingId]`: cabeçalho com imóvel, situação, período e noites; ação de cancelamento no contexto. */
export async function TitularBookingDetailPage(props: {
  readonly bookingId: string;
  readonly searchParams: SearchParams;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const now = new Date();
  const booking = UUID.test(props.bookingId)
    ? await orUnavailable(() => readTitularBooking(session.userId, props.bookingId, now))
    : null;
  if (booking === 'unavailable') return <AuthUnavailable />;
  if (booking === null) notFound();
  const preview = previewOf(booking, now);
  const lead = [
    lifecycleLabels.display[booking.display],
    periodRange(booking.checkinDate, booking.checkoutDate),
    nightsText(nightsOf(booking)),
  ].join(' · ');
  const deadline =
    preview.timelyUntil === null
      ? null
      : instantIn(dateFromMicros(preview.timelyUntil), booking.timezone);
  return (
    <TitularShell>
      <PageHeader
        title={booking.label}
        lead={lead}
        context={{ href: ownUsePaths.bookings, label: bookingsMessages.title }}
      />
      {param(props.searchParams, 'cancelada') === '1' && booking.state === 'cancelled' ? (
        <CancelledNotice booking={booking} />
      ) : null}
      {param(props.searchParams, 'aviso') === 'nada-cancelado' && booking.state !== 'cancelled' ? (
        <Message
          kind="warning"
          title={detailText.changedTitle}
          body={detailText.changedBody}
          live="status"
        />
      ) : null}
      {preview.kind === 'suspended' && deadline !== null ? (
        <Message
          kind="info"
          title={detailText.suspendedTitle}
          body={detailText.suspendedBody(deadline)}
        />
      ) : null}
      <ExceptionNotice booking={booking} preview={preview} />
      <Section id="estadia" title={detailText.stay}>
        <div className="lx-booking__rights">
          <Facts
            rows={[
              [detailText.checkin, detailText.checkinValue(shortDate(booking.checkinDate))],
              [detailText.checkout, detailText.checkoutValue(shortDate(booking.checkoutDate))],
              [
                detailText.nights,
                detailText.nightsValue(
                  nightsOf(booking),
                  booking.modality === 'owner' ? [] : bucketParts(booking.nights),
                ),
              ],
            ]}
          />
        </div>
      </Section>
      <CancellationSection booking={booking} preview={preview} />
      <div className="lx-page-section">
        <Disclosure summary={detailText.more}>
          <Facts
            rows={[
              [detailText.type, typeOf(booking)],
              ...(booking.modality === 'owner'
                ? []
                : ([[detailText.stake, detailText.stakeValue]] as const)),
              [
                detailText.confirmedAt,
                `${shortInstantIn(booking.confirmedAt, booking.timezone)} ${lifecycleLabels.local}`,
              ],
            ]}
          />
        </Disclosure>
      </div>
    </TitularShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Prévia do cancelamento
// ---------------------------------------------------------------------------------------------------------------

function Verdict({ preview }: { readonly preview: CancellationPreview }) {
  const n = preview.affected.length;
  const started = preview.started.length > 0;
  const title =
    preview.modality === 'owner'
      ? started
        ? text.verdictOwnerStarted(n)
        : text.verdictOwner(n)
      : preview.cancellationClass === 'timely'
        ? text.verdictTimely(n)
        : started
          ? text.verdictLateStarted(n)
          : text.verdictLate(n);
  return (
    <h2 className="lx-display-s" id="consequencia">
      {title}
    </h2>
  );
}

function Reason({
  preview,
  deadline,
  today,
}: {
  readonly preview: CancellationPreview;
  readonly deadline: string | null;
  readonly today: string;
}) {
  const n = preview.affected.length;
  const startedDates = dateList(preview.started.map((night) => night.stayDate));
  const first = preview.firstAffectedDate ?? '';
  const todayLine = first === today ? text.today(dayMonth(today)) : null;
  if (preview.started.length > 0) {
    const effect = preview.modality === 'owner' ? null : text.startedLate(n, dayMonth(first));
    return (
      <Message
        kind={preview.modality === 'owner' ? 'info' : 'warning'}
        title={text.startedTitle}
        body={[text.startedNights(startedDates, preview.started.length), todayLine, effect]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }
  if (preview.modality === 'owner') return <p className="lx-body">{text.ownerReason}</p>;
  if (preview.cancellationClass === 'timely')
    return <p className="lx-body">{text.timelyReason(deadline ?? '')}</p>;
  return <Message kind="warning" title={text.lateTitle(deadline ?? '')} body={text.lateBody(n)} />;
}

function Rows({ preview }: { readonly preview: CancellationPreview }) {
  const affected = dateList(preview.affected.map((night) => night.stayDate));
  const rows: (readonly [string, ReactNode])[] = [];
  if (preview.started.length > 0) {
    rows.push([
      text.rowStarted,
      text.startedValue(
        preview.started.length,
        dateList(preview.started.map((night) => night.stayDate)),
      ),
    ]);
    rows.push([text.rowCancelledStarted, text.countValue(preview.affected.length, affected)]);
  } else rows.push([text.rowCancelled, text.countValue(preview.affected.length, affected)]);
  if (preview.returning !== null) {
    rows.push([text.rowReturning, text.returningValue(preview.returning, preview.affected.length)]);
    for (const balance of preview.balances)
      rows.push([
        text.balanceLabel(
          lifecycleLabels.buckets[balance.bucket] ?? balance.bucket,
          balance.exerciseYear,
        ),
        text.balanceValue(balance.after, balance.granted, balance.returning),
      ]);
  }
  return (
    <div className="lx-booking__rights">
      <h3 className="lx-label" id="saldo">
        {preview.modality === 'owner' ? text.rowsTitleOwner : text.rowsTitle}
      </h3>
      <Facts rows={rows} />
    </div>
  );
}

function NightByNight({ preview }: { readonly preview: CancellationPreview }) {
  const all = [...preview.started, ...preview.affected];
  const effect = (night: PreviewNight) =>
    preview.started.includes(night)
      ? text.nightStarted
      : preview.modality === 'owner'
        ? text.nightOwner
        : preview.cancellationClass === 'timely'
          ? text.nightReturns
          : text.nightLeaves;
  return (
    <Disclosure summary={text.nightByNight(all.length)}>
      <Facts
        rows={all.map((night) => [
          preview.modality === 'owner'
            ? shortDate(night.stayDate)
            : `${shortDate(night.stayDate)} · ${lifecycleLabels.buckets[night.bucket]}`,
          effect(night),
        ])}
      />
    </Disclosure>
  );
}

function statementOf(booking: TitularBookingDetail, preview: CancellationPreview): string {
  if (booking.exception?.type === 'operational') return text.statementClosesException;
  if (booking.exception?.type === 'unauthorized_booking') return text.statementClosesReview;
  if (preview.started.length > 0)
    return text.statementFrom(dayMonth(preview.firstAffectedDate ?? ''));
  if (preview.modality === 'co_owner' && preview.cancellationClass === 'late')
    return text.statementLate;
  return text.statementAll;
}

function hintOf(
  booking: TitularBookingDetail,
  preview: CancellationPreview,
  today: string,
): string | null {
  if (preview.firstAffectedDate === today) return text.startedHint;
  if (preview.modality === 'co_owner' && preview.cancellationClass === 'timely')
    return booking.exception?.type === 'unauthorized_booking'
      ? text.reviewTimelyHint
      : text.timelyHint;
  return null;
}

function Aside({ booking }: { readonly booking: TitularBookingDetail }) {
  return (
    <aside className="lx-booking__summary" aria-labelledby="reserva-h">
      <h2 id="reserva-h" className="lx-title">
        {text.aside}
      </h2>
      <Facts
        rows={[
          [
            text.asideHome,
            booking.modality === 'owner'
              ? text.asideHomeOwner(booking.label)
              : text.asideHomeCoOwner(booking.label),
          ],
          [detailText.checkin, text.asideCheckin(shortDate(booking.checkinDate))],
          [detailText.checkout, text.asideCheckout(shortDate(booking.checkoutDate))],
          [detailText.nights, String(nightsOf(booking))],
          [listText.state, lifecycleLabels.display[booking.display]],
        ]}
      />
    </aside>
  );
}

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

const SUBMITTED_CLASS = new Map<string, CancellationClass | null>([
  ['timely', 'timely'],
  ['late', 'late'],
  ['owner', null],
]);

/** Termos que a confirmação recusada levou, devolvidos pela action na URL (`antes`, `primeira`): só indícios. */
function submittedTerms(params: SearchParams): SubmittedTerms | null {
  const before = param(params, 'antes');
  const first = param(params, 'primeira');
  if (before === null || !SUBMITTED_CLASS.has(before)) return null;
  return {
    cancellationClass: SUBMITTED_CLASS.get(before) ?? null,
    firstAffectedDate: first !== null && DATE_PARAM.test(first) ? first : null,
  };
}

type Row = readonly [string, string];

function termsChangeView(change: TermsChange, preview: CancellationPreview, timezone: string) {
  const now: Row = [
    text.now,
    preview.firstAffectedDate === null
      ? text.nothingLeftTitle
      : text.firstNightNow(dayMonth(preview.firstAffectedDate)),
  ];
  const changed = { id: 'mudou', title: text.changedTitle, section: text.whatChanged };
  switch (change.kind) {
    case 'deadline_passed':
      return {
        ...changed,
        body: text.changedDeadline(instantIn(dateFromMicros(change.timelyUntil), timezone)),
        review: text.review,
        rows: [
          [text.before, text.beforeTimely],
          [text.now, text.nowLate(preview.affected.length)],
        ] as readonly Row[],
      };
    case 'night_started':
      return {
        ...changed,
        body: text.changedNight(dayMonth(change.stayDate)),
        review: text.review,
        rows: [[text.before, text.firstNight(dayMonth(change.stayDate))], now] as readonly Row[],
      };
    case 'unexplained':
      return {
        id: 'condicoes-atuais',
        title: text.mismatchTitle,
        section: text.currentTerms,
        body: text.mismatchBody,
        review: text.reviewCurrent,
        rows: [now] as readonly Row[],
      };
  }
}

/**
 * Recusa por termos diferentes (D7): sem ação destrutiva; só revisar (nova prévia e chave). A causa só é dita quando o
 * servidor a prova (`termsChange`: prazo terminado ou noite iniciada), com "Antes" e "Agora". Sem prova, a tela afirma
 * só a recusa e mostra as condições atuais: os valores do formulário nunca viram fato.
 */
function TermsChanged(props: {
  readonly booking: TitularBookingDetail;
  readonly preview: CancellationPreview;
  readonly params: SearchParams;
}) {
  const change = termsChange(submittedTerms(props.params), props.preview);
  const view = termsChangeView(change, props.preview, props.booking.timezone);
  return (
    <>
      <Message kind="warning" live="alert" title={view.title} body={view.body} />
      <Section id={view.id} title={view.section}>
        <dl className="lx-evidence lx-evidence--inline">
          {view.rows.map(([label, value]) => (
            <div className="lx-evidence__item" key={label}>
              <dt className="lx-evidence__label">{label}</dt>
              <dd className="lx-evidence__value">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="lx-form__actions">
          <a
            className="lx-button lx-button--primary"
            href={ownUsePaths.cancellation(props.booking.id)}
          >
            {view.review}
          </a>
          <a className="lx-button lx-button--quiet" href={ownUsePaths.booking(props.booking.id)}>
            {text.keep}
          </a>
        </div>
      </Section>
    </>
  );
}

/** `/titular/reservas/[bookingId]/cancelamento`: consequência → prazo → noites e saldo → noite a noite → confirmação. */
export async function TitularCancellationPage(props: {
  readonly bookingId: string;
  readonly searchParams: SearchParams;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const now = new Date();
  const read = UUID.test(props.bookingId)
    ? await orUnavailable(() => readTitularCancellation(session.userId, props.bookingId, now))
    : null;
  if (read === 'unavailable') return <AuthUnavailable />;
  if (read === null) notFound();
  const { booking, preview } = read;
  if (preview.kind === 'not_cancellable' || preview.kind === 'suspended')
    redirect(ownUsePaths.booking(booking.id));
  const header = (
    <PageHeader
      title={text.title}
      lead={text.lead(
        booking.label,
        periodRange(booking.checkinDate, booking.checkoutDate),
        nightsOf(booking),
        booking.display === 'confirmed' ? null : lifecycleLabels.display[booking.display],
      )}
      context={{ href: ownUsePaths.booking(booking.id), label: text.back }}
    />
  );
  if (param(props.searchParams, 'condicoes') === 'mudaram')
    return (
      <TitularShell>
        {header}
        <TermsChanged booking={booking} preview={preview} params={props.searchParams} />
      </TitularShell>
    );
  if (preview.kind === 'nothing_left')
    return (
      <TitularShell>
        {header}
        <Message kind="info" title={text.nothingLeftTitle} body={text.nothingLeftBody} />
        <p className="lx-body">
          <a className="lx-link" href={ownUsePaths.booking(booking.id)}>
            {text.back}
          </a>
        </p>
      </TitularShell>
    );
  const today = civilToday(now, booking.timezone);
  const deadline =
    preview.timelyUntil === null
      ? null
      : instantIn(dateFromMicros(preview.timelyUntil), booking.timezone);
  return (
    <TitularShell>
      {header}
      {preview.kind === 'closed' ? (
        <div className="lx-booking__closed">
          <Message kind="info" title={text.closedTitle} body={text.closedBody} />
        </div>
      ) : null}
      <ExceptionNotice booking={booking} preview={preview} />
      <div className="lx-booking">
        <div className="lx-booking__period">
          <section className="lx-booking__period" aria-labelledby="consequencia">
            <Verdict preview={preview} />
            <Reason preview={preview} deadline={deadline} today={today} />
            <Rows preview={preview} />
            <NightByNight preview={preview} />
          </section>
          {preview.kind === 'actionable' ? (
            <OwnUseCancelForm
              bookingId={booking.id}
              secondHomeId={booking.secondHomeId}
              partyId={booking.partyId}
              expectedClass={preview.cancellationClass}
              expectedFirstDate={preview.firstAffectedDate ?? ''}
              idempotencyKey={randomUUID()}
              statement={statementOf(booking, preview)}
              hint={hintOf(booking, preview, today)}
              detailHref={ownUsePaths.booking(booking.id)}
            />
          ) : null}
        </div>
        <Aside booking={booking} />
      </div>
    </TitularShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------------------------------------------

/** `/titular/notificacoes`: central só leitura — título curto, Second Home e "O que mudou" (REQ-097). */
export async function TitularNotificationsListPage() {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const rows = await orUnavailable(() =>
    withUserRead(getDatabase(), { sub: session.userId, role: 'authenticated' }, async (tx) => {
      const notifications = await tx
        .selectFrom('app.notification')
        .select(['id', 'kind', 'data', 'created_at'])
        .orderBy('created_at', 'desc')
        .execute();
      const homes = await tx
        .selectFrom('app.second_home')
        .select(['id', 'label', 'timezone'])
        .execute();
      return { notifications, homes };
    }),
  );
  if (rows === 'unavailable') return <AuthUnavailable />;
  const base = notificationMessages;
  const homes = new Map(rows.homes.map((home) => [home.id, home]));
  const items = rows.notifications.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const home =
      typeof data.second_home_id === 'string' ? homes.get(data.second_home_id) : undefined;
    const timeZone = home?.timezone ?? rows.homes[0]?.timezone ?? 'UTC';
    const bookingId = typeof data.booking_id === 'string' ? data.booking_id : undefined;
    const copy = notificationCopy(row.kind, data, {
      date: fullDate,
      instant: (iso) => {
        const at = new Date(iso);
        return Number.isNaN(at.getTime()) ? '—' : instantIn(at, timeZone).replace(/^[^,]*, /, '');
      },
    });
    const received = shortInstantIn(new Date(row.created_at), timeZone);
    return {
      id: row.id,
      ...(bookingId === undefined ? {} : { href: ownUsePaths.booking(bookingId) }),
      title: copy?.title ?? base.unknown,
      attributes: [
        ...(home === undefined
          ? []
          : [{ label: lifecycleNotificationMessages.home, value: home.label }]),
        ...(copy === null
          ? []
          : [{ label: lifecycleNotificationMessages.whatChanged, value: copy.what }]),
        ...(copy?.extra ?? []).map(([label, value]) => ({ label, value })),
        { label: base.receivedAt, value: received },
      ],
    };
  });
  return (
    <TitularShell>
      <PageHeader
        title={base.title}
        lead={base.lead}
        context={{ href: AREA, label: base.backToArea }}
      />
      <Section id="titular-notifications" title={base.title} hidden>
        {items.length === 0 ? (
          <p className="lx-body">{base.empty}</p>
        ) : (
          <RecordList label={base.title} items={items} />
        )}
      </Section>
    </TitularShell>
  );
}
