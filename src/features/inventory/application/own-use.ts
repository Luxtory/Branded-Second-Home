/** Estado de uma noite selada para o uso próprio: a custódia ativa e se já há ocupação ativa (TECH-021). */
export interface NightCustodyState {
  readonly stayDate: string;
  readonly custodyId: string;
  readonly holderKind: string;
  readonly basis: string | null;
  readonly stakeId: string | null;
  readonly occupied: boolean;
}

/** Ocupação `own_use` de uma noite da reserva (TECH-023: `owner`, ou `reserved_right` da mesma Ação). */
export interface OwnUseOccupancy {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly bookingId: string;
  readonly custodyId: string;
  readonly stakeId: string | null;
  readonly operationId: string;
}

/** Transição `spe_pool → use_right/reserved_right` da Ação (TECH-022, reserva Co-Owner). */
export interface ReservedRightTransition {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly parentCustodyId: string;
  readonly stakeId: string;
  readonly operationId: string;
}

/** Custódia e ocupação do uso próprio por SQL direto do servidor; o banco decide o que é permitido (ADR-0026). */
export interface OwnUseInventory<Tx> {
  nightStates(
    tx: Tx,
    secondHomeId: string,
    stayDates: readonly string[],
  ): Promise<readonly NightCustodyState[]>;
  /** Fecha a `spe_pool` ativa e abre a `reserved_right`; devolve a custódia aberta, ou `null` se a mãe já fechou. */
  reserveRight(tx: Tx, transition: ReservedRightTransition): Promise<string | null>;
  occupy(tx: Tx, occupancies: readonly OwnUseOccupancy[]): Promise<void>;
}
