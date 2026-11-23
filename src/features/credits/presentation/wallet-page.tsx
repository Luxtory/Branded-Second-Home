import type { ReactNode } from 'react';
import { Icon, PageHeader, RecordList } from '@/design-system/react';
import { AuthUnavailable, TitularShell, requireTitularSession } from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import { compareQuantities } from '../domain/credit';
import { WALLET_STATES, type WalletState } from '../domain/wallet';
import { CREDIT_MOVEMENTS, walletMessages as text } from './i18n/wallet-pt-br';
import { Instant } from './instant';
import {
  formatCreditQuantity,
  isOneCredit,
  parseWalletQuery,
  shortCode,
  walletHref,
} from './wallet-format';
import { readWallet, readWalletSummary, type WalletView } from './wallet-read';

/**
 * Carteira do Titular (W17, spec credits §5.4; REQ-053, REQ-054, REQ-096): só leitura, sem formato monetário, resgate,
 * venda, cessão ou transferência. Filtro e paginação por parâmetros de URL (funciona sem JavaScript). Composição de
 * classes `lx-*` existentes (ADR-0003, consumer-driven); mobile-first com paridade (ADR-0009).
 */
export const WALLET_PATH = '/titular/carteira';
const AREA = '/titular';

async function orUnavailable<T>(read: () => Promise<T>): Promise<T | 'unavailable'> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return 'unavailable';
  }
}

const credits = (value: string) => text.credits(formatCreditQuantity(value), isOneCredit(value));
const isPositive = (value: string) => compareQuantities(value, '0') > 0;

