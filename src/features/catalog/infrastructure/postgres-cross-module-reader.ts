import type { DatabaseTransaction } from '@/features/platform';
import type { PublicHomeEditionTarget } from '../application/public-views';
import type { HomeEditionLabel } from '../application/views';

/**
 * Consultas do catálogo servidas a outros módulos pela superfície pública (`index.ts`, TECH-011): nenhum outro slice lê
 * as tabelas do catálogo diretamente.
 */
type Tx = DatabaseTransaction;

/**
 * Home Edition pública, dentro de `withPublicRead` (como `anon`): a RLS só entrega Home Edition visível de Home Concept
 * público (ADR-0014) — nenhuma regra de visibilidade repetida aqui. Em preparação, fora do público ou inexistente → `null`.
 */
export async function readPublicHomeEditionTarget(
  tx: Tx,
  homeEditionId: string,
): Promise<PublicHomeEditionTarget | null> {
  const row = await tx
    .selectFrom('app.home_edition')
    .select(['id', 'home_concept_id'])
    .where('id', '=', homeEditionId)
    .executeTakeFirst();
  return row === undefined ? null : { homeEditionId: row.id, homeConceptId: row.home_concept_id };
}

/**
 * Nome da Home Edition, título do Home Concept e marca, lidos como `luxtory_app` na transação da leitura do Admin
 * (ADR-0010 §7).
 */
export async function readHomeEditionLabels(
  tx: Tx,
  homeEditionIds: readonly string[],
): Promise<ReadonlyMap<string, HomeEditionLabel>> {
  if (homeEditionIds.length === 0) return new Map();
  const rows = await tx
    .selectFrom('app.home_edition as home_edition')
    .innerJoin(
      'app.home_concept as home_concept',
      'home_concept.id',
      'home_edition.home_concept_id',
    )
    .innerJoin('app.brand_partner as partner', 'partner.id', 'home_concept.brand_partner_id')
    .select(['home_edition.id', 'home_edition.name', 'home_concept.title', 'partner.brand_name'])
    .where('home_edition.id', 'in', [...homeEditionIds])
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      { homeEditionName: row.name, homeConceptTitle: row.title, brandName: row.brand_name },
    ]),
  );
}
