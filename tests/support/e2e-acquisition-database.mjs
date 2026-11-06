// Disposable local/CI runbook fixture only. Never reads DATABASE_URL or contacts a deployed database.
import { readFileSync } from 'node:fs';
import { withClient } from '../../scripts/lib/pg.mjs';
export const E2E_ACQUISITION_DATABASE_FILE = 'reports/e2e-acquisition-db.json';

/** @param {unknown} value @param {Readonly<Record<string, string | undefined>>} [source] */
export function validateE2eAcquisitionDatabase(value, source = process.env) {
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  if (typeof value !== 'string') throw new Error('Missing disposable E2E database');
  const url = new URL(value);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('Invalid E2E database protocol');
  if (
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/luxtory_e2e' ||
    !url.port ||
    url.username !== 'postgres' ||
    !['', '?sslmode=disable'].includes(url.search)
  )
    throw new Error('Refusing non-disposable E2E database');
  return url.toString();
}

/** Existing W7 API creates a valid encrypted synthetic party first. This invokes the owner-only runbook locally. */
export async function registerE2eInstitution(partyId) {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  if (!/^[0-9a-f-]{36}$/i.test(partyId)) throw new Error('Invalid fixture party id');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  const url = validateE2eAcquisitionDatabase(config.ownerUrl);
  await withClient(url, (client) =>
    client.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
      partyId,
      'Synthetic W8 E2E institutional act',
    ]),
  );
}

/**
 * A identidade jurídica da Luxtory é única no ambiente: o primeiro spec a chegar a registra com a sua party e os demais
 * recebem essa mesma party (corrida entre workers resolvida pela chave primária). Use a party devolvida.
 */
export async function ensureE2eInstitution(partyId) {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  if (!/^[0-9a-f-]{36}$/i.test(partyId)) throw new Error('Invalid fixture party id');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  const url = validateE2eAcquisitionDatabase(config.ownerUrl);
  return withClient(url, async (client) => {
    try {
      await client.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
        partyId,
        'Synthetic W8 E2E institutional act',
      ]);
      return partyId;
    } catch (error) {
      if (error?.code !== '23505') throw error;
    }
    const { rows } = await client.query('SELECT party_id FROM app.luxtory_legal_identity');
    return rows[0].party_id;
  });
}

/**
 * Ativação das reservas de uso próprio (ADR-0026) só no banco descartável do E2E: liga para provar a confirmação na
 * interface real e desliga em seguida. Nunca em Production (a validação recusa qualquer banco não descartável).
 */
export async function setE2eOwnUseBooking(open) {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  const url = validateE2eAcquisitionDatabase(config.ownerUrl);
  await withClient(url, (client) =>
    client.query(
      open
        ? `INSERT INTO app.capability_activation VALUES ('own_use_booking', now(), 'e2e:fixture')
           ON CONFLICT DO NOTHING`
        : `DELETE FROM app.capability_activation WHERE capability = 'own_use_booking'`,
    ),
  );
}

function disposableOwnerUrl() {
  const source = process.env;
  if (source.VERCEL || source.VERCEL_ENV) throw new Error('E2E fixture is local/CI only');
  const config = JSON.parse(readFileSync(E2E_ACQUISITION_DATABASE_FILE, 'utf8'));
  return validateE2eAcquisitionDatabase(config.ownerUrl);
}

/**
 * K2 (`own_use_lifecycle`, ADR-0027 §5) só no banco descartável do E2E (W13 E4b): liga para provar os atos do ciclo na
 * interface real e desliga em seguida. Nunca em Production (a validação recusa qualquer banco não descartável).
 */
export async function setE2eOwnUseLifecycle(open) {
  const url = disposableOwnerUrl();
  await withClient(url, (client) =>
    client.query(
      open
        ? `INSERT INTO app.capability_activation VALUES ('own_use_lifecycle', now(), 'e2e:fixture')
           ON CONFLICT DO NOTHING`
        : `DELETE FROM app.capability_activation WHERE capability = 'own_use_lifecycle'`,
    ),
  );
}

/**
 * Autorização independente pelo papel autorizador real (`app.authorize_booking_action`), como o workflow da E5 faria,
 * só no banco descartável: a função deriva o escopo dos fatos e confere o esperado da solicitação.
 */
let syntheticRun = 0;

export async function authorizeE2eBookingAction(requestId) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Invalid fixture request id');
  const url = disposableOwnerUrl();
  // Referência no formato fechado da função (`github-run:<id>:<tentativa>`), sintética e única por chamada.
  syntheticRun += 1;
  const approvalRef = `github-run:${Date.now()}${syntheticRun}:1`;
  return withClient(url, async (client) => {
    await client.query('SET ROLE luxtory_booking_authorizer');
    const { rows } = await client.query('SELECT app.authorize_booking_action($1, $2) AS id', [
      requestId,
      approvalRef,
    ]);
    return rows[0].id;
  });
}

