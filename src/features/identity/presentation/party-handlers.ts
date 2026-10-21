import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction, EnvSource } from '@/features/platform';
import {
  activatePartyDelegationHandler,
  createPartyDelegationHandler,
  registerPartyHandler,
  revokePartyDelegationHandler,
} from '../application/party-commands';
import type { PartyDocumentProtector, RepresentativeAccounts } from '../application/party-ports';
import { createRepresentativeAccounts } from '../infrastructure/auth/representative-accounts';
import { environmentDocumentProtector } from '../infrastructure/pii/document-protector';
import { postgresPartyStore } from '../infrastructure/postgres-parties';

export interface PartyHandlerDependencies {
  readonly source?: EnvSource;
  readonly newId?: () => string;
  readonly protector?: PartyDocumentProtector;
  readonly accounts?: RepresentativeAccounts<DatabaseTransaction>;
}

/** Handlers das operações da W7 com as dependências de produção (injetáveis nos testes). */
export function createPartyHandlers({
  source = process.env,
  newId = randomUUID,
  protector = environmentDocumentProtector(source),
  accounts = createRepresentativeAccounts(source),
}: PartyHandlerDependencies = {}) {
  const base = { store: postgresPartyStore, protector, newId };
  return {
    registerParty: registerPartyHandler<DatabaseTransaction>(base),
    createPartyDelegation: createPartyDelegationHandler<DatabaseTransaction>({ ...base, accounts }),
    revokePartyDelegation: revokePartyDelegationHandler<DatabaseTransaction>(base),
    activatePartyDelegation: activatePartyDelegationHandler<DatabaseTransaction>(base),
  };
}
