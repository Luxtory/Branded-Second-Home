import type { DatabaseTransaction } from '@/features/platform';

/** W8 read seam: the original commercial version survives later approvals or public withdrawal. No locks. */
export function readAcquisitionOrigin(tx: DatabaseTransaction, id: string) {
  return tx
    .selectFrom('app.second_home as h')
    .innerJoin('app.home_edition as e', 'e.id', 'h.home_edition_id')
    .innerJoin('app.home_concept as c', 'c.id', 'h.home_concept_id')
    .innerJoin('app.home_concept_version as v', 'v.id', 'h.home_concept_version_id')
    .select([
      'h.id',
      'h.label',
      'h.timezone',
      'e.name as homeEdition',
      'c.title as homeConcept',
      'v.version',
      'v.id as versionId',
    ])
    .where('h.id', '=', id)
    .executeTakeFirst();
}
