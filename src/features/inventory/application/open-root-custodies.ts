import { randomUUID } from 'node:crypto';
import { rootHolderFor, type AcquisitionModality, type RootHolder } from '../domain/root-custody';

export interface RootCustody {
  readonly id: string;
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly holderKind: RootHolder;
  readonly operationId: string;
}

export interface RootCustodyStore<Tx> {
  insert(tx: Tx, custodies: readonly RootCustody[]): Promise<void>;
}

export interface OpenRootCustodiesInput {
  readonly secondHomeId: string;
  readonly modality: AcquisitionModality;
  /** Noites seladas na mesma transação, `YYYY-MM-DD`. */
  readonly stayDates: readonly string[];
  /** Operação do command que sela (TECH-002). */
  readonly operationId: string;
}

/**
 * Abre a custódia raiz de cada noite recém-selada (TECH-021), na transação do command que sela. O banco confere que
 * é a primeira custódia da noite, que segue a modalidade e que a operação é a da transação (spec inventory §4).
 */
export async function openRootCustodies<Tx>(
  store: RootCustodyStore<Tx>,
  tx: Tx,
  input: OpenRootCustodiesInput,
  newId: () => string = randomUUID,
): Promise<RootHolder> {
  const holderKind = rootHolderFor(input.modality);
  await store.insert(
    tx,
    input.stayDates.map((stayDate) => ({
      id: newId(),
      secondHomeId: input.secondHomeId,
      stayDate,
      holderKind,
      operationId: input.operationId,
    })),
  );
  return holderKind;
}
