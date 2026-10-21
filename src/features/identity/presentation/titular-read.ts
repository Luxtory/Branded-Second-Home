import {
  getDatabase,
  systemClock,
  withUserRead,
  type Clock,
  type Database,
} from '@/features/platform';
import type { PartyDocumentProtector } from '../application/party-ports';
import {
  delegationStatus,
  isDelegationCurrent,
  type PartyDelegation,
} from '../domain/party-delegation';
import { maskPartyDocument, type DocumentType } from '../domain/party-document';
import type { VerifiedSession } from '../domain/session';
import { environmentDocumentProtector } from '../infrastructure/pii/document-protector';
import {
  postgresPartyReader as reader,
  type OwnDelegation,
} from '../infrastructure/postgres-party-reader';

/** Party que o usuário representa agora (documento só mascarado, decifrado no servidor). */
export interface Representation {
  readonly partyId: string;
  readonly documentType: DocumentType;
  readonly maskedDocument: string;
  readonly delegationId: string;
  readonly activatedAt: Date | null;
  readonly validUntil: Date | null;
}

/** Convite pendente: nenhuma informação da party antes da ativação (decisão do fundador de 2026-10-21). */
export interface PendingInvitation {
  readonly delegationId: string;
  readonly invitedAt: Date;
}

export interface TitularOverview {
  readonly representations: readonly Representation[];
  readonly pending: readonly PendingInvitation[];
}

export interface TitularReadDependencies {
  readonly db?: Database;
  readonly protector?: PartyDocumentProtector;
  readonly clock?: Clock;
}

const asDelegation = (own: OwnDelegation, userId: string): PartyDelegation => ({ ...own, userId });

/**
 * Leituras da Área do Titular sob RLS (TECH-052, ADR-0006 §6): `authenticated` + claims verificadas. A política só
 * devolve as delegações do próprio usuário e as parties com delegação vigente; um id de outra party simplesmente não
 * aparece.
 */
export function readTitularOverview(
  session: VerifiedSession,
  deps: TitularReadDependencies = {},
): Promise<TitularOverview> {
  const db = deps.db ?? getDatabase();
  const protector = deps.protector ?? environmentDocumentProtector();
  const now = (deps.clock ?? systemClock).now();
  return withUserRead(db, { sub: session.userId, role: 'authenticated' }, async (tx) => {
    const delegations = (await reader.ownDelegations(tx)).map((own) =>
      asDelegation(own, session.userId),
    );
    const parties = await reader.visibleParties(tx);
    const representations = parties.flatMap((party) => {
      const delegation = delegations.find(
        (item) => item.partyId === party.id && isDelegationCurrent(item, now),
      );
      if (delegation === undefined) return [];
      const document = protector.reveal(party.id, party.sealed);
      return [
        {
          partyId: party.id,
          documentType: document.type,
          maskedDocument: maskPartyDocument(document),
          delegationId: delegation.id,
          activatedAt: delegation.activatedAt,
          validUntil: delegation.validUntil,
        },
      ];
    });
    const pending = delegations
      .filter((item) => delegationStatus(item, now) === 'pending')
      .map((item) => ({ delegationId: item.id, invitedAt: item.createdAt }));
    return { representations, pending };
  });
}

/** Uma party representada pelo id da URL; não representada, inexistente ou id inválido → `null` (mesma resposta). */
export async function readRepresentation(
  session: VerifiedSession,
  partyId: string,
  deps: TitularReadDependencies = {},
): Promise<Representation | null> {
  const overview = await readTitularOverview(session, deps);
  return overview.representations.find((item) => item.partyId === partyId) ?? null;
}
