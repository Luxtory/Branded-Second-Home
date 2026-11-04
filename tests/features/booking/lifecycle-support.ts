import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { addDays, type BookingHarness, type Titular } from './booking-support';

/**
 * W13 E1 — fixtures do ciclo da reserva no banco. As escritas dos commands (cancelamento, no-show, exceção,
 * recuperação, invalidação) são gravadas aqui em SQL, na ordem que o command da E2 seguirá, pelo papel da aplicação
 * (`luxtory_app`) com uma operação `pending` — o que o executor grava, ou o que um forjador com a credencial conseguiria.
 */

export interface Admin {
  readonly userId: string;
  readonly roleId: string;
}

export type OperationActor =
  | { readonly kind: 'titular'; readonly titular: Titular }
  | { readonly kind: 'admin'; readonly admin: Admin }
  | { readonly kind: 'system' };

export type Capability = 'own_use_booking' | 'own_use_lifecycle';

export interface BookingRow {
  readonly id: string;
  readonly second_home_id: string;
  readonly holding_id: string;
  readonly stake_id: string | null;
  readonly checkin_date: string;
  readonly checkout_date: string;
  readonly state: string;
  readonly last_transition_id: string | null;
  readonly cancellation_class: string | null;
  readonly opened_by_operation: string;
}

type Queryable = Pick<pg.Client | pg.Pool, 'query'>;
type Harness = Pick<BookingHarness, 'database'>;

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Admin com atribuição ativa (`app.assign_staff_role`, o caminho do runbook). */
export async function addAdmin(h: Harness): Promise<Admin> {
  const userId = randomUUID();
  await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [userId]);
  const { rows } = await h.database.pool.query<{ id: string }>(
    `SELECT app.assign_staff_role($1, 'admin', 'Test W13 authority') AS id`,
    [userId],
  );
  return { userId, roleId: rows[0]!.id };
}

/** Ativação privilegiada pelo dono do schema (a migration futura, autorizada pelo fundador, fará o mesmo). */
export async function activate(h: Harness, ...capabilities: readonly Capability[]): Promise<void> {
  for (const capability of capabilities)
    await h.database.pool.query(
      `INSERT INTO app.capability_activation VALUES ($1, now(), 'test:activation') ON CONFLICT (capability) DO NOTHING`,
      [capability],
    );
}

export async function deactivate(
  h: Harness,
  ...capabilities: readonly Capability[]
): Promise<void> {
  await h.database.pool.query(
    `DELETE FROM app.capability_activation WHERE capability = ANY($1::text[])`,
    [[...capabilities]],
  );
}

export async function openOperation(
  client: Queryable,
  command: string,
  actor: OperationActor,
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
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, idempotency_key, correlation_id,
       authorization_ref, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', now(), now())`,
    [op, command, userId, partyId, role, `w13:${op}`, randomUUID(), authorizationRef],
  );
  return op;
}

