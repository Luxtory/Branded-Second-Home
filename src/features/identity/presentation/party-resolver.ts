import type { DatabaseTransaction } from '@/features/platform';
import {
  createPartyDocumentResolver,
  type PartyDocumentResolver,
} from '../application/party-resolver';
import { environmentDocumentProtector } from '../infrastructure/pii/document-protector';
import { postgresPartyStore } from '../infrastructure/postgres-parties';

/** Resolução de produção (anéis do ambiente, lidos no primeiro uso; `luxtory_app` na transação do command). */
export const partyDocumentResolver: PartyDocumentResolver<DatabaseTransaction> =
  createPartyDocumentResolver(environmentDocumentProtector(), postgresPartyStore);
