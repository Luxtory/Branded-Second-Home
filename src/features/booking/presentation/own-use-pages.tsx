import { notFound } from 'next/navigation';
import { sql } from 'kysely';
import { PageHeader, RecordList } from '@/design-system/react';
import { AuthUnavailable, TitularShell, requireTitularSession } from '@/features/identity';
import { getDatabase, unavailableKeys, withUserRead } from '@/features/platform';
import {
  bookingLabels,
  bookingsMessages,
  calendarMessages,
  notificationMessages,
} from './i18n/own-use-pt-br';
import { OwnUseCalendar } from './own-use-calendar';
import { OwnUseRights } from './own-use-rights';
import { readOwnUseCalendar } from './own-use-calendar-read';
import { ownUsePaths } from './own-use-paths';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AREA = '/titular';
const LOCALE = 'pt-BR';
const DAY_MS = 86_400_000;

const civil = (s: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(
    new Date(`${s}T00:00:00Z`),
  );
const fullDate = (s: string) => civil(s, { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDate = (s: string) =>
  civil(s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const nightsOf = (checkin: string, checkout: string) =>
  Math.round((Date.parse(`${checkout}T00:00:00Z`) - Date.parse(`${checkin}T00:00:00Z`)) / DAY_MS);

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

/** `/titular/calendario/[holdingId]`: calendário de uso próprio da holding que o usuário representa (RLS); senão 404. */
export async function TitularOwnUseCalendarPage({ holdingId }: { readonly holdingId: string }) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const data = UUID.test(holdingId)
    ? await orUnavailable(() => readOwnUseCalendar(session.userId, holdingId))
    : null;
  if (data === 'unavailable') return <AuthUnavailable />;
  if (data === null) notFound();
  return (
    <TitularShell>
      <PageHeader
        title={calendarMessages.title}
        lead={calendarMessages.context(data.secondHomeLabel, data.role)}
        context={{ href: AREA, label: calendarMessages.backToArea }}
      />
      <OwnUseRights data={data} />
      <OwnUseCalendar data={data} />
    </TitularShell>
  );
}

interface BookingRow {
  readonly id: string;
  readonly secondHomeId: string;
  readonly label: string;
  readonly timezone: string;
  readonly modality: string;
  readonly channel: string;
  readonly state: string;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly confirmedAt: Date;
}

/** Reservas visíveis ao usuário (RLS da W12: só as da holding vigente que ele representa), com canal e estado. */
async function readBookings(userId: string, bookingId?: string): Promise<BookingRow[]> {
  return withUserRead(getDatabase(), { sub: userId, role: 'authenticated' }, async (tx) => {
    let query = tx
      .selectFrom('app.booking as b')
      .innerJoin('app.second_home as s', 's.id', 'b.second_home_id')
      .innerJoin('app.acquisition as a', 'a.second_home_id', 'b.second_home_id')
      .select([
        'b.id',
        'b.second_home_id as secondHomeId',
        's.label',
        's.timezone',
        'a.modality',
        'b.channel',
        'b.state',
        sql<string>`b.checkin_date::text`.as('checkinDate'),
        sql<string>`b.checkout_date::text`.as('checkoutDate'),
        'b.confirmed_at as confirmedAt',
      ])
      .orderBy('b.checkin_date', 'desc');
    if (bookingId !== undefined) query = query.where('b.id', '=', bookingId);
    return query.execute();
  });
}

const roleOf = (modality: string) => (modality === 'owner' ? 'owner' : 'co_owner');
const typeOf = (row: BookingRow) =>
  bookingLabels.channel(row.channel, roleOf(row.modality)) ?? bookingLabels.missing;
const stateOf = (row: BookingRow) => bookingLabels.state(row.state) ?? bookingLabels.missing;

/** `/titular/reservas`: tipo, período, noites e situação de cada reserva (canceladas ficam no histórico, W13). */
export async function TitularBookingsPage() {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const rows = await orUnavailable(() => readBookings(session.userId));
  if (rows === 'unavailable') return <AuthUnavailable />;
  const text = bookingsMessages;
  return (
    <TitularShell>
      <PageHeader
        title={text.title}
        lead={text.lead}
        context={{ href: AREA, label: text.backToArea }}
      />
      <section className="lx-page-section" aria-label={text.title}>
        {rows.length === 0 ? (
          <p className="lx-body">{text.empty}</p>
        ) : (
          <RecordList
            label={text.title}
            items={rows.map((row) => ({
              id: row.id,
              href: ownUsePaths.booking(row.id),
              title: row.label,
              attributes: [
                { label: text.type, value: typeOf(row) },
                {
                  label: text.period,
                  value: text.periodValue(shortDate(row.checkinDate), shortDate(row.checkoutDate)),
                },
                {
                  label: text.nights,
                  value: text.nightsValue(nightsOf(row.checkinDate, row.checkoutDate)),
                },
                { label: text.state, value: stateOf(row) },
              ],
            }))}
          />
        )}
      </section>
    </TitularShell>
  );
}

/** `/titular/reservas/[bookingId]`: detalhe visível pela RLS; qualquer outro id → 404, sem oráculo. */
export async function TitularBookingPage({ bookingId }: { readonly bookingId: string }) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const rows = UUID.test(bookingId)
    ? await orUnavailable(() => readBookings(session.userId, bookingId))
    : [];
  if (rows === 'unavailable') return <AuthUnavailable />;
  const row = rows[0];
  if (row === undefined) notFound();
  const text = bookingsMessages;
  const confirmedAt = new Intl.DateTimeFormat(LOCALE, {
    timeZone: row.timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(row.confirmedAt);
  const facts = [
    { label: text.type, value: typeOf(row) },
    {
      label: text.period,
      value: text.periodValue(shortDate(row.checkinDate), shortDate(row.checkoutDate)),
    },
    { label: text.nights, value: text.nightsValue(nightsOf(row.checkinDate, row.checkoutDate)) },
    { label: text.state, value: stateOf(row) },
    { label: text.confirmedAt, value: confirmedAt },
  ];
  return (
    <TitularShell>
      <PageHeader
        title={text.detailTitle}
        lead={row.label}
        context={{ href: ownUsePaths.bookings, label: text.title }}
      />
      <section className="lx-page-section" aria-label={text.detailTitle}>
        <dl className="lx-booking__facts">
          {facts.map((fact) => (
            <div className="lx-booking__fact" key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </TitularShell>
  );
}

/** `/titular/notificacoes`: central só leitura — avisos das parties que o usuário representa agora (RLS, REQ-097). */
export async function TitularNotificationsPage() {
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
  const text = notificationMessages;
  const homes = new Map(rows.homes.map((home) => [home.id, home]));
  const items = rows.notifications.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const home =
      typeof data.second_home_id === 'string' ? homes.get(data.second_home_id) : undefined;
    const bookingId = typeof data.booking_id === 'string' ? data.booking_id : undefined;
    const confirmed =
      row.kind === 'booking.own_use_confirmed' &&
      typeof data.checkin_date === 'string' &&
      typeof data.checkout_date === 'string' &&
      typeof data.nights === 'number';
    const title = confirmed
      ? text.confirmed(
          home?.label ?? bookingLabels.missing,
          fullDate(data.checkin_date as string),
          fullDate(data.checkout_date as string),
          data.nights as number,
        )
      : text.unknown;
    const received = new Intl.DateTimeFormat(LOCALE, {
      timeZone: home?.timezone ?? rows.homes[0]?.timezone ?? 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(row.created_at));
    return {
      id: row.id,
      ...(bookingId === undefined ? {} : { href: ownUsePaths.booking(bookingId) }),
      title,
      attributes: [{ label: text.receivedAt, value: received }],
    };
  });
  return (
    <TitularShell>
      <PageHeader
        title={text.title}
        lead={text.lead}
        context={{ href: AREA, label: text.backToArea }}
      />
      <section className="lx-page-section" aria-label={text.title}>
        {items.length === 0 ? (
          <p className="lx-body">{text.empty}</p>
        ) : (
          <RecordList label={text.title} items={items} />
        )}
      </section>
    </TitularShell>
  );
}

/** Seção da Área do Titular: Second Homes que o usuário representa (RLS), com o calendário e as reservas. */
export async function TitularOwnUseSection({ userId }: { readonly userId: string }) {
  const holdings = await orUnavailable(() =>
    withUserRead(getDatabase(), { sub: userId, role: 'authenticated' }, (tx) =>
      tx
        .selectFrom('app.holding as h')
        .innerJoin('app.second_home as s', 's.id', 'h.second_home_id')
        .select(['h.id', 'h.role', 's.label'])
        .orderBy('s.label')
        .execute(),
    ),
  );
  if (holdings === 'unavailable' || holdings.length === 0) return null;
  const text = bookingsMessages;
  return (
    <section className="lx-page-section" aria-labelledby="titular-own-use">
      <h2 className="lx-display-s" id="titular-own-use">
        {text.areaSection}
      </h2>
      <p className="lx-hint">{text.areaLead}</p>
      <RecordList
        label={text.areaSection}
        items={holdings.map((holding) => ({
          id: holding.id,
          href: ownUsePaths.calendar(holding.id),
          title: holding.label,
          attributes: [
            {
              label: text.role,
              value: text.roleLabel(holding.role === 'owner' ? 'owner' : 'co_owner'),
            },
          ],
        }))}
      />
      <p className="lx-body">
        <a className="lx-link" href={ownUsePaths.bookings}>
          {text.bookingsLink}
        </a>
        {text.linkSeparator}
        <a className="lx-link" href={ownUsePaths.notifications}>
          {text.notificationsLink}
        </a>
      </p>
    </section>
  );
}
