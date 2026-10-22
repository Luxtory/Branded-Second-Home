import type { DocumentType, PartyDocument } from '../domain/party-document';
import type { PartyDelegation } from '../domain/party-delegation';
import type { StaffRole } from '../domain/staff';

/** HMAC do documento normalizado com uma chave do anel do HMAC (ADR-0020 §2). */
export interface DocumentDigest {
  readonly keyId: string;
  readonly digest: Uint8Array;
}

/**
 * CPF/CNPJ protegido para gravar (ADR-0020): cifra com o `key_id` ativo e um digest por chave do anel do HMAC — o
 * `UNIQUE` sobre os digests mantém um documento → uma party mesmo com versões do app em anéis diferentes.
 */
export interface ProtectedDocument {
  readonly type: DocumentType;
  readonly ciphertext: Uint8Array;
  readonly keyId: string;
  readonly digests: readonly DocumentDigest[];
}

/** Cifra, HMAC e fingerprint do documento (implementação AES-256-GCM + HMAC-SHA-256 na infraestrutura). */
export interface PartyDocumentProtector {
  protect(partyId: string, document: PartyDocument): ProtectedDocument;
  /** Decifra com o `key_id` gravado; `key_id` fora do anel → erro explícito, nunca valor errado. */
  reveal(partyId: string, sealed: SealedDocument): PartyDocument;
  /** HMAC com **todas** as chaves do anel: busca e deduplicação sobrevivem à rotação do segredo. */
  lookupDigests(document: PartyDocument): readonly Uint8Array[];
  /** Chave ativa do anel do HMAC: a que pseudonimiza um hash de idempotência novo (gravada ao lado dele). */
  activeHmacKeyId(): string;
  /**
   * Pseudônimo (hex) para o hash de idempotência com a chave `keyId` do anel — nunca o documento ou o e-mail
   * (ADR-0020 §5). Chave fora do anel → erro explícito (o replay falha fechado, nunca é falso).
   */
  fingerprint(purpose: 'document' | 'email', value: string, keyId: string): string;
}

/** O que o banco guarda do documento (sem HMAC): a party só decifra com o próprio id no AAD. */
export interface SealedDocument {
  readonly type: DocumentType;
  readonly ciphertext: Uint8Array;
  readonly keyId: string;
}

export interface PartyRecord {
  readonly id: string;
  readonly documentType: DocumentType;
  readonly createdAt: Date;
}

export interface NewParty {
  readonly id: string;
  readonly document: ProtectedDocument;
  readonly registeredByUserId: string;
  readonly registeredRole: StaffRole;
  readonly operationId: string;
  readonly createdAt: Date;
}

/** Delegação com os campos que o command grava e devolve. */
export interface DelegationRecord extends PartyDelegation {
  readonly scope: 'party';
  readonly basis: string;
  readonly operationId: string;
  readonly revocationBasis: string | null;
}

export interface NewDelegation {
  readonly id: string;
  readonly partyId: string;
  readonly userId: string;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly basis: string;
  readonly invitedByUserId: string;
  readonly invitedRole: StaffRole;
  readonly operationId: string;
  readonly createdAt: Date;
}

export interface DelegationRevocation {
  readonly at: Date;
  readonly basis: string;
  readonly userId: string;
  readonly role: StaffRole;
  readonly operationId: string;
}

/** Persistência de `party` e `party_delegation` na transação do command, como `luxtory_app`. */
export interface PartyStore<Tx> {
  findPartyIdByDigests(tx: Tx, digests: readonly Uint8Array[]): Promise<string | null>;
  insertParty(tx: Tx, party: NewParty): Promise<void>;
  /** Lê a party e a trava na transação: convites concorrentes do mesmo par são serializados. */
  lockParty(tx: Tx, partyId: string): Promise<PartyRecord | null>;
  /**
   * Delegação pendente ou ativa do par cuja vigência se sobrepõe a [validFrom, validUntil) — a que impediria uma nova.
   * Expirada antes de `validFrom` não conta (a constraint `conflict_party_delegation_overlap` é a garantia final).
   */
  overlappingDelegation(
    tx: Tx,
    userId: string,
    partyId: string,
    validFrom: Date,
    validUntil: Date | null,
  ): Promise<DelegationRecord | null>;
  insertDelegation(tx: Tx, delegation: NewDelegation): Promise<DelegationRecord>;
  lockDelegation(tx: Tx, delegationId: string): Promise<DelegationRecord | null>;
  activateDelegation(
    tx: Tx,
    delegationId: string,
    at: Date,
    operationId: string,
  ): Promise<DelegationRecord>;
  revokeDelegation(
    tx: Tx,
    delegationId: string,
    revocation: DelegationRevocation,
  ): Promise<DelegationRecord>;
}

/** Rótulo de conta do Supabase Auth: e-mail mascarado (`app.auth_account_labels`, ADR-0020 §8) e confirmação. */
export interface AccountLabel {
  readonly maskedEmail: string | null;
  readonly confirmed: boolean;
}

/** Conta do Supabase Auth de um e-mail: só o id e se já foi confirmada (nunca o e-mail, ADR-0020 §8). */
export interface AccountMatch {
  readonly userId: string;
  readonly confirmed: boolean;
}

/**
 * Contas do Supabase Auth vistas pelo convite (decisão do fundador de 2026-10-21): busca restrita no banco e convite
 * pela Admin API, só no servidor. A conta nova nasce pelo convite, nunca já confirmada.
 */
export interface RepresentativeAccounts<Tx> {
  find(tx: Tx, email: string): Promise<AccountMatch | null>;
  /** Rótulos das contas para o Admin: e-mail **já mascarado** na origem, nunca completo. */
  labels(tx: Tx, userIds: readonly string[]): Promise<ReadonlyMap<string, AccountLabel>>;
  /** Cria a conta não confirmada e envia o convite, ou reenvia para conta não confirmada; devolve o id. */
  invite(email: string): Promise<string>;
}

/** Delegações lidas pelo guard a cada decisão (revogar vale na hora). */
export interface DelegationDirectory {
  /** Delegação ativa e vigente de `userId` para `partyId` em `at` (TECH-050). */
  currentDelegation(userId: string, partyId: string, at: Date): Promise<PartyDelegation | null>;
  delegation(delegationId: string): Promise<PartyDelegation | null>;
}

/**
 * A conta foi confirmada entre a busca e o convite (o Supabase recusa convite para conta confirmada): o command busca de
 * novo e segue sem convite.
 */
export class AccountAlreadyConfirmedError extends Error {
  constructor() {
    super('Supabase Auth account is already confirmed');
    this.name = 'AccountAlreadyConfirmedError';
  }
}
