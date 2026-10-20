import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { PublicCover } from '../application/collection-views';
import type { PublicCatalogReader } from '../application/public-views';
import type { CropStep } from '../domain/collection';
import {
  publicHomeEditionMedia,
  publicHomeEditionsByConcept,
  publicProjectedInvestments,
} from './public-home-editions';

/**
 * Leituras do Discovery como `anon`, dentro de `withPublicRead` (ADR-0014). Só as colunas concedidas a `anon` (spec
 * catalog §13.2, §17.7); as linhas visíveis vêm da RLS — nenhuma regra de visibilidade repetida aqui.
 */
type Tx = DatabaseTransaction;

/** Capa aprovada do Home Concept (a RLS só entrega a aprovada de Home Concept público), com as larguras de exibição. */
async function cover(tx: Tx, homeConceptId: string): Promise<PublicCover | null> {
  const media = await tx
    .selectFrom('app.home_concept_media')
    .select(['id', 'alt', 'credit', 'crop_x', 'crop_y'])
    .where('home_concept_id', '=', homeConceptId)
    .executeTakeFirst();
  if (media === undefined) return null;
  const files = await tx
    .selectFrom('app.home_concept_media_file')
    .select(['width', 'height'])
    .where('media_id', '=', media.id)
    .where('role', '=', 'display')
    .orderBy('width')
    .execute();
  return {
    mediaId: media.id,
    alt: media.alt,
    credit: media.credit,
    // O CHECK do banco garante o passo do foco.
    cropX: media.crop_x as CropStep,
    cropY: media.crop_y as CropStep,
    widths: files.map(({ width, height }) => ({ width, height })),
  };
}

/** Lifestyle principal (posição 1) da versão; termo desativado é invisível para `anon` e some. */
async function primaryLifestyle(tx: Tx, versionId: string): Promise<string | null> {
  const row = await tx
    .selectFrom('app.home_concept_version_term as classification')
    .innerJoin('app.catalog_term as term', 'term.id', 'classification.term_id')
    .select('term.label')
    .where('classification.home_concept_version_id', '=', versionId)
    .where('classification.kind', '=', 'lifestyle')
    .orderBy('classification.position')
    .limit(1)
    .executeTakeFirst();
  return row?.label ?? null;
}

async function conceptHeader(tx: Tx, id: string) {
  return tx
    .selectFrom('app.home_concept as home_concept')
    .innerJoin('app.brand_partner as partner', 'partner.id', 'home_concept.brand_partner_id')
    .select(['home_concept.id', 'home_concept.title', 'partner.brand_name'])
    .where('home_concept.id', '=', id)
    .executeTakeFirst();
}

export const postgresPublicCatalogReader: PublicCatalogReader<Tx> = {
  async homeConcept(tx, id) {
    const homeConcept = await conceptHeader(tx, id);
    if (homeConcept === undefined) return null;
    // Versão vigente = a aprovada de maior número; a RLS só entrega versões aprovadas.
    const version = await tx
      .selectFrom('app.home_concept_version')
      .select(['id', 'specification'])
      .where('home_concept_id', '=', id)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (version === undefined) return null;
    return {
      id: homeConcept.id,
      title: homeConcept.title,
      brandName: homeConcept.brand_name,
      lifestyle: await primaryLifestyle(tx, version.id),
      cover: await cover(tx, id),
      specification: version.specification,
      homeEditions: (await publicHomeEditionsByConcept(tx, [id])).get(id) ?? [],
    };
  },

  async homeEdition(tx, homeConceptId, homeEditionId) {
    const row = await tx
      .selectFrom('app.home_edition')
      .select([
        'id',
        'home_concept_id',
        'name',
        'description',
        'typology',
        'spatial_configuration',
        'projected_area_m2',
        'suites',
        'guests_max',
        'rooms',
        'amenities',
        'characteristics',
      ])
      .where('id', '=', homeEditionId)
      .where('home_concept_id', '=', homeConceptId)
      .executeTakeFirst();
    if (row === undefined) return null;
    const homeConcept = await conceptHeader(tx, homeConceptId);
    if (homeConcept === undefined) return null;
    const [media, investments] = [
      await publicHomeEditionMedia(tx, [row.id]),
      await publicProjectedInvestments(tx, [row.id]),
    ];
    return {
      id: row.id,
      homeConceptId: row.home_concept_id,
      homeConceptTitle: homeConcept.title,
      brandName: homeConcept.brand_name,
      name: row.name,
      description: row.description,
      typology: row.typology,
      spatialConfiguration: row.spatial_configuration,
      projectedAreaM2: row.projected_area_m2,
      suites: row.suites,
      guestsMax: row.guests_max,
      rooms: row.rooms ?? [],
      amenities: row.amenities ?? [],
      characteristics: row.characteristics ?? [],
      media: media.get(row.id) ?? [],
      projectedInvestment: investments.get(row.id) ?? null,
    };
  },

  async availability(tx) {
    const row = await tx
      .selectNoFrom([
        sql<boolean>`EXISTS (SELECT 1 FROM app.home_concept)`.as('home_concepts'),
        sql<boolean>`EXISTS (SELECT 1 FROM app.home_edition)`.as('home_editions'),
      ])
      .executeTakeFirstOrThrow();
    return { homeConcepts: row.home_concepts, homeEditions: row.home_editions };
  },
};
