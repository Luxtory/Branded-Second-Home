import { sql, type Selectable } from 'kysely';
import type { DatabaseTables, DatabaseTransaction, MembershipGate } from '@/features/platform';
import type { MembershipRecord, MembershipStore } from '../application/membership-ports';
import {
  isMembershipEligible,
  MEMBERSHIP_STATES,
  type MembershipState,
} from '../domain/membership';

type MembershipRow = Pick<
  Selectable<DatabaseTables['app.membership']>,
  'id' | 'party_id' | 'state' | 'basis' | 'changed_at' | 'operation_id' | 'created_at'
>;

const COLUMNS = [
  'id',
  'party_id',
  'state',
  'basis',
  'changed_at',
  'operation_id',
  'created_at',
] as const;

function toState(value: string): MembershipState {
  const state = MEMBERSHIP_STATES.find((candidate) => candidate === value);
  if (state === undefined) throw new Error(`Unknown Membership state in the database: ${value}`);
  return state;
}

function toRecord(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    partyId: row.party_id,
    state: toState(row.state),
    basis: row.basis,
    changedAt: new Date(row.changed_at),
    operationId: row.operation_id,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Store do Membership (W15, ADR-0031). O papel da aplicação só grava `state`, `basis` e `operation_id`: autor,
 * autoridade e instante vêm do gatilho, e o `RETURNING` devolve o que o banco carimbou.
 */
export const postgresMembershipStore: MembershipStore<DatabaseTransaction> = {
  async partyExists(tx, partyId) {
    const row = await tx
      .selectFrom('app.party')
      .select('id')
      .where('id', '=', partyId)
      .executeTakeFirst();
    return row !== undefined;
  },
  async lockMembership(tx, partyId) {
    const row = await tx
      .selectFrom('app.membership')
      .select(COLUMNS)
      .where('party_id', '=', partyId)
      .forNoKeyUpdate()
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row);
  },
  async insertMembership(tx, { id, partyId, basis, operationId }) {
    const { rows } = await sql<MembershipRow>`
      INSERT INTO app.membership (id, party_id, state, basis, operation_id)
      VALUES (${id}, ${partyId}, 'active', ${basis}, ${operationId})
      RETURNING id, party_id, state, basis, changed_at, operation_id, created_at`.execute(tx);
    return toRecord(rows[0]!);
  },
  async changeMembership(tx, { partyId, state, basis, operationId }) {
    const row = await tx
      .updateTable('app.membership')
      .set({ state, basis, operation_id: operationId })
      .where('party_id', '=', partyId)
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
    return toRecord(row);
  },
};

/**
 * Verificação de elegibilidade do executor (TECH-050, TECH-053; ADR-0031 §5): `FOR SHARE` nas linhas das parties, em
 * ordem crescente de `party_id`, mantido até o commit — uma mudança concorrente espera esta ação, e uma mudança em curso
 * faz esta leitura esperar e ver o estado confirmado. Sem linha = sem Membership = não elegível.
 */
export const postgresMembershipGate: MembershipGate<DatabaseTransaction> = {
  async ineligible(tx, partyIds) {
    if (partyIds.length === 0) return [];
    const rows = await tx
      .selectFrom('app.membership')
      .select(['party_id', 'state'])
      .where('party_id', 'in', [...partyIds])
      .orderBy('party_id')
      .forShare()
      .execute();
    const states = new Map(rows.map((row) => [row.party_id, toState(row.state)]));
    return partyIds.filter((partyId) => !isMembershipEligible(states.get(partyId) ?? null));
  },
};

/** Mudança do histórico (`app.membership_transition`), para a tela do Admin. */
export interface MembershipHistoryEntry {
  readonly fromState: MembershipState | null;
  readonly toState: MembershipState;
  readonly basis: string;
  readonly recordedAt: Date;
  readonly authority: string;
}

/** Membership e histórico de uma party, lidos pelo papel da aplicação na transação auditada do detalhe do Admin. */
export async function readMembershipForAdmin(
  tx: DatabaseTransaction,
  partyId: string,
): Promise<{
  readonly record: MembershipRecord;
  readonly history: readonly MembershipHistoryEntry[];
} | null> {
  const row = await tx
    .selectFrom('app.membership')
    .select(COLUMNS)
    .where('party_id', '=', partyId)
    .executeTakeFirst();
  if (row === undefined) return null;
  const history = await tx
    .selectFrom('app.membership_transition')
    .select(['from_state', 'to_state', 'basis', 'recorded_at', 'authority'])
    .where('party_id', '=', partyId)
    .orderBy('recorded_at', 'desc')
    .execute();
  return {
    record: toRecord(row),
    history: history.map((entry) => ({
      fromState: entry.from_state === null ? null : toState(entry.from_state),
      toState: toState(entry.to_state),
      basis: entry.basis,
      recordedAt: new Date(entry.recorded_at),
      authority: entry.authority,
    })),
  };
}

/** Estado atual visível ao Titular (RLS: só parties com delegação vigente; sem base, autor nem operação). */
export async function visibleMemberships(
  tx: DatabaseTransaction,
): Promise<ReadonlyMap<string, { readonly state: MembershipState; readonly changedAt: Date }>> {
  const rows = await tx
    .selectFrom('app.membership')
    .select(['party_id', 'state', 'changed_at'])
    .execute();
  return new Map(
    rows.map((row) => [
      row.party_id,
      { state: toState(row.state), changedAt: new Date(row.changed_at) },
    ]),
  );
}
