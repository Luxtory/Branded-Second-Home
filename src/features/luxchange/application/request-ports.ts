import type { DepositNightFacts } from '../domain/deposit';
import type { RequestClosureReason, RequestHolding, RequestTermsDocument } from '../domain/request';

/** K7 do intercâmbio (ADR-0036 §7) e K5 dos pagamentos (ADR-0035 §8), além da K4 e da K6. */
export const LUXCHANGE_EXCHANGE_CAPABILITY = 'luxchange_exchange';
export const PAYMENTS_CAPABILITY = 'payments';

/** Request travada (classe 1) com o Fee do envio, relida depois da trava. */
export interface LockedRequest {
  readonly id: string;
  readonly operationId: string;
  readonly requesterPartyId: string;
  readonly holderPartyId: string;
  readonly secondHomeId: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly state: 'pending' | 'expired' | 'cancelled_pre_accept';
  readonly guaranteeCredits: string;
  readonly expiresAt: string;
  /** Motivo pelo qual não pode mais ser aceita (relógio do banco e histórico); `null` = ainda pode. */
  readonly closureReason: RequestClosureReason | null;
  readonly feeChargeId: string;
  readonly paymentId: string;
}

/** Encerramento gravado: o banco decide estado, motivo e prova. */
export interface RecordedClosing {
  readonly transitionId: string;
  readonly state: 'expired' | 'cancelled_pre_accept';
  readonly reason: RequestClosureReason;
  readonly closedAt: string;
}

export interface RequestDraft {
  readonly operationId: string;
  readonly requesterPartyId: string;
  readonly holder: RequestHolding;
  readonly checkin: string;
  readonly checkout: string;
  readonly creditsRequired: string;
  readonly guaranteeCredits: string;
  readonly complementCredits: string;
}

export interface ComplementUnitDraft {
  readonly kind: 'owner_night' | 'co_owner_booking';
  readonly holdingId: string;
  readonly bookingId: string | null;
  readonly secondHomeId: string;
  readonly potentialCredits: string;
  readonly nights: readonly {
    readonly stayDate: string;
    readonly prlId: string;
    readonly credits: string;
  }[];
}

/** Leituras, travas e gravações da Request na transação do command (PostgreSQL em `infrastructure/`). */
export interface RequestStore<Tx> {
  /** K4, K5, K6 e K7, lidas primeiro e dentro da transação. */
  capabilities(tx: Tx): Promise<{
    readonly credits: boolean;
    readonly payments: boolean;
    readonly deposit: boolean;
    readonly exchange: boolean;
  }>;
  /** Delegação vigente usuário → party travada `FOR SHARE` (TECH-050); `false` = não representa. */
  lockDelegation(tx: Tx, userId: string, partyId: string, at: Date): Promise<boolean>;
  /** Memberships `active` de todas as parties (prévia: leitura sem trava; o envio trava pelo executor). */
  membershipsEligible(tx: Tx, partyIds: readonly string[]): Promise<boolean>;
  /** O usuário representa a party agora (BR-211: quem age não representa o detentor). */
  represents(tx: Tx, userId: string, partyId: string, at: Date): Promise<boolean>;
  /** Holdings vigentes da party (solicitante), em qualquer Second Home. */
  currentHoldings(tx: Tx, partyId: string, at: Date): Promise<readonly RequestHolding[]>;
  /** Holding vigente do Owner da Second Home; `null` = não é Owner ou não há. */
  ownerHolding(tx: Tx, secondHomeId: string, at: Date): Promise<RequestHolding | null>;
  /** Holding pelo id, se vigente no instante. */
  holding(tx: Tx, holdingId: string, at: Date): Promise<RequestHolding | null>;
  lockStake(tx: Tx, stakeId: string): Promise<void>;
  /** Trava de uma noite (`app.second_home_date:<casa>:<data>`, classe 5). */
  lockNight(tx: Tx, secondHomeId: string, stayDate: string): Promise<void>;
  nightFacts(
    tx: Tx,
    secondHomeId: string,
    dates: readonly string[],
  ): Promise<readonly DepositNightFacts[]>;
  /** Noites (`${casa}:${data}`) e reservas com compromisso efetivo de complemento (predicado do banco, só leitura). */
  committed(
    tx: Tx,
    nights: readonly { readonly secondHomeId: string; readonly stayDate: string }[],
    bookingIds: readonly string[],
  ): Promise<{ readonly nights: ReadonlySet<string>; readonly bookings: ReadonlySet<string> }>;
  /** Requests pendentes do solicitante com compromisso ativo sobre as unidades (as que o reenvio precisa liberar). */
  blockingRequests(
    tx: Tx,
    requesterPartyId: string,
    nights: readonly { readonly secondHomeId: string; readonly stayDate: string }[],
    bookingIds: readonly string[],
  ): Promise<readonly string[]>;
  /** Trava `FOR UPDATE` das Requests (classe 1), na ordem recebida; inexistente não aparece. */
  lockRequests(tx: Tx, requestIds: readonly string[]): Promise<readonly LockedRequest[]>;
  databaseInstant(tx: Tx): Promise<string>;
  insertRequest(
    tx: Tx,
    draft: RequestDraft,
  ): Promise<{ readonly requestId: string; readonly sentAt: string; readonly expiresAt: string }>;
  insertRequestNights(
    tx: Tx,
    requestId: string,
    secondHomeId: string,
    nights: readonly { readonly stayDate: string; readonly bookingId: string | null }[],
  ): Promise<void>;
  insertComplement(tx: Tx, requestId: string, units: readonly ComplementUnitDraft[]): Promise<void>;
  insertConsent(
    tx: Tx,
    requestId: string,
    textVersion: string,
    terms: RequestTermsDocument,
  ): Promise<void>;
  /** Evento de encerramento pré-aceite da operação; o banco decide estado, motivo e prova. */
  insertClosing(tx: Tx, requestId: string, operationId: string): Promise<RecordedClosing>;
}

/** Request pendente que não pode mais ser aceita, para o job `expire_requests`. */
export interface ClosableRequest {
  readonly requestId: string;
  readonly reason: RequestClosureReason;
}
