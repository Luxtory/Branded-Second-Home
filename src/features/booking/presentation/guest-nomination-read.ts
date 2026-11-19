import { sql } from 'kysely';
import { parameterInForce } from '@/features/admin/parameters';
import {
  getDatabase,
  withUserThenServerRead,
  type Database,
  type DatabaseTransaction,
} from '@/features/platform';

export interface GuestNominationEntry {
  readonly rulesId: string;
  readonly rulesSince: Date;
  readonly nominatedAt: Date;
}

export interface TitularGuestNominationRead {
  readonly booking: {
    readonly id: string;
    readonly secondHomeId: string;
    readonly partyId: string;
    readonly label: string;
    readonly timezone: string;
    readonly checkinDate: string;
    readonly checkoutDate: string;
    /** Confirmada ou em uso, antes do check-out (TECH-055); só exibição — o command revalida. */
    readonly declarable: boolean;
  };
  readonly rules: { readonly id: string; readonly value: string; readonly since: Date } | null;
  readonly nominations: readonly GuestNominationEntry[];
}

async function nominationsOf(tx: Pick<DatabaseTransaction, 'selectFrom'>, bookingId: string) {
  const rows = await tx
    .selectFrom('app.guest_nomination as n')
    .innerJoin('app.parameter as p', 'p.id', 'n.parameter_id')
    .select(['n.parameter_id', 'p.effective_from', 'n.nominated_at'])
    .where('n.booking_id', '=', bookingId)
    .orderBy('n.nominated_at')
    .execute();
  return rows.map((row) => ({
    rulesId: row.parameter_id,
    rulesSince: new Date(row.effective_from),
    nominatedAt: new Date(row.nominated_at),
  }));
}

/**
 * Leitura do Titular (W14, spec booking §11): a RLS prova que a reserva é da holding vigente que ele representa; o
 * servidor lê, no mesmo instantâneo, as regras vigentes e as declarações. Só exibição — a declaração revalida tudo.
 */
export async function readTitularGuestNomination(
  userId: string,
  bookingId: string,
  now: Date = new Date(),
  db: Database = getDatabase(),
): Promise<TitularGuestNominationRead | null> {
  return withUserThenServerRead(
    db,
    { sub: userId, role: 'authenticated' },
    async (tx) =>
      (await tx
        .selectFrom('app.booking')
        .select('id')
        .where('id', '=', bookingId)
        .executeTakeFirst()) ?? null,
    async (tx) => {
      const row = await tx
        .selectFrom('app.booking as b')
        .innerJoin('app.holding as h', 'h.id', 'b.holding_id')
        .innerJoin('app.second_home as s', 's.id', 'b.second_home_id')
        .select([
          'b.id',
          'b.second_home_id',
          'b.channel',
          'b.state',
          sql<string>`b.checkin_date::text`.as('checkin_date'),
          sql<string>`b.checkout_date::text`.as('checkout_date'),
          sql<boolean>`${now.toISOString()}::timestamptz < app.booking_checkout_at(b.checkout_date, s.timezone)`.as(
            'before_checkout',
          ),
          'h.party_id',
          's.label',
          's.timezone',
        ])
        .where('b.id', '=', bookingId)
        .executeTakeFirstOrThrow();
      const rules = await parameterInForce(tx, 'guest_rules', row.second_home_id, now);
      return {
        booking: {
          id: row.id,
          secondHomeId: row.second_home_id,
          partyId: row.party_id,
          label: row.label,
          timezone: row.timezone,
          checkinDate: row.checkin_date,
          checkoutDate: row.checkout_date,
          declarable:
            row.channel === 'own_use' &&
            ['confirmed', 'in_use'].includes(row.state) &&
            row.before_checkout,
        },
        rules:
          rules === null ? null : { id: rules.id, value: rules.value, since: rules.effectiveFrom },
        nominations: await nominationsOf(tx, bookingId),
      };
    },
  );
}

/** Declarações de uma reserva para o Admin (papel do servidor, depois do portão Admin). */
export async function readBookingNominations(
  bookingId: string,
  db: Database = getDatabase(),
): Promise<readonly GuestNominationEntry[]> {
  return nominationsOf(db, bookingId);
}
