import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createOwnUseBookingHandler } from '@/features/booking/presentation/own-use-handler';
import { ordinaryOrder } from '@/features/calendar/domain/use-right';
import { createAuthorizationGuard } from '@/features/identity/application/authorization-guard';
import { createPostgresGrantDirectory } from '@/features/identity/infrastructure/postgres-grants';
import { createPostgresDelegationDirectory } from '@/features/identity/infrastructure/postgres-parties';
import { createPostgresStaffDirectory } from '@/features/identity/infrastructure/postgres-staff-directory';
import { createHoldingDirectory } from '@/features/ownership';
import {
  commandRegistry,
  createCommandExecutor,
  createPostgresCommandStore,
  systemClock,
} from '@/features/platform';
import { ownerDelegation } from '../../support/party-fixtures';
import {
  NEXT_YEAR,
  SEALING_YEAR,
  sealingHarness,
  type SealingHarness,
} from '../calendar/sealing-support';
import {
  backdateAuthority,
  completeDrawWithCalendar,
  drawnPositions,
  formalizeCoOwnerAt,
  useRightRunner as createUseRightRunner,
} from '../calendar/use-right-support';

/** Titular de teste: usuário com delegação ativa para a party que detém a holding. */
export interface Titular {
  readonly userId: string;
  readonly partyId: string;
  readonly holdingId: string;
  readonly stakeId: string | null;
}

export interface CoOwnerScenario {
  readonly homeId: string;
  readonly acquisitionId: string;
  /** Exercício reservável agora (corrente, ou o seguinte no fim do ano): janelas de todas as posições abertas. */
  readonly year: number;
  /** Titulares por posição ordinária no exercício `year` (índice 0 = posição 1). */
  readonly titulares: readonly Titular[];
}

export interface OwnerScenario {
  readonly homeId: string;
  readonly titular: Titular;
}

const DAY_MS = 86_400_000;
/** Folga até o fim do ano para reservar no exercício corrente; menos que isso, usa o seguinte (já selado). */
const MIN_DAYS_LEFT_IN_YEAR = 60;

export const isoDate = (at: Date) => at.toISOString().slice(0, 10);
export const addDays = (date: string, days: number) =>
  isoDate(new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS));

/**
 * Exercício e primeira noite reserváveis pelo relógio real (o banco decide pelo relógio do servidor, T3): a partir de
 * hoje + 7 dias no exercício corrente, ou 01/02 do seguinte quando o ano está no fim.
 */
export function bookableStart(): { readonly year: number; readonly first: string } {
  const today = isoDate(new Date());
  const daysLeft = (new Date(`${SEALING_YEAR}-12-31T12:00:00Z`).getTime() - Date.now()) / DAY_MS;
  return daysLeft >= MIN_DAYS_LEFT_IN_YEAR
    ? { year: SEALING_YEAR, first: addDays(today, 7) }
    : { year: NEXT_YEAR, first: `${NEXT_YEAR}-02-01` };
}

export async function addTitular(
  h: Pick<SealingHarness, 'database'>,
  holding: { readonly id: string; readonly party_id: string; readonly stake_id: string | null },
): Promise<Titular> {
  const userId = randomUUID();
  await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
  await ownerDelegation(h.database.pool, { partyId: holding.party_id, userId });
  return { userId, partyId: holding.party_id, holdingId: holding.id, stakeId: holding.stake_id };
}

/** Segundo representante da mesma party (TECH-050: várias delegações para a mesma party). */
export async function secondRepresentative(
  h: Pick<SealingHarness, 'database'>,
  titular: Titular,
): Promise<Titular> {
  const userId = randomUUID();
  await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
  await ownerDelegation(h.database.pool, { partyId: titular.partyId, userId });
  return { ...titular, userId };
}

