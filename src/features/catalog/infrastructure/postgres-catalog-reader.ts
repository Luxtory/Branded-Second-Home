import type { DatabaseTransaction } from '@/features/platform';
import type {
  BrandPartnerDetail,
  CatalogReader,
  ConceptDetail,
  EditionDetail,
  ResidenceDetail,
} from '../application/views';
import type { BrandPartner, Concept, ConceptVersion } from '../domain/catalog';
import {
  toBrandPartner,
  toCatalogTerm,
  toConcept,
  toConceptCuration,
  toConceptMedia,
  toConceptVersion,
  toEdition,
  toEditionReferenceValue,
  toInvestorAuthorization,
  toResidence,
} from './rows';

/** Leituras do Admin como `luxtory_app` (ADR-0010 §7), dentro da transação que grava o `admin_read`. */
type Tx = DatabaseTransaction;

const count = (value: string | number | bigint | null) => Number(value ?? 0);

async function partnerById(tx: Tx, id: string): Promise<BrandPartner | null> {
  const row = await tx
    .selectFrom('app.brand_partner')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row === undefined ? null : toBrandPartner(row);
}

async function conceptById(tx: Tx, id: string): Promise<Concept | null> {
  const row = await tx
    .selectFrom('app.concept')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row === undefined ? null : toConcept(row);
}

async function conceptVersions(tx: Tx, conceptId: string): Promise<ConceptVersion[]> {
  const rows = await tx
    .selectFrom('app.concept_version')
    .selectAll()
    .where('concept_id', '=', conceptId)
    .orderBy('version', 'desc')
    .execute();
  const terms = await tx
    .selectFrom('app.concept_version_term as t')
    .innerJoin('app.concept_version as v', 'v.id', 't.concept_version_id')
    .select(['t.concept_version_id', 't.term_id', 't.kind', 't.position'])
    .where('v.concept_id', '=', conceptId)
    .execute();
  return rows.map((row) =>
    toConceptVersion(
      row,
      terms.filter((term) => term.concept_version_id === row.id),
    ),
  );
}

async function allTerms(tx: Tx) {
  const rows = await tx
    .selectFrom('app.catalog_term')
    .selectAll()
    .orderBy('kind')
    .orderBy('label')
    .execute();
  return rows.map(toCatalogTerm);
}

async function conceptMediaList(tx: Tx, conceptId: string) {
  const rows = await tx
    .selectFrom('app.concept_media')
    .selectAll()
    .where('concept_id', '=', conceptId)
    .orderBy('created_at', 'desc')
    .execute();
  const files = await tx
    .selectFrom('app.concept_media_file as f')
    .innerJoin('app.concept_media as m', 'm.id', 'f.media_id')
    .select(['f.media_id', 'f.role', 'f.width', 'f.height'])
    .where('m.concept_id', '=', conceptId)
    .orderBy('f.width')
    .execute();
  return rows.map((row) =>
    toConceptMedia(
      row,
      files.filter((file) => file.media_id === row.id),
    ),
  );
}

async function investorAuthorizations(tx: Tx, conceptId: string) {
  const rows = await tx
    .selectFrom('app.investor_authorization')
    .selectAll()
    .where('concept_id', '=', conceptId)
    .orderBy('created_at', 'desc')
    .execute();
  return rows.map(toInvestorAuthorization);
}

const current = (versions: readonly ConceptVersion[]) =>
  versions.find((version) => version.state === 'approved') ?? null;

