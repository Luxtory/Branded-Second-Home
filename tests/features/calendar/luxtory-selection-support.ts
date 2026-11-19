import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Admin, OperationActor } from '../booking/lifecycle-support';
import type { Titular } from '../booking/booking-support';

/**
 * W14 E2 — fixtures SQL da seleção Luxtory, dos parâmetros e da declaração de convidados. As escritas são as que os
 * commands da E3 farão, gravadas aqui pelo papel da aplicação (`luxtory_app`) com uma operação `pending` presa à Second
 * Home (o executor grava `operation.second_home_id`), ou o que um forjador com a credencial conseguiria.
 */

type Queryable = Pick<pg.Client | pg.Pool, 'query'>;

export type Purpose = 'maintenance' | 'marketing' | 'promotion' | 'production' | 'inventory';

export async function openHomeOperation(
  client: Queryable,
  command: string,
  actor: OperationActor,
  homeId: string,
): Promise<string> {
  const op = randomUUID();
  const [userId, partyId, role, authorizationRef] =
    actor.kind === 'titular'
      ? [
          actor.titular.userId,
          actor.titular.partyId,
          'titular',
          `holding:${actor.titular.holdingId}`,
        ]
      : actor.kind === 'admin'
        ? [actor.admin.userId, null, 'admin', `staff_role:${actor.admin.roleId}`]
        : [null, null, 'system', 'system:job'];
  await client.query(
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
       correlation_id, authorization_ref, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', now(), now())`,
    [op, command, userId, partyId, role, homeId, `w14:${op}`, randomUUID(), authorizationRef],
  );
  return op;
}

/** Uma transação do papel informado com a operação `pending`, marcada `committed` no fim, como o executor faz. */
export async function inOperation<T>(
  url: string,
  command: string,
  actor: OperationActor,
  homeId: string,
  work: (client: pg.Client, op: string) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const op = await openHomeOperation(client, command, actor, homeId);
    const result = await work(client, op);
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Seleção de uma noite: fecha a custódia ativa e abre `luxtory/{finalidade}` (ordem do command da E3). */
export async function selectNight(
  client: Queryable,
  op: string,
  homeId: string,
  date: string,
  purpose: Purpose,
  options: { origin?: string | null; basis?: string | null } = {},
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM app.date_custody WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL`,
    [homeId, date],
  );
  await client.query(
    `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`,
    [rows[0]!.id, op],
  );
  const id = randomUUID();
  const origin =
    options.origin !== undefined
      ? options.origin
      : purpose === 'inventory'
        ? 'annual_allocation'
        : null;
  await client.query(
    `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, purpose, inventory_origin,
       authorization_ref, parent_custody_id, opened_by_operation)
     VALUES ($1, $2, $3, 'luxtory', $4, $5, $6, $7, $8)`,
    [
      id,
      homeId,
      date,
      purpose,
      origin,
      options.basis === undefined ? 'Ata Luxtory W14' : options.basis,
      rows[0]!.id,
      op,
    ],
  );
  return id;
}

/** Noites futuras, não bissextas e ainda `spe_pool` da categoria no exercício, em ordem crescente. */
export async function freeNights(
  db: Queryable,
  homeId: string,
  year: number,
  season: 'alta' | 'media',
  count: number,
): Promise<string[]> {
  const { rows } = await db.query<{ stay_date: string }>(
    `SELECT d.stay_date::text AS stay_date
       FROM app.second_home_date d
       JOIN app.date_custody c ON c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date
                              AND c.closed_at IS NULL AND c.holder_kind = 'spe_pool'
      WHERE d.second_home_id = $1 AND d.exercise_year = $2 AND d.season = $3 AND NOT d.is_leap_day
        AND d.checkin_at > now() + interval '1 day'
      ORDER BY d.stay_date LIMIT $4`,
    [homeId, year, season, count],
  );
  if (rows.length < count) throw new Error(`only ${rows.length} free ${season} nights in ${year}`);
  return rows.map((row) => row.stay_date);
}

/** Publicação de `guest_rules` como o `set_parameter` da E3 gravará (autoridade e autor iguais aos da operação). */
export async function insertRules(
  client: Queryable,
  op: string,
  admin: Admin,
  homeId: string,
  options: {
    value?: string;
    from?: string | null;
    to?: string | null;
    authority?: string;
    author?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.parameter (id, key, second_home_id, value, effective_from, effective_to, authority,
       authorization_ref, created_at, created_by, operation_id)
     VALUES ($1, 'guest_rules', $2, $3, $4, $5, $6, 'Ata Luxtory W14', '2000-01-01T00:00:00Z', $7, $8)`,
    [
      id,
      homeId,
      options.value ?? 'Regras de convidados (texto de teste)',
      options.from ?? null,
      options.to ?? null,
      options.authority ?? 'admin',
      options.author ?? admin.userId,
      op,
    ],
  );
  return id;
}

export async function publishRules(
  url: string,
  admin: Admin,
  homeId: string,
  options: Parameters<typeof insertRules>[4] = {},
): Promise<string> {
  return inOperation(url, 'set_parameter', { kind: 'admin', admin }, homeId, (client, op) =>
    insertRules(client, op, admin, homeId, options),
  );
}

export async function insertNomination(
  client: Queryable,
  op: string,
  titular: Titular,
  homeId: string,
  bookingId: string,
  rulesId: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.guest_nomination (id, booking_id, second_home_id, parameter_id, party_id, nominated_at,
       operation_id)
     VALUES ($1, $2, $3, $4, $5, '2000-01-01T00:00:00Z', $6)`,
    [id, bookingId, homeId, rulesId, titular.partyId, op],
  );
  return id;
}

export async function nominate(
  url: string,
  titular: Titular,
  homeId: string,
  bookingId: string,
  rulesId: string,
): Promise<string> {
  return inOperation(url, 'nominate_guest', { kind: 'titular', titular }, homeId, (client, op) =>
    insertNomination(client, op, titular, homeId, bookingId, rulesId),
  );
}

/** Leitura do Titular: papel `authenticated` com as claims do usuário, em transação só de leitura. */
export async function asUser<T>(
  url: string,
  userId: string,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await client.query('SET LOCAL ROLE authenticated');
    return (await client.query(query, params)).rows as T[];
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

/** Contagens que a seleção e a declaração não podem alterar (nenhum efeito econômico, de Direito de Uso ou de direito). */
export async function sideEffects(db: Queryable, homeId: string) {
  const { rows } = await db.query<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM app.use_right_ledger WHERE second_home_id = $1) AS ledger,
            (SELECT count(*)::int FROM app.date_occupancy WHERE second_home_id = $1) AS occupancies,
            (SELECT count(*)::int FROM app.booking WHERE second_home_id = $1) AS bookings,
            (SELECT count(*)::int FROM app.holding WHERE second_home_id = $1) AS holdings,
            (SELECT count(*)::int FROM app.party) AS parties,
            (SELECT count(*)::int FROM app.stake WHERE second_home_id = $1) AS stakes,
            (SELECT count(*)::int FROM app.date_custody WHERE second_home_id = $1 AND closed_at IS NULL) AS custodies`,
    [homeId],
  );
  return rows[0]!;
}
