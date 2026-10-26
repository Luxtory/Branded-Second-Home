import type { ExercisedAdminSession } from '@/features/admin';
import {
  getDatabase,
  recordAdminRead,
  systemClock,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';
import type {
  AccountLabel,
  DelegationRecord,
  PartyDocumentProtector,
  RepresentativeAccounts,
} from '../application/party-ports';
import { createPartyDocumentResolver } from '../application/party-resolver';
import {
  formatPartyDocument,
  maskPartyDocument,
  type DocumentType,
  type PartyDocument,
} from '../domain/party-document';
import { createRepresentativeAccounts } from '../infrastructure/auth/representative-accounts';
import { environmentDocumentProtector } from '../infrastructure/pii/document-protector';
import { postgresPartyStore } from '../infrastructure/postgres-parties';
import {
  postgresPartyReader as reader,
  type SealedParty,
} from '../infrastructure/postgres-party-reader';

/** Parties mais recentes na lista do Admin (sem paginação na W7: a busca por CPF/CNPJ acha qualquer uma). */
export const PARTY_LIST_LIMIT = 50;

/** Objetos das leituras auditadas (TECH-092, spec identity §13.9): só ids no `audit_log`, nunca o documento. */
type AuditedObject = 'party_directory' | 'party' | 'party_document';

export interface PartySummary {
  readonly id: string;
  readonly documentType: DocumentType;
  readonly maskedDocument: string;
  readonly createdAt: Date;
}

export interface DelegationView extends DelegationRecord {
  readonly account: AccountLabel | null;
}

export interface PartyDetail extends PartySummary {
  readonly delegations: readonly DelegationView[];
}

export interface PartyAdminReadDependencies {
  readonly db?: Database;
  readonly protector?: PartyDocumentProtector;
  readonly accounts?: RepresentativeAccounts<DatabaseTransaction>;
}

const defaults = (deps: PartyAdminReadDependencies) => ({
  db: deps.db ?? getDatabase(),
  protector: deps.protector ?? environmentDocumentProtector(),
  accounts: deps.accounts ?? createRepresentativeAccounts(),
});

function recordRead(
  tx: DatabaseTransaction,
  session: ExercisedAdminSession,
  objectType: AuditedObject,
  objectId: string,
): Promise<void> {
  return recordAdminRead(tx, {
    actor: { kind: 'user', userId: session.userId, actingPartyId: null, role: session.role },
    objectType,
    objectId,
    authorizationRef: session.authorizationRef,
    at: systemClock.now(),
  });
}

function summaryOf(protector: PartyDocumentProtector, party: SealedParty): PartySummary {
  const document = protector.reveal(party.id, party.sealed);
  return {
    id: party.id,
    documentType: document.type,
    maskedDocument: maskPartyDocument(document),
    createdAt: party.createdAt,
  };
}

/** Lista do Admin: documentos mascarados (`admin_read` `party_directory`, id `list`). */
export function readPartyDirectory(
  session: ExercisedAdminSession,
  deps: PartyAdminReadDependencies = {},
): Promise<readonly PartySummary[]> {
  const { db, protector } = defaults(deps);
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'party_directory', 'list');
    const parties = await reader.recentParties(tx, PARTY_LIST_LIMIT);
    return parties.map((party) => summaryOf(protector, party));
  });
}

/** Busca pelo CPF/CNPJ (HMAC em todas as chaves): `admin_read` com o id achado ou `not_found`, nunca o documento. */
export function lookupPartyByDocument(
  session: ExercisedAdminSession,
  document: PartyDocument,
  deps: PartyAdminReadDependencies = {},
): Promise<string | null> {
  const { db, protector } = defaults(deps);
  const resolver = createPartyDocumentResolver(protector, postgresPartyStore);
  return db.transaction().execute(async (tx) => {
    const partyId = await resolver.resolve(tx, document);
    await recordRead(tx, session, 'party_directory', partyId ?? 'not_found');
    return partyId;
  });
}

/** Detalhe: documento mascarado e representantes com e-mail mascarado (`admin_read` `party`). */
export function readPartyDetail(
  session: ExercisedAdminSession,
  partyId: string,
  deps: PartyAdminReadDependencies = {},
): Promise<PartyDetail | null> {
  const { db, protector, accounts } = defaults(deps);
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'party', partyId);
    const party = await reader.party(tx, partyId);
    if (party === null) return null;
    const delegations = await reader.partyDelegations(tx, partyId);
    const labels = await accounts.labels(tx, [...new Set(delegations.map((item) => item.userId))]);
    return {
      ...summaryOf(protector, party),
      delegations: delegations.map((item) => ({
        ...item,
        account: labels.get(item.userId) ?? null,
      })),
    };
  });
}

/** Documento completo, leitura deliberada (`admin_read` `party_document`); o valor nunca vai ao `audit_log`. */
export function readPartyDocument(
  session: ExercisedAdminSession,
  partyId: string,
  deps: PartyAdminReadDependencies = {},
): Promise<{ readonly documentType: DocumentType; readonly document: string } | null> {
  const { db, protector } = defaults(deps);
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'party_document', partyId);
    const party = await reader.party(tx, partyId);
    if (party === null) return null;
    const document = protector.reveal(party.id, party.sealed);
    return { documentType: document.type, document: formatPartyDocument(document) };
  });
}

/** W8 masked selector: lookup by id, including parties older than the recent directory. No delegation/PII export. */
export function readPartySummary(
  session: ExercisedAdminSession,
  partyId: string,
  deps: PartyAdminReadDependencies = {},
): Promise<PartySummary | null> {
  const { db, protector } = defaults(deps);
  return db.transaction().execute(async (tx) => {
    await recordRead(tx, session, 'party', partyId);
    const party = await reader.party(tx, partyId);
    return party === null ? null : summaryOf(protector, party);
  });
}
