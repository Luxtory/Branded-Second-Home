import { sql, type Selectable } from 'kysely';
import type { Database, DatabaseTables, DatabaseTransaction } from '@/features/platform';
import type {
  DelegationDirectory,
  DelegationRecord,
  PartyRecord,
  PartyStore,
} from '../application/party-ports';
import { isDocumentType, type DocumentType } from '../domain/party-document';
import { DELEGATION_STATES, type DelegationState } from '../domain/party-delegation';

type DelegationRow = Selectable<DatabaseTables['app.party_delegation']>;

const DELEGATION_COLUMNS = [
  'id',
  'party_id',
  'user_id',
  'state',
  'valid_from',
  'valid_until',
  'basis',
  'operation_id',
  'created_at',
  'activated_at',
  'revoked_at',
  'revocation_basis',
] as const;

const OPEN_STATES: readonly DelegationState[] = ['pending', 'active'];

function documentType(value: string): DocumentType {
  if (!isDocumentType(value)) throw new Error(`app.party: unexpected document_type ${value}`);
  return value;
}

export function delegationState(value: string): DelegationState {
  if (!(DELEGATION_STATES as readonly string[]).includes(value)) {
    throw new Error(`app.party_delegation: unexpected state ${value}`);
  }
  return value as DelegationState;
}

export function toDelegation(
  row: Pick<DelegationRow, (typeof DELEGATION_COLUMNS)[number]>,
): DelegationRecord {
  return {
    id: row.id,
    partyId: row.party_id,
    userId: row.user_id,
    scope: 'party',
    state: delegationState(row.state),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    basis: row.basis,
    operationId: row.operation_id,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
    revocationBasis: row.revocation_basis,
  };
}

/** `party` e `party_delegation` na transação do command, como `luxtory_app` (spec identity §13). */
export const postgresPartyStore: PartyStore<DatabaseTransaction> = {
  async findPartyIdByDigests(tx, digests) {
    if (digests.length === 0) return null;
    const row = await tx
      .selectFrom('app.party')
      .select('id')
      .where(
        'document_hmac',
        'in',
        digests.map((digest) => Buffer.from(digest)),
      )
      .executeTakeFirst();
    return row?.id ?? null;
  },
  async insertParty(tx, party) {
    await tx
      .insertInto('app.party')
      .values({
        id: party.id,
        document_type: party.document.type,
        document_ciphertext: Buffer.from(party.document.ciphertext),
        document_key_id: party.document.keyId,
        document_hmac: Buffer.from(party.document.hmac),
        document_hmac_key_id: party.document.hmacKeyId,
        registered_by_user_id: party.registeredByUserId,
        registered_role: party.registeredRole,
        operation_id: party.operationId,
        created_at: party.createdAt,
      })
      .execute();
  },
  async lockParty(tx, partyId): Promise<PartyRecord | null> {
    // Trava consultiva da party na transação: a party é imutável (sem privilégio de UPDATE, então sem `FOR UPDATE`), e o
    // que precisa ser serializado é o convite do mesmo par — o segundo espera e vê a delegação aberta antes do e-mail.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`app.party:${partyId}`}, 0))`.execute(
      tx,
    );
    const row = await tx
      .selectFrom('app.party')
      .select(['id', 'document_type', 'created_at'])
      .where('id', '=', partyId)
      .executeTakeFirst();
    return row === undefined
      ? null
      : { id: row.id, documentType: documentType(row.document_type), createdAt: row.created_at };
  },
  async openDelegation(tx, userId, partyId) {
    const row = await tx
      .selectFrom('app.party_delegation')
      .select(DELEGATION_COLUMNS)
      .where('user_id', '=', userId)
      .where('party_id', '=', partyId)
      .where('state', 'in', OPEN_STATES)
      .executeTakeFirst();
    return row === undefined ? null : toDelegation(row);
  },
  async insertDelegation(tx, delegation) {
    const row = await tx
      .insertInto('app.party_delegation')
      .values({
        id: delegation.id,
        party_id: delegation.partyId,
        user_id: delegation.userId,
        scope: 'party',
        state: 'pending',
        valid_from: delegation.validFrom,
        valid_until: delegation.validUntil,
        basis: delegation.basis,
        invited_by_user_id: delegation.invitedByUserId,
        invited_role: delegation.invitedRole,
        operation_id: delegation.operationId,
        created_at: delegation.createdAt,
      })
      .returning(DELEGATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toDelegation(row);
  },
  async lockDelegation(tx, delegationId) {
    const row = await tx
      .selectFrom('app.party_delegation')
      .select(DELEGATION_COLUMNS)
      .where('id', '=', delegationId)
      .forNoKeyUpdate()
      .executeTakeFirst();
    return row === undefined ? null : toDelegation(row);
  },
  async activateDelegation(tx, delegationId, at, operationId) {
    const row = await tx
      .updateTable('app.party_delegation')
      .set({ state: 'active', activated_at: at, activation_operation_id: operationId })
      .where('id', '=', delegationId)
      .returning(DELEGATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toDelegation(row);
  },
  async revokeDelegation(tx, delegationId, revocation) {
    const row = await tx
      .updateTable('app.party_delegation')
      .set({
        state: 'revoked',
        revoked_at: revocation.at,
        revocation_basis: revocation.basis,
        revoked_by_user_id: revocation.userId,
        revoked_role: revocation.role,
        revocation_operation_id: revocation.operationId,
      })
      .where('id', '=', delegationId)
      .returning(DELEGATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toDelegation(row);
  },
};

/** Party existe (o `grant_authorization` confere antes do `INSERT`: erro funcional, não a FK — D-W2-1 encerrada). */
export async function partyExists(tx: DatabaseTransaction, partyId: string): Promise<boolean> {
  const row = await tx
    .selectFrom('app.party')
    .select('id')
    .where('id', '=', partyId)
    .executeTakeFirst();
  return row !== undefined;
}

/** Delegações lidas pelo guard a cada decisão, como `luxtory_app` (TECH-050). */
export function createPostgresDelegationDirectory(database: () => Database): DelegationDirectory {
  return {
    async currentDelegation(userId, partyId, at) {
      const row = await database()
        .selectFrom('app.party_delegation')
        .select(DELEGATION_COLUMNS)
        .where('user_id', '=', userId)
        .where('party_id', '=', partyId)
        .where('state', '=', 'active')
        .where('valid_from', '<=', at)
        .where((eb) => eb.or([eb('valid_until', 'is', null), eb('valid_until', '>', at)]))
        .executeTakeFirst();
      return row === undefined ? null : toDelegation(row);
    },
    async delegation(delegationId) {
      const row = await database()
        .selectFrom('app.party_delegation')
        .select(DELEGATION_COLUMNS)
        .where('id', '=', delegationId)
        .executeTakeFirst();
      return row === undefined ? null : toDelegation(row);
    },
  };
}
