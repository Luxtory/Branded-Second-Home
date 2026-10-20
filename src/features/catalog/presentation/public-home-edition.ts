import { getDatabase, withPublicRead, type Database } from '@/features/platform';
import type { PublicHomeEditionTarget } from '../application/public-views';
import { readPublicHomeEditionTarget } from '../infrastructure/postgres-cross-module-reader';

/**
 * Home Edition pública alvo de uma manifestação de interesse (spec catalog §17.10): leitura como `anon` sob RLS, na
 * mesma regra de visibilidade do Discovery (ADR-0014). Usada pelo registro de interesse do módulo `ownership`.
 */
export function findPublicHomeEdition(
  homeEditionId: string,
  db: Database = getDatabase(),
): Promise<PublicHomeEditionTarget | null> {
  return withPublicRead(db, (tx) => readPublicHomeEditionTarget(tx, homeEditionId));
}
