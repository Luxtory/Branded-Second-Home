import { findPublicConceptOffer } from '@/features/catalog';
import type { Database } from '@/features/platform';
import type { InterestTargets } from '../application/ports';

/** Alvo do interesse pela consulta pública do catálogo (como `anon` sob RLS, ADR-0014) — sem ler as tabelas dele. */
export function createCatalogInterestTargets(db: Database): InterestTargets {
  return { find: (conceptId) => findPublicConceptOffer(conceptId, db) };
}
