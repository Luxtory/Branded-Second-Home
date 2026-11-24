import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { postgresMembershipGate } from '@/features/identity/infrastructure/postgres-membership';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createDepositHandler, type DepositCapacityResult } from '@/features/luxchange';
import { createHoldingDirectory } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
  type CommandHandler,
  type CommandOutcome,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { createPrlHandlers } from '@/features/pricing/prl';
import { activateMembership } from '../identity/membership-support';
import { addDays, bookableStart, type Titular } from '../booking/booking-support';
import { activate, asOperation, bookNow, type Admin } from '../booking/lifecycle-support';
import {
  creditsHarness,
  type CreditsHarness,
  type CreditTitular,
} from '../credits/credits-support';
import { addStaff, staffRunner, type Staff } from '../pricing/pricing-support';

/**
 * W20 — fixtures do depósito Luxchange (ADR-0036). Valores de teste deliberadamente diferentes dos canônicos: o
 * multiplicador de referência (10) só onde a regra comercial é provada; validade de 18 meses (credits-support).
 */
type Queryable = Pick<pg.Client | pg.Pool, 'query'>;

export const TEST_MULTIPLIER = '10';

export interface DepositHarness {
  readonly c: CreditsHarness;
  readonly admin: Staff;
  readonly multiplierId: string | null;
  readonly run: ReturnType<typeof staffRunner>;
}

/** Owner com Titular representado, Membership ativo, validade e multiplicador publicados, K4 e K6 ligadas. */
export async function depositHarness(
  options: {
    multiplier?: string | null;
    validityMonths?: number | null;
    membership?: boolean;
    activated?: boolean;
  } = {},
): Promise<DepositHarness> {
  const c = await creditsHarness({
    membership: options.membership,
    validityMonths: options.validityMonths,
    activated: false,
  });
  const multiplier = options.multiplier === undefined ? TEST_MULTIPLIER : options.multiplier;
  const multiplierId = multiplier === null ? null : await publishMultiplier(c, multiplier);
  if (options.activated !== false) await activate(c.h, 'credits', 'luxchange_deposit');
  return { c, admin: { ...c.admin, role: 'admin' }, multiplierId, run: staffRunner(c.h) };
}

/** `set_parameter` global de `credit_multiplier`, confirmado; vigência carimbada pelo banco. */
export async function publishMultiplier(c: CreditsHarness, value: string): Promise<string> {
  return asOperation(
    c.h.database.appUrl,
    'set_parameter',
    { kind: 'admin', admin: c.admin },
    async (client, op) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, effective_to, authority,
         authorization_ref, created_at, created_by, operation_id)
       VALUES ($1, 'credit_multiplier', NULL, $2, NULL, NULL, NULL, 'admin', 'Ata Luxtory W20', now(), $3, $4)`,
        [id, value, c.admin.userId, op],
      );
      return id;
    },
  );
}

/** PRL inicial (Admin) das noites, em unidade mínima, pelo command real da W16. */
export async function publishPrl(
  d: DepositHarness,
  homeId: string,
  nights: Readonly<Record<string, string>>,
): Promise<void> {
  const outcome = await d.run.as(d.admin, createPrlHandlers().publishInitialPrl, {
    second_home_id: homeId,
    nights: Object.entries(nights).map(([stay_date, amount_minor]) => ({
      stay_date,
      amount_minor,
    })),
    effective_from: null,
    basis: 'Ata Luxtory W20',
  });
  if (outcome.status !== 'committed') throw new Error(`PRL fixture: ${JSON.stringify(outcome)}`);
}

/** Alteração do PRL publicado (Super Admin, BR-181), pelo command real da W16. */
export async function changePrl(
  d: DepositHarness,
  homeId: string,
  nights: Readonly<Record<string, string>>,
  superAdmin?: Staff,
): Promise<CommandOutcome<JsonValue>> {
  const staff = superAdmin ?? (await addStaff(d.c.h, 'super_admin'));
  return d.run.as(staff, createPrlHandlers().changePublishedPrl, {
    second_home_id: homeId,
    nights: Object.entries(nights).map(([stay_date, amount_minor]) => ({
      stay_date,
      amount_minor,
    })),
    effective_from: null,
    basis: 'Ata Luxtory W20',
  });
}

/** Primeira data com folga para o depósito (≥ 14 dias) no exercício reservável, mais `offset` dias. */
export function depositDate(offset = 0): string {
  return addDays(bookableStart().first, 30 + offset);
}

/** Co-Owner da posição 1 com Membership ativo e K1 ligada para reservar pelo command real. */
export async function coOwnerTitular(d: DepositHarness): Promise<CreditTitular> {
  const scenario = await d.c.h.coOwnerScenario();
  const titular = scenario.titulares[0]!;
  await activateMembership(d.c.h.database.appUrl, d.c.admin, titular.partyId);
  await activate(d.c.h, 'own_use_booking');
  return { ...titular, homeId: scenario.homeId };
}

/** Reserva de uso próprio pelo command real da W12 (exige a K1). */
export function book(d: DepositHarness, titular: CreditTitular, checkin: string, nights: number) {
  return bookNow(d.c.h, titular, titular.homeId, checkin, addDays(checkin, nights));
}

/** Executor real (TECH-054) com o guard do Titular, a verificação de Membership e os privilégios do `luxtory_app`. */
export function depositRunner(d: DepositHarness, titular: Titular) {
  const guard = createAuthorizationGuard({
    session: { userId: titular.userId, assurance: 'aal1' },
    staff: createPostgresStaffDirectory(() => d.c.h.db),
    grants: createPostgresGrantDirectory(() => d.c.h.db),
    delegations: createPostgresDelegationDirectory(() => d.c.h.db),
    holdings: createHoldingDirectory(() => d.c.h.db),
    clock: systemClock,
  });
  const executor = createCommandExecutor({
    store: createPostgresCommandStore(d.c.h.db),
    guard,
    clock: systemClock,
    limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
    log: d.c.h.log,
    registry: commandRegistry,
    membership: postgresMembershipGate,
  });
  return <R extends JsonValue = DepositCapacityResult>(
    input: unknown,
    options: {
      key?: string;
      handler?: CommandHandler<unknown, R, DatabaseTransaction>;
    } = {},
  ) =>
    executor.execute(
      (options.handler ?? createDepositHandler()) as CommandHandler<
        unknown,
        R,
        DatabaseTransaction
      >,
      {
        actor: {
          kind: 'user',
          userId: titular.userId,
          actingPartyId: titular.partyId,
          role: 'titular',
        },
        idempotencyKey: options.key ?? randomUUID(),
        correlationId: randomUUID(),
        input,
      },
    );
}

/** Créditos esperados (texto exato) para o total de PRL em unidade mínima × multiplicador inteiro de teste. */
export function expectedCredits(totalMinor: bigint, multiplier = TEST_MULTIPLIER): string {
  const scaled = totalMinor * BigInt(multiplier);
  const whole = scaled / 100n;
  const cents = (scaled % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return cents === '' ? whole.toString() : `${whole}.${cents}`;
}

/** Operação `pending` de `deposit_capacity` do Titular para a Second Home (como o executor grava). */
export async function openDepositOperation(
  client: Queryable,
  titular: Titular,
  homeId: string,
  command = 'deposit_capacity',
): Promise<string> {
  const op = randomUUID();
  await client.query(
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
       correlation_id, authorization_ref, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'titular', $5, $6, $7, $8, 'pending', now(), now())`,
    [
      op,
      command,
      titular.userId,
      titular.partyId,
      homeId,
      `w20:${op}`,
      randomUUID(),
      `holding:${titular.holdingId}`,
    ],
  );
  return op;
}