/** Uma transação com a operação `pending` do command, marcada `committed` no fim, como o executor faz. */
export async function asOperation<T>(
  url: string,
  command: string,
  actor: OperationActor,
  work: (client: pg.Client, op: string) => Promise<T>,
): Promise<T> {
  const client = await connect(url);
  try {
    await client.query('BEGIN');
    const op = await openOperation(client, command, actor);
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

export async function bookingRow(db: Queryable, id: string): Promise<BookingRow> {
  const { rows } = await db.query<BookingRow>(
    `SELECT id, second_home_id, holding_id, stake_id, checkin_date::text AS checkin_date,
            checkout_date::text AS checkout_date, state, last_transition_id, cancellation_class, opened_by_operation
       FROM app.booking WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

/** Noites da reserva ainda não iniciadas agora (relógio do servidor). */
export async function unstartedNights(db: Queryable, bookingId: string): Promise<string[]> {
  const { rows } = await db.query<{ nights: string[] }>(
    `SELECT app.booking_unstarted_nights($1, clock_timestamp())::text[] AS nights`,
    [bookingId],
  );
  return rows[0]!.nights;
}

/**
 * Última noite já iniciada da Second Home (check-in 14:00 locais antes de agora). A partir dela os testes escolhem
 * períodos iniciados, em curso ou ainda futuros pelo relógio real — o banco decide pelo relógio do servidor (T3).
 */
export async function lastStartedNight(h: Harness, homeId: string): Promise<string> {
  const { rows } = await h.database.pool.query<{ stay_date: string }>(
    `SELECT stay_date::text AS stay_date FROM app.second_home_date
      WHERE second_home_id = $1 AND checkin_at <= now() ORDER BY stay_date DESC LIMIT 1`,
    [homeId],
  );
  if (rows[0] === undefined)
    throw new Error('No started sealed night: the fixture needs a sealed past night');
  return rows[0].stay_date;
}

/**
 * Reserva gravada pelo dono do schema como se tivesse sido criada antes de as noites começarem (fato histórico): o
 * gatilho de abertura da W12 recusa noite passada pelo relógio, então ele fica desligado só nesta transação de fixture.
 * Os demais fatos (custódia, consumo, ocupação) seguem as regras estruturais; as consultas de invariantes conferem.
 */
export async function historicBooking(
  h: Harness,
  b: {
    readonly homeId: string;
    readonly titular: Titular;
    readonly checkin: string;
    readonly checkout: string;
  },
): Promise<string> {
  const client = await connect(h.database.url);
  try {
    await client.query('BEGIN');
    const op = await openOperation(client, 'create_own_use_booking', {
      kind: 'titular',
      titular: b.titular,
    });
    const id = randomUUID();
    await client.query('ALTER TABLE app.booking DISABLE TRIGGER booking_open');
    await client.query(
      `INSERT INTO app.booking (id, second_home_id, channel, holding_id, stake_id, checkin_date, checkout_date, state,
         opened_by_operation, confirmed_at)
       VALUES ($1, $2, 'own_use', $3, $4, $5, $6, 'confirmed', $7, now() - interval '30 days')`,
      [id, b.homeId, b.titular.holdingId, b.titular.stakeId, b.checkin, b.checkout, op],
    );
    // A constraint diferida da W12 (o dono passa por ela) roda agora: sem evento pendente, o gatilho volta a ligar.
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query('ALTER TABLE app.booking ENABLE TRIGGER booking_open');
    for (let date = b.checkin; date < b.checkout; date = addDays(date, 1)) {
      if (b.titular.stakeId !== null) {
        const { rows } = await client.query<{ id: string }>(
          `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $3
            WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL RETURNING id`,
          [b.homeId, date, op],
        );
        await client.query(
          `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, stake_id, basis, parent_custody_id,
             opened_by_operation)
           VALUES (gen_random_uuid(), $1, $2, 'use_right', $3, 'reserved_right', $4, $5)`,
          [b.homeId, date, b.titular.stakeId, rows[0]!.id, op],
        );
        await client.query(
          `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket,
             movement, quantity, stay_date, operation_id, created_at)
           SELECT gen_random_uuid(), d.second_home_id, a.id, $3, d.exercise_year,
                  CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END, 'consume', 1, d.stay_date, $4, now()
             FROM app.second_home_date d JOIN app.acquisition a ON a.second_home_id = d.second_home_id
            WHERE d.second_home_id = $1 AND d.stay_date = $2`,
          [b.homeId, date, b.titular.stakeId, op],
        );
      }
      await client.query(
        `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, stake_id,
           opened_by_operation)
         SELECT gen_random_uuid(), $1, $2, $3, 'own_use', c.id, $4, $5
           FROM app.date_custody c WHERE c.second_home_id = $1 AND c.stay_date = $2 AND c.closed_at IS NULL`,
        [b.homeId, date, id, b.titular.stakeId, op],
      );
    }
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export type ClosingKind = 'cancellation' | 'no_show' | 'exception_resolution' | 'invalidation';
export type Successor = 'spe_pool' | 'forfeited_right';

export interface TransitionInput {
  readonly bookingId: string;
  readonly kind: ClosingKind | 'advance' | 'exception_opening';
  readonly toState: string;
  readonly cancellationClass?: string | null;
  readonly firstAffectedDate?: string | null;
  readonly basis?: string | null;
  /** Forjar a cadeia: anterior e estado de origem diferentes dos atuais. */
  readonly previous?: string | null;
  readonly fromState?: string;
}

export async function insertTransition(
  client: Queryable,
  op: string,
  t: TransitionInput,
): Promise<{ id: string; cancellation_class: string | null; first_affected_date: string | null }> {
  const b = await bookingRow(client, t.bookingId);
  const id = randomUUID();
  const { rows } = await client.query<{
    id: string;
    cancellation_class: string | null;
    first_affected_date: string | null;
  }>(
    `INSERT INTO app.booking_state_transition (id, booking_id, previous_transition_id, from_state, to_state, kind,
       operation_id, recorded_at, cancellation_class, first_affected_date, basis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10)
     RETURNING id, cancellation_class, first_affected_date::text AS first_affected_date`,
    [
      id,
      t.bookingId,
      t.previous === undefined ? b.last_transition_id : t.previous,
      t.fromState ?? b.state,
      t.toState,
      t.kind,
      op,
      t.cancellationClass ?? null,
      t.firstAffectedDate ?? null,
      t.basis === undefined
        ? t.kind === 'advance' || t.kind === 'cancellation'
          ? null
          : 'Base registrada de teste'
        : t.basis,
    ],
  );
  return rows[0]!;
}

/** Exceção aberta da reserva (ou `undefined`). */
export async function openExceptionId(
  db: Queryable,
  bookingId: string,
): Promise<string | undefined> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT e.id FROM app.booking_exception e
      WHERE e.booking_id = $1 AND NOT EXISTS (SELECT 1 FROM app.booking_exception_resolution r WHERE r.exception_id = e.id)`,
    [bookingId],
  );
  return rows[0]?.id;
}

