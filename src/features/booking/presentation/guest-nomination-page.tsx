import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/design-system/react';
import { AuthUnavailable, TitularShell, requireTitularSession } from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import { GuestNominationForm } from './guest-nomination-form';
import { readTitularGuestNomination } from './guest-nomination-read';
import { guestNominationMessages as text } from './i18n/guest-nomination-pt-br';
import { instantIn, periodRange } from './own-use-lifecycle-format';
import { ownUsePaths } from './own-use-paths';
import { Message, Section } from './own-use-ui';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SearchParams = Record<string, string | string[] | undefined>;
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

/** Texto das regras em parágrafos (linhas em branco separam parágrafos), sempre como texto — nunca HTML. */
function RulesText({ value }: { readonly value: string }) {
  return (
    <>
      {value
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '')
        .map((paragraph, index) => (
          <p className="lx-body" key={index}>
            {paragraph.split('\n').map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        ))}
    </>
  );
}

/**
 * `/titular/reservas/[bookingId]/convidados` (W14; REQ-092; spec booking §11): regras vigentes da Second Home e a
 * declaração de uso por convidados. Sem dado, identificação ou quantidade de convidados (P-6).
 */
export async function TitularGuestNominationPage(props: {
  readonly bookingId: string;
  readonly searchParams: SearchParams;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const read = UUID.test(props.bookingId)
    ? await orUnavailable(() => readTitularGuestNomination(session.userId, props.bookingId))
    : null;
  if (read === 'unavailable') return <AuthUnavailable />;
  if (read === null) notFound();
  const { booking, rules, nominations } = read;
  const declared =
    rules === null ? undefined : nominations.find((entry) => entry.rulesId === rules.id);
  return (
    <TitularShell>
      <PageHeader
        title={text.title}
        lead={text.lead(booking.label, periodRange(booking.checkinDate, booking.checkoutDate))}
        context={{ href: ownUsePaths.booking(booking.id), label: text.back }}
      />
      {param(props.searchParams, 'declarado') === '1' ||
      param(props.searchParams, 'regras') === 'mudaram' ||
      rules === null ? (
        <div className="lx-page-section">
          {param(props.searchParams, 'declarado') === '1' ? (
            <Message kind="success" title={text.doneTitle} body={text.doneBody} live="status" />
          ) : null}
          {param(props.searchParams, 'regras') === 'mudaram' ? (
            <Message
              kind="warning"
              title={text.changedTitle}
              body={text.changedBody}
              live="status"
            />
          ) : null}
          {rules === null ? (
            <Message kind="info" title={text.noRulesTitle} body={text.noRulesBody} />
          ) : null}
        </div>
      ) : null}
      {rules === null ? null : (
        <Section id="regras" title={text.rulesTitle}>
          <p className="lx-body">{text.rulesSince(instantIn(rules.since, booking.timezone))}</p>
          <RulesText value={rules.value} />
        </Section>
      )}
      <div className="lx-page-section">
        {declared !== undefined ? (
          <Message
            kind="success"
            title={text.declaredTitle}
            body={text.declaredBody(instantIn(declared.nominatedAt, booking.timezone))}
          />
        ) : null}
        {!booking.declarable ? (
          <Message kind="info" title={text.notDeclarableTitle} body={text.notDeclarableBody} />
        ) : null}
        {booking.declarable && rules !== null && declared === undefined ? (
          <GuestNominationForm
            bookingId={booking.id}
            secondHomeId={booking.secondHomeId}
            partyId={booking.partyId}
            rulesId={rules.id}
            idempotencyKey={randomUUID()}
            backHref={ownUsePaths.booking(booking.id)}
          />
        ) : null}
      </div>
    </TitularShell>
  );
}
