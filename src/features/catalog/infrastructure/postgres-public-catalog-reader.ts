import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { PublicCatalogReader, PublicEdition } from '../application/public-views';
import type { EditionModality } from '../domain/catalog';

/**
 * Leituras do Discovery como `anon`, dentro de `withPublicRead` (ADR-0014). Só as colunas concedidas a `anon` (spec
 * catalog §13.2); as linhas visíveis vêm da RLS — nenhuma regra de visibilidade repetida aqui.
 */
type Tx = DatabaseTransaction;

// O CHECK do banco garante o valor do enum.
const modality = (value: string) => value as EditionModality;

async function editionsOf(tx: Tx, conceptId: string): Promise<PublicEdition[]> {
  const rows = await tx
    .selectFrom('app.edition')
    .select(['id', 'region', 'modality', 'commercial_conditions'])
    .where('concept_id', '=', conceptId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    region: row.region,
    modality: modality(row.modality),
    commercialConditions: row.commercial_conditions,
  }));
}

export const postgresPublicCatalogReader: PublicCatalogReader<Tx> = {
  async collection(tx) {
    const concepts = await tx
      .selectFrom('app.concept as concept')
      .innerJoin('app.brand_partner as partner', 'partner.id', 'concept.brand_partner_id')
      .select(['concept.id', 'concept.title', 'partner.brand_name'])
      .orderBy('concept.created_at')
      .orderBy('concept.id')
      .execute();
    const editions = await tx
      .selectFrom('app.edition')
      .select(['id', 'concept_id', 'region', 'modality'])
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    return concepts.map((concept) => ({
      id: concept.id,
      title: concept.title,
      brandName: concept.brand_name,
      editions: editions
        .filter((edition) => edition.concept_id === concept.id)
        .map((edition) => ({
          id: edition.id,
          region: edition.region,
          modality: modality(edition.modality),
        })),
    }));
  },

  async concept(tx, id) {
    const concept = await tx
      .selectFrom('app.concept as concept')
      .innerJoin('app.brand_partner as partner', 'partner.id', 'concept.brand_partner_id')
      .select(['concept.id', 'concept.title', 'partner.brand_name'])
      .where('concept.id', '=', id)
      .executeTakeFirst();
    if (concept === undefined) return null;
    // Versão vigente = a aprovada de maior número; a RLS só entrega versões aprovadas.
    const version = await tx
      .selectFrom('app.concept_version')
      .select(['specification'])
      .where('concept_id', '=', id)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (version === undefined) return null;
    return {
      id: concept.id,
      title: concept.title,
      brandName: concept.brand_name,
      specification: version.specification,
      editions: await editionsOf(tx, id),
    };
  },

  async availability(tx) {
    const row = await tx
      .selectNoFrom([
        sql<boolean>`EXISTS (SELECT 1 FROM app.concept)`.as('concepts'),
        sql<boolean>`EXISTS (SELECT 1 FROM app.edition)`.as('editions'),
      ])
      .executeTakeFirstOrThrow();
    return { concepts: row.concepts, editions: row.editions };
  },
};
