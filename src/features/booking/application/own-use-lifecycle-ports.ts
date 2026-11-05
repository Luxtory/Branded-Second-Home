import type { UseRightReversal } from '@/features/calendar/booking';
import type { OwnUseLifecycleInventory } from '@/features/inventory';
import type { Actor } from '@/features/platform';
import type {
  BookingState,
  CancellationClass,
  ExceptionType,
  LifecycleNight,
  Micros,
  TransitionKind,
} from '../domain/own-use-lifecycle';
import type { Representation } from './create-own-use-booking';

/** Reserva de uso próprio como o ciclo a lê (W13). Campos imutáveis + estado projetado (ADR-0027 §2). */
export interface LifecycleBooking {
  readonly id: string;
  readonly secondHomeId: string;
  readonly holdingId: string;
  readonly stakeId: string | null;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly state: BookingState;
  readonly lastTransitionId: string | null;
  readonly openedByOperation: string;
}

export interface LifecyclePeriod {
  /** Noites da reserva com o check-in gravado na selagem, em ordem crescente. */
  readonly nights: readonly LifecycleNight[];
  readonly checkoutAt: Micros;
}

export interface OpenException {
  readonly id: string;
  readonly type: ExceptionType;
}

export type AuthorizationPurpose =
  'no_show' | 'recovery' | 'exception_cancellation' | 'invalidation';

/** Autorização independente viva: não usada, não revogada e `now < valid_until` (ADR-0027 §4). */
export interface LiveAuthorization {
  readonly id: string;
  readonly scopeDates: readonly string[];
  readonly scopeCustodyIds: readonly string[];
  readonly expectedClass: CancellationClass | null;
}

/** Transição como o banco a gravou: instante, classe e primeira noite afetada calculados no instante da escrita. */
export interface RecordedTransition {
  readonly id: string;
  readonly recordedAt: Micros;
  readonly cancellationClass: CancellationClass | null;
  readonly firstAffectedDate: string | null;
}

export interface TransitionDraft {
  readonly id: string;
  readonly booking: LifecycleBooking;
  readonly kind: TransitionKind;
  readonly toState: BookingState;
  readonly operationId: string;
  /** Termos esperados da prévia (só no cancelamento do Titular, D7); nos atos Admin o banco grava os calculados. */
  readonly expectedClass: CancellationClass | null;
  readonly expectedFirstAffectedDate: string | null;
  /** Base registrada (atos Admin); nula no cancelamento do Titular. */
  readonly basis: string | null;
}

/** Fatos para a solicitação de autorização, derivados no banco pelas mesmas funções do autorizador (ADR-0027 §4). */
export interface AuthorizationRequestFacts {
  readonly noShowWindowOpen: boolean;
  readonly unstartedDates: readonly string[];
  readonly cancellationClass: CancellationClass | null;
  /** Custódias `forfeited_right` ativas e futuras com linhagem à reserva, ordenadas por id. */
  readonly recoverableCustodyIds: readonly string[];
  readonly recoverableFromException: boolean;
}

export interface RecoverableNight {
  readonly custodyId: string;
  readonly stayDate: string;
  readonly checkinAt: Micros;
}

export interface BookingLifecycleStore<Tx> {
  /** K2 `own_use_lifecycle` (ADR-0027 §5); a leitura mantém a tabela travada em modo compartilhado. */
  lifecycleActivated(tx: Tx): Promise<boolean>;
  findBooking(tx: Tx, bookingId: string): Promise<LifecycleBooking | null>;
  period(tx: Tx, bookingId: string): Promise<LifecyclePeriod>;
  openException(tx: Tx, bookingId: string): Promise<OpenException | null>;
  /** Delegação ativa travada `FOR SHARE` + holding vigente da party na Second Home (W12). */
  lockRepresentation(
    tx: Tx,
    input: { userId: string; partyId: string; secondHomeId: string; at: Date },
  ): Promise<Representation | null>;
  lockStake(tx: Tx, stakeId: string): Promise<void>;
  lockNights(tx: Tx, secondHomeId: string, stayDates: readonly string[]): Promise<void>;
  /** Trava consultiva `app.booking:<id>` (a mesma do gatilho; ADR-0027 nota 1). */
  lockBooking(tx: Tx, bookingId: string): Promise<void>;
  holdingParty(tx: Tx, holdingId: string): Promise<string | null>;
  insertTransition(tx: Tx, draft: TransitionDraft): Promise<RecordedTransition>;
  insertException(
    tx: Tx,
    exception: {
      readonly id: string;
      readonly bookingId: string;
      readonly type: ExceptionType;
      readonly reason: string | null;
      readonly incidentRef: string | null;
      readonly openedByTransitionId: string;
    },
  ): Promise<void>;
  insertResolution(
    tx: Tx,
    resolution: {
      readonly exceptionId: string;
      readonly bookingId: string;
      readonly transitionId: string;
      readonly outcome: 'confirmed' | 'completed' | 'cancelled';
      readonly source: 'admin' | 'titular_cancellation';
    },
  ): Promise<void>;
  liveAuthorization(
    tx: Tx,
    query: {
      readonly bookingId: string;
      readonly purpose: AuthorizationPurpose;
      readonly exceptionId: string | null;
    },
  ): Promise<LiveAuthorization | null>;
  /** Uso da autorização na operação; devolve o instante do uso gravado pelo banco. */
  useAuthorization(
    tx: Tx,
    use: {
      readonly authorizationId: string;
      readonly bookingId: string;
      readonly operationId: string;
    },
  ): Promise<Micros>;
  requestFacts(tx: Tx, booking: LifecycleBooking): Promise<AuthorizationRequestFacts>;
  insertRequest(
    tx: Tx,
    request: {
      readonly id: string;
      readonly bookingId: string;
      readonly purpose: AuthorizationPurpose;
      readonly exceptionId: string | null;
      readonly expectedDates: readonly string[];
      readonly expectedCustodyIds: readonly string[];
      readonly expectedClass: CancellationClass | null;
      readonly availabilityAttested: boolean;
      readonly basis: string;
      readonly operationId: string;
    },
  ): Promise<void>;
  /** Custódias indicadas ainda `forfeited_right` ativas, com o check-in da noite, em ordem crescente de noite. */
  recoverableNights(tx: Tx, custodyIds: readonly string[]): Promise<readonly RecoverableNight[]>;
}

/** Autoridade Admin revalidada na transação (trava compartilhada do `staff_role` + releitura; ADR-0021). */
export type AdminAuthority<Tx> = (tx: Tx, actor: Actor, authorizationRef: string) => Promise<void>;

export interface LifecycleDependencies<Tx> {
  readonly store: BookingLifecycleStore<Tx>;
  readonly inventory: OwnUseLifecycleInventory<Tx>;
  readonly reversal: UseRightReversal<Tx>;
  readonly assertAdmin: AdminAuthority<Tx>;
  readonly newId?: () => string;
}