export async function recordResolution(
  client: Queryable,
  bookingId: string,
  transitionId: string,
  outcome: string,
  source: 'admin' | 'titular_cancellation',
): Promise<void> {
  const exceptionId = await openExceptionId(client, bookingId);
  await client.query(
    `INSERT INTO app.booking_exception_resolution (exception_id, booking_id, transition_id, outcome, resolution_source,
       resolved_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [exceptionId, bookingId, transitionId, outcome, source],
  );
}

export interface ClosingOptions {
  readonly kind: ClosingKind;
  readonly toState?: 'cancelled' | 'no_show';
  /** Termos esperados da prévia (cancelamento do Titular). */
  readonly expected?: {
    readonly cancellationClass: string | null;
    readonly firstAffectedDate: string | null;
  };
  readonly authorizationId?: string;
  /** Sobrescritas para forjar efeitos fora da regra. */
  readonly nights?: readonly string[];
  readonly successor?: Successor;
  readonly reversal?: 'restore' | 'correction' | 'none';
  readonly releaseReason?: string;
  readonly skipResolution?: boolean;
}

const RELEASE_REASON: Record<ClosingKind, string> = {
  cancellation: 'cancelled',
  no_show: 'no_show',
  exception_resolution: 'exception',
  invalidation: 'invalidation',
};

/**
 * Evento que libera noites, na ordem do command: uso da autorização → transição (trava a reserva) → resolução da
 * exceção → por noite não iniciada, crescente: liberação, custódia, `restore`/`correction`.
 */
export async function closeBooking(
  client: Queryable,
  op: string,
  bookingId: string,
  o: ClosingOptions,
) {
  const b = await bookingRow(client, bookingId);
  if (o.authorizationId !== undefined)
    await client.query(
      `INSERT INTO app.booking_authorization_use (authorization_id, booking_id, operation_id, used_at)
       VALUES ($1, $2, $3, now())`,
      [o.authorizationId, bookingId, op],
    );
  const toState = o.toState ?? (o.kind === 'no_show' ? 'no_show' : 'cancelled');
  const transition = await insertTransition(client, op, {
    bookingId,
    kind: o.kind,
    toState,
    cancellationClass: o.expected?.cancellationClass ?? null,
    firstAffectedDate: o.expected?.firstAffectedDate ?? null,
  });
  if (b.state === 'in_exception' && o.skipResolution !== true)
    await recordResolution(
      client,
      bookingId,
      transition.id,
      toState,
      o.kind === 'cancellation' ? 'titular_cancellation' : 'admin',
    );
  const nights = o.nights ?? (await unstartedNights(client, bookingId));
  const toSpePool = o.kind === 'invalidation' || transition.cancellation_class === 'timely';
  const successor = o.successor ?? (toSpePool ? 'spe_pool' : 'forfeited_right');
  const reversal =
    o.reversal ?? (toSpePool ? (o.kind === 'invalidation' ? 'correction' : 'restore') : 'none');
  for (const night of nights) {
    await client.query(
      `UPDATE app.date_occupancy SET released_at = now(), release_reason = $3, released_by_operation = $4
        WHERE booking_id = $1 AND stay_date = $2 AND released_at IS NULL`,
      [bookingId, night, o.releaseReason ?? RELEASE_REASON[o.kind], op],
    );
    if (b.stake_id === null) continue;
    const { rows } = await client.query<{ id: string }>(
      `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $3
        WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL RETURNING id`,
      [b.second_home_id, night, op],
    );
    await client.query(
      `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, stake_id, basis, parent_custody_id,
         opened_by_operation)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
      successor === 'spe_pool'
        ? [b.second_home_id, night, 'spe_pool', null, null, rows[0]!.id, op]
        : [b.second_home_id, night, 'use_right', b.stake_id, 'forfeited_right', rows[0]!.id, op],
    );
    if (reversal !== 'none') await reverseConsumption(client, op, b, night, reversal);
  }
  return { transition, nights };
}

