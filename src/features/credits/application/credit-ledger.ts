import { CommandRejection, type LockSequence } from '@/features/platform';
import type { EconomicTerms } from '@/features/pricing';
import {
  allocateFefo,
  compareQuantities,
  instantMicros,
  parseCreditQuantity,
  type Allocation,
  type UsableLot,
} from '../domain/credit';
import type { CreditStore, EntryDraft, OpenEntry, OriginatedLot, SnapshotRecorder } from './ports';

/**
 * Mecanismos dos Créditos (ADR-0033; TECH-070, TECH-071, TECH-072) para os commands das waves seguintes, dentro da
 * transação do command (TECH-054). Quem chama já verificou autoridade e, nos commands `eligible`, o Membership da party
 * que age (classe 3, ADR-0031 §5) e travou as classes 4–6 que usar; aqui só a classe 7 (`credit_lot`). O banco confere
 * de novo cada movimento (validade, Membership, representação, saldo).
 */
export interface LedgerContext<Tx> {
  readonly tx: Tx;
  readonly locks: LockSequence;
  readonly operationId: string;
}

export interface LedgerDependencies<Tx> {
  readonly store: CreditStore<Tx>;
}

export interface Movement {
  readonly entryId: string;
  readonly lotId: string;
  readonly quantity: string;
}

export class MissingValidityTermsError extends Error {
  constructor() {
    super(
      'Credit origination requires the credit_validity_months economic term (TECH-031, TECH-044)',
    );
    this.name = 'MissingValidityTermsError';
  }
}

type LockKeyed = Pick<UsableLot, 'expiresAt' | 'originatedAt'> & { readonly id: string };

/** Registra a classe 7 na ordem de travas com as chaves das linhas que o banco travou (FEFO = ordem da TECH-053). */
function claimLots(locks: LockSequence, lots: readonly LockKeyed[]): void {
  locks.claim(
    'credit_lot',
    lots.map((lot) => [lot.expiresAt, lot.originatedAt, lot.id] as const),
  );
}

async function record<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  drafts: readonly EntryDraft[],
): Promise<Movement[]> {
  const ids = await deps.store.insertEntries(context.tx, context.operationId, drafts);
  return drafts.map((draft, index) => ({
    entryId: ids[index]!,
    lotId: draft.lotId,
    quantity: draft.quantity,
  }));
}

/**
 * Originação (`external → available`; ADR-0033 §3): persiste o snapshot dos termos (TECH-031) e cria o lote da party
 * que age. O banco grava `originated_at` (instante do snapshot) e `expires_at` (TECH-044) a partir da versão de
 * `credit_validity_months` registrada; a quantidade é do mecanismo que origina (W20: Σ PRL × multiplicador).
 */
export async function originateCreditLot<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx> & { readonly snapshots: SnapshotRecorder<Tx> },
  input: { readonly partyId: string; readonly quantity: string; readonly terms: EconomicTerms },
): Promise<OriginatedLot> {
  parseCreditQuantity(input.quantity);
  if (input.terms.parameters.credit_validity_months === undefined)
    throw new MissingValidityTermsError();
  await deps.snapshots.record(context.tx, context.operationId, input.terms);
  return deps.store.insertLot(context.tx, {
    operationId: context.operationId,
    partyId: input.partyId,
    quantity: input.quantity,
  });
}

/**
 * Créditos em Garantia (TECH-071): FEFO entre os lotes que vencem no prazo da Request ou depois
 * (`lot.expires_at ≥ coverUntil`). Saldo total suficiente sem cobertura → `ERR_CREDIT_HOLD_INVALID` (EC-6); saldo
 * insuficiente → `ERR_CREDITS_INSUFFICIENT`. `coverUntil`: prazo da Request, ISO 8601 UTC.
 */
export async function holdCredits<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  input: { readonly partyId: string; readonly quantity: string; readonly coverUntil: string },
): Promise<Movement[]> {
  const lots = await lockUsable(context, deps, input.partyId);
  const until = instantMicros(input.coverUntil);
  const covering = lots.filter((lot) => instantMicros(lot.expiresAt) >= until);
  const allocations = allocateFefo(covering, input.quantity);
  if (allocations === null)
    throw new CommandRejection(
      allocateFefo(lots, input.quantity) === null
        ? 'ERR_CREDITS_INSUFFICIENT'
        : 'ERR_CREDIT_HOLD_INVALID',
    );
  return record(context, deps, drafts(allocations, 'hold', 'available', 'held'));
}