/** Revogação da delegação como o command `revoke_party_delegation` a grava (estado, base, autor e operação). */
export async function revokeDelegation(
  h: Pick<SealingHarness, 'database' | 'userId'>,
  userId: string,
): Promise<void> {
  const operation = randomUUID();
  await h.database.pool.query(
    `INSERT INTO app.operation (id, command, actor_user_id, role, idempotency_key, correlation_id, authorization_ref,
       state, created_at, updated_at)
     VALUES ($1, 'revoke_party_delegation', $2, 'admin', $3, $3, 'test:revocation', 'committed', now(), now())`,
    [operation, h.userId, `test:${operation}`],
  );
  await h.database.pool.query(
    `UPDATE app.party_delegation SET state = 'revoked', revoked_at = now(), revocation_basis = 'Fim da procuração',
       revoked_by_user_id = $2, revoked_role = 'admin', revocation_operation_id = $3
      WHERE user_id = $1 AND state <> 'revoked'`,
    [userId, h.userId, operation],
  );
}

export async function bookingHarness() {
  const h = await sealingHarness();
  await backdateAuthority(h);
  const runner = createUseRightRunner(h);
  const handler = createOwnUseBookingHandler();

  async function holdings(homeId: string) {
    return h.db
      .selectFrom('app.holding')
      .select(['id', 'party_id', 'stake_id'])
      .where('second_home_id', '=', homeId)
      .execute();
  }

  /**
   * Co-Owner formalizada em 01/11 do ano anterior para o exercício corrente: a base das janelas do corrente é a
   * formalização, então todas as posições já abriram; no seguinte, a base é 15/09 do corrente. Corrente e seguinte
   * selados pelo job, sorteio revelado.
   */
  async function coOwnerScenario(n = 2): Promise<CoOwnerScenario> {
    const home = await formalizeCoOwnerAt(
      h,
      n,
      `${SEALING_YEAR}-01-01`,
      new Date(`${SEALING_YEAR - 1}-11-01T12:00:00Z`),
    );
    h.clock.set(new Date());
    const job = await h.runJob();
    if (job.failed !== 0) throw new Error('open_exercise fixture failed');
    await completeDrawWithCalendar(h, home.acquisitionId);
    const { year } = bookableStart();
    const order = ordinaryOrder(
      await drawnPositions(h, home.acquisitionId),
      `${SEALING_YEAR}-01-01`,
      year,
    );
    const byStake = new Map((await holdings(home.homeId)).map((row) => [row.stake_id, row]));
    const titulares: Titular[] = [];
    for (const stakeId of order) titulares.push(await addTitular(h, byStake.get(stakeId)!));
    return { homeId: home.homeId, acquisitionId: home.acquisitionId, year, titulares };
  }

  /** Owner com data-base em 01/01 do corrente: corrente e seguinte selados (custódia `owner`). */
  async function ownerScenario(): Promise<OwnerScenario> {
    const homeId = await h.formalizeOwner(`${SEALING_YEAR}-01-01`);
    const job = await h.runJob();
    if (job.failed !== 0) throw new Error('open_exercise fixture failed');
    const [holding] = await holdings(homeId);
    return { homeId, titular: await addTitular(h, holding!) };
  }

  /** Executor real com o guard do Titular (W12) e o relógio real: o banco valida pelo relógio do servidor. */
  function book(
    titular: Titular,
    input: { second_home_id: string; checkin_date: string; checkout_date: string },
    key: string = randomUUID(),
  ) {
    const guard = createAuthorizationGuard({
      session: { userId: titular.userId, assurance: 'aal1' },
      staff: createPostgresStaffDirectory(() => h.db),
      grants: createPostgresGrantDirectory(() => h.db),
      delegations: createPostgresDelegationDirectory(() => h.db),
      holdings: createHoldingDirectory(() => h.db),
      clock: systemClock,
    });
    const executor = createCommandExecutor({
      store: createPostgresCommandStore(h.db),
      guard,
      clock: systemClock,
      limits: { maxAttempts: 1, lockTimeoutMs: 10_000 },
      log: h.log,
      registry: commandRegistry,
    });
    return executor.execute(handler, {
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

  /** Ativação privilegiada pelo dono do schema (a migration futura, autorizada pelo fundador, fará o mesmo). */
  const activate = () =>
    h.database.pool.query(
      `INSERT INTO app.capability_activation VALUES ('own_use_booking', now(), 'test:activation')
       ON CONFLICT (capability) DO NOTHING`,
    );
  const deactivate = () =>
    h.database.pool.query(
      `DELETE FROM app.capability_activation WHERE capability = 'own_use_booking'`,
    );

  async function client(url: string): Promise<pg.Client> {
    const connection = new pg.Client({ connectionString: url });
    await connection.connect();
    return connection;
  }

  return {
    ...h,
    runner,
    handler,
    coOwnerScenario,
    ownerScenario,
    book,
    activate,
    deactivate,
    client,
    holdings,
  };
}
export type BookingHarness = Awaited<ReturnType<typeof bookingHarness>>;

/** Linhas que a reserva deixa no banco (para provar o "nada parcial"). */
export async function bookingFacts(h: Pick<SealingHarness, 'database'>, homeId: string) {
  const { rows } = await h.database.pool.query<{
    bookings: number;
    occupancies: number;
    consumes: number;
    reserved: number;
  }>(
    `SELECT (SELECT count(*)::int FROM app.booking WHERE second_home_id = $1) AS bookings,
            (SELECT count(*)::int FROM app.date_occupancy WHERE second_home_id = $1) AS occupancies,
            (SELECT count(*)::int FROM app.use_right_ledger WHERE second_home_id = $1 AND movement = 'consume') AS consumes,
            (SELECT count(*)::int FROM app.date_custody WHERE second_home_id = $1 AND basis = 'reserved_right') AS reserved`,
    [homeId],
  );
  return rows[0]!;
}

/**
 * Primeira sequência de `length` noites seguidas da categoria pedida em `[from, before)`; `null` se não houver (o
 * exercício reservável muda com a data em que o teste roda).
 */
export async function nightsOfSeason(
  h: Pick<SealingHarness, 'database'>,
  homeId: string,
  from: string,
  before: string,
  season: 'alta' | 'media',
  length: number,
): Promise<string | null> {
  const { rows } = await h.database.pool.query<{ stay_date: string }>(
    `SELECT d.stay_date::text AS stay_date FROM app.second_home_date d
      WHERE d.second_home_id = $1 AND d.stay_date >= $2 AND d.stay_date + $5::int <= $3 AND NOT d.is_leap_day
        AND (SELECT count(*) FROM app.second_home_date e
              WHERE e.second_home_id = d.second_home_id AND e.stay_date >= d.stay_date
                AND e.stay_date < d.stay_date + $5::int AND e.season = $4 AND NOT e.is_leap_day) = $5
      ORDER BY d.stay_date LIMIT 1`,
    [homeId, from, before, season, length],
  );
  return rows[0]?.stay_date ?? null;
}

/**
 * Consome pelo dono do schema (estrutura da W11, fora do command) `count` noites da categoria no exercício, exceto as
 * informadas: deixa o saldo da Ação no ponto que o teste precisa.
 */
export async function drainBalance(
  h: Pick<SealingHarness, 'database' | 'userId'>,
  scenario: Pick<CoOwnerScenario, 'homeId' | 'acquisitionId'>,
  stakeId: string,
  year: number,
  bucket: 'alta' | 'media',
  keep: readonly string[],
): Promise<void> {
  const client = new pg.Client({ connectionString: h.database.url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const op = randomUUID();
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, role, idempotency_key, correlation_id, authorization_ref,
         state, created_at, updated_at)
       VALUES ($1, 'test_consume', $2, 'admin', $3, $4, 'test:balance', 'pending', now(), now())`,
      [op, h.userId, `test:${op}`, randomUUID()],
    );
    const { rows } = await client.query<{ remaining: number }>(
      `SELECT remaining FROM app.use_right_balance WHERE stake_id = $1 AND exercise_year = $2 AND bucket = $3`,
      [stakeId, year, bucket],
    );
    await client.query(
      `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement,
         quantity, stay_date, operation_id, created_at)
       SELECT gen_random_uuid(), $1, $2, $3, $4, $5, 'consume', 1, d.stay_date, $6, now()
         FROM app.second_home_date d
        WHERE d.second_home_id = $1 AND d.exercise_year = $4 AND d.season = $5 AND NOT d.is_leap_day
          AND NOT (d.stay_date = ANY($7::date[]))
        ORDER BY d.stay_date LIMIT $8`,
      [
        scenario.homeId,
        scenario.acquisitionId,
        stakeId,
        year,
        bucket,
        op,
        keep,
        rows[0]!.remaining - (keep.length - 1),
      ],
    );
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