export const postgresCatalogReader: CatalogReader<Tx> = {
  async brandPartners(tx) {
    const rows = await tx
      .selectFrom('app.brand_partner as bp')
      .leftJoin('app.concept as c', 'c.brand_partner_id', 'bp.id')
      .select(['bp.id', 'bp.brand_name', 'bp.terminated_effective_at', 'bp.exposure_authorized_at'])
      .select((eb) => eb.fn.count<string>('c.id').as('concept_count'))
      .groupBy('bp.id')
      .orderBy('bp.brand_name')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      terminatedEffectiveAt: row.terminated_effective_at,
      exposureAuthorizedAt: row.exposure_authorized_at,
      conceptCount: count(row.concept_count),
    }));
  },

  async brandPartner(tx, id): Promise<BrandPartnerDetail | null> {
    const partner = await partnerById(tx, id);
    if (partner === null) return null;
    const rows = await tx
      .selectFrom('app.concept as c')
      .select(['c.id', 'c.title'])
      .select((eb) => [
        eb
          .selectFrom('app.concept_version as v')
          .select((sub) => sub.fn.max('v.version').as('n'))
          .whereRef('v.concept_id', '=', 'c.id')
          .where('v.state', '=', 'approved')
          .as('current_version'),
        eb
          .selectFrom('app.concept_version as v')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .whereRef('v.concept_id', '=', 'c.id')
          .as('version_count'),
        eb
          .selectFrom('app.edition as e')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .whereRef('e.concept_id', '=', 'c.id')
          .as('edition_count'),
      ])
      .where('c.brand_partner_id', '=', id)
      .orderBy('c.title')
      .execute();
    return {
      partner,
      concepts: rows.map((row) => ({
        id: row.id,
        title: row.title,
        currentVersion: row.current_version ?? null,
        versionCount: count(row.version_count),
        editionCount: count(row.edition_count),
      })),
    };
  },

  async concept(tx, id): Promise<ConceptDetail | null> {
    const concept = await conceptById(tx, id);
    if (concept === null) return null;
    const partner = await partnerById(tx, concept.brandPartnerId);
    if (partner === null) return null;
    const editions = await tx
      .selectFrom('app.edition as e')
      .selectAll('e')
      .select((eb) =>
        eb
          .selectFrom('app.residence as r')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .whereRef('r.edition_id', '=', 'e.id')
          .as('residence_count'),
      )
      .where('e.concept_id', '=', id)
      .orderBy('e.created_at', 'desc')
      .execute();
    return {
      concept,
      partner,
      versions: await conceptVersions(tx, id),
      editions: editions.map((row) => ({
        edition: toEdition(row),
        residenceCount: count(row.residence_count),
      })),
      investorAuthorizations: await investorAuthorizations(tx, id),
      media: await conceptMediaList(tx, id),
      curation: await tx
        .selectFrom('app.concept_curation')
        .selectAll()
        .where('concept_id', '=', id)
        .executeTakeFirst()
        .then((row) => (row === undefined ? null : toConceptCuration(row))),
      terms: await allTerms(tx),
    };
  },

  async edition(tx, id): Promise<EditionDetail | null> {
    const row = await tx
      .selectFrom('app.edition')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) return null;
    const edition = toEdition(row);
    const concept = await conceptById(tx, edition.conceptId);
    const partner = concept === null ? null : await partnerById(tx, concept.brandPartnerId);
    if (concept === null || partner === null) return null;
    const residences = await tx
      .selectFrom('app.residence as r')
      .innerJoin('app.concept_version as v', 'v.id', 'r.concept_version_id')
      .selectAll('r')
      .select('v.version')
      .where('r.edition_id', '=', id)
      .orderBy('r.commercially_approved_at', 'desc')
      .execute();
    return {
      edition,
      concept,
      partner,
      currentVersion: current(await conceptVersions(tx, concept.id)),
      residences: residences.map((residence) => ({
        residence: toResidence(residence),
        conceptVersion: residence.version,
      })),
      investorAuthorizations: await investorAuthorizations(tx, concept.id),
      referenceValues: (
        await tx
          .selectFrom('app.edition_reference_value')
          .selectAll()
          .where('edition_id', '=', id)
          .orderBy('valid_from', 'desc')
          .orderBy('basis')
          .execute()
      ).map(toEditionReferenceValue),
    };
  },

  async residence(tx, id): Promise<ResidenceDetail | null> {
    const row = await tx
      .selectFrom('app.residence')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) return null;
    const residence = toResidence(row);
    const [versionRow, editionRow, concept] = await Promise.all([
      tx
        .selectFrom('app.concept_version')
        .selectAll()
        .where('id', '=', residence.conceptVersionId)
        .executeTakeFirst(),
      tx
        .selectFrom('app.edition')
        .selectAll()
        .where('id', '=', residence.editionId)
        .executeTakeFirst(),
      conceptById(tx, residence.conceptId),
    ]);
    const partner = concept === null ? null : await partnerById(tx, concept.brandPartnerId);
    if (
      versionRow === undefined ||
      editionRow === undefined ||
      concept === null ||
      partner === null
    ) {
      return null;
    }
    const authorizationId = residence.investorAuthorizationId;
    const authorizationRow =
      authorizationId === null
        ? undefined
        : await tx
            .selectFrom('app.investor_authorization')
            .selectAll()
            .where('id', '=', authorizationId)
            .executeTakeFirst();
    return {
      residence,
      conceptVersion: toConceptVersion(
        versionRow,
        await tx
          .selectFrom('app.concept_version_term')
          .select(['term_id', 'kind', 'position'])
          .where('concept_version_id', '=', versionRow.id)
          .execute(),
      ),
      edition: toEdition(editionRow),
      concept,
      partner,
      investorAuthorization:
        authorizationRow === undefined ? null : toInvestorAuthorization(authorizationRow),
    };
  },

  terms: allTerms,

  async mediaPreview(tx, mediaId) {
    const row = await tx
      .selectFrom('app.concept_media_file')
      .select(['content_type', 'storage_key', 'width', 'height'])
      .where('media_id', '=', mediaId)
      .where('role', '=', 'display')
      .orderBy('width')
      .limit(1)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          contentType: row.content_type,
          storageKey: row.storage_key,
          width: row.width,
          height: row.height,
        };
  },
};
