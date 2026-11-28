import type { RequestStore } from './request-ports';
import type { RequestClosureReason } from '../domain/request';

export interface AcceptanceNight {
  readonly secondHomeId: string;
  readonly stayDate: string;
  readonly custodyId: string;
  readonly bookingId: string | null;
  readonly stakeId: string | null;
  readonly complement: boolean;
}

export interface AcceptanceTerms {
  readonly required: string;
  readonly complement: string;
  readonly consumption: string;
  readonly excess: string;
  readonly holderCreditsMatch: boolean;
}

export interface RequestAcceptanceStore<Tx> extends Pick<
  RequestStore<Tx>,
  | 'capabilities'
  | 'lockRequests'
  | 'lockDelegation'
  | 'represents'
  | 'lockStake'
  | 'lockNight'
  | 'insertClosing'
> {
  pendingConflicts(
    tx: Tx,
    requestId: string,
    holderPartyId: string,
  ): Promise<readonly string[] | null>;
  closedByCompetingAcceptance(tx: Tx, requestId: string): Promise<boolean>;
  acceptanceTerms(tx: Tx, requestId: string, expectedCredits: string): Promise<AcceptanceTerms>;
  cessionNights(tx: Tx, requestId: string): Promise<readonly AcceptanceNight[]>;
  rescan(tx: Tx, requestId: string, lockedRequestIds: readonly string[]): Promise<void>;
  lockCustodies(tx: Tx, custodyIds: readonly string[]): Promise<boolean>;
  recordSnapshotAndRevalidate(
    tx: Tx,
    requestId: string,
    operationId: string,
  ): Promise<{
    readonly reason: RequestClosureReason | null;
    readonly noticeMet: boolean;
    readonly capacityEligible: boolean;
  }>;
  insertAcceptance(tx: Tx, requestId: string, operationId: string): Promise<string>;
  openDestination(tx: Tx, requestId: string, operationId: string): Promise<string>;
}
