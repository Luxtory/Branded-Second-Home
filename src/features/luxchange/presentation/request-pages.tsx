import { randomUUID } from 'node:crypto';
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
import { dateList, formatCredits, fullDate } from './deposit-format';
import { readDepositHoldings } from './deposit-read';
import { formatFee, instantDateTime } from './request-format';
import { RequestJourney } from './request-journey';
import {
  readRequestDetail,
  readRequestJourney,
  readRequestList,
  readRequestStart,
  type RequestDetailView,
} from './request-read';
import { RequestWithdrawForm } from './request-withdraw';
import { requestMessages as text } from './i18n/request-pt-br';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const lastNight = (checkout: string) =>
  new Date(Date.parse(`${checkout}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const period = (checkin: string, checkout: string) =>
  `${fullDate(checkin)} a ${fullDate(lastNight(checkout))}`;
const credits = (value: string) => text.credits(formatCredits(value));
const param = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null);

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

function Notice({ body }: { readonly body: string }) {
  return (
    <div className="lx-message lx-message--info lx-booking__closed" role="status">
      <Icon name="alert" className="lx-message__icon" />
      <p className="lx-message__body">{body}</p>
    </div>
  );
}

const header = (lead: string) => (
  <PageHeader
    title={text.title}
    lead={lead}
    context={{ href: luxchangePaths.area, label: text.backToArea }}
  />
);

/** Estado real da Request (e, encerrada, o motivo decidido pelo banco). */
const stateLine = (state: RequestDetailView['state'], reason: RequestDetailView['reason']) =>
  reason === null ? text.states[state] : `${text.states[state]} · ${text.reasons[reason]}`;

/**
 * `/titular/luxchange/solicitacoes` (spec §13.5 item 7): Minhas solicitações (estado, prazo, Créditos necessários) e
 * Recebidas só leitura (datas, Second Home, prazo) — na W21 o membro solicitado não age.
 */
export async function TitularRequestsPage() {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const list = await orUnavailable(() => readRequestList(session));
  if (list === 'unavailable') return <AuthUnavailable />;
  return (
    <TitularShell>
      {header(text.lead)}
      <p className="lx-body">
        <a className="lx-button lx-button--primary" href={luxchangePaths.newRequest}>
          {text.list.new}
        </a>
      </p>
      <section className="lx-page-section" aria-labelledby="solicitacoes-enviadas">
        <h2 className="lx-display-s" id="solicitacoes-enviadas">
          {text.list.sent}
        </h2>
        {list.sent.length === 0 ? (
          <p className="lx-body">{text.list.sentEmpty}</p>
        ) : (
          <RecordList
            label={text.list.sent}
            items={list.sent.map((item) => ({
              id: item.requestId,
              href: luxchangePaths.request(item.requestId),
              title: `${item.homeLabel} · ${period(item.checkin, item.checkout)}`,
              attributes: [
                { label: text.list.state, value: stateLine(item.state, item.reason) },
                {
                  label: text.list.deadline,
                  value: instantDateTime(item.expiresAt, item.timezone),
                },
                { label: text.list.required, value: credits(item.creditsRequired) },
              ],
            }))}
          />
        )}
      </section>
      <section className="lx-page-section" aria-labelledby="solicitacoes-recebidas">
        <h2 className="lx-display-s" id="solicitacoes-recebidas">
          {text.list.received}
        </h2>
        <p className="lx-hint">{text.list.receivedHint}</p>
        {list.received.length === 0 ? (
          <p className="lx-body">{text.list.receivedEmpty}</p>
        ) : (
          <RecordList
            label={text.list.received}
            items={list.received.map((item) => ({
              id: item.requestId,
              title: `${item.homeLabel} · ${period(item.checkin, item.checkout)}`,
              attributes: [
                { label: text.list.state, value: text.states[item.state] },
                {
                  label: text.list.deadline,
                  value: instantDateTime(item.expiresAt, item.timezone),
                },
              ],
            }))}
          />
        )}
      </section>
    </TitularShell>
  );
}

/**
 * `/titular/luxchange/solicitacoes/nova` (spec §13.5 itens 1–5): sem `casa`, a escolha da party e da Second Home com
 * capacidade solicitável ("a partir de"); com `party` e `casa`, a jornada. Party não representada ou Second Home
 * inexistente: 404 (sem oráculo).
 */
export async function TitularNewRequestPage({
  searchParams,
}: {
  readonly searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const partyId = param(searchParams.party);
  const homeId = param(searchParams.casa);
  if (partyId !== null && homeId !== null) {
    const data =
      UUID.test(partyId) && UUID.test(homeId)
        ? await orUnavailable(() => readRequestJourney(session, partyId, homeId))
        : null;
    if (data === 'unavailable') return <AuthUnavailable />;
    if (data === null) notFound();
    return (
      <TitularShell>
        {header(
          `${data.home.label} · ${text.journey.partyLabel(data.party.documentType, data.party.maskedDocument)}`,
        )}
        <p className="lx-body">
          <a className="lx-link" href={luxchangePaths.newRequest}>
            {text.journey.changeHome}
          </a>
        </p>
        {data.open ? null : <Notice body={text.journey.closed} />}
        {data.party.membershipActive ? null : <Notice body={text.journey.membership} />}
        <RequestJourney data={data} />
      </TitularShell>
    );
  }
  const start = await orUnavailable(() => readRequestStart(session));
  if (start === 'unavailable') return <AuthUnavailable />;
  const eligible = start.parties.filter((party) => party.membershipActive);
  return (
    <TitularShell>
      {header(text.lead)}
      {eligible.length === 0 ? (
        <Notice body={text.journey.noParty} />
      ) : (
        eligible.map((party) => (
          <section
            className="lx-page-section"
            aria-labelledby={`solicitar-${party.partyId}`}
            key={party.partyId}
          >
            <h2 className="lx-display-s" id={`solicitar-${party.partyId}`}>
              {text.journey.home}
            </h2>
            <p className="lx-hint">
              {text.journey.who}:{' '}
              {text.journey.partyLabel(party.documentType, party.maskedDocument)}.{' '}
              {text.journey.homeHint}
            </p>
            {start.homes.length === 0 ? (
              <p className="lx-body">{text.journey.noHomes}</p>
            ) : (
              <RecordList
                label={text.journey.home}
                items={start.homes.map((home) => ({
                  id: `${party.partyId}:${home.secondHomeId}`,
                  href: luxchangePaths.newRequestFor(party.partyId, home.secondHomeId),
                  title: home.label,
                  attributes: [
                    {
                      label: text.list.required,
                      value: text.journey.fromCredits(formatCredits(home.fromCredits)),
                    },
                  ],
                }))}
              />
            )}
          </section>
        ))
      )}
    </TitularShell>
  );
}

/**
 * `/titular/luxchange/solicitacoes/[requestId]` (spec §13.5 itens 6–7): estado real da Request, do pagamento e do
 * estorno (ADR-0037 §11) — estorno solicitado aparece como "em processamento", nunca como concluído — e "Retirar".
 */
export async function TitularRequestDetailPage({
  requestId,
  sent,
}: {
  readonly requestId: string;
  readonly sent: boolean;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const detail = UUID.test(requestId)
    ? await orUnavailable(() => readRequestDetail(session, requestId))
    : null;
  if (detail === 'unavailable') return <AuthUnavailable />;
  if (detail === null) notFound();
  const pending = detail.state === 'pending';
  const refund = detail.refundState === null ? text.refund.none : text.refund[detail.refundState];
  return (
    <TitularShell>
      <PageHeader
        title={text.detail.title}
        lead={`${detail.homeLabel} · ${period(detail.checkin, detail.checkout)}`}
        context={{ href: luxchangePaths.requests, label: text.detail.back }}
      />
      {sent && pending ? (
        <div className="lx-message lx-message--success" role="status">
          <Icon name="check" className="lx-message__icon" />
          <p className="lx-message__body">{text.detail.sent}</p>
        </div>
      ) : null}
      <section className="lx-page-section" aria-labelledby="solicitacao-detalhe">
        <h2 className="lx-visually-hidden" id="solicitacao-detalhe">
          {text.detail.title}
        </h2>
        <dl className="lx-booking__facts">
          {(
            [
              [text.detail.state, stateLine(detail.state, detail.reason)],
              [text.detail.sentAt, instantDateTime(detail.sentAt, detail.timezone)],
              [text.detail.deadline, instantDateTime(detail.expiresAt, detail.timezone)],
              ...(detail.closedAt === null
                ? []
                : [[text.detail.closedAt, instantDateTime(detail.closedAt, detail.timezone)]]),
              [text.detail.required, credits(detail.creditsRequired)],
              [
                pending ? text.detail.guarantee : text.detail.released,
                credits(detail.guaranteeCredits),
              ],
              [
                text.detail.committed,
                detail.complement.length === 0
                  ? text.detail.none
                  : detail.complement
                      .map((night) => `${night.homeLabel} ${fullDate(night.date)}`)
                      .join(', '),
              ],
              [text.detail.potential, credits(detail.complementCredits)],
              [text.detail.fee, formatFee(detail.feeAmountMinor)],
              [
                text.detail.payment,
                text.detail.paymentStates[detail.paymentState] ?? detail.paymentState,
              ],
              [text.detail.refundLabel, refund],
              [
                text.detail.nights,
                detail.nightCredits.length > 3
                  ? `${dateList(detail.nightCredits.map((night) => night.date))} · ${detail.nightCredits.map((night) => formatCredits(night.credits)).join(' + ')}`
                  : detail.nightCredits
                      .map((night) => `${fullDate(night.date)}: ${credits(night.credits)}`)
                      .join(' · '),
              ],
            ] as const
          ).map(([label, value]) => (
            <div className="lx-booking__fact" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {pending ? (
          <RequestWithdrawForm
            requestId={detail.requestId}
            partyId={detail.partyId}
            initialKey={randomUUID()}
          />
        ) : null}
      </section>
    </TitularShell>
  );
}

/** Seção da Área do Titular: entrada das solicitações quando o usuário representa ao menos uma Second Home. */
export async function TitularRequestsSection({ session }: { readonly session: VerifiedSession }) {
  const holdings = await orUnavailable(() => readDepositHoldings(session));
  if (holdings === 'unavailable' || holdings.length === 0) return null;
  return (
    <section className="lx-page-section" aria-labelledby="titular-solicitacoes">
      <h2 className="lx-display-s" id="titular-solicitacoes">
        {text.area.heading}
      </h2>
      <p className="lx-hint">{text.area.lead}</p>
      <p className="lx-body">
        <a className="lx-link" href={luxchangePaths.requests}>
          {text.area.link}
        </a>
      </p>
    </section>
  );
}
