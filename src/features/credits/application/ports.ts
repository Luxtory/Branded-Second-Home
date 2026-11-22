import type { EconomicTerms } from '@/features/pricing';
import type { UsableLot } from '../domain/credit';

/** Movimento a gravar (ADR-0033 §2); command, instante e buckets vêm do banco. */
export interface EntryDraft {
  readonly lotId: string;
  readonly movement: 'hold' | 'release' | 'consume' | 'expire' | 'reverse';
  readonly from: 'available' | 'held' | 'consumed';
  readonly to: 'available' | 'held' | 'consumed' | 'expired';
  readonly quantity: string;
  readonly parentEntryId?: string;
  readonly basis?: string;
}

/** Saldo ainda reservado (Garantia) ou consumido por um movimento-pai, com a validade do lote. */
export interface OpenEntry {
  readonly entryId: string;
  readonly lotId: string;
  readonly remaining: string;
  /** Lote ainda válido no instante do banco (`now < expires_at`). */
  readonly valid: boolean;
  /** Chave de trava do lote (TECH-053, classe 7): instantes ISO 8601 UTC com microssegundos. */
  readonly expiresAt: string;
  readonly originatedAt: string;
}

/** Lote travado, com o saldo disponível e a validade no instante do banco. */
export interface LockedLot {
  readonly id: string;
  readonly available: string;
  readonly valid: boolean;
  readonly expiresAt: string;
  readonly originatedAt: string;
}

export interface OriginatedLot {
  readonly lotId: string;
  readonly quantity: string;
  readonly originatedAt: string;
  readonly expiresAt: string;
}

/** Persistência dos Créditos (PostgreSQL em `infrastructure/`); toda trava segue a TECH-053. */
export interface CreditStore<Tx> {
  /**
   * Lotes da party com saldo e `expires_at` futuro no relógio do banco, em ordem FEFO, travados `FOR UPDATE` nessa
   * ordem (classe 7).
   */
  lockUsableLots(tx: Tx, partyId: string): Promise<readonly UsableLot[]>;
  /** Garantias (`hold`) ou consumos de uma operação com saldo restante; lotes travados em ordem FEFO. */
  lockOpenEntries(
    tx: Tx,
    operationId: string,
    movement: 'hold' | 'consume',
  ): Promise<readonly OpenEntry[]>;
  /** Um movimento de consumo com o saldo ainda reversível; lote travado. `null` = não é um consumo. */
  lockConsumption(tx: Tx, entryId: string): Promise<OpenEntry | null>;
  /** Um lote travado `FOR UPDATE`; `null` = inexistente. */
  lockLot(tx: Tx, lotId: string): Promise<LockedLot | null>;
  insertLot(
    tx: Tx,
    input: { operationId: string; partyId: string; quantity: string },
  ): Promise<OriginatedLot>;
  insertEntries(
    tx: Tx,
    operationId: string,
    entries: readonly EntryDraft[],
  ): Promise<readonly string[]>;
}

/** Persistência do snapshot econômico (módulo `pricing`, TECH-031). */
export interface SnapshotRecorder<Tx> {
  record(tx: Tx, operationId: string, terms: EconomicTerms): Promise<void>;
}
