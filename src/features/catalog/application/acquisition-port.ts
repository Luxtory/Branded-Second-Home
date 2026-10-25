import type { Clock } from '@/features/platform';
export interface AcquisitionOrigin {
  readonly id: string;
  readonly timezone: string;
}
/** Definitive catalog facts are an immutable extension of its original Second Home (ADR-0021). */
export interface SecondHomeFormalization {
  readonly id: string;
  readonly secondHomeId: string;
  readonly modality: 'owner' | 'co_owner';
  readonly location: string;
  readonly configurationId: number | null;
  readonly operationStartDate: string;
  readonly initialAllocationId: string | null;
  readonly basisRef: string;
  readonly formalizedAt: Date;
  readonly operationId: string;
}
export interface SecondHomeOperationStart {
  readonly id: string;
  readonly secondHomeId: string;
  readonly acquisitionId: string;
  readonly effectiveStartDate: string;
  readonly registeredAt: Date;
  readonly basisRef: string;
  readonly operationId: string;
}
export interface AcquisitionCatalog<Tx> {
  lockForFormalization(
    tx: Tx,
    id: string,
    clock: Clock,
  ): Promise<AcquisitionOrigin & { readonly validatedAt: Date }>;
  /** Existing formalized homes retain continuity (BR-022), without treating auxiliaries as new brand uses. */
  lockRoot(tx: Tx, id: string): Promise<AcquisitionOrigin>;
  recordFormalization(tx: Tx, fact: SecondHomeFormalization): Promise<void>;
  recordOperationStart(tx: Tx, fact: SecondHomeOperationStart): Promise<void>;
}
