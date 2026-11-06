import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader, RecordList } from '@/design-system/react';
import { adminRoleGate, AdminShell, type ExercisedAdminSession } from '@/features/admin';
import { AuthUnavailable } from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import type { AdminAct } from '../application/own-use-admin-availability';
import type { AuthorizationPurpose } from '../application/own-use-lifecycle-ports';
import { timelyUntil, microsFromMillis } from '../domain/own-use-lifecycle';
import { adminActMessages as act, adminBookingMessages as text } from './i18n/own-use-admin-pt-br';
import { lifecycleLabels } from './i18n/own-use-lifecycle-pt-br';
import {
  correctUseRightAction,
  declareNoShowAction,
  openExceptionAction,
  recoverFutureCapacityAction,
  requestBookingAuthorizationAction,
  resolveExceptionAction,
} from './own-use-admin-actions';
import { OwnUseAdminForm, type ChoiceOption } from './own-use-admin-form';
import {
  readAdminBooking,
  readAdminBookingDirectory,
  type AdminBookingDetail,
  type DirectorySection,
} from './own-use-admin-read';
import {
  dateFromMicros,
  dateList,
  instantIn,
  listRange,
  nightsBetween,
  periodRange,
  shortDate,
} from './own-use-lifecycle-format';
import { EvidenceRow, Message, OpaqueId, Section } from './own-use-ui';

/**
 * Admin do ciclo da reserva (W13 E4b; spec booking §10.9, §10.15; referência visual E4a v2.1). Papel `admin` exercido
 * explícito, AAL2 pelo gate; leituras auditadas; cada ato mostra a consequência antes do formulário e o servidor
 * revalida tudo (K2, estado, janela, autorização independente). Sem "party" no texto visível.
 */
const ROLE = 'admin' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTIONS: readonly DirectorySection[] = [
  'attendance',
  'exceptions',
  'recoverable',
  'upcoming',
];
const ACT_PATHS: Record<AdminAct, string> = {
  open_exception: 'excecao',
  resolve: 'resolucao',
  no_show: 'no-show',
  invalidation: 'invalidacao',
  recovery: 'recuperacao',
  request: 'autorizacao',
};
export const ADMIN_ACT_SLUGS = Object.values(ACT_PATHS);
const actOfSlug = (slug: string) =>
  (Object.entries(ACT_PATHS).find(([, path]) => path === slug)?.[0] as AdminAct | undefined) ??
  null;

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

function Page({
  session,
  children,
}: {
  readonly session: ExercisedAdminSession;
  readonly children: ReactNode;
}) {
  return (
    <AdminShell roles={session.roles} current="bookings">
      <div className="lx-container">{children}</div>
    </AdminShell>
  );
}

const detailPath = (id: string) => `/admin/reservas/${id}`;
const actPath = (id: string, a: AdminAct) => `${detailPath(id)}/${ACT_PATHS[a]}`;
const stateLabel = (booking: Pick<AdminBookingDetail, 'state' | 'exception'>) =>
  booking.state === 'in_exception' && booking.exception !== null
    ? text.exceptionState[booking.exception.type]
    : (text.state[booking.state] ?? booking.state);
const leadOf = (booking: AdminBookingDetail) =>
  text.lead2(
    stateLabel(booking),
    text.modality[booking.modality],
    periodRange(booking.checkinDate, booking.checkoutDate),
    booking.nights.length,
  );

// ---------------------------------------------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------------------------------------------

