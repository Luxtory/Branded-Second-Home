import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { postgresMembershipGate } from '@/features/identity/infrastructure/postgres-membership';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createHoldingDirectory } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
  systemCommandGuard,
  type CommandGuard,
  type CommandHandler,
  type DatabaseTransaction,
  type JsonValue,
} from '@/features/platform';
import { bookingHarness, type BookingHarness, type Titular } from '../booking/booking-support';
import {
  activate,
  addAdmin,
  asOperation,
  connect,
  openOperation,
  type Admin,
  type OperationActor,
} from '../booking/lifecycle-support';
import { activateMembership, changeMembership } from '../identity/membership-support';

/**
 * W17 — fixtures dos Créditos (ADR-0033). As escritas são as que as funções do slice `credits` fazem, gravadas pelo papel
 * da aplicação (`luxtory_app`) com a operação `pending` do command; o envelhecimento de lotes é do dono do schema, com
 * os gatilhos desligados, para simular a passagem do tempo sem mexer no relógio do banco.
 */
type Queryable = Pick<pg.Client | pg.Pool, 'query'>;

/** Validade de teste deliberadamente diferente da inicial canônica (TECH-030), para revelar padrão embutido. */
export const TEST_VALIDITY_MONTHS = 18;

/** Titular com a Second Home de que é Owner (escopo do guard do Titular). */
export interface CreditTitular extends Titular {
  readonly homeId: string;
}

export interface CreditsHarness {
  readonly h: BookingHarness;
  readonly admin: Admin;
  readonly titular: CreditTitular;
  /** Versão de `credit_validity_months` publicada; `null` quando o cenário a omite (TECH-001). */
  readonly validityId: string | null;
}

/** Owner com Titular representado, Membership ativo, validade publicada e K4 ligada (o dono do schema ativa). */
export async function creditsHarness(
  options: { membership?: boolean; activated?: boolean; validityMonths?: number | null } = {},
): Promise<CreditsHarness> {
  const h = await bookingHarness();
  const { homeId, titular } = await h.ownerScenario();
  const admin = await addAdmin(h);
  if (options.membership !== false)
    await activateMembership(h.database.appUrl, admin, titular.partyId);
  const months =
    options.validityMonths === undefined ? TEST_VALIDITY_MONTHS : options.validityMonths;
  const validityId = months === null ? null : await publishValidity(h, admin, months);
  if (options.activated !== false) await activate(h, 'credits');
  return { h, admin, titular: { ...titular, homeId }, validityId };
}

/** Segunda party Titular (outra Second Home Owner), com Membership ativo. */
export async function secondTitular(c: CreditsHarness): Promise<CreditTitular> {
  const { homeId, titular } = await c.h.ownerScenario();
  await activateMembership(c.h.database.appUrl, c.admin, titular.partyId);
  return { ...titular, homeId };
}

export const suspend = (c: CreditsHarness, partyId: string) =>
  changeMembership(c.h.database.appUrl, c.admin, partyId, 'suspended');
export const reactivate = (c: CreditsHarness, partyId: string) =>
  changeMembership(c.h.database.appUrl, c.admin, partyId, 'active');

/** `set_parameter` global de `credit_validity_months`, confirmado; vigência carimbada pelo banco. */
export async function publishValidity(
  h: BookingHarness,
  admin: Admin,
  months: number,
): Promise<string> {
  return asOperation(
    h.database.appUrl,
    'set_parameter',
    { kind: 'admin', admin },
    async (client, op) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, effective_to, authority,
         authorization_ref, created_at, created_by, operation_id)
       VALUES ($1, 'credit_validity_months', NULL, $2, NULL, NULL, NULL, 'admin', 'Ata Luxtory W17', now(), $3, $4)`,
        [id, String(months), admin.userId, op],
      );
      return id;
    },
  );
}

/** Snapshot da validade vigente, resolvido agora pelo banco (como o resolvedor `EconomicTerms`). */
export async function recordValiditySnapshot(client: Queryable, op: string): Promise<void> {
  await client.query(
    `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
    [op],
  );
  await client.query(
    `INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
     SELECT $1, 'credit_validity_months', v.id
       FROM app.economic_snapshot s, app.parameter_at('credit_validity_months', NULL, s.resolved_at) v
      WHERE s.operation_id = $1`,
    [op],
  );
}

export async function insertLot(
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

const titularActor = (titular: Titular): OperationActor => ({ kind: 'titular', titular });

/**
 * Originação completa (snapshot + lote) na operação de `command`, confirmada. Desde a W20 (ADR-0036 §5–§6), uma
 * originação por `deposit_capacity` só confirma com o depósito inteiro (noites cedidas, PRL e multiplicador no snapshot)
 * — provado em `tests/features/luxchange`. Os fixtures genéricos do ledger originam por `accept_request`, cujas regras
 * de cessão chegam com a W22 (K4 fechada até lá).
 */
export function originate(
  c: CreditsHarness,
  quantity: string,
  options: { titular?: Titular; command?: 'accept_request' } = {},
): Promise<string> {
  const titular = options.titular ?? c.titular;
  return asOperation(
    c.h.database.appUrl,
    options.command ?? 'accept_request',
    titularActor(titular),
    async (client, op) => {
      await recordValiditySnapshot(client, op);
      return insertLot(client, op, titular.partyId, quantity);
    },
  );
}

export interface EntryInput {
  readonly lotId: string;
  readonly movement: string;
  readonly from: string;
  readonly to: string;
  readonly quantity: string;
  readonly parent?: string | null;
  readonly basis?: string | null;
}

export async function insertEntry(
  client: Queryable,
  op: string,
  entry: EntryInput,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.credit_entry (id, lot_id, operation_id, movement, from_bucket, to_bucket, quantity,
       parent_entry_id, basis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      entry.lotId,
      op,
      entry.movement,
      entry.from,
      entry.to,
      entry.quantity,
      entry.parent ?? null,
      entry.basis ?? null,
    ],
  );
  return id;
}

