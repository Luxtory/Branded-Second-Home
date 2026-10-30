import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { vi } from 'vitest';
import { createCivilCalendar } from '@/features/calendar';
import { createOpenExerciseJob } from '@/features/calendar/jobs';
import {
  createFakeStaffNotification,
  createOperationalAlert,
  type JobResult,
} from '@/features/platform';
import { acquisitionHarness, type AcquisitionHarness } from '../ownership/acquisition-support';
import type { FormalizedCoOwner } from '../ownership/initial-draw-support';

const calendar = createCivilCalendar();

/**
 * Exercício corrente pela data real em São Paulo: o banco limita a selagem ao corrente e ao seguinte pelo relógio do
 * servidor (ADR-0024 §1), então os testes de selagem usam o relógio real (o papel de staff também nasce agora).
 */
export const SEALING_YEAR = calendar.exerciseYear(
  calendar.localDate(new Date(), 'America/Sao_Paulo'),
);
/** O exercício seguinte: sempre selado pelo job e sempre futuro — as noites dos testes estruturais ficam nele. */
export const NEXT_YEAR = SEALING_YEAR + 1;
export const nextYear = (monthDay: string) => `${NEXT_YEAR}-${monthDay}`;
export const nightsIn = (year: number) =>
  calendar.exerciseNights({
    exerciseYear: year,
    operationStartDate: `${year}-01-01`,
    timezone: 'America/Sao_Paulo',
  }).length;

/** Limites do executor do job nos testes (runbook em produção, TECH-001). */
export const JOB_SOURCE = { COMMAND_MAX_ATTEMPTS: '1', COMMAND_LOCK_TIMEOUT_MS: '10000' } as const;

/** Formalização W8 + job `open_exercise` real (executor, guard de sistema, banco como `luxtory_app`). */
export async function sealingHarness() {
  const h = await acquisitionHarness();
  h.clock.set(new Date());
  const staff = createFakeStaffNotification();
  const jobLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const alert = createOperationalAlert({ log: jobLog, transport: staff });

  async function formalizeOwner(operationStartDate = `${SEALING_YEAR}-01-01`): Promise<string> {
    const { home } = await h.root();
    const outcome = await h.run(h.handlers.formalizeAcquisition, {
      ...(await h.owner(home.id)),
      operation_start_date: operationStartDate,
    });
    if (outcome.status !== 'committed') throw new Error(`owner formalization ${outcome.status}`);
    return home.id;
  }

  function job(options: { timeBudgetMs?: number; source?: Record<string, string> } = {}) {
    return createOpenExerciseJob({
      log: jobLog,
      database: h.db,
      clock: h.clock,
      alert,
      source: { ...JOB_SOURCE, ...options.source },
      ...(options.timeBudgetMs === undefined ? {} : { timeBudgetMs: options.timeBudgetMs }),
    });
  }

  const runJob = (correlationId: string = randomUUID()): Promise<JobResult> =>
    job()({ correlationId });

  return {
    ...h,
    staff,
    jobLog,
    alert,
    formalizeOwner,
    formalizeCoOwner: (n = 2) => formalizeCoOwner(h, n),
    job,
    runJob,
  };
}
export type SealingHarness = Awaited<ReturnType<typeof sealingHarness>>;

/**
 * Co-Owner com exercício completo (sem alocação inicial) no ano seguinte, pelo command da W8: a capacidade inicial
 * conta só noites futuras, então 01/01 do ano corrente já não comporta a configuração inteira.
 */
async function formalizeCoOwner(
  h: AcquisitionHarness,
  n: number,
): Promise<Pick<FormalizedCoOwner, 'homeId' | 'stakes'>> {
  const { home } = await h.root();
  const outcome = await h.run(h.handlers.formalizeAcquisition, {
    ...(await h.coOwner(home.id, n)),
    operation_start_date: `${NEXT_YEAR}-01-01`,
  });
  if (outcome.status !== 'committed') throw new Error(`co-owner formalization ${outcome.status}`);
  const stakes = await h.db
    .selectFrom('app.stake')
    .select(['id', 'allocation_position as position'])
    .where('second_home_id', '=', home.id)
    .orderBy('allocation_position')
    .execute();
  return { homeId: home.id, stakes };
}

/**
 * Transação SQL do dono do schema (superusuário de teste): passa por cima dos privilégios, nunca dos gatilhos. Abre
 * uma operação `pending` na própria transação e a marca `committed` antes do COMMIT, como o executor.
 */
export async function asOwner<T>(
  h: Pick<AcquisitionHarness, 'database' | 'userId'>,
  work: (client: pg.Client, operationId: string) => Promise<T>,
  command = 'test_inventory_transition',
  /** `null` = ator de sistema. */
  userId: string | null = h.userId,
): Promise<T> {
  const client = new pg.Client({ connectionString: h.database.url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const operationId = await openOperation(client, command, userId);
    const result = await work(client, operationId);
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [operationId]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Operação `pending` na transação do cliente (TECH-002), com o ator humano ou o de sistema. */
export async function openOperation(
  client: pg.Client,
  command: string,
  userId: string | null,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.operation (id, command, actor_user_id, role, idempotency_key, correlation_id,
       authorization_ref, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'test:inventory', 'pending', now(), now())`,
    [id, command, userId, userId === null ? 'system' : 'admin', `test:${id}`, randomUUID()],
  );
  return id;
}

export interface CustodyRow {
  readonly id: string;
  readonly holder_kind: string;
  readonly stake_id: string | null;
  readonly basis: string | null;
  readonly purpose: string | null;
  readonly inventory_origin: string | null;
  readonly parent_custody_id: string | null;
  readonly closed_at: Date | null;
}

export async function activeCustody(
  client: pg.Client | pg.Pool,
  home: string,
  stayDate: string,
): Promise<CustodyRow> {
  const { rows } = await client.query<CustodyRow>(
    `SELECT id, holder_kind, stake_id, basis, purpose, inventory_origin, parent_custody_id, closed_at
       FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
    [home, stayDate],
  );
  if (rows.length !== 1) throw new Error(`expected one active custody, found ${rows.length}`);
  return rows[0]!;
}

export interface Successor {
  readonly holder_kind: string;
  readonly stake_id?: string | null;
  readonly basis?: string | null;
  readonly purpose?: string | null;
  readonly inventory_origin?: string | null;
  readonly authorization_ref?: string | null;
}

/** Transição da TECH-022 numa transação: fecha a custódia ativa e abre a sucessora pela mesma operação. */
export async function transition(
  client: pg.Client,
  operationId: string,
  home: string,
  stayDate: string,
  next: Successor,
): Promise<string> {
  const current = await activeCustody(client, home, stayDate);
  await client.query(
    `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`,
    [current.id, operationId],
  );
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, stake_id, basis, purpose,
       inventory_origin, authorization_ref, parent_custody_id, opened_by_operation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      home,
      stayDate,
      next.holder_kind,
      next.stake_id ?? null,
      next.basis ?? null,
      next.purpose ?? null,
      next.inventory_origin ?? null,
      next.authorization_ref ?? null,
      current.id,
      operationId,
    ],
  );
  return id;
}

/** Ocupação de teste (nenhum command a grava na W10): o `booking` só nasce na W12. */
export async function occupy(
  client: pg.Client,
  operationId: string,
  home: string,
  stayDate: string,
  channel: string,
  stakeId: string | null = null,
): Promise<string> {
  const custody = await activeCustody(client, home, stayDate);
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, stake_id,
       opened_by_operation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, home, stayDate, randomUUID(), channel, custody.id, stakeId, operationId],
  );
  return id;
}
