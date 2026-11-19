import type { NightCustodyState } from './own-use';

/** Finalidades da capacidade Luxtory (BR-121; 03 §3.2, `date_custody.purpose`). */
export const LUXTORY_PURPOSES = [
  'maintenance',
  'marketing',
  'promotion',
  'production',
  'inventory',
] as const;
export type LuxtoryPurpose = (typeof LUXTORY_PURPOSES)[number];

/** Transição `spe_pool → luxtory/{finalidade}` da seleção Luxtory (TECH-022; `inventory ⇔ annual_allocation`). */
export interface LuxtorySelectionTransition {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly parentCustodyId: string;
  readonly purpose: LuxtoryPurpose;
  /** Base registrada do Admin (REQ-040: autorização identificável). */
  readonly authorizationRef: string;
  readonly operationId: string;
}

/**
 * Custódia da seleção Luxtory por SQL direto do servidor; o banco decide o que é permitido (ADR-0030 §2). Só a
 * custódia: seleção de capacidade não é ocupação (D1).
 */
export interface LuxtorySelectionInventory<Tx> {
  nightStates(
    tx: Tx,
    secondHomeId: string,
    stayDates: readonly string[],
  ): Promise<readonly NightCustodyState[]>;
  /** Fecha a `spe_pool` ativa e abre `luxtory/{finalidade}`; devolve a custódia aberta, ou `null` se a mãe já fechou. */
  select(tx: Tx, transition: LuxtorySelectionTransition): Promise<string | null>;
}