export type Mover =
  | { readonly kind: 'titular'; readonly titular: Titular }
  | { readonly kind: 'admin'; readonly admin: Admin }
  | {
      readonly kind: 'system';
    };

/** Movimentos numa operação de `command`, confirmada; devolve os ids na ordem. */
export function move(
  c: CreditsHarness,
  command: string,
  actor: Mover,
  entries: readonly EntryInput[],
): Promise<string[]> {
  return asOperation(c.h.database.appUrl, command, actor, async (client, op) => {
    const ids: string[] = [];
    for (const entry of entries) ids.push(await insertEntry(client, op, entry));
    return ids;
  });
}

/** Tenta gravar como o papel da aplicação e desfaz sempre: só a validação do banco importa. */
export async function attempt(
  url: string,
  command: string,
  actor: OperationActor,
  work: (client: pg.Client, op: string) => Promise<unknown>,
): Promise<void> {
  const client = await connect(url);
  try {
    await client.query('BEGIN');
    const op = await openOperation(client, command, actor);
    await work(client, op);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

export interface LotRow {
  readonly id: string;
  readonly party_id: string;
  readonly quantity: string;
  readonly held: string;
  readonly consumed: string;
  readonly expired: string;
  readonly available: string;
  readonly originated_at: Date;
  readonly expires_at: Date;
  readonly origin_command: string;
}

export async function lotRow(db: Queryable, id: string): Promise<LotRow> {
  const { rows } = await db.query<LotRow>(
    `SELECT id, party_id, quantity::text, held::text, consumed::text, expired::text, available::text, originated_at,
            expires_at, origin_command
       FROM app.credit_lot WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

/**
 * Envelhece um lote para `originatedAt` (dono do schema, gatilhos desligados): snapshot, lote e movimentos andam juntos e
 * `expires_at` é recalculado pela mesma função do banco — os invariantes continuam válidos.
 */
export async function ageLot(h: BookingHarness, lotId: string, originatedAt: Date): Promise<void> {
  const client = await h.database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    const { rows } = await client.query<{ shift: string }>(
      `SELECT ($2::timestamptz - originated_at)::text AS shift FROM app.credit_lot WHERE id = $1`,
      [lotId, originatedAt],
    );
    const shift = rows[0]!.shift;
    await client.query(
      `UPDATE app.economic_snapshot s SET resolved_at = $2
         FROM app.credit_lot l WHERE l.id = $1 AND s.operation_id = l.origin_operation_id`,
      [lotId, originatedAt],
    );
    await client.query(
      `UPDATE app.credit_lot l
          SET originated_at = $2, expires_at = app.credit_expires_at($2, p.value::integer)
         FROM app.economic_snapshot_parameter sp JOIN app.parameter p ON p.id = sp.parameter_id
        WHERE l.id = $1 AND sp.operation_id = l.origin_operation_id AND sp.parameter_key = 'credit_validity_months'`,
      [lotId, originatedAt],
    );
    await client.query(
      `UPDATE app.credit_entry SET created_at = created_at + $2::interval WHERE lot_id = $1`,
      [lotId, shift],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Instante `months` meses (calendário UTC) e `days` dias antes de agora. */
export function monthsAgo(months: number, days = 0): Date {
  const at = new Date();
  at.setUTCMonth(at.getUTCMonth() - months);
  at.setUTCDate(at.getUTCDate() - days);
  return at;
}

/**
 * Executor real (TECH-054) com o guard do Titular (delegação + holding no escopo da Second Home), a verificação de
 * Membership do identity e os privilégios reais do `luxtory_app`.
 */
export function titularExecutor(
  c: CreditsHarness,
  titular: CreditTitular,
  options: { requestGuard?: boolean } = {},
) {
  // As autoridades "detentor" e "solicitante" da Request (aceite e retirada) chegam com a W21/W22: aqui um guard de
  // teste explícito, só para exercitar a Garantia — o banco continua conferindo tudo o que é dos Créditos.
  const requestGuard: CommandGuard = {
    authorize: async () => ({ allowed: true, authorizationRef: `holding:${titular.holdingId}` }),
  };
  const titularGuard = createAuthorizationGuard({
    session: { userId: titular.userId, assurance: 'aal1' },
    staff: createPostgresStaffDirectory(() => c.h.db),
    grants: createPostgresGrantDirectory(() => c.h.db),
    delegations: createPostgresDelegationDirectory(() => c.h.db),
    holdings: createHoldingDirectory(() => c.h.db),
    clock: systemClock,
  });
  const executor = createCommandExecutor({
    store: createPostgresCommandStore(c.h.db),
    guard: options.requestGuard === true ? requestGuard : titularGuard,
    clock: systemClock,
    limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
    log: c.h.log,
    registry: commandRegistry,
    membership: postgresMembershipGate,
  });
  return <I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
    key: string = randomUUID(),
  ) =>
    executor.execute(handler, {
      actor: {
        kind: 'user',
        userId: titular.userId,
        actingPartyId: titular.partyId,
        role: 'titular',
      },
      idempotencyKey: key,
      correlationId: randomUUID(),
      input,
    });
}

/** Executor de sistema (jobs do TECH-090) sobre o PostgreSQL do harness. */
export function systemExecutor(c: CreditsHarness) {
  return createCommandExecutor({
    store: createPostgresCommandStore(c.h.db),
    guard: systemCommandGuard,
    clock: systemClock,
    limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
    log: c.h.log,
    registry: commandRegistry,
  });
}
