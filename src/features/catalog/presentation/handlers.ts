import { randomUUID } from 'node:crypto';
import { partyDocumentResolver, type AdminCommand } from '@/features/identity';
import type { DatabaseTransaction, JsonValue } from '@/features/platform';
import { createCatalogHandlers } from '../application/handlers';
import { postgresCatalogStore } from '../infrastructure/postgres-catalog-store';
import { runtimeMediaStorage } from '../infrastructure/media-storage';
import { sharpCoverProcessor } from '../infrastructure/sharp-cover-processor';

/**
 * Papel exercido nas operações do catálogo: a autoridade delas é "Admin" (REQ-095); sem hierarquia, quem só tem Super
 * Admin não opera nem lê o catálogo (ADR-0008).
 */
export const CATALOG_ROLE = 'admin';

/** Handlers de produção do catálogo (telas); as rotas REST montam os seus com ids injetáveis. */
export const catalogHandlers = createCatalogHandlers<DatabaseTransaction>({
  store: postgresCatalogStore,
  images: sharpCoverProcessor,
  media: runtimeMediaStorage,
  parties: partyDocumentResolver,
  newId: randomUUID,
});

export function catalogCommand<I, R extends JsonValue>(
  handler: AdminCommand<I, R>['handler'],
): AdminCommand<I, R> {
  return { handler, role: CATALOG_ROLE };
}
