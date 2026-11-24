/**
 * Custódia e ocupação do depósito Luxchange (W20; TECH-022, TECH-023, BR-161, BR-202; ADR-0036 §3). O banco confere
 * cada escrita contra a operação `deposit_capacity` da transação, a K6, a representação, o Membership, a antecedência e
 * o snapshot por noite; aqui só a escrita, na transação do command do luxchange.
 */

/** Origem da noite cedida: `owner` livre (Owner) ou `use_right/reserved_right` da Ação (Co-Owner). */
export type CessionSource =
  { readonly kind: 'owner' } | { readonly kind: 'reserved_right'; readonly stakeId: string };

export interface NightCession {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly source: CessionSource;
  readonly operationId: string;
}

export interface CededOccupancyRelease {
  readonly bookingId: string;
  readonly stayDate: string;
  readonly operationId: string;
}

export interface LuxchangeCessionInventory<Tx> {
  /**
   * Fecha a custódia de origem ativa da noite e abre `luxtory/inventory/luxchange_cession` com a referência do depósito;
   * `false` se a origem não estava ativa (noite já movida por outra operação).
   */
  cedeNight(tx: Tx, cession: NightCession): Promise<boolean>;
  /** Libera com `ceded` a ocupação `own_use` ativa da reserva cedida na noite; `false` se não havia ocupação ativa. */
  releaseCededOccupancy(tx: Tx, release: CededOccupancyRelease): Promise<boolean>;
}

/** Referência da entrada no Inventário Luxtory pelo depósito (BR-161): a operação que originou os Créditos. */
export const depositAuthorizationRef = (operationId: string) => `deposit_capacity:${operationId}`;
