import type { AcquisitionCatalog } from '@/features/catalog';
import type { CivilCalendar } from '@/features/calendar';
import type { Actor, Clock } from '@/features/platform';
import type {
  AcquisitionConfiguration,
  AllocationGrant,
  SeasonalQuantity,
} from '../domain/acquisition';
import type { AdministrationInput, InitialAllocationInput } from './acquisition-input';

export interface AcquisitionRecord {
  readonly id: string;
  readonly modality: string;
  readonly operationStartDate: string;
  readonly operationStarted: boolean;
}
export interface InitialAllocationRecord {
  readonly id: string;
  readonly secondHomeId: string;
  readonly configurationId: number;
  readonly operationStartDate: string;
  readonly grants: readonly AllocationGrant[];
  readonly luxtoryCapacity: SeasonalQuantity;
}
interface StructureReference {
  readonly id: string;
  readonly secondHomeId: string;
  readonly acquisitionId: string;
  readonly operationId: string;
}
export interface SpeRecord extends StructureReference {
  readonly partyId: string;
}
export interface StakeRecord extends StructureReference {
  readonly speId: string;
  readonly position: number;
  readonly participationBps: number;
}
export interface HoldingRecord extends StructureReference {
  readonly partyId: string;
  readonly role: 'owner' | 'co_owner';
  readonly stakeId: string | null;
  readonly participationBps: number;
  readonly validFrom: Date;
}
export interface UseRightGrant extends StructureReference {
  readonly stakeId: string;
  readonly exerciseYear: number;
  readonly bucket: 'alta' | 'media';
  readonly source: 'configuration' | 'initial_allocation';
  readonly initialAllocationId: string | null;
  readonly quantity: number;
  readonly createdAt: Date;
}
export interface AdministrationRecord {
  readonly id: string;
  readonly secondHomeId: string;
  readonly validFrom: string;
  readonly replaced: boolean;
}
export interface AcquisitionStore<Tx> {
  configuration(tx: Tx, id: number): Promise<AcquisitionConfiguration | null>;
  institution(tx: Tx): Promise<string | null>;
  acquisition(tx: Tx, home: string): Promise<AcquisitionRecord | null>;
  allocation(tx: Tx, id: string): Promise<InitialAllocationRecord | null>;
  nextAllocationVersion(tx: Tx, home: string): Promise<number>;
  insertAllocation(
    tx: Tx,
    input: InitialAllocationInput,
    id: string,
    version: number,
    at: Date,
    operationId: string,
  ): Promise<void>;
  insertSpe(tx: Tx, record: SpeRecord): Promise<void>;
  insertStake(tx: Tx, record: StakeRecord): Promise<void>;
  insertHolding(tx: Tx, record: HoldingRecord): Promise<void>;
  insertGrant(tx: Tx, record: UseRightGrant): Promise<void>;
  administration(tx: Tx, id: string): Promise<AdministrationRecord | null>;
  insertAdministration(
    tx: Tx,
    coverage: AdministrationInput['coverages'][number],
    context: {
      readonly id: string;
      readonly secondHomeId: string;
      readonly basisRef: string;
      readonly operationId: string;
      readonly at: Date;
    },
  ): Promise<void>;
  hasProfessionalCoverage(tx: Tx, home: string, from: string): Promise<boolean>;
}
export interface AcquisitionDependencies<Tx> {
  readonly store: AcquisitionStore<Tx>;
  readonly catalog: AcquisitionCatalog<Tx>;
  readonly calendar: CivilCalendar;
  readonly clock: Clock;
  readonly newId: () => string;
  readonly assertAvailable: () => void | Promise<void>;
  readonly assertAuthority: (tx: Tx, actor: Actor, authorizationRef: string) => Promise<void>;
  readonly party: (
    tx: Tx,
    id: string,
  ) => Promise<{ readonly id: string; readonly documentType: 'cpf' | 'cnpj' } | null>;
}
export type AcquisitionResult = {
  readonly id: string;
  readonly second_home_id: string;
  readonly operation_id: string;
};
