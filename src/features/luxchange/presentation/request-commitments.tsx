import type { ReactNode } from 'react';
import { Icon } from '@/design-system/react';
import { requireTitularSession, type VerifiedSession } from '@/features/identity';
import { unavailableKeys } from '@/features/platform';
import { sumCredits } from '../domain/deposit';
import { luxchangePaths } from '../paths';
import { dateList, formatCredits, fullDate } from './deposit-format';
import { readDepositHoldings } from './deposit-read';
import { readBookingCommitment, readCommittedDates } from './request-read';
import { requestMessages } from './i18n/request-pt-br';

/**
 * Integração das telas existentes com a Request (W21 E3; spec luxchange §13.5 item 8): Carteira, reserva, cancelamento e
 * calendário mostram as datas comprometidas com solicitação pendente — Créditos potenciais, nunca saldo — e orientam a
 * retirar a solicitação. As rotas do app compõem estes avisos (booking e credits não importam o luxchange). Leitura
 * indisponível nunca derruba a tela que os hospeda.
 */
const text = requestMessages.commitments;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function quietly<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
    return null;
  }
}

function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <div className="lx-message lx-message--info" role="status">
      <Icon name="alert" className="lx-message__icon" />
      <div className="lx-message__body">{children}</div>
    </div>
  );
}

/** Carteira: datas comprometidas da party exibida, com o total de Créditos potenciais (não utilizáveis). */
export async function RequestCommittedDatesSection(props: {
  readonly session: VerifiedSession;
  readonly partyId: string;
}) {
  const dates = await quietly(() => readCommittedDates(props.session, props.partyId));
  if (dates === null || dates.length === 0) return null;
  const requests = [...new Set(dates.map((date) => date.requestId))];
  return (
    <section className="lx-page-section" aria-labelledby="carteira-comprometidas">
      <h2 className="lx-display-s" id="carteira-comprometidas">
        {text.heading}
      </h2>
      <p className="lx-hint">{text.hint}</p>
      <dl className="lx-evidence lx-evidence--inline">
        <div className="lx-evidence__item">
          <dt className="lx-evidence__label">{text.total}</dt>
          <dd className="lx-evidence__value">
            {requestMessages.credits(formatCredits(sumCredits(dates.map((date) => date.credits))))}
          </dd>
        </div>
      </dl>
      <ul className="lx-booking__issues">
        {dates.map((date) => (
          <li key={`${date.secondHomeId}:${date.date}`}>
            {text.line(date.homeLabel, fullDate(date.date), formatCredits(date.credits))}
          </li>
        ))}
      </ul>
      {requests.map((requestId) => (
        <p className="lx-body" key={requestId}>
          <a className="lx-link" href={luxchangePaths.request(requestId)}>
            {text.see}
          </a>
        </p>
      ))}
    </section>
  );
}

/** Reserva e cancelamento: a reserva Co-Owner comprometida com solicitação pendente, com o caminho para retirar. */
export async function RequestBookingCommitmentNotice({
  bookingId,
}: {
  readonly bookingId: string;
}) {
  if (!UUID.test(bookingId)) return null;
  const session = await requireTitularSession();
  if (session === 'unavailable') return null;
  const requestId = await quietly(() => readBookingCommitment(session, bookingId));
  if (requestId === null) return null;
  return (
    <Notice>
      <p>{text.booking}</p>
      <p>
        <a className="lx-link" href={luxchangePaths.request(requestId)}>
          {text.see}
        </a>
      </p>
    </Notice>
  );
}

/** Calendário de uso próprio: noites da Second Home da holding comprometidas com solicitação pendente. */
export async function RequestHoldingCommitmentsNotice({
  holdingId,
}: {
  readonly holdingId: string;
}) {
  if (!UUID.test(holdingId)) return null;
  const session = await requireTitularSession();
  if (session === 'unavailable') return null;
  const holding = (await quietly(() => readDepositHoldings(session)))?.find(
    (item) => item.holdingId === holdingId,
  );
  if (holding === undefined) return null;
  const dates = (await quietly(() => readCommittedDates(session, holding.partyId)))?.filter(
    (date) => date.secondHomeId === holding.secondHomeId,
  );
  if (dates === undefined || dates.length === 0) return null;
  const requests = [...new Set(dates.map((date) => date.requestId))];
  return (
    <Notice>
      <p>{text.calendar(dateList(dates.map((date) => date.date)))}</p>
      {requests.map((requestId) => (
        <p key={requestId}>
          <a className="lx-link" href={luxchangePaths.request(requestId)}>
            {text.see}
          </a>
        </p>
      ))}
    </Notice>
  );
}
