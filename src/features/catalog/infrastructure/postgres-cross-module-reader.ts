import type { DatabaseTransaction } from '@/features/platform';
import type { PublicConceptOffer } from '../application/public-views';
import type { ConceptLabel } from '../application/views';
import type { EditionModality } from '../domain/catalog';

/**
 * Consultas do catálogo servidas a outros módulos pela superfície pública (`index.ts`, TECH-011): nenhum outro slice lê
 * as tabelas do catálogo diretamente.
 */
type Tx = DatabaseTransaction;

// O CHECK do banco garante o valor do enum.
const modality = (value: string) => value as EditionModality;

/**
 * Oferta pública do Concept, dentro de `withPublicRead` (como `anon`): a RLS só entrega o Concept publicado e as Editions
 * dele (ADR-0014) — nenhuma regra de visibilidade repetida aqui. Não publicado ou inexistente → `null`.
 */
export async function readPublicConceptOffer(
  tx: Tx,
  conceptId: string,
): Promise<PublicConceptOffer | null> {
  const concept = await tx
    .selectFrom('app.concept')
    .select('id')
    .where('id', '=', conceptId)
    .executeTakeFirst();
  if (concept === undefined) return null;
  const editions = await tx
    .selectFrom('app.edition')
    .select(['id', 'modality'])
    .where('concept_id', '=', conceptId)
    .execute();
  return {
    conceptId: concept.id,
    editions: editions.map((edition) => ({ id: edition.id, modality: modality(edition.modality) })),
  };
}

/** Título e marca dos Concepts pedidos, lidos como `luxtory_app` na transação da leitura do Admin (ADR-0010 §7). */
export async function readConceptLabels(
  tx: Tx,
  conceptIds: readonly string[],
): Promise<ReadonlyMap<string, ConceptLabel>> {
  if (conceptIds.length === 0) return new Map();
  const rows = await tx
    .selectFrom('app.concept as concept')
    .innerJoin('app.brand_partner as partner', 'partner.id', 'concept.brand_partner_id')
    .select(['concept.id', 'concept.title', 'partner.brand_name'])
    .where('concept.id', 'in', [...conceptIds])
    .execute();
  return new Map(rows.map((row) => [row.id, { title: row.title, brandName: row.brand_name }]));
}