/** Snapshot com validade, multiplicador e as noites em vigor agora (como o resolvedor `EconomicTerms`). */
export async function recordDepositSnapshot(
  client: Queryable,
  op: string,
  homeId: string,
  nights: readonly string[],
): Promise<void> {
  await client.query(
    `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
    [op],
  );
  for (const key of ['credit_validity_months', 'credit_multiplier'])
    await client.query(
      `INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
       SELECT $1, $2, v.id FROM app.economic_snapshot s, app.parameter_at($2, NULL, s.resolved_at) v
        WHERE s.operation_id = $1`,
      [op, key],
    );
  for (const night of nights)
    await client.query(
      `INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
       SELECT $1, $2, $3::date, v.id
         FROM app.economic_snapshot s, app.prl_at($2, $3::date, s.resolved_at) v WHERE s.operation_id = $1`,
      [op, homeId, night],
    );
}

/** Fecha a custódia `owner` ativa da noite e abre a cessão (com a referência informada). */
export async function cedeOwnerNight(
  client: Queryable,
  op: string,
  homeId: string,
  night: string,
  authorizationRef = `deposit_capacity:${op}`,
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $1
      WHERE second_home_id = $2 AND stay_date = $3::date AND closed_at IS NULL RETURNING id`,
    [op, homeId, night],
  );
  await client.query(
    `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, purpose, inventory_origin,
       authorization_ref, parent_custody_id, opened_by_operation)
     VALUES ($1, $2, $3::date, 'luxtory', 'inventory', 'luxchange_cession', $4, $5, $6)`,
    [randomUUID(), homeId, night, authorizationRef, rows[0]?.id ?? null, op],
  );
}

export async function insertDepositLot(
  client: Queryable,
  op: string,
  partyId: string,
  quantity: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.credit_lot (id, party_id, quantity, origin_operation_id) VALUES ($1, $2, $3, $4)`,
    [id, partyId, quantity, op],
  );
  return id;
}

export interface CustodyRow {
  readonly stay_date: string;
  readonly holder_kind: string;
  readonly basis: string | null;
  readonly inventory_origin: string | null;
  readonly authorization_ref: string | null;
  readonly opened_by_operation: string;
}

/** Custódias ativas das noites, em ordem de data. */
export async function activeCustody(
  db: Queryable,
  homeId: string,
  nights: readonly string[],
): Promise<CustodyRow[]> {
  const { rows } = await db.query<CustodyRow>(
    `SELECT stay_date::text, holder_kind, basis, inventory_origin, authorization_ref, opened_by_operation
       FROM app.date_custody WHERE second_home_id = $1 AND stay_date = ANY($2::date[]) AND closed_at IS NULL
      ORDER BY stay_date`,
    [homeId, [...nights]],
  );
  return rows;
}

/** Contagens de fatos econômicos do banco (para provar que nada foi gravado). */
export async function economicFacts(db: Queryable) {
  const { rows } = await db.query<{
    lots: number;
    snapshots: number;
    nights: number;
    cessions: number;
  }>(
    `SELECT (SELECT count(*)::int FROM app.credit_lot) AS lots,
            (SELECT count(*)::int FROM app.economic_snapshot) AS snapshots,
            (SELECT count(*)::int FROM app.economic_snapshot_night) AS nights,
            (SELECT count(*)::int FROM app.date_custody WHERE inventory_origin = 'luxchange_cession') AS cessions`,
  );
  return rows[0]!;
}

export type { Admin, CreditTitular };
