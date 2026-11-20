import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@/features/platform';
import {
  activateMembershipHandler,
  endMembershipHandler,
  reactivateMembershipHandler,
  suspendMembershipHandler,
} from '../application/membership-commands';
import type { MembershipStore } from '../application/membership-ports';
import { postgresMembershipStore } from '../infrastructure/postgres-membership';

export interface MembershipHandlerDependencies {
  readonly newId?: () => string;
  readonly store?: MembershipStore<DatabaseTransaction>;
}

/** Handlers das quatro operações do Membership (W15) com as dependências de produção (injetáveis nos testes). */
export function createMembershipHandlers({
  newId = randomUUID,
  store = postgresMembershipStore,
}: MembershipHandlerDependencies = {}) {
  const deps = { store, newId };
  return {
    activateMembership: activateMembershipHandler<DatabaseTransaction>(deps),
    suspendMembership: suspendMembershipHandler<DatabaseTransaction>(deps),
    reactivateMembership: reactivateMembershipHandler<DatabaseTransaction>(deps),
    endMembership: endMembershipHandler<DatabaseTransaction>(deps),
  };
}
