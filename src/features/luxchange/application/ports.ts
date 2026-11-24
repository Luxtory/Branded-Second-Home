import type { DepositHolding, DepositNightFacts } from '../domain/deposit';

/** K6 do depósito (ADR-0036 §7) e K4 dos Créditos (ADR-0033 §8) na tabela de ativação privilegiada. */
export const LUXCHANGE_DEPOSIT_CAPABILITY = 'luxchange_deposit';
export const CREDITS_CAPABILITY = 'credits';

/** Leituras e travas do depósito na transação do command (PostgreSQL em `infrastructure/`). */
export interface DepositStore<Tx> {
  /** Linhas das capabilities K4 e K6 (lidas primeiro e dentro da transação, como a K1/K2). */
  capabilities(tx: Tx): Promise<{ readonly credits: boolean; readonly deposit: boolean }>;
  /** Delegação vigente travada `FOR SHARE` e holding vigente da party na Second Home; `null` = não representa. */
  lockRepresentation(
    tx: Tx,
    input: {
      readonly userId: string;
      readonly partyId: string;
      readonly secondHomeId: string;
      readonly at: Date;
    },
  ): Promise<DepositHolding | null>;
  /** Trava da Ação (`app.stake:<id>`, classe 4). */
  lockStake(tx: Tx, stakeId: string): Promise<void>;
  /** Travas das noites (`app.second_home_date:<casa>:<data>`, classe 5), na ordem recebida. */
  lockNights(tx: Tx, secondHomeId: string, dates: readonly string[]): Promise<void>;
  /** Noites seladas pedidas com custódia e ocupação ativas; noite não selada não aparece. */
  nightFacts(
    tx: Tx,
    secondHomeId: string,
    dates: readonly string[],
  ): Promise<readonly DepositNightFacts[]>;
  /** Instante do banco (`clock_timestamp()`), ISO 8601. */
  databaseInstant(tx: Tx): Promise<string>;
}
