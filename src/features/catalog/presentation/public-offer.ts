import { getDatabase, withPublicRead, type Database } from '@/features/platform';
import type { PublicConceptOffer } from '../application/public-views';
import { readPublicConceptOffer } from '../infrastructure/postgres-cross-module-reader';

/**
 * Oferta pública de um Concept (W5): leitura como `anon` sob RLS, na mesma regra de visibilidade do Discovery
 * (ADR-0014). Usada pelo registro de interesse do módulo `ownership`.
 */
export function findPublicConceptOffer(
  conceptId: string,
  db: Database = getDatabase(),
): Promise<PublicConceptOffer | null> {
  return withPublicRead(db, (tx) => readPublicConceptOffer(tx, conceptId));
}