/**
 * Usuário que representa a party agora (delegação ativa e vigente): o ator da operação histórica do fixture, como o
 * `openOperation` dos testes db — a constraint `operation_actor_check` exige ator em toda operação que não é `system`.
 */
async function activeRepresentative(client, partyId) {
  const { rows } = await client.query(
    `SELECT user_id FROM app.party_delegation
      WHERE party_id = $1 AND state = 'active' AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())
      ORDER BY activated_at DESC LIMIT 1`,
    [partyId],
  );
  if (rows[0] === undefined) throw new Error('Fixture needs an active representation of the party');
  return rows[0].user_id;
}

/**
 * Estadia do Owner já começada (fato histórico do fixture, W13 E4b): a reserva é gravada pelo dono do schema como se
 * tivesse sido criada antes das noites começarem — a regra de abertura da W12 (noite futura) fica desligada só nesta
 * transação; custódia e ocupação seguem os gatilhos e constraints. Noites: da primeira já iniciada até amanhã.
 */
export async function seedE2eStartedOwnerBooking(homeId) {
  if (!/^[0-9a-f-]{36}$/i.test(homeId)) throw new Error('Invalid fixture home id');
  const url = disposableOwnerUrl();
  return withClient(url, async (client) => {
    await client.query('BEGIN');
    try {
      const { rows: holdings } = await client.query(
        `SELECT h.id, h.party_id FROM app.holding h WHERE h.second_home_id = $1 AND h.role = 'owner'
          AND h.valid_until IS NULL`,
        [homeId],
      );
      const holding = holdings[0];
      const { rows: nights } = await client.query(
        `SELECT stay_date::text AS d FROM app.second_home_date WHERE second_home_id = $1
          AND checkin_at <= now() ORDER BY stay_date DESC LIMIT 1`,
        [homeId],
      );
      if (holding === undefined || nights[0] === undefined)
        throw new Error('Owner fixture needs a started sealed night');
      const checkin = nights[0].d;
      const { rows: out } = await client.query(
        `SELECT ($1::date + 2)::text AS checkout, gen_random_uuid() AS id, gen_random_uuid() AS op`,
        [checkin],
      );
      const { checkout, id, op } = out[0];
      const actor = await activeRepresentative(client, holding.party_id);
      await client.query(
        `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, idempotency_key, correlation_id,
           authorization_ref, state, created_at, updated_at)
         VALUES ($1, 'create_own_use_booking', $5, $2, 'titular', $3, $3, $4, 'pending', now(), now())`,
        [op, holding.party_id, `e2e:${op}`, `holding:${holding.id}`, actor],
      );
      await client.query('ALTER TABLE app.booking DISABLE TRIGGER booking_open');
      await client.query(
        `INSERT INTO app.booking (id, second_home_id, channel, holding_id, stake_id, checkin_date, checkout_date, state,
           opened_by_operation, confirmed_at)
         VALUES ($1, $2, 'own_use', $3, NULL, $4, $5, 'confirmed', $6, now() - interval '30 days')`,
        [id, homeId, holding.id, checkin, checkout, op],
      );
      await client.query(
        `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, stake_id,
           opened_by_operation)
         SELECT gen_random_uuid(), c.second_home_id, c.stay_date, $1, 'own_use', c.id, NULL, $2
           FROM app.date_custody c
          WHERE c.second_home_id = $3 AND c.stay_date >= $4::date AND c.stay_date < $5::date AND c.closed_at IS NULL`,
        [id, op, homeId, checkin, checkout],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await client.query('ALTER TABLE app.booking ENABLE TRIGGER booking_open');
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
      return { bookingId: id, checkin, checkout };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}

/**
 * Reserva de Co-Owner dentro dos próximos 15 dias (fato do fixture, W13 E4b): no cenário parcial do E2E a janela desta
 * Ação abre meses à frente, então a interface não reserva noite próxima. Mesmo SQL do fixture histórico dos testes db
 * (`historicBooking`): regra de abertura e de movimento do ledger desligadas só nesta transação do dono; custódia
 * `reserved_right`, consumo e ocupação gravados e conferidos pelas constraints. Primeira noite livre a partir de
 * `fromOffset` dias, uma noite.
 */
export async function seedE2eSoonCoOwnerBooking(homeId, partyId, fromOffset = 3) {
  if (!/^[0-9a-f-]{36}$/i.test(homeId) || !/^[0-9a-f-]{36}$/i.test(partyId))
    throw new Error('Invalid fixture ids');
  const url = disposableOwnerUrl();
  return withClient(url, async (client) => {
    await client.query('BEGIN');
    try {
      const { rows: holdings } = await client.query(
        `SELECT id, stake_id FROM app.holding WHERE second_home_id = $1 AND party_id = $2 AND valid_until IS NULL`,
        [homeId, partyId],
      );
      const holding = holdings[0];
      const { rows: nights } = await client.query(
        `SELECT d.stay_date::text AS d FROM app.second_home_date d
          JOIN app.date_custody c ON c.second_home_id = d.second_home_id AND c.stay_date = d.stay_date
                                 AND c.closed_at IS NULL AND c.holder_kind = 'spe_pool'
          JOIN app.use_right_balance b ON b.stake_id = $3 AND b.exercise_year = d.exercise_year
                                      AND b.bucket = CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END
                                      AND b.remaining > 0
         WHERE d.second_home_id = $1 AND d.stay_date >= current_date + $2::int AND d.checkin_at > now()
         ORDER BY d.stay_date LIMIT 1`,
        [homeId, fromOffset, holding?.stake_id ?? null],
      );
      if (holding === undefined || nights[0] === undefined)
        throw new Error('Co-Owner fixture needs a free sealed night with balance');
      const checkin = nights[0].d;
      const { rows: out } = await client.query(
        `SELECT ($1::date + 1)::text AS checkout, gen_random_uuid() AS id, gen_random_uuid() AS op`,
        [checkin],
      );
      const { checkout, id, op } = out[0];
      await client.query(
        `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, idempotency_key, correlation_id,
           authorization_ref, state, created_at, updated_at)
         VALUES ($1, 'create_own_use_booking', $5, $2, 'titular', $3, $3, $4, 'pending', now(), now())`,
        [
          op,
          partyId,
          `e2e:${op}`,
          `holding:${holding.id}`,
          await activeRepresentative(client, partyId),
        ],
      );
      await client.query('ALTER TABLE app.booking DISABLE TRIGGER booking_open');
      await client.query(
        'ALTER TABLE app.use_right_ledger DISABLE TRIGGER use_right_ledger_movement',
      );
      await client.query(
        `INSERT INTO app.booking (id, second_home_id, channel, holding_id, stake_id, checkin_date, checkout_date, state,
           opened_by_operation, confirmed_at)
         VALUES ($1, $2, 'own_use', $3, $4, $5, $6, 'confirmed', $7, now())`,
        [id, homeId, holding.id, holding.stake_id, checkin, checkout, op],
      );
      const { rows: closed } = await client.query(
        `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $3
          WHERE second_home_id = $1 AND stay_date = $2 AND closed_at IS NULL RETURNING id`,
        [homeId, checkin, op],
      );
      await client.query(
        `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, stake_id, basis, parent_custody_id,
           opened_by_operation)
         VALUES (gen_random_uuid(), $1, $2, 'use_right', $3, 'reserved_right', $4, $5)`,
        [homeId, checkin, holding.stake_id, closed[0].id, op],
      );
      await client.query(
        `INSERT INTO app.use_right_ledger (id, second_home_id, acquisition_id, stake_id, exercise_year, bucket,
           movement, quantity, stay_date, operation_id, created_at)
         SELECT gen_random_uuid(), d.second_home_id, a.id, $3, d.exercise_year,
                CASE WHEN d.is_leap_day THEN 'leap' ELSE d.season END, 'consume', 1, d.stay_date, $4, now()
           FROM app.second_home_date d JOIN app.acquisition a ON a.second_home_id = d.second_home_id
          WHERE d.second_home_id = $1 AND d.stay_date = $2`,
        [homeId, checkin, holding.stake_id, op],
      );
      await client.query(
        `INSERT INTO app.date_occupancy (id, second_home_id, stay_date, booking_id, channel, custody_id, stake_id,
           opened_by_operation)
         SELECT gen_random_uuid(), $1, $2, $3, 'own_use', c.id, $4, $5
           FROM app.date_custody c WHERE c.second_home_id = $1 AND c.stay_date = $2 AND c.closed_at IS NULL`,
        [homeId, checkin, id, holding.stake_id, op],
      );
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await client.query(
        'ALTER TABLE app.use_right_ledger ENABLE TRIGGER use_right_ledger_movement',
      );
      await client.query('ALTER TABLE app.booking ENABLE TRIGGER booking_open');
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
      return { bookingId: id, checkin, checkout };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}