export async function reverseConsumption(
  client: Queryable,
  op: string,
  b: Pick<BookingRow, 'opened_by_operation'>,
  night: string,
  movement: 'restore' | 'correction',
): Promise<void> {
  await client.query(
    `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket, movement,
       quantity, stay_date, refers_to_id, operation_id, created_at)
     SELECT gen_random_uuid(), l.second_home_id, l.acquisition_id, l.stake_id, l.exercise_year, l.bucket, $3, l.quantity,
            CASE WHEN $3 = 'restore' THEN l.stay_date END, l.id, $4, now()
       FROM app.use_right_ledger l
      WHERE l.operation_id = $1 AND l.movement = 'consume' AND l.stay_date = $2`,
    [b.opened_by_operation, night, movement, op],
  );
}

/** Abertura de exceção (P-A, motivo da PD-010; P-B, referência do incidente do REQ-084). */
export async function openException(
  client: Queryable,
  op: string,
  bookingId: string,
  type: 'operational' | 'unauthorized_booking',
): Promise<string> {
  const transition = await insertTransition(client, op, {
    bookingId,
    kind: 'exception_opening',
    toState: 'in_exception',
  });
  const id = randomUUID();
  await client.query(
    `INSERT INTO app.booking_exception (id, booking_id, exception_type, reason, incident_ref, opened_by_transition_id,
       opened_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      id,
      bookingId,
      type,
      type === 'operational' ? 'emergency_maintenance' : null,
      type === 'unauthorized_booking' ? 'INC-2026-001' : null,
      transition.id,
    ],
  );
  return id;
}

export async function resolveWithoutEffect(
  client: Queryable,
  op: string,
  bookingId: string,
  outcome: 'confirmed' | 'completed',
): Promise<void> {
  const transition = await insertTransition(client, op, {
    bookingId,
    kind: 'exception_resolution',
    toState: outcome,
  });
  await recordResolution(client, bookingId, transition.id, outcome, 'admin');
}

export interface RequestInput {
  readonly bookingId: string;
  readonly purpose: 'no_show' | 'recovery' | 'exception_cancellation' | 'invalidation';
  readonly exceptionId?: string;
  readonly expectedDates?: readonly string[];
  readonly expectedCustodyIds?: readonly string[];
  readonly expectedClass?: string | null;
  readonly attested?: boolean;
}

/** Solicitação opaca registrada pelo Admin (`request_booking_authorization`, sem efeito econômico). */
export async function requestAuthorization(
  h: Harness,
  admin: Admin,
  r: RequestInput,
): Promise<string> {
  const id = randomUUID();
  await asOperation(
    h.database.appUrl,
    'request_booking_authorization',
    { kind: 'admin', admin },
    (client, op) =>
      client.query(
        `INSERT INTO app.booking_authorization_request (id, booking_id, purpose, exception_id, expected_dates,
         expected_custody_ids, expected_cancellation_class, availability_attested, basis, requested_by_operation,
         requested_at)
       VALUES ($1, $2, $3, $4, $5::date[], $6::uuid[], $7, $8, 'Registro verificável de teste', $9, now())`,
        [
          id,
          r.bookingId,
          r.purpose,
          r.exceptionId ?? null,
          [...(r.expectedDates ?? [])],
          [...(r.expectedCustodyIds ?? [])],
          r.expectedClass ?? null,
          r.attested ?? false,
          op,
        ],
      ),
  );
  return id;
}

/**
 * O papel autorizador chama a função, como o workflow fará. `SET ROLE` a partir do dono prova os privilégios do papel
 * sem gastar a única conexão permitida (`CONNECTION LIMIT 1`, do cluster); o login real é provado em teste próprio.
 */
export async function asAuthorizer<T>(
  h: Harness,
  work: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = await connect(h.database.url);
  try {
    await client.query('SET ROLE luxtory_booking_authorizer');
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function authorize(
  h: Harness,
  requestId: string,
  approvalRef = 'github-run:1001:1',
): Promise<string> {
  return asAuthorizer(h, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT app.authorize_booking_action($1, $2) AS id`,
      [requestId, approvalRef],
    );
    return rows[0]!.id;
  });
}

