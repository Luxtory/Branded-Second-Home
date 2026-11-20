import type { MembershipState } from '../domain/membership';

/** Linha de `app.membership` (W15): estado atual e a última mudança (instante e operação derivados pelo banco). */
export interface MembershipRecord {
  readonly id: string;
  readonly partyId: string;
  readonly state: MembershipState;
  readonly basis: string;
  readonly changedAt: Date;
  readonly operationId: string;
  readonly createdAt: Date;
}

/** Persistência do Membership; autor, autoridade e instante são do banco (gatilho `membership_write`, ADR-0031 §3). */
export interface MembershipStore<Tx> {
  partyExists(tx: Tx, partyId: string): Promise<boolean>;
  /** Trava a linha da party (`FOR NO KEY UPDATE`, classe 3 da TECH-053); sem Membership → `null`. */
  lockMembership(tx: Tx, partyId: string): Promise<MembershipRecord | null>;
  insertMembership(
    tx: Tx,
    row: {
      readonly id: string;
      readonly partyId: string;
      readonly basis: string;
      readonly operationId: string;
    },
  ): Promise<MembershipRecord>;
  changeMembership(
    tx: Tx,
    row: {
      readonly partyId: string;
      readonly state: MembershipState;
      readonly basis: string;
      readonly operationId: string;
    },
  ): Promise<MembershipRecord>;
}