/** `/admin/reservas`: filas operacionais (comparecimento, exceções, capacidade recuperável, próximas). */
export async function AdminBookingsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const gate = await adminRoleGate(ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const casa = param(searchParams, 'casa');
  const filter = { secondHomeId: casa !== null && UUID.test(casa) ? casa : null };
  const data = await orUnavailable(() => readAdminBookingDirectory(gate.session, filter));
  if (data === 'unavailable') return <AuthUnavailable />;
  return (
    <Page session={gate.session}>
      <PageHeader title={text.title} lead={text.lead} />
      <p className="lx-hint">{text.audit}</p>
      <form className="lx-form" method="get" aria-label={text.filterName}>
        <div className="lx-form__row">
          <div className="lx-field">
            <label className="lx-label" htmlFor="casa">
              {text.filterLabel}
            </label>
            <select
              className="lx-select"
              id="casa"
              name="casa"
              defaultValue={filter.secondHomeId ?? ''}
            >
              <option value="">{text.filterAll}</option>
              {data.homes.map((home) => (
                <option key={home.id} value={home.id}>
                  {home.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="lx-form__actions">
          <button className="lx-button lx-button--secondary" type="submit">
            {text.filterSubmit}
          </button>
        </div>
      </form>
      {data.items.length === 0 ? (
        <Section id="reservas-vazio" title={text.title} hidden>
          <div className="lx-empty">
            <p className="lx-body">{text.empty}</p>
          </div>
        </Section>
      ) : null}
      {SECTIONS.map((section) => {
        const rows = data.items.filter((item) => item.section === section);
        if (rows.length === 0) return null;
        const title = text.sections[section];
        const hint = text.sectionHints[section];
        return (
          <Section key={section} id={`fila-${section}`} title={title}>
            {hint ? <p className="lx-hint">{hint}</p> : null}
            <RecordList
              label={title}
              items={rows.map((row) => {
                const period = {
                  label: text.meta.period,
                  value: text.meta.periodValue(
                    listRange(row.checkinDate, row.checkoutDate),
                    nightsBetween(row.checkinDate, row.checkoutDate),
                  ),
                };
                const attributes =
                  section === 'attendance'
                    ? [
                        period,
                        {
                          label: text.meta.deadline,
                          value: text.meta.checkout(instantIn(row.checkoutAt, row.timezone)),
                        },
                        {
                          label: text.meta.noShowAuthorization,
                          value:
                            row.noShowAuthorizationUntil === null
                              ? text.meta.none
                              : text.meta.validUntil(
                                  instantIn(row.noShowAuthorizationUntil, row.timezone),
                                ),
                        },
                      ]
                    : section === 'exceptions'
                      ? [
                          {
                            label: text.meta.state,
                            value: [
                              row.exceptionType === null
                                ? text.state.in_exception
                                : text.exceptionState[row.exceptionType],
                              row.reason === null ? null : text.reasons[row.reason],
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          },
                          period,
                          {
                            label: text.meta.firstCheckin,
                            value: instantIn(row.firstCheckinAt, row.timezone),
                          },
                        ]
                      : [
                          { label: text.meta.state, value: text.state[row.state] ?? row.state },
                          period,
                        ];
                return {
                  id: row.id,
                  href: detailPath(row.id),
                  title: `${row.label} · ${text.modality[row.modality]}`,
                  attributes,
                };
              })}
            />
          </Section>
        );
      })}
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------------------------------------------

function liveSummary(booking: AdminBookingDetail): string {
  const live = Object.entries(booking.live).filter(([, auth]) => auth !== null) as [
    AuthorizationPurpose,
    NonNullable<AdminBookingDetail['live'][AuthorizationPurpose]>,
  ][];
  if (live.length === 0) return text.meta.none;
  return live
    .map(
      ([purpose, auth]) =>
        `${text.purposes[purpose]} · ${text.meta.validUntil(instantIn(auth.validUntil, booking.timezone))}`,
    )
    .join('; ');
}

function deadlineOf(booking: AdminBookingDetail): string | null {
  if (booking.modality === 'owner') return null;
  const until = timelyUntil(microsFromMillis(booking.firstCheckinAt.getTime()));
  return instantIn(dateFromMicros(until), booking.timezone);
}

/** `/admin/reservas/[bookingId]`: atos disponíveis no cabeçalho; indisponíveis com o motivo; noites, autorizações e histórico. */
export async function AdminBookingPage(props: {
  readonly bookingId: string;
  readonly searchParams: SearchParams;
}) {
  const gate = await adminRoleGate(ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const booking = UUID.test(props.bookingId)
    ? await orUnavailable(() => readAdminBooking(gate.session, props.bookingId))
    : null;
  if (booking === 'unavailable') return <AuthUnavailable />;
  if (booking === null) notFound();
  const available = booking.acts.filter((a) => a.available);
  const unavailable = booking.acts.filter((a) => !a.available);
  const done = param(props.searchParams, 'feito');
  const requested = param(props.searchParams, 'solicitacao');
  const deadline = deadlineOf(booking);
  const summary: (readonly [string, ReactNode])[] = [];
  if (booking.exception !== null) {
    summary.push([
      text.detail.reason,
      booking.exception.type === 'operational'
        ? `${text.reasons[booking.exception.reason ?? ''] ?? '—'} · ${text.meta.openedAt.toLowerCase()} ${instantIn(booking.exception.openedAt, booking.timezone)}`
        : `${text.exceptionState.unauthorized_booking} · ${text.meta.openedAt.toLowerCase()} ${instantIn(booking.exception.openedAt, booking.timezone)}`,
    ]);
    if (booking.exception.incidentRef !== null)
      summary.push([
        text.detail.incident,
        <code className="lx-caption" key="inc">
          {booking.exception.incidentRef}
        </code>,
      ]);
  }
  summary.push([
    text.detail.nights,
    text.detail.nightsValue(booking.nights.length, booking.facts.unstartedDates.length),
  ]);
  if (deadline !== null)
    summary.push([text.detail.deadline, `${deadline} ${lifecycleLabels.local}`]);
  summary.push([text.detail.authorization, liveSummary(booking)]);
  return (
    <Page session={gate.session}>
      <PageHeader
        title={booking.label}
        lead={leadOf(booking)}
        context={{ href: '/admin/reservas', label: text.title }}
        actions={
          available.length === 0 ? undefined : (
            <>
              {available.map((a) => (
                <a
                  key={a.act}
                  className="lx-button lx-button--secondary"
                  href={actPath(booking.id, a.act)}
                >
                  {text.acts[a.act]}
                </a>
              ))}
            </>
          )
        }
      />
      {done !== null && text.done[done] !== undefined ? (
        <Message kind="success" title={text.doneTitle} body={text.done[done]} live="status" />
      ) : null}
      {requested !== null && UUID.test(requested) ? (
        <Message
          kind="success"
          title={text.requestDoneTitle}
          body={
            <>
              {text.requestDoneBody} <OpaqueId value={requested} />
            </>
          }
          live="status"
        />
      ) : null}
      {booking.facts.lifecycleOpen ? null : (
        <Message kind="info" title={text.detail.closedTitle} body={text.detail.closedBody} />
      )}
      <Section id="resumo" title={text.detail.summary}>
        <EvidenceRow rows={summary} />
        <p className="lx-hint">{text.auditOne(booking.timezone)}</p>
      </Section>
      {unavailable.length === 0 ? null : (
        <Section id="indisponiveis" title={text.detail.unavailableNow}>
          <RecordList
            label={text.detail.unavailableNow}
            items={unavailable.map((a) => ({
              id: a.act,
              title: text.acts[a.act] ?? a.act,
              attributes: [
                {
                  label: text.detail.unavailableReason,
                  value: text.unavailability[a.reason ?? ''] ?? '—',
                },
              ],
            }))}
          />
        </Section>
      )}
      <Section id="noites-admin" title={text.detail.nights}>
        <RecordList
          label={text.detail.nights}
          items={booking.nights.map((night) => ({
            id: night.date,
            title: shortDate(night.date),
            attributes: [
              ...(night.bucket === null
                ? []
                : [
                    {
                      label: text.detail.category,
                      value: lifecycleLabels.buckets[night.bucket] ?? night.bucket,
                    },
                  ]),
              { label: text.detail.custody, value: text.custody[night.custody] ?? '—' },
              {
                label: text.detail.occupancy,
                value: night.occupied
                  ? text.occupied
                  : night.releaseReason === null
                    ? '—'
                    : text.released(
                        text.releaseReasons[night.releaseReason] ?? night.releaseReason,
                      ),
              },
              { label: text.detail.start, value: instantIn(night.checkinAt, booking.timezone) },
            ],
          }))}
        />
      </Section>
      <Section id="autorizacoes" title={text.detail.authorizations}>
        {booking.authorizations.length === 0 ? (
          <div className="lx-empty">
            <p className="lx-body">{text.detail.noAuthorizations}</p>
          </div>
        ) : (
          <RecordList
            label={text.detail.authorizations}
            items={booking.authorizations.map((auth) => ({
              id: auth.requestId,
              title: text.purposes[auth.purpose] ?? auth.purpose,
              attributes: [
                {
                  label: text.detail.status,
                  value:
                    auth.status === 'live' && auth.validUntil !== null
                      ? text.authorizationStatus.live(instantIn(auth.validUntil, booking.timezone))
                      : text.authorizationStatus[
                          auth.status === 'live' ? 'requested' : auth.status
                        ],
                },
                {
                  label: text.detail.requestedAt,
                  value: instantIn(auth.requestedAt, booking.timezone),
                },
                { label: text.detail.request, value: <OpaqueId value={auth.requestId} /> },
              ],
            }))}
          />
        )}
      </Section>
      <Section id="historico" title={text.detail.history}>
        <RecordList
          label={text.detail.history}
          items={[
            ...booking.history.map((row, index) => ({
              id: `${index}-${row.at.toISOString()}`,
              title: `${text.state[row.from] ?? row.from} → ${text.state[row.to] ?? row.to}`,
              attributes: [
                { label: text.detail.when, value: instantIn(row.at, booking.timezone) },
                { label: text.detail.by, value: text.roles[row.role] ?? row.role },
                ...(row.basis === null
                  ? []
                  : [
                      {
                        label: text.detail.basis,
                        value: (
                          <code className="lx-caption" key="b">
                            {row.basis}
                          </code>
                        ),
                      },
                    ]),
              ],
            })),
            {
              id: 'confirmed',
              title: text.detail.confirmed,
              attributes: [
                {
                  label: text.detail.when,
                  value: instantIn(booking.confirmedAt, booking.timezone),
                },
              ],
            },
          ]}
        />
      </Section>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Atos
// ---------------------------------------------------------------------------------------------------------------

function ActHeader({ booking, a }: { readonly booking: AdminBookingDetail; readonly a: AdminAct }) {
  return (
    <PageHeader
      title={text.acts[a] ?? a}
      lead={leadOf(booking)}
      context={{
        href: detailPath(booking.id),
        label: act.back === 'Voltar' ? 'Reserva' : act.back,
      }}
    />
  );
}

function NoAuthorization({ booking }: { readonly booking: AdminBookingDetail }) {
  return (
    <Message
      kind="info"
      title={act.noAuthorizationTitle}
      body={
        <>
          {act.noAuthorizationBody}{' '}
          {booking.purposes.length > 0 ? (
            <a className="lx-link" href={actPath(booking.id, 'request')}>
              {act.requestLink}
            </a>
          ) : null}
        </>
      }
    />
  );
}

function Consequence({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby="efeito">
      <h2 className="lx-display-s" id="efeito">
        {title}
      </h2>
      {children}
    </section>
  );
}

function authorizationRow(
  booking: AdminBookingDetail,
  purpose: AuthorizationPurpose,
): readonly [string, string] {
  const auth = booking.live[purpose];
  return [
    text.detail.authorization,
    auth === null
      ? text.meta.none
      : `${text.purposes[purpose]} · ${text.meta.validUntil(instantIn(auth.validUntil, booking.timezone))} · uso único`,
  ];
}

function actBody(booking: AdminBookingDetail, a: AdminAct): ReactNode {
  const hidden = { booking_id: booking.id, second_home_id: booking.secondHomeId };
  const back = detailPath(booking.id);
  const key = randomUUID();
  const unstarted = booking.facts.unstartedDates;
  switch (a) {
    case 'open_exception':
      return (
        <>
          <Consequence title={act.consequence.open_exception}>
            <p className="lx-body">{act.consequence.openExceptionBody(deadlineOf(booking))}</p>
          </Consequence>
          <OwnUseAdminForm
            act={a}
            action={openExceptionAction}
            idempotencyKey={key}
            hidden={hidden}
            backHref={back}
          />
        </>
      );
    case 'resolve': {
      const exception = booking.exception!;
      const purpose: AuthorizationPurpose =
        exception.type === 'operational' ? 'exception_cancellation' : 'invalidation';
      const auth = booking.live[purpose];
      const coOwnerReview =
        exception.type === 'unauthorized_booking' && booking.modality === 'co_owner';
      const outcomes: ChoiceOption[] = [
        booking.facts.beforeCheckout
          ? { value: 'confirmed', title: act.outcomeConfirmed, desc: act.outcomeConfirmedDesc }
          : { value: 'completed', title: act.outcomeCompleted, desc: act.outcomeCompletedDesc },
      ];
      if (!coOwnerReview && auth !== null && unstarted.length > 0)
        outcomes.push({
          value: 'cancelled',
          title: act.outcomeCancelled,
          desc:
            booking.modality === 'owner'
              ? act.outcomeCancelledOwner(unstarted.length)
              : booking.cancellationClassNow === 'timely'
                ? act.outcomeCancelledTimely(unstarted.length)
                : act.outcomeCancelledLate(unstarted.length),
        });
      return (
        <>
          <OwnUseAdminForm
            act={a}
            action={resolveExceptionAction}
            idempotencyKey={key}
            hidden={{ ...hidden, exception_id: exception.id }}
            outcomes={outcomes}
            outcomeHint={act.outcomeHint(instantIn(new Date(), booking.timezone))}
            cancelNotice={
              auth === null
                ? null
                : act.usesAuthorization(
                    text.purposes[purpose] ?? purpose,
                    instantIn(auth.validUntil, booking.timezone),
                  )
            }
            backHref={back}
          />
          {coOwnerReview ? (
            <Message kind="info" title={act.reviewCoOwnerNote} />
          ) : auth === null && unstarted.length > 0 ? (
            <Message
              kind="info"
              title={act.needsAuthorizationTitle}
              body={
                <>
                  {act.needsAuthorizationBody}{' '}
                  <a className="lx-link" href={actPath(booking.id, 'request')}>
                    {act.requestLink}
                  </a>
                </>
              }
            />
          ) : null}
        </>
      );
    }
    case 'no_show': {
      const auth = booking.live.no_show;
      const n = unstarted.length;
      return (
        <>
          <Consequence
            title={
              booking.modality === 'owner'
                ? act.consequence.noShowOwner(n)
                : act.consequence.noShowCoOwner(n)
            }
          >
            <Message
              kind="warning"
              title={act.consequence.noShowWarningTitle}
              body={
                booking.modality === 'owner'
                  ? act.consequence.noShowWarningOwner(dateList(unstarted) || '—')
                  : act.consequence.noShowWarningCoOwner(dateList(unstarted) || '—')
              }
            />
            <EvidenceRow
              rows={[
                [
                  act.consequence.window,
                  text.meta.checkout(instantIn(booking.checkoutAt, booking.timezone)),
                ],
                authorizationRow(booking, 'no_show'),
              ]}
            />
          </Consequence>
          {auth === null ? (
            <NoAuthorization booking={booking} />
          ) : (
            <OwnUseAdminForm
              act={a}
              action={declareNoShowAction}
              idempotencyKey={key}
              hidden={hidden}
              attest="no_show"
              destructive
              backHref={back}
            />
          )}
        </>
      );
    }
    case 'invalidation': {
      const auth = booking.live.invalidation;
      return (
        <>
          <Consequence title={act.consequence.invalidation(unstarted.length)}>
            <p className="lx-body">{act.consequence.invalidationBody}</p>
            <EvidenceRow
              rows={[
                authorizationRow(booking, 'invalidation'),
                [text.detail.incident, booking.exception?.incidentRef ?? '—'],
              ]}
            />
          </Consequence>
          {auth === null ? (
            <NoAuthorization booking={booking} />
          ) : (
            <OwnUseAdminForm
              act={a}
              action={correctUseRightAction}
              idempotencyKey={key}
              hidden={{ ...hidden, exception_id: booking.exception!.id }}
              destructive
              backHref={back}
            />
          )}
        </>
      );
    }
    case 'recovery': {
      const auth = booking.live.recovery;
      return (
        <>
          <Consequence title={act.consequence.recovery(booking.facts.recoverableCustodies)}>
            <p className="lx-body">{act.consequence.recoveryBody}</p>
            <EvidenceRow
              rows={[
                [
                  act.consequence.origin,
                  booking.recoverableFromException
                    ? act.consequence.originException
                    : act.consequence.originOther,
                ],
                authorizationRow(booking, 'recovery'),
              ]}
            />
          </Consequence>
          {auth === null ? (
            <NoAuthorization booking={booking} />
          ) : (
            <OwnUseAdminForm
              act={a}
              action={recoverFutureCapacityAction}
              idempotencyKey={key}
              hidden={hidden}
              backHref={back}
            />
          )}
        </>
      );
    }
    case 'request': {
      const descriptions: Record<AuthorizationPurpose, string> = {
        no_show: act.purposeDesc.no_show(unstarted.length),
        exception_cancellation: act.purposeDesc.exception_cancellation(
          unstarted.length,
          booking.modality === 'owner' ? null : booking.cancellationClassNow === 'timely',
        ),
        invalidation: act.purposeDesc.invalidation(unstarted.length),
        recovery: act.purposeDesc.recovery(booking.facts.recoverableCustodies),
      };
      const purposes = booking.purposes.map((purpose) => ({
        value: purpose,
        title: text.purposes[purpose] ?? purpose,
        desc: descriptions[purpose],
      }));
      const attestRequired =
        booking.purposes.includes('recovery') && booking.recoverableFromException;
      return (
        <>
          <Consequence title={act.consequence.request}>
            <p className="lx-body">{act.consequence.requestBody}</p>
          </Consequence>
          <OwnUseAdminForm
            act={a}
            action={requestBookingAuthorizationAction}
            idempotencyKey={key}
            hidden={{ ...hidden, attest_required: attestRequired ? 'yes' : 'no' }}
            purposes={purposes}
            attest={attestRequired ? 'recovery' : null}
            backHref={back}
          />
        </>
      );
    }
  }
}

/** `/admin/reservas/[bookingId]/[ato]`: consequência antes do formulário; ato indisponível → o motivo, sem formulário. */
export async function AdminBookingActPage(props: {
  readonly bookingId: string;
  readonly slug: string;
}) {
  const a = actOfSlug(props.slug);
  if (a === null) notFound();
  const gate = await adminRoleGate(ROLE);
  if (gate.kind === 'blocked') return gate.page;
  const booking = UUID.test(props.bookingId)
    ? await orUnavailable(() => readAdminBooking(gate.session, props.bookingId))
    : null;
  if (booking === 'unavailable') return <AuthUnavailable />;
  if (booking === null) notFound();
  const availability = booking.acts.find((item) => item.act === a)!;
  return (
    <Page session={gate.session}>
      <ActHeader booking={booking} a={a} />
      {availability.available ? (
        actBody(booking, a)
      ) : (
        <>
          <Message kind="info" title={text.unavailability[availability.reason ?? ''] ?? '—'} />
          <p className="lx-body">
            <a className="lx-button lx-button--secondary" href={detailPath(booking.id)}>
              {act.back}
            </a>
          </p>
        </>
      )}
    </Page>
  );
}
