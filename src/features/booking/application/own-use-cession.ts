/**
 * Cessão da reserva de uso próprio Co-Owner pelo depósito Luxchange (W20; REQ-060, TECH-023, TECH-055; ADR-0036 §1–§2):
 * a transição `cession` (`confirmed → cancelled`) da reserva inteira, na transação do command do luxchange. O banco
 * confere o command `deposit_capacity`, a K6, o Titular da holding, o Membership, a antecedência, a reserva inteira e o
 * snapshot; sem classe de cancelamento, sem base e sem movimento do Direito de Uso.
 */
export interface CedableBooking {
  readonly id: string;
  readonly secondHomeId: string;
  readonly holdingId: string;
  readonly stakeId: string | null;
  readonly channel: string;
  readonly state: string;
  readonly checkinDate: string;
  readonly checkoutDate: string;
  readonly lastTransitionId: string | null;
}

export interface OwnUseCessionPort<Tx> {
  /** Trava da reserva (`app.booking:<id>`, a mesma dos gatilhos da W13), na posição `booking` da ordem total. */
  lock(tx: Tx, bookingId: string): Promise<void>;
  /** Reservas pelos ids (relidas depois das travas). */
  find(tx: Tx, bookingIds: readonly string[]): Promise<readonly CedableBooking[]>;
  /** Grava a transição `cession` a partir do estado lido; devolve a transição e a primeira noite (do banco). */
  cede(
    tx: Tx,
    input: { readonly booking: CedableBooking; readonly id: string; readonly operationId: string },
  ): Promise<{ readonly transitionId: string; readonly firstAffectedDate: string | null }>;
}
