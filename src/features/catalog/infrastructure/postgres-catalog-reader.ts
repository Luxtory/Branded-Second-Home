import type { DatabaseTransaction } from '@/features/platform';
import type {
  BrandPartnerDetail,
  CatalogReader,
  HomeConceptDetail,
  HomeEditionDetail,
  SecondHomeDetail,
} from '../application/views';
import type { BrandPartner, HomeConcept, HomeConceptVersion } from '../domain/catalog';
import {
  toBrandPartner,
  toCatalogTerm,
  toHomeConcept,
  toHomeConceptCuration,
  toHomeConceptMedia,
  toHomeConceptVersion,
  toHomeEdition,
  toHomeEditionMedia,
  toHomeEditionProjectedInvestment,
  toInvestorAuthorization,
  toSecondHome,
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

async function homeConceptById(tx: Tx, id: string): Promise<HomeConcept | null> {
  const row = await tx
    .selectFrom('app.home_concept')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row === undefined ? null : toHomeConcept(row);
}

async function homeConceptVersions(tx: Tx, homeConceptId: string): Promise<HomeConceptVersion[]> {
  const rows = await tx
    .selectFrom('app.home_concept_version')
    .selectAll()
    .where('home_concept_id', '=', homeConceptId)
    .orderBy('version', 'desc')
    .execute();
  const terms = await tx
    .selectFrom('app.home_concept_version_term as t')
    .innerJoin('app.home_concept_version as v', 'v.id', 't.home_concept_version_id')
    .select(['t.home_concept_version_id', 't.term_id', 't.kind', 't.position'])
    .where('v.home_concept_id', '=', homeConceptId)
    .execute();
  return rows.map((row) =>
    toHomeConceptVersion(
      row,
      terms.filter((term) => term.home_concept_version_id === row.id),
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

async function homeConceptMediaList(tx: Tx, homeConceptId: string) {
  const rows = await tx
    .selectFrom('app.home_concept_media')
    .selectAll()
    .where('home_concept_id', '=', homeConceptId)
    .orderBy('created_at', 'desc')
    .execute();
  const files = await tx
    .selectFrom('app.home_concept_media_file as f')
    .innerJoin('app.home_concept_media as m', 'm.id', 'f.media_id')
    .select(['f.media_id', 'f.role', 'f.width', 'f.height'])
    .where('m.home_concept_id', '=', homeConceptId)
    .orderBy('f.width')
    .execute();
  return rows.map((row) =>
    toHomeConceptMedia(
      row,
      files.filter((file) => file.media_id === row.id),
    ),
  );
}

async function homeEditionMediaList(tx: Tx, homeEditionId: string) {
  const rows = await tx
    .selectFrom('app.home_edition_media')
    .selectAll()
    .where('home_edition_id', '=', homeEditionId)
    .orderBy('created_at', 'desc')
    .execute();
  const files = await tx
    .selectFrom('app.home_edition_media_file as f')
    .innerJoin('app.home_edition_media as m', 'm.id', 'f.media_id')
    .select(['f.media_id', 'f.role', 'f.width', 'f.height'])
    .where('m.home_edition_id', '=', homeEditionId)
    .orderBy('f.width')
    .execute();
  return rows.map((row) =>
    toHomeEditionMedia(
      row,
      files.filter((file) => file.media_id === row.id),
    ),
  );
}

async function investorAuthorizations(tx: Tx, homeConceptId: string) {
  const rows = await tx
    .selectFrom('app.investor_authorization')
    .selectAll()
    .where('home_concept_id', '=', homeConceptId)
    .orderBy('created_at', 'desc')
    .execute();
  return rows.map(toInvestorAuthorization);
}

const current = (versions: readonly HomeConceptVersion[]) =>
  versions.find((version) => version.state === 'approved') ?? null;

export const postgresCatalogReader: CatalogReader<Tx> = {
  async brandPartners(tx) {
    const rows = await tx
      .selectFrom('app.brand_partner as bp')
      .leftJoin('app.home_concept as c', 'c.brand_partner_id', 'bp.id')
      .select(['bp.id', 'bp.brand_name', 'bp.terminated_effective_at', 'bp.exposure_authorized_at'])
      .select((eb) => eb.fn.count<string>('c.id').as('home_concept_count'))
      .groupBy('bp.id')
      .orderBy('bp.brand_name')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      brandName: row.brand_name,
      terminatedEffectiveAt: row.terminated_effective_at,
      exposureAuthorizedAt: row.exposure_authorized_at,
      homeConceptCount: count(row.home_concept_count),
    }));
  },

  async brandPartner(tx, id): Promise<BrandPartnerDetail | null> {
    const partner = await partnerById(tx, id);
    if (partner === null) return null;
    const rows = await tx
      .selectFrom('app.home_concept as c')
      .select(['c.id', 'c.title'])
      .select((eb) => [
        eb
          .selectFrom('app.home_concept_version as v')
          .select((sub) => sub.fn.max('v.version').as('n'))
          .whereRef('v.home_concept_id', '=', 'c.id')
          .where('v.state', '=', 'approved')
          .as('current_version'),
        eb
          .selectFrom('app.home_concept_version as v')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .whereRef('v.home_concept_id', '=', 'c.id')
          .as('version_count'),
        eb
          .selectFrom('app.home_edition as e')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .whereRef('e.home_concept_id', '=', 'c.id')
          .as('home_edition_count'),
      ])
      .where('c.brand_partner_id', '=', id)
      .orderBy('c.title')
      .execute();
    return {
      partner,
      homeConcepts: rows.map((row) => ({
        id: row.id,
        title: row.title,
        currentVersion: row.current_version ?? null,
        versionCount: count(row.version_count),
        homeEditionCount: count(row.home_edition_count),
      })),
    };
  },

  async homeConcept(tx, id): Promise<HomeConceptDetail | null> {
    const homeConcept = await homeConceptById(tx, id);
    if (homeConcept === null) return null;
    const partner = await partnerById(tx, homeConcept.brandPartnerId);
    if (partner === null) return null;
    const homeEditions = await tx
      .selectFrom('app.home_edition as e')
      .selectAll('e')
      .select((eb) =>
        eb
          .selectFrom('app.second_home as s')
          .select((sub) => sub.fn.countAll<string>().as('n'))
          .whereRef('s.home_edition_id', '=', 'e.id')
          .as('second_home_count'),
      )
      .where('e.home_concept_id', '=', id)
      .orderBy('e.created_at', 'desc')
      .execute();
    return {
      homeConcept,
      partner,
      versions: await homeConceptVersions(tx, id),
      homeEditions: homeEditions.map((row) => ({
        homeEdition: toHomeEdition(row),
        secondHomeCount: count(row.second_home_count),
      })),
      investorAuthorizations: await investorAuthorizations(tx, id),
      media: await homeConceptMediaList(tx, id),
      curation: await tx
        .selectFrom('app.home_concept_curation')
        .selectAll()
        .where('home_concept_id', '=', id)
        .executeTakeFirst()
        .then((row) => (row === undefined ? null : toHomeConceptCuration(row))),
      terms: await allTerms(tx),
    };
  },

  async homeEdition(tx, id): Promise<HomeEditionDetail | null> {
    const row = await tx
      .selectFrom('app.home_edition')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) return null;
    const homeEdition = toHomeEdition(row);
    const homeConcept = await homeConceptById(tx, homeEdition.homeConceptId);
    const partner = homeConcept === null ? null : await partnerById(tx, homeConcept.brandPartnerId);
    if (homeConcept === null || partner === null) return null;
    const secondHomes = await tx
      .selectFrom('app.second_home as s')
      .innerJoin('app.home_concept_version as v', 'v.id', 's.home_concept_version_id')
      .selectAll('s')
      .select('v.version')
      .where('s.home_edition_id', '=', id)
      .orderBy('s.commercially_approved_at', 'desc')
      .execute();
    return {
      homeEdition,
      homeConcept,
      partner,
      currentVersion: current(await homeConceptVersions(tx, homeConcept.id)),
      secondHomes: secondHomes.map((secondHome) => ({
        secondHome: toSecondHome(secondHome),
        homeConceptVersion: secondHome.version,
      })),
      investorAuthorizations: await investorAuthorizations(tx, homeConcept.id),
      projectedInvestments: (
        await tx
          .selectFrom('app.home_edition_projected_investment')
          .selectAll()
          .where('home_edition_id', '=', id)
          .orderBy('valid_from', 'desc')
          .execute()
      ).map(toHomeEditionProjectedInvestment),
      media: await homeEditionMediaList(tx, id),
    };
  },

  async secondHome(tx, id): Promise<SecondHomeDetail | null> {
    const row = await tx
      .selectFrom('app.second_home')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) return null;
    const secondHome = toSecondHome(row);
    const [versionRow, homeEditionRow, homeConcept] = await Promise.all([
      tx
        .selectFrom('app.home_concept_version')
        .selectAll()
        .where('id', '=', secondHome.homeConceptVersionId)
        .executeTakeFirst(),
      tx
        .selectFrom('app.home_edition')
        .selectAll()
        .where('id', '=', secondHome.homeEditionId)
        .executeTakeFirst(),
      homeConceptById(tx, secondHome.homeConceptId),
    ]);
    const partner = homeConcept === null ? null : await partnerById(tx, homeConcept.brandPartnerId);
    if (
      versionRow === undefined ||
      homeEditionRow === undefined ||
      homeConcept === null ||
      partner === null
    ) {
      return null;
    }
    const authorizationId = secondHome.investorAuthorizationId;
    const authorizationRow =
      authorizationId === null
        ? undefined
        : await tx
            .selectFrom('app.investor_authorization')
            .selectAll()
            .where('id', '=', authorizationId)
            .executeTakeFirst();
    return {
      secondHome,
      homeConceptVersion: toHomeConceptVersion(
        versionRow,
        await tx
          .selectFrom('app.home_concept_version_term')
          .select(['term_id', 'kind', 'position'])
          .where('home_concept_version_id', '=', versionRow.id)
          .execute(),
      ),
      homeEdition: toHomeEdition(homeEditionRow),
      homeConcept,
      partner,
      investorAuthorization:
        authorizationRow === undefined ? null : toInvestorAuthorization(authorizationRow),
    };
  },

  terms: allTerms,

  mediaPreview: (tx, mediaId) => smallestDisplay(tx, 'app.home_concept_media_file', mediaId),

  homeEditionMediaPreview: (tx, mediaId) =>
    smallestDisplay(tx, 'app.home_edition_media_file', mediaId),
};

async function smallestDisplay(
  tx: Tx,
  table: 'app.home_concept_media_file' | 'app.home_edition_media_file',
  mediaId: string,
) {
  const row = await tx
    .selectFrom(table)
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
}
