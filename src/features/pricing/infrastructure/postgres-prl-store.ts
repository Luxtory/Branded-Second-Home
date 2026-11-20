import { sql } from 'kysely';
import { lockAdvisoryKeys, type DatabaseTransaction } from '@/features/platform';
import type { PrlStore } from '../application/publish-prl';
import type { PrlVersion } from '../domain/prl';

type Reader = Pick<DatabaseTransaction, 'selectFrom'>;

const dateText = (value: Date | string) =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);

/** Escrita do PRL por SQL direto do servidor; os gatilhos do banco decidem (ADR-0032). */
export function createPostgresPrlStore(): PrlStore<DatabaseTransaction> {
  return {
    async secondHomeExists(tx, secondHomeId) {
      const row = await tx
        .selectFrom('app.second_home')
        .select('id')
        .where('id', '=', secondHomeId)
        .executeTakeFirst();
      return row !== undefined;
    },
    async lockScope(tx, secondHomeId) {
      await lockAdvisoryKeys(tx, [`app.prl:${secondHomeId.toLowerCase()}`]);
    },
    async sealedNights(tx, secondHomeId, nights) {
      const rows = await tx
        .selectFrom('app.second_home_date')
        .select(sql<string>`stay_date::text`.as('night'))
        .where('second_home_id', '=', secondHomeId)
        .where(sql<boolean>`stay_date = ANY(${nights}::date[])`)
        .execute();
      return new Set(rows.map((row) => row.night));
    },
    async publishedNights(tx, secondHomeId, nights) {
      const rows = await tx
        .selectFrom('app.prl')
        .select(sql<string>`stay_date::text`.as('night'))
        .distinct()
        .where('second_home_id', '=', secondHomeId)
        .where(sql<boolean>`stay_date = ANY(${nights}::date[])`)
        .execute();
      return new Set(rows.map((row) => row.night));
    },
    async latestStart(tx, secondHomeId, nights) {
      const row = await tx
        .selectFrom('app.prl')
        .select(sql<Date | null>`max(effective_from)`.as('latest'))
        .where('second_home_id', '=', secondHomeId)
        .where(sql<boolean>`stay_date = ANY(${nights}::date[])`)
        .executeTakeFirst();
      return row?.latest == null ? null : new Date(row.latest);
    },
    async insert(tx, draft) {
      const publication = await tx
        .insertInto('app.prl_publication')
        .values({
          id: draft.id,
          second_home_id: draft.secondHomeId,
          kind: draft.kind,
          // Sem início informado, o gatilho carimba o instante da gravação (NOT NULL é conferido depois dele).
          effective_from: draft.effectiveFrom ?? sql<Date>`NULL`,
          authority: draft.authority,
          authorization_ref: draft.authorizationRef,
          created_at: sql<Date>`now()`,
          created_by: draft.createdBy,
          operation_id: draft.operationId,
        })
        .returning('effective_from')
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('app.prl')
        .values(
          draft.nights.map((night) => ({
            id: crypto.randomUUID(),
            publication_id: draft.id,
            second_home_id: draft.secondHomeId,
            stay_date: night.stayDate,
            amount_minor: night.amountMinor.toString(),
            currency: 'BRL',
            // A noite herda a vigência da publicação no gatilho.
            effective_from: sql<Date>`NULL`,
          })),
        )
        .execute();
      return new Date(publication.effective_from);
    },
  };
}

/** Histórico de versões das noites de um intervalo `[from, to)`, para o Admin (em ordem de noite e de início). */
export async function prlHistory(
  db: Reader,
  secondHomeId: string,
  from: string,
  to: string,
): Promise<readonly PrlVersion[]> {
  const rows = await db
    .selectFrom('app.prl_version')
    .select([
      'id',
      sql<string>`stay_date::text`.as('night'),
      sql<string>`amount_minor::text`.as('amount'),
      'effective_from',
      'effective_to',
      'kind',
      'authority',
      'authorization_ref',
      'created_at',
    ])
    .where('second_home_id', '=', secondHomeId)
    .where(sql<boolean>`stay_date >= ${from}::date AND stay_date < ${to}::date`)
    .orderBy('stay_date')
    .orderBy('effective_from')
    .execute();
  return rows.map((row) => ({
    id: row.id!,
    stayDate: dateText(row.night),
    amountMinor: BigInt(row.amount),
    currency: 'BRL',
    effectiveFrom: new Date(row.effective_from!),
    effectiveTo: row.effective_to === null ? null : new Date(row.effective_to),
    kind: row.kind as PrlVersion['kind'],
    authority: row.authority as PrlVersion['authority'],
    authorizationRef: row.authorization_ref ?? '',
    createdAt: new Date(row.created_at!),
  }));
}

/** Noites seladas de um intervalo `[from, to)` (o calendário onde o PRL pode existir). */
export async function sealedNightsBetween(
  db: Reader,
  secondHomeId: string,
  from: string,
  to: string,
): Promise<readonly string[]> {
  const rows = await db
    .selectFrom('app.second_home_date')
    .select(sql<string>`stay_date::text`.as('night'))
    .where('second_home_id', '=', secondHomeId)
    .where(sql<boolean>`stay_date >= ${from}::date AND stay_date < ${to}::date`)
    .orderBy('stay_date')
    .execute();
  return rows.map((row) => row.night);
}

export interface PrlCoverage {
  readonly secondHomeId: string;
  readonly label: string;
  readonly editionName: string;
  readonly sealedNights: number;
  /** Noites seladas com PRL vigente no instante. */
  readonly nightsInForce: number;
  /** Noites seladas com alguma versão (vigente ou agendada). */
  readonly nightsPublished: number;
  readonly firstSealed: string | null;
  readonly lastSealed: string | null;
}

/** Cobertura por Second Home: noites seladas, com PRL vigente e com alguma versão, no instante. */
export async function prlCoverage(db: Reader, at: Date): Promise<readonly PrlCoverage[]> {
  const rows = await db
    .selectFrom('app.second_home as s')
    .innerJoin('app.home_edition as e', 'e.id', 's.home_edition_id')
    .select([
      's.id',
      's.label',
      'e.name',
      sql<number>`(SELECT count(*)::int FROM app.second_home_date d WHERE d.second_home_id = s.id)`.as(
        'sealed',
      ),
      sql<number>`(SELECT count(DISTINCT l.stay_date)::int FROM app.prl l
                    WHERE l.second_home_id = s.id AND l.effective_from <= ${at.toISOString()}::timestamptz)`.as(
        'in_force',
      ),
      sql<number>`(SELECT count(DISTINCT l.stay_date)::int FROM app.prl l WHERE l.second_home_id = s.id)`.as(
        'published',
      ),
      sql<
        string | null
      >`(SELECT min(d.stay_date)::text FROM app.second_home_date d WHERE d.second_home_id = s.id)`.as(
        'first_sealed',
      ),
      sql<
        string | null
      >`(SELECT max(d.stay_date)::text FROM app.second_home_date d WHERE d.second_home_id = s.id)`.as(
        'last_sealed',
      ),
    ])
    .orderBy('e.name')
    .orderBy('s.label')
    .execute();
  return rows.map((row) => ({
    secondHomeId: row.id,
    label: row.label,
    editionName: row.name,
    sealedNights: row.sealed,
    nightsInForce: row.in_force,
    nightsPublished: row.published,
    firstSealed: row.first_sealed,
    lastSealed: row.last_sealed,
  }));
}
