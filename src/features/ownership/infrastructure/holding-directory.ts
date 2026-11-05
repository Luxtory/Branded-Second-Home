import type { Database, DatabaseTransaction } from '@/features/platform';

type Executor = Database | DatabaseTransaction;

/** Holding vigente de uma party numa Second Home (W8); a mesma forma da porta do guard do identity (W12). */
export interface CurrentHolding {
  readonly id: string;
  readonly role: 'owner' | 'co_owner';
  readonly stakeId: string | null;
}

class UnexpectedHoldingRoleError extends Error {
  constructor(value: string) {
    super(`Unexpected holding role: ${value}`);
    this.name = 'UnexpectedHoldingRoleError';
  }
}

function roleOf(value: string): CurrentHolding['role'] {
  if (value === 'owner' || value === 'co_owner') return value;
  throw new UnexpectedHoldingRoleError(value);
}

/**
 * Holding vigente da party na Second Home no instante. A W8 garante no máximo uma por party e Second Home a cada
 * instante (EXCLUDE `conflict_holding_party_period`), então "mesmo Co-Owner" e "mesma Ação" coincidem (REQ-034, TECH-045).
 */
export async function currentHolding(
  db: Executor,
  partyId: string,
  secondHomeId: string,
  at: Date,
): Promise<CurrentHolding | null> {
  const row = await db
    .selectFrom('app.holding')
    .select(['id', 'role', 'stake_id'])
    .where('party_id', '=', partyId)
    .where('second_home_id', '=', secondHomeId)
    .where('valid_from', '<=', at)
    .where((eb) => eb.or([eb('valid_until', 'is', null), eb('valid_until', '>', at)]))
    .executeTakeFirst();
  return row === undefined ? null : { id: row.id, role: roleOf(row.role), stakeId: row.stake_id };
}

/**
 * Party de uma holding, vigente ou não (W13): a reserva fica presa à holding da época (`booking.holding_id`), e as
 * notificações do ciclo dela vão a essa party (spec booking §10.12, como na confirmação, ADR-0026 D6).
 */
export async function holdingParty(db: Executor, holdingId: string): Promise<string | null> {
  const row = await db
    .selectFrom('app.holding')
    .select('party_id')
    .where('id', '=', holdingId)
    .executeTakeFirst();
  return row?.party_id ?? null;
}

/** Diretório para o guard do Titular (porta `HoldingDirectory` do identity), lido a cada decisão. */
export function createHoldingDirectory(database: () => Database) {
  return {
    currentHolding: (partyId: string, secondHomeId: string, at: Date) =>
      currentHolding(database(), partyId, secondHomeId, at),
  };
}
