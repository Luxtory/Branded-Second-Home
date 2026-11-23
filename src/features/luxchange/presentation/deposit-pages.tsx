import { notFound } from 'next/navigation';
import { Icon, PageHeader, RecordList } from '@/design-system/react';
import {
  AuthUnavailable,
  TitularShell,
  requireTitularSession,
  type VerifiedSession,
} from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import { luxchangePaths } from '../paths';
import { DepositCalendar } from './deposit-calendar';
import { dateList, formatCredits, fullDate, instantDate, operationCode } from './deposit-format';
import {
  readDepositCalendar,
  readDepositHoldings,
  readDepositResult,
  type DepositHoldingOption,
} from './deposit-read';
import { depositMessages as text } from './i18n/deposit-pt-br';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

function Notice({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="lx-message lx-message--info lx-booking__closed" role="status">
      <Icon name="alert" className="lx-message__icon" />
      <p className="lx-message__title">{title}</p>
      <p className="lx-message__body">{body}</p>
    </div>
  );
}

function HoldingChooser({ holdings }: { readonly holdings: readonly DepositHoldingOption[] }) {
  return (
    <section className="lx-page-section" aria-labelledby="deposito-casa">
      <h2 className="lx-display-s" id="deposito-casa">
        {text.chooser.heading}
      </h2>
      <p className="lx-hint">{holdings.length === 0 ? text.chooser.none : text.chooser.hint}</p>
      {holdings.length === 0 ? null : (
        <RecordList
          label={text.chooser.heading}
          items={holdings.map((holding) => ({
            id: holding.holdingId,
            href: luxchangePaths.depositFor(holding.holdingId),
            title: holding.label,
            attributes: [
              { label: text.chooser.role, value: text.chooser.roles[holding.modality] },
              {
                label: text.chooser.membership,
                value:
                  text.chooser.membershipStates[holding.membershipActive ? 'active' : 'inactive'],
              },
            ],
          }))}
        />
      )}
    </section>
  );
}

/**
 * `/titular/luxchange/deposito` (W20; spec luxchange §5.4): escolha da Second Home (holdings vigentes das parties
 * representadas) e, escolhida — ou única —, o calendário com resumo, revisão e confirmação. Holding que o usuário não
 * representa: 404 (sem oráculo).
 */
export async function TitularDepositPage({
  searchParams,
}: {
  readonly searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const holdings = await orUnavailable(() => readDepositHoldings(session));
  if (holdings === 'unavailable') return <AuthUnavailable />;
  const requested = typeof searchParams.holding === 'string' ? searchParams.holding : null;
  const holdingId = requested ?? (holdings.length === 1 ? holdings[0]!.holdingId : null);
  const header = (lead: string) => (
    <PageHeader
      title={text.title}
      lead={lead}
      context={{ href: luxchangePaths.area, label: text.backToArea }}
    />
  );
  if (holdingId === null)
    return (
      <TitularShell>
        {header(text.lead)}
        <HoldingChooser holdings={holdings} />
      </TitularShell>
    );
  const data = UUID.test(holdingId)
    ? await orUnavailable(() => readDepositCalendar(session, holdingId))
    : null;
  if (data === 'unavailable') return <AuthUnavailable />;
  if (data === null) notFound();
  return (
    <TitularShell>
      {header(`${data.holding.label} · ${text.chooser.roles[data.holding.modality]}`)}
      {holdings.length > 1 ? (
        <p className="lx-body">
          <a className="lx-link" href={luxchangePaths.deposit}>
            {text.chooser.change}
          </a>
        </p>
      ) : null}
      {data.open ? null : <Notice title={text.closed.title} body={text.closed.body} />}
      {data.holding.membershipActive ? null : (
        <Notice title={text.membership.title} body={text.membership.body} />
      )}
      <DepositCalendar data={data} />
    </TitularShell>
  );
}

/** `/titular/luxchange/deposito/[operationId]`: resultado lido do banco (lote + noites cedidas pela operação). */
export async function TitularDepositResultPage({ operationId }: { readonly operationId: string }) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const result = UUID.test(operationId)
    ? await orUnavailable(() => readDepositResult(session, operationId))
    : null;
  if (result === 'unavailable') return <AuthUnavailable />;
  if (result === null) notFound();
  return (
    <TitularShell>
      <PageHeader
        title={text.result.title}
        lead={text.result.lead}
        context={{ href: luxchangePaths.area, label: text.backToArea }}
      />
      <section className="lx-page-section" aria-labelledby="deposito-resultado">
        <h2 className="lx-visually-hidden" id="deposito-resultado">
          {text.result.title}
        </h2>
        <dl className="lx-booking__facts">
          {[
            [text.result.home, result.secondHomeLabel],
            [
              text.result.dates,
              result.nights.length > 3
                ? dateList(result.nights)
                : result.nights.map(fullDate).join(', '),
            ],
            [text.result.credits, text.credits(formatCredits(result.credits))],
            [text.result.validity, instantDate(result.expiresAt, result.timezone)],
            [text.result.reference, operationCode(result.operationId)],
          ].map(([label, value]) => (
            <div className="lx-booking__fact" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="lx-booking__footnote">{text.result.binding}</p>
        <p className="lx-body">
          <a className="lx-button lx-button--primary" href={luxchangePaths.wallet}>
            {text.result.wallet}
          </a>
        </p>
        <p className="lx-body">
          <a className="lx-link" href={luxchangePaths.deposit}>
            {text.result.another}
          </a>
        </p>
      </section>
    </TitularShell>
  );
}

/** Seção da Área do Titular: entrada do depósito quando o usuário representa ao menos uma Second Home. */
export async function TitularLuxchangeSection({ session }: { readonly session: VerifiedSession }) {
  const holdings = await orUnavailable(() => readDepositHoldings(session));
  if (holdings === 'unavailable' || holdings.length === 0) return null;
  return (
    <section className="lx-page-section" aria-labelledby="titular-luxchange">
      <h2 className="lx-display-s" id="titular-luxchange">
        {text.area.heading}
      </h2>
      <p className="lx-hint">{text.area.lead}</p>
      <p className="lx-body">
        <a className="lx-link" href={luxchangePaths.deposit}>
          {text.area.link}
        </a>
      </p>
    </section>
  );
}
