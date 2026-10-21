import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { InterestCount, InterestReader, InterestRecord } from '../application/ports';
import type { InterestModality } from '../domain/interest';
import {
  QUALIFICATION_VERSION,
  type AvailableToStartBand,
  type DecisionHorizon,
  type DecisionUnit,
  type ReferenceFit,
} from '../domain/interest-qualification';

/** Registro de pré-qualificação numa versão de códigos que esta leitura não conhece. */
export class QualificationVersionError extends Error {
  constructor(readonly version: number) {
    super(`interest_qualification version ${version} is not readable by this release`);
    this.name = 'QualificationVersionError';
  }
}

// Os CHECKs do banco garantem os valores dos enums.
const modality = (value: string) => value as InterestModality;

// Campos da manifestação mostrados ao Admin — nunca `origin`/`partner_ref` (sem uso definido) nem dado de contato.
const RECORD_COLUMNS = [
  'id',
  'home_edition_id',
  'modality',
  'desired_location',
  'approx_days',
  'created_at',
] as const;

interface RecordRow {
  readonly id: string;
  readonly home_edition_id: string;
  readonly modality: string;
  readonly desired_location: string;
  readonly approx_days: number | null;
  readonly created_at: Date;
}

const toRecord = (row: RecordRow): InterestRecord => ({
  id: row.id,
  homeEditionId: row.home_edition_id,
  modality: modality(row.modality),
  desiredLocation: row.desired_location,
  approxDays: row.approx_days,
  createdAt: row.created_at,
});

/** Leituras do Admin (BR-062; spec ownership §5, §14.10), como `luxtory_app` na transação do `admin_read`. */
export const postgresInterestReader: InterestReader<DatabaseTransaction> = {
  async counts(tx) {
    const rows = await tx
      .selectFrom('app.interest')
      .select(['home_edition_id', 'desired_location', 'modality', 'approx_days'])
      .select(sql<number>`count(*)::int`.as('count'))
      .groupBy(['home_edition_id', 'desired_location', 'modality', 'approx_days'])
      .execute();
    return rows.map((row): InterestCount => ({
      homeEditionId: row.home_edition_id,
      desiredLocation: row.desired_location,
      modality: modality(row.modality),
      approxDays: row.approx_days,
      count: row.count,
    }));
  },

  async homeEditionInterests(tx, homeEditionId) {
    const rows = await tx
      .selectFrom('app.interest')
      .select(RECORD_COLUMNS)
      .where('home_edition_id', '=', homeEditionId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    return rows.map(toRecord);
  },

  async interest(tx, interestId) {
    const row = await tx
      .selectFrom('app.interest')
      .select(RECORD_COLUMNS)
      .where('id', '=', interestId)
      .executeTakeFirst();
    return row === undefined ? null : toRecord(row);
  },

  async contact(tx, interestId) {
    const row = await tx
      .selectFrom('app.interest_contact')
      .select(['name', 'phone', 'email'])
      .where('interest_id', '=', interestId)
      .executeTakeFirst();
    return row === undefined ? null : { name: row.name, phone: row.phone, email: row.email };
  },

  async qualification(tx, interestId) {
    const row = await tx
      .selectFrom('app.interest_qualification')
      .select([
        'qualification_version',
        'available_to_start_band',
        'reference_fit',
        'presented_projected_investment_id',
        'decision_unit',
        'decision_horizon',
      ])
      .where('interest_id', '=', interestId)
      .executeTakeFirst();
    if (row === undefined) return null;
    // Só a versão 1 existe; uma versão nova traz a sua própria leitura dos códigos.
    if (row.qualification_version !== QUALIFICATION_VERSION) {
      throw new QualificationVersionError(row.qualification_version);
    }
    return {
      version: QUALIFICATION_VERSION,
      availableToStartBand: row.available_to_start_band as AvailableToStartBand,
      referenceFit: row.reference_fit as ReferenceFit | null,
      presentedProjectedInvestmentId: row.presented_projected_investment_id,
      decisionUnit: row.decision_unit as DecisionUnit,
      decisionHorizon: row.decision_horizon as DecisionHorizon,
    };
  },
};