/** Consumo direto (Direct; `available → consumed`) em FEFO (PD-008). */
export async function consumeCredits<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  input: { readonly partyId: string; readonly quantity: string },
): Promise<Movement[]> {
  const lots = await lockUsable(context, deps, input.partyId);
  const allocations = allocateFefo(lots, input.quantity);
  if (allocations === null) throw new CommandRejection('ERR_CREDITS_INSUFFICIENT');
  return record(context, deps, drafts(allocations, 'consume', 'available', 'consumed'));
}

/** Aceite (`held → consumed`): todo o saldo ainda reservado pela operação de Garantia. */
export async function consumeHold<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  input: { readonly holdOperationId: string },
): Promise<Movement[]> {
  const open = await lockOpen(context, deps, input.holdOperationId, 'hold');
  if (open.some((entry) => !entry.valid)) throw new CommandRejection('ERR_CREDIT_HOLD_INVALID');
  return record(
    context,
    deps,
    open.map((entry) => ({
      lotId: entry.lotId,
      movement: 'consume',
      from: 'held',
      to: 'consumed',
      quantity: entry.remaining,
      parentEntryId: entry.entryId,
    })),
  );
}

/**
 * Encerramento pré-aceite (TECH-071): libera todo o saldo ainda reservado — para `available` antes do vencimento do
 * lote, para `expired` depois (TECH-072).
 */
export async function releaseHold<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  input: { readonly holdOperationId: string },
): Promise<Movement[]> {
  const open = await lockOpen(context, deps, input.holdOperationId, 'hold');
  return record(
    context,
    deps,
    open.map((entry) => ({
      lotId: entry.lotId,
      movement: 'release',
      from: 'held',
      to: entry.valid ? 'available' : 'expired',
      quantity: entry.remaining,
      parentEntryId: entry.entryId,
    })),
  );
}

/**
 * Reversão de um consumo (TECH-070): `consumed → available` antes do vencimento, `consumed → expired` depois. Nunca
 * acima do que o consumo ainda tem; nunca muda de lote ou party.
 */
export async function reverseConsumption<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  input: { readonly entryId: string; readonly quantity: string; readonly basis: string },
): Promise<Movement & { readonly to: 'available' | 'expired' }> {
  parseCreditQuantity(input.quantity);
  const consumption = await deps.store.lockConsumption(context.tx, input.entryId);
  if (consumption === null) throw new CommandRejection('ERR_NOT_FOUND');
  claimLots(context.locks, [{ ...consumption, id: consumption.lotId }]);
  if (compareQuantities(input.quantity, consumption.remaining) > 0)
    throw new CommandRejection('ERR_CREDITS_INSUFFICIENT');
  const to = consumption.valid ? 'available' : 'expired';
  const [movement] = await record(context, deps, [
    {
      lotId: consumption.lotId,
      movement: 'reverse',
      from: 'consumed',
      to,
      quantity: input.quantity,
      parentEntryId: consumption.entryId,
      basis: input.basis,
    },
  ]);
  return { ...movement!, to };
}

/** Materializa a expiração (`available → expired`) de todo o saldo disponível de um lote já vencido (TECH-072). */
export async function expireLot<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  input: { readonly lotId: string },
): Promise<Movement> {
  const lot = await deps.store.lockLot(context.tx, input.lotId);
  if (lot === null) throw new CommandRejection('ERR_NOT_FOUND');
  claimLots(context.locks, [lot]);
  if (lot.valid || compareQuantities(lot.available, '0') <= 0)
    throw new CommandRejection('ERR_STATE_TRANSITION');
  const [movement] = await record(context, deps, [
    {
      lotId: lot.id,
      movement: 'expire',
      from: 'available',
      to: 'expired',
      quantity: lot.available,
    },
  ]);
  return movement!;
}

async function lockUsable<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  partyId: string,
): Promise<readonly UsableLot[]> {
  const lots = await deps.store.lockUsableLots(context.tx, partyId);
  claimLots(context.locks, lots);
  return lots;
}

async function lockOpen<Tx>(
  context: LedgerContext<Tx>,
  deps: LedgerDependencies<Tx>,
  operationId: string,
  movement: 'hold' | 'consume',
): Promise<readonly OpenEntry[]> {
  const open = await deps.store.lockOpenEntries(context.tx, operationId, movement);
  claimLots(
    context.locks,
    open.map((entry) => ({ ...entry, id: entry.lotId })),
  );
  if (open.length === 0) throw new CommandRejection('ERR_STATE_TRANSITION');
  return open;
}

function drafts(
  allocations: readonly Allocation[],
  movement: 'hold' | 'consume',
  from: 'available',
  to: 'held' | 'consumed',
): EntryDraft[] {
  return allocations.map((allocation) => ({
    lotId: allocation.lotId,
    movement,
    from,
    to,
    quantity: allocation.quantity,
  }));
}
