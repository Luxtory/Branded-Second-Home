/**
 * Custódia e ocupação no ciclo da reserva de uso próprio (W13; TECH-022, TECH-060, BR-283; spec booking §10.3, §10.6).
 * O banco confere cada escrita contra a transição da mesma operação, a noite não iniciada e a autorização (ADR-0027);
 * aqui só a escrita, na transação do command do booking.
 */

export type ReleaseReason = 'cancelled' | 'no_show' | 'exception' | 'invalidation';

export interface OccupancyRelease {
  readonly bookingId: string;
  readonly stayDate: string;
  readonly reason: ReleaseReason;
  readonly operationId: string;
}

/** Sucessora da `use_right/reserved_right` da Ação: `spe_pool` (tempestivo, invalidação) ou `forfeited_right`. */
export interface ReservedRightSuccession {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly stakeId: string;
  readonly successor: 'spe_pool' | 'forfeited_right';
  readonly operationId: string;
}

export interface OwnUseLifecycleInventory<Tx> {
  /** Libera a ocupação ativa da reserva na noite; `false` se não havia ocupação ativa. */
  releaseOccupancy(tx: Tx, release: OccupancyRelease): Promise<boolean>;
  /** Fecha a `reserved_right` ativa da Ação na noite e abre a sucessora; `false` se ela não estava ativa. */
  succeedReservedRight(tx: Tx, succession: ReservedRightSuccession): Promise<boolean>;
}

/** Escrita do ciclo que o banco aceitou mas não encontrou o estado esperado: bug ou corrida não serializada. */
export class OwnUseLifecycleWriteError extends Error {
  constructor(what: string) {
    super(`Own use lifecycle write found no active row: ${what}`);
    this.name = 'OwnUseLifecycleWriteError';
  }
}
