// Superfície pública do módulo credits (TECH-011) para os commands das waves seguintes (W20 depósito, W21 envio de
// Request, W22 aceite/recusa, W23 Direct): mecanismos do ledger (ADR-0033), o adaptador PostgreSQL e os tipos. O job
// fica em `./jobs`; a Carteira, em `./presentation`.
export {
  consumeCredits,
  consumeHold,
  holdCredits,
  originateCreditLot,
  releaseHold,
  MissingValidityTermsError,
  type LedgerContext,
  type LedgerDependencies,
  type Movement,
} from './application/credit-ledger';
export type { CreditStore, OriginatedLot, SnapshotRecorder } from './application/ports';
export { createReverseCreditHandler, type ReverseCreditResult } from './application/reverse-credit';
export { isCreditQuantity } from './domain/credit';
export { createPostgresCreditStore } from './infrastructure/postgres-credit-store';
// W20: saldo disponível da party representada, para o resumo do depósito Luxchange (leitura sob RLS).
export { readAvailableCredits } from './presentation/wallet-read';