export async function revoke(
  h: Harness,
  authorizationId: string,
  approvalRef = 'github-run:1002:1',
): Promise<void> {
  await asAuthorizer(h, (client) =>
    client.query(`SELECT app.revoke_booking_authorization($1, $2)`, [authorizationId, approvalRef]),
  );
}

/** Custódias `forfeited_right` ativas e futuras da reserva, ordenadas por id (o escopo derivado da recuperação). */
export async function futureForfeited(h: Harness, bookingId: string): Promise<string[]> {
  const { rows } = await h.database.pool.query<{ id: string }>(
    `SELECT f.id FROM app.date_custody f
       JOIN app.booking b ON b.id = $1
       JOIN app.second_home_date d ON d.second_home_id = f.second_home_id AND d.stay_date = f.stay_date
      WHERE f.second_home_id = b.second_home_id AND f.stay_date >= b.checkin_date AND f.stay_date < b.checkout_date
        AND f.closed_at IS NULL AND f.basis = 'forfeited_right' AND now() < d.checkin_at
      ORDER BY f.id`,
    [bookingId],
  );
  return rows.map((row) => row.id);
}

/** Recuperação (BR-283): uso da autorização → por custódia, fecha `forfeited_right` e abre o Inventário Luxtory. */
export async function recover(
  client: Queryable,
  op: string,
  bookingId: string,
  authorizationId: string,
  custodyIds: readonly string[],
  authorizationRef = `booking_authorization:${authorizationId}`,
): Promise<void> {
  await client.query(
    `INSERT INTO app.booking_authorization_use (authorization_id, booking_id, operation_id, used_at)
     VALUES ($1, $2, $3, now())`,
    [authorizationId, bookingId, op],
  );
  for (const custodyId of custodyIds) {
    await client.query(
      `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $2 WHERE id = $1`,
      [custodyId, op],
    );
    await client.query(
      `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, purpose, inventory_origin,
         authorization_ref, parent_custody_id, opened_by_operation)
       SELECT gen_random_uuid(), c.second_home_id, c.stay_date, 'luxtory', 'inventory', 'recovered_future_capacity', $3,
              c.id, $2
         FROM app.date_custody c WHERE c.id = $1`,
      [custodyId, op, authorizationRef],
    );
  }
}

