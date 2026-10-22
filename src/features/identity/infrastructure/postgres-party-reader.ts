import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { AccountLabel, DelegationRecord, SealedDocument } from '../application/party-ports';
import { isDocumentType, type DocumentType } from '../domain/party-document';
import type { DelegationState } from '../domain/party-delegation';
import { delegationState, toDelegation } from './postgres-parties';

/** Party como o banco a guarda para leitura: só a cifra e o `key_id` (o HMAC nunca sai do banco). */
export interface SealedParty {
  readonly id: string;
  readonly sealed: SealedDocument;
  readonly createdAt: Date;
}

/** Delegação vista pelo próprio usuário (colunas que `authenticated` pode ler, sem bases nem ids de staff). */
export interface OwnDelegation {
  readonly id: string;
  readonly partyId: string;
  readonly state: DelegationState;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly createdAt: Date;
  readonly activatedAt: Date | null;
  readonly revokedAt: Date | null;
}

const PARTY_COLUMNS = [
  'id',
  'document_type',
  'document_ciphertext',
  'document_key_id',
  'created_at',
] as const;

function documentType(value: string): DocumentType {
  if (!isDocumentType(value)) throw new Error(`app.party: unexpected document_type ${value}`);
  return value;
}

function toSealedParty(row: {
  id: string;
  document_type: string;
  document_ciphertext: Buffer;
  document_key_id: string;
  created_at: Date;
}): SealedParty {
  return {
    id: row.id,
    sealed: {
      type: documentType(row.document_type),
      ciphertext: row.document_ciphertext,
      keyId: row.document_key_id,
    },
    createdAt: row.created_at,
  };
}

/**
 * Leituras de party e delegação (spec identity §13.9). O Admin lê como `luxtory_app` (com `admin_read` na mesma
 * transação); quem representa a pessoa ou empresa, na Área do Titular, dentro de `withUserRead`, onde a RLS só deixa ver as próprias delegações e as parties com
 * delegação vigente — as mesmas consultas, filtradas pela política.
 */
export const postgresPartyReader = {
  async recentParties(tx: DatabaseTransaction, limit: number): Promise<readonly SealedParty[]> {
    const rows = await tx
      .selectFrom('app.party')
      .select(PARTY_COLUMNS)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .limit(limit)
      .execute();
    return rows.map(toSealedParty);
  },
  async party(tx: DatabaseTransaction, partyId: string): Promise<SealedParty | null> {
    const row = await tx
      .selectFrom('app.party')
      .select(PARTY_COLUMNS)
      .where('id', '=', partyId)
      .executeTakeFirst();
    return row === undefined ? null : toSealedParty(row);
  },
  async partyDelegations(
    tx: DatabaseTransaction,
    partyId: string,
  ): Promise<readonly DelegationRecord[]> {
    const rows = await tx
      .selectFrom('app.party_delegation')
      .select([
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
      ])
      .where('party_id', '=', partyId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDelegation);
  },
  async accountLabels(
    tx: DatabaseTransaction,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, AccountLabel>> {
    if (userIds.length === 0) return new Map();
    const { rows } = await sql<{
      user_id: string;
      email_masked: string | null;
      email_confirmed: boolean;
    }>`
      SELECT user_id, email_masked, email_confirmed FROM app.auth_account_labels(${[...userIds]}::uuid[])
    `.execute(tx);
    return new Map(
      rows.map((row) => [
        row.user_id,
        { maskedEmail: row.email_masked, confirmed: row.email_confirmed },
      ]),
    );
  },
  async ownDelegations(tx: DatabaseTransaction): Promise<readonly OwnDelegation[]> {
    const rows = await tx
      .selectFrom('app.party_delegation')
      .select([
        'id',
        'party_id',
        'state',
        'valid_from',
        'valid_until',
        'created_at',
        'activated_at',
        'revoked_at',
      ])
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      partyId: row.party_id,
      state: delegationState(row.state),
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      revokedAt: row.revoked_at,
    }));
  },
  async visibleParties(tx: DatabaseTransaction): Promise<readonly SealedParty[]> {
    const rows = await tx
      .selectFrom('app.party')
      .select(PARTY_COLUMNS)
      .orderBy('created_at')
      .execute();
    return rows.map(toSealedParty);
  },
};