function Section(props: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lx-page-section" aria-labelledby={props.id}>
      <h2 className="lx-display-s" id={props.id}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function Notice(props: { readonly title: string; readonly body: string }) {
  return (
    <div className="lx-message lx-message--warning">
      <Icon name="alert" className="lx-message__icon" />
      <p className="lx-message__title">{props.title}</p>
      <p className="lx-message__body">{props.body}</p>
    </div>
  );
}

/** Estados exibidos no saldo: "Indisponível por Membership" no lugar de "Disponível" quando o Membership não é vigente. */
function balanceStates(view: WalletView): readonly WalletState[] {
  return WALLET_STATES.filter((state) =>
    state === 'available'
      ? view.membershipActive
      : state === 'membership_blocked'
        ? !view.membershipActive
        : true,
  );
}

function Balance({ view }: { readonly view: WalletView }) {
  return (
    <Section id="carteira-saldo" title={text.balance.title}>
      <p className="lx-hint">{text.nature}</p>
      <dl className="lx-evidence lx-evidence--inline">
        {balanceStates(view).map((state) => (
          <div className="lx-evidence__item" key={state}>
            <dt className="lx-evidence__label">{text.balance.labels[state]}</dt>
            <dd className="lx-evidence__value">{credits(view.totals[state])}</dd>
          </div>
        ))}
      </dl>
      {view.membershipActive ? null : (
        <Notice title={text.balance.blockedTitle} body={text.balance.blockedBody} />
      )}
      {isPositive(view.totals.held) ? <p className="lx-hint">{text.balance.heldHint}</p> : null}
    </Section>
  );
}

function Lots({ view }: { readonly view: WalletView }) {
  const lots = text.lots;
  return (
    <Section id="carteira-lotes" title={lots.title}>
      {view.lots.length === 0 ? (
        <p className="lx-body">{lots.empty}</p>
      ) : (
        <>
          <p className="lx-hint">{lots.lead}</p>
          <RecordList
            label={lots.title}
            items={view.lots.map((lot) => ({
              id: lot.id,
              title: lots.itemTitle(shortCode(lot.id)),
              attributes: [
                { label: lots.origin, value: lots.origins[lot.originCommand] ?? text.unknown },
                { label: lots.quantity, value: credits(lot.quantity) },
                {
                  label: lots.available,
                  value: credits(lot.situation === 'expired' ? '0' : lot.available),
                },
                {
                  label: lots.originatedAt,
                  value: <Instant iso={lot.originatedAt.toISOString()} />,
                },
                { label: lots.expiresAt, value: <Instant iso={lot.expiresAt.toISOString()} /> },
                { label: lots.situation, value: lots.situations[lot.situation] },
              ],
            }))}
          />
        </>
      )}
    </Section>
  );
}

function StatementFilter({ view }: { readonly view: WalletView }) {
  const statement = text.statement;
  return (
    <form className="lx-form" method="get" action={WALLET_PATH}>
      {view.parties.length > 1 ? (
        <input type="hidden" name="pessoa" value={view.party.partyId} />
      ) : null}
      <div className="lx-form__row">
        <div className="lx-field">
          <label className="lx-label" htmlFor="carteira-tipo">
            {statement.filterLabel}
          </label>
          <div className="lx-select-wrap">
            <select
              className="lx-select"
              id="carteira-tipo"
              name="tipo"
              defaultValue={view.statement.movement ?? ''}
            >
              <option value="">{statement.filterAll}</option>
              {CREDIT_MOVEMENTS.map((movement) => (
                <option key={movement} value={movement}>
                  {statement.filters[movement]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="lx-form__actions">
        <button type="submit" className="lx-button lx-button--secondary">
          {statement.filterSubmit}
        </button>
      </div>
    </form>
  );
}

function Pagination({ view }: { readonly view: WalletView }) {
  const { page, pages, movement } = view.statement;
  if (pages <= 1) return null;
  const statement = text.statement;
  const partyId = view.parties.length > 1 ? view.party.partyId : null;
  const href = (target: number) => walletHref({ partyId, movement, page: target }, WALLET_PATH);
  return (
    <nav aria-label={statement.paginationLabel} className="lx-form__actions">
      {page > 1 ? (
        <a className="lx-button lx-button--secondary" href={href(page - 1)}>
          {statement.previous}
        </a>
      ) : null}
      <p className="lx-hint">{statement.pageOf(page, pages)}</p>
      {page < pages ? (
        <a className="lx-button lx-button--secondary" href={href(page + 1)}>
          {statement.next}
        </a>
      ) : null}
    </nav>
  );
}

function Statement({ view }: { readonly view: WalletView }) {
  const statement = text.statement;
  const items = view.statement.items;
  return (
    <Section id="carteira-extrato" title={statement.title}>
      <p className="lx-hint">{statement.lead}</p>
      {view.statement.total === 0 && view.statement.movement === null ? null : (
        <StatementFilter view={view} />
      )}
      {items.length === 0 ? (
        <p className="lx-body">
          {view.statement.movement === null ? statement.empty : statement.emptyFiltered}
        </p>
      ) : (
        <RecordList
          label={statement.title}
          items={items.map((entry) => ({
            id: entry.id,
            title: statement.kinds[entry.kind],
            attributes: [
              { label: statement.date, value: <Instant iso={entry.createdAt.toISOString()} /> },
              { label: statement.quantity, value: credits(entry.quantity) },
              { label: statement.lot, value: shortCode(entry.lotId) },
              {
                label: statement.operation,
                value: statement.operationValue(
                  statement.commands[entry.command] ?? text.unknown,
                  shortCode(entry.operationId),
                ),
              },
            ],
          }))}
        />
      )}
      <Pagination view={view} />
    </Section>
  );
}

function PartySelector({ view }: { readonly view: WalletView }) {
  if (view.parties.length < 2) return null;
  return (
    <nav aria-label={text.partiesLabel}>
      <ul className="lx-record-list">
        {view.parties.map((party) => (
          <li className="lx-record-list__item" key={party.partyId}>
            <a
              className="lx-link"
              href={walletHref({ partyId: party.partyId, movement: null, page: 1 }, WALLET_PATH)}
              aria-current={party.partyId === view.party.partyId ? 'page' : undefined}
            >
              {text.partyTitle(party.documentType, party.maskedDocument)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** `/titular/carteira`: saldo por estado, lotes na ordem FEFO e extrato filtrável da party representada. */
export async function TitularWalletPage({
  searchParams,
}: {
  readonly searchParams: Readonly<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireTitularSession();
  if (session === 'unavailable') return <AuthUnavailable />;
  const query = parseWalletQuery(searchParams);
  const view = await orUnavailable(() => readWallet(session, query));
  if (view === 'unavailable') return <AuthUnavailable />;
  const header = (
    <PageHeader
      title={
        view !== null && view.parties.length > 1
          ? `${text.title} · ${text.partyTitle(view.party.documentType, view.party.maskedDocument)}`
          : text.title
      }
      lead={text.lead}
      context={{ href: AREA, label: text.backToArea }}
    />
  );
  if (view === null) {
    return (
      <TitularShell>
        {header}
        <Notice title={text.noRepresentation.title} body={text.noRepresentation.body} />
      </TitularShell>
    );
  }
  return (
    <TitularShell>
      {header}
      <PartySelector view={view} />
      <Balance view={view} />
      <Lots view={view} />
      <Statement view={view} />
    </TitularShell>
  );
}

/**
 * Seção da Área do Titular: aparece só quando há ao menos um lote visível (nada muda para quem não tem Créditos — com a
 * K4 fechada, ninguém tem). Leitura indisponível não derruba a Área.
 */
export async function TitularWalletSection({
  session,
}: {
  readonly session: Parameters<typeof readWalletSummary>[0];
}) {
  const summary = await orUnavailable(() => readWalletSummary(session));
  if (summary === 'unavailable' || summary === null) return null;
  const area = text.area;
  return (
    <Section id="titular-carteira" title={area.title}>
      <p className="lx-hint">{area.lead}</p>
      <dl className="lx-evidence lx-evidence--inline">
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{area.available}</dt>
          <dd className="lx-evidence__value">{credits(summary.available)}</dd>
        </div>
      </dl>
      <p className="lx-body">
        <a className="lx-link" href={WALLET_PATH}>
          {area.link}
        </a>
      </p>
    </Section>
  );
}
