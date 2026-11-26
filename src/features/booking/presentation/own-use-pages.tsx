import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Icon, PageHeader, RecordList } from '@/design-system/react';
import { AuthUnavailable, TitularShell, requireTitularSession } from '@/features/identity';
import { getDatabase, unavailableKeys, withUserRead } from '@/features/platform';
import { bookingsMessages, calendarMessages } from './i18n/own-use-pt-br';
import { OwnUseCalendar } from './own-use-calendar';
import { OwnUseRights } from './own-use-rights';
import { readOwnUseCalendar } from './own-use-calendar-read';
import { ownUsePaths } from './own-use-paths';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AREA = '/titular';

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

/** `/titular/calendario/[holdingId]`: calendário de uso próprio da holding que o usuário representa (RLS); senão 404. */
export async function TitularOwnUseCalendarPage({
  holdingId,
  notice,
}: {
  readonly holdingId: string;
  /** W21: aviso composto pela rota (datas comprometidas com solicitação pendente), sem importar o luxchange. */
  readonly notice?: ReactNode;
}) {
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
      {notice}
      {data.bookingOpen ? null : (
        <div className="lx-message lx-message--info lx-booking__closed" role="status">
          <Icon name="alert" className="lx-message__icon" />
          <p className="lx-message__title">{calendarMessages.closed.title}</p>
          <p className="lx-message__body">{calendarMessages.closed.body}</p>
        </div>
      )}
      <OwnUseRights data={data} />
      <OwnUseCalendar data={data} />
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