/** Saldo e fatos de uma reserva, para provar efeitos (e o "nada parcial"). */
export async function lifecycleFacts(h: Harness, bookingId: string) {
  const { rows } = await h.database.pool.query<{
    state: string;
    cancellation_class: string | null;
    transitions: number;
    active_occupancies: number;
    released: number;
    reserved: number;
    forfeited: number;
    restores: number;
    corrections: number;
    consumed: number;
  }>(
    `SELECT b.state, b.cancellation_class,
            (SELECT count(*)::int FROM app.booking_state_transition t WHERE t.booking_id = b.id) AS transitions,
            (SELECT count(*)::int FROM app.date_occupancy o WHERE o.booking_id = b.id AND o.released_at IS NULL)
              AS active_occupancies,
            (SELECT count(*)::int FROM app.date_occupancy o WHERE o.booking_id = b.id AND o.released_at IS NOT NULL)
              AS released,
            (SELECT count(*)::int FROM app.date_custody c
              WHERE c.opened_by_operation = b.opened_by_operation AND c.closed_at IS NULL) AS reserved,
            (SELECT count(*)::int FROM app.date_custody c
              WHERE c.second_home_id = b.second_home_id AND c.stay_date >= b.checkin_date
                AND c.stay_date < b.checkout_date AND c.closed_at IS NULL AND c.basis = 'forfeited_right') AS forfeited,
            (SELECT count(*)::int FROM app.use_right_ledger l JOIN app.use_right_ledger c ON c.id = l.refers_to_id
              WHERE c.operation_id = b.opened_by_operation AND l.movement = 'restore') AS restores,
            (SELECT count(*)::int FROM app.use_right_ledger l JOIN app.use_right_ledger c ON c.id = l.refers_to_id
              WHERE c.operation_id = b.opened_by_operation AND l.movement = 'correction') AS corrections,
            coalesce((SELECT sum(r.consumed)::int FROM app.use_right_balance r WHERE r.stake_id = b.stake_id), 0)
              AS consumed
       FROM app.booking b WHERE b.id = $1`,
    [bookingId],
  );
  return rows[0]!;
}

/** Reserva pelo command real da W12 (exige a K1 presente); devolve o id. */
export async function bookNow(
  h: Pick<BookingHarness, 'book'>,
  titular: Titular,
  homeId: string,
  checkin: string,
  checkout: string,
): Promise<string> {
  const outcome = await h.book(titular, {
    second_home_id: homeId,
    checkin_date: checkin,
    checkout_date: checkout,
  });
  if (outcome.status !== 'committed')
    throw new Error(`booking fixture: ${JSON.stringify(outcome)}`);
  return outcome.result.booking_id;
}

/**
 * Exceção aberta no passado (fato histórico): a regra de abertura recusa depois do check-out pelo relógio, então o
 * gatilho de regras fica desligado só nesta transação de fixture do dono; projeção, exceção e constraint seguem ativas.
 */
export async function historicException(
  h: Harness,
  bookingId: string,
  admin: Admin,
  type: 'operational' | 'unauthorized_booking',
): Promise<void> {
  const client = await connect(h.database.url);
  try {
    await client.query('BEGIN');
    const op = await openOperation(client, 'open_exception', { kind: 'admin', admin });
    const b = await bookingRow(client, bookingId);
    const transition = randomUUID();
    await client.query(
      'ALTER TABLE app.booking_state_transition DISABLE TRIGGER booking_state_transition_check',
    );
    await client.query(
      `INSERT INTO app.booking_state_transition (id, booking_id, previous_transition_id, from_state, to_state, kind,
         operation_id, recorded_at, basis)
       VALUES ($1, $2, $3, $4, 'in_exception', 'exception_opening', $5, now() - interval '10 days', 'Base histórica')`,
      [transition, bookingId, b.last_transition_id, b.state, op],
    );
    await client.query(
      `INSERT INTO app.booking_exception (id, booking_id, exception_type, reason, incident_ref, opened_by_transition_id,
         opened_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
      [
        bookingId,
        type,
        type === 'operational' ? 'casualty' : null,
        type === 'unauthorized_booking' ? 'INC-HIST-1' : null,
        transition,
      ],
    );
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query(
      'ALTER TABLE app.booking_state_transition ENABLE TRIGGER booking_state_transition_check',
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
