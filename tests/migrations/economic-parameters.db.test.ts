import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { waitForLockWaiter } from '../support/platform-fixtures';
import {
  bookingHarness,
  type BookingHarness,
  type OwnerScenario,
} from '../features/booking/booking-support';
import { addAdmin, type Admin } from '../features/booking/lifecycle-support';
import { asUser, publishRules } from '../features/calendar/luxtory-selection-support';

/**
 * W16 E2 — chaves econômicas globais em `app.parameter` (TECH-030, TECH-033, TECH-001; REQ-013, REQ-095; ADR-0032 §6).
 * Os valores são de teste e deliberadamente diferentes dos valores iniciais canônicos: nenhum padrão é presumido.
 */
const KEYS = [
  'credit_multiplier',
  'credit_validity_months',
  'luxchange_fee_rate',
  'luxchange_fee_minimum',
  'request_deadline_hours',
  'membership_base_annual_price',
] as const;
type Key = (typeof KEYS)[number];

const VALID: Record<Key, { readonly value: string; readonly currency: string | null }> = {
  credit_multiplier: { value: '7.25', currency: null },
  credit_validity_months: { value: '13', currency: null },
  luxchange_fee_rate: { value: '0.075', currency: null },
  luxchange_fee_minimum: { value: '9876', currency: 'BRL' },
  request_deadline_hours: { value: '36', currency: null },
  membership_base_annual_price: { value: '123456', currency: 'BRL' },
};

const HOUR_MS = 3_600_000;
const constraint = (name: string) => expect.objectContaining({ constraint: name });
const iso = (ms: number) => new Date(ms).toISOString();

interface InsertOptions {
  readonly homeId?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly currency?: string | null;
}

describe('W16 — parâmetros econômicos globais no banco (TECH-030, TECH-033, REQ-013)', () => {
  let h: BookingHarness;
  let owner: OwnerScenario;
  let admin: Admin;

  async function connect(url: string = h.database.appUrl): Promise<pg.Client> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    return client;
  }

  /** Operação `set_parameter` do Admin, sem Second Home (escopo global) salvo indicação. */
  async function openOperation(client: pg.Client, homeId: string | null = null): Promise<string> {
    const op = randomUUID();
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
         correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, 'set_parameter', $2, NULL, 'admin', $3, $4, $5, $6, 'pending', now(), now())`,
      [op, admin.userId, homeId, `w16:${op}`, randomUUID(), `staff_role:${admin.roleId}`],
    );
    return op;
  }

  async function insertParameter(
    client: pg.Client,
    op: string,
    key: string,
    value: string,
    options: InsertOptions = {},
  ): Promise<string> {
    const id = randomUUID();
    const currency =
      options.currency === undefined
        ? (VALID[key as Key]?.currency ?? null)
        : options.currency;
    await client.query(
      `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, effective_to, authority,
         authorization_ref, created_at, created_by, operation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', 'Ata Luxtory W16', '2000-01-01T00:00:00Z', $8, $9)`,
      [id, key, options.homeId ?? null, value, currency, options.from ?? null, options.to ?? null, admin.userId, op],
    );
    return id;
  }

  /** Publica e confirma, como o executor: operação `pending` e `committed` no fim. */
  async function publish(key: string, value: string, options: InsertOptions = {}): Promise<string> {
    const client = await connect();
    try {
      await client.query('BEGIN');
      const op = await openOperation(client, options.homeId ?? null);
      const id = await insertParameter(client, op, key, value, options);
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

  /** Tenta gravar e desfaz sempre: só a validação do banco importa. */
  async function attempt(key: string, value: string, options: InsertOptions = {}): Promise<void> {
    const client = await connect();
    try {
      await client.query('BEGIN');
      const op = await openOperation(client, options.homeId ?? null);
      await insertParameter(client, op, key, value, options);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  }

  async function inForce(key: string, at: string | Date, homeId: string | null = null) {
    const { rows } = await h.database.pool.query<{ id: string; value: string; currency: string | null }>(
      `SELECT id, value, currency FROM app.parameter_at($1, $2, $3::timestamptz)`,
      [key, homeId, at],
    );
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    owner = await h.ownerScenario();
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  it('[TECH-001] sem versão, nenhuma chave econômica tem valor: nenhuma linha, nunca zero ou padrão', async () => {
    for (const key of KEYS) expect(await inForce(key, new Date())).toBeNull();
  });

  it('[TECH-030][REQ-013] as seis chaves são publicadas no escopo global, com instante, autoridade, base e autor do banco e da operação', async () => {
    for (const key of KEYS) {
      const id = await publish(key, VALID[key].value);
      const { rows } = await h.database.pool.query(
        `SELECT second_home_id, value, currency, authority, authorization_ref, created_by,
                effective_from = created_at AS immediate, created_at > now() - interval '1 minute' AS stamped
           FROM app.parameter WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        second_home_id: null,
        value: VALID[key].value,
        currency: VALID[key].currency,
        authority: 'admin',
        authorization_ref: 'Ata Luxtory W16',
        created_by: admin.userId,
        immediate: true,
        stamped: true,
      });
      expect(await inForce(key, new Date())).toMatchObject({ id, value: VALID[key].value });
      // Escopo próprio: a chave global não existe "por Second Home".
      expect(await inForce(key, new Date(), owner.homeId)).toBeNull();
      // Antes da primeira versão, ausente.
      expect(await inForce(key, '2000-01-01T00:00:00Z')).toBeNull();
    }
  });

  it('[REQ-013][BR-361][TECH-033] valores tipados no banco: formato, sinal, limite e moeda por chave; lista fechada e escopo', async () => {
    const refused: readonly (readonly [Key | string, string, string, InsertOptions?])[] = [
      ['credit_multiplier', '0', 'parameter_decimal_value'],
      ['credit_multiplier', '-1', 'parameter_decimal_value'],
      ['credit_multiplier', '1.50', 'parameter_decimal_value'],
      ['credit_multiplier', '01', 'parameter_decimal_value'],
      ['credit_multiplier', '1.', 'parameter_decimal_value'],
      ['credit_multiplier', '.5', 'parameter_decimal_value'],
      ['credit_multiplier', '1e3', 'parameter_decimal_value'],
      ['credit_multiplier', ' 7', 'parameter_decimal_value'],
      ['credit_multiplier', '1.1234567', 'parameter_decimal_value'],
      ['credit_multiplier', '1234567890', 'parameter_decimal_value'],
      ['credit_validity_months', '0', 'parameter_integer_value'],
      ['credit_validity_months', '-3', 'parameter_integer_value'],
      ['credit_validity_months', '1.5', 'parameter_integer_value'],
      ['credit_validity_months', '012', 'parameter_integer_value'],
      ['credit_validity_months', '10000', 'parameter_integer_value'],
      ['request_deadline_hours', '0', 'parameter_integer_value'],
      ['request_deadline_hours', 'abc', 'parameter_integer_value'],
      ['luxchange_fee_rate', '0', 'parameter_rate_value'],
      ['luxchange_fee_rate', '1.0', 'parameter_rate_value'],
      ['luxchange_fee_rate', '1.5', 'parameter_rate_value'],
      ['luxchange_fee_rate', '2', 'parameter_rate_value'],
      ['luxchange_fee_rate', '0.10', 'parameter_rate_value'],
      ['luxchange_fee_rate', '0.1234567', 'parameter_rate_value'],
      ['luxchange_fee_minimum', '0', 'parameter_money_value'],
      ['luxchange_fee_minimum', '-1', 'parameter_money_value'],
      ['luxchange_fee_minimum', '12.5', 'parameter_money_value'],
      ['luxchange_fee_minimum', '1234567890123456', 'parameter_money_value'],
      ['membership_base_annual_price', '0', 'parameter_money_value'],
      ['luxchange_fee_minimum', '9876', 'parameter_currency_check', { currency: null }],
      ['membership_base_annual_price', '9876', 'parameter_currency_check', { currency: 'USD' }],
      ['credit_multiplier', '7', 'parameter_currency_check', { currency: 'BRL' }],
      ['administration_fee', '1', 'parameter_key_check'],
      ['luxplus_discount', '0.5', 'parameter_key_check'],
      ['credit_multiplier', '7', 'parameter_scope_check', { homeId: 'home' }],
      ['guest_rules', 'Regras', 'parameter_scope_check'],
    ];
    for (const [key, value, name, options] of refused) {
      const resolved =
        options?.homeId === 'home' ? { ...options, homeId: owner.homeId } : (options ?? {});
      await expect(attempt(key, value, resolved), `${key}=${value}`).rejects.toEqual(
        constraint(name),
      );
    }
    const accepted: readonly (readonly [Key, string])[] = [
      ['credit_multiplier', '0.5'],
      ['credit_multiplier', '999999999.999999'],
      ['credit_validity_months', '9999'],
      ['request_deadline_hours', '1'],
      ['luxchange_fee_rate', '1'],
      ['luxchange_fee_rate', '0.000001'],
      ['luxchange_fee_minimum', '999999999999999'],
      ['membership_base_annual_price', '1'],
    ];
    for (const [key, value] of accepted)
      await expect(attempt(key, value), `${key}=${value}`).resolves.toBeUndefined();
  });

  it('[TECH-030] vigência no escopo global (D3): nunca retroativa, início posterior a todos, término explícito respeitado', async () => {
    const key = 'credit_validity_months';
    await expect(publish(key, '14', { from: iso(Date.now() - 60_000) })).rejects.toEqual(
      constraint('conflict_parameter_retroactive'),
    );
    const t2 = iso(Date.now() + 2 * HOUR_MS);
    const t4 = iso(Date.now() + 4 * HOUR_MS);
    const v2 = await publish(key, '15', { from: t2, to: t4 });
    await expect(publish(key, '16')).rejects.toEqual(constraint('conflict_parameter_overlap'));
    await expect(publish(key, '16', { from: t2 })).rejects.toEqual(
      constraint('conflict_parameter_overlap'),
    );
    await expect(publish(key, '16', { from: iso(Date.now() + 3 * HOUR_MS) })).rejects.toEqual(
      constraint('conflict_parameter_overlap'),
    );
    const v3 = await publish(key, '16', { from: t4 });

    const { rows } = await h.database.pool.query<{ id: string; effective_until: Date | null; currency: null }>(
      `SELECT id, effective_until, currency FROM app.parameter_version
        WHERE key = $1 AND second_home_id IS NULL ORDER BY effective_from`,
      [key],
    );
    expect(rows.map((row) => row.id).slice(-2)).toEqual([v2, v3]);
    expect(rows.at(-3)!.effective_until).toEqual(new Date(t2));
    expect(rows.at(-2)!.effective_until).toEqual(new Date(t4));
    expect(rows.at(-1)!.effective_until).toBeNull();
    expect(await inForce(key, iso(Date.parse(t2) + HOUR_MS))).toMatchObject({ id: v2 });
    expect(await inForce(key, t4)).toMatchObject({ id: v3 });
  });

  it('[TECH-030] os escopos não colidem: guest_rules por Second Home segue igual ao lado das chaves globais', async () => {
    const rules = await publishRules(h.database.appUrl, admin, owner.homeId);
    expect(await inForce('guest_rules', new Date(), owner.homeId)).toMatchObject({
      id: rules,
      currency: null,
    });
    expect(await inForce('guest_rules', new Date())).toBeNull();
    expect(await inForce('credit_multiplier', new Date())).toMatchObject({
      value: VALID.credit_multiplier.value,
    });
  });

  it('[TECH-053] publicações globais concorrentes da mesma chave se serializam: a segunda espera e vê a primeira', async () => {
    const key = 'luxchange_fee_rate';
    const first = await connect();
    try {
      await first.query('BEGIN');
      const op = await openOperation(first);
      await insertParameter(first, op, key, '0.08', { from: iso(Date.now() + 10 * HOUR_MS) });
      const second = publish(key, '0.09', { from: iso(Date.now() + 5 * HOUR_MS) });
      await waitForLockWaiter(h.database.pool);
      await first.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await first.query('COMMIT');
      await expect(second).rejects.toEqual(constraint('conflict_parameter_overlap'));
    } finally {
      await first.end();
    }
  });

  it('[TECH-052] versões globais não mudam nem somem', async () => {
    const version = await inForce('credit_multiplier', new Date());
    const app = await connect();
    try {
      for (const sql of [
        `UPDATE app.parameter SET value = '8' WHERE id = $1`,
        `DELETE FROM app.parameter WHERE id = $1`,
      ])
        await expect(app.query(sql, [version!.id])).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }
    await expect(
      h.database.pool.query(`UPDATE app.parameter SET value = '8' WHERE id = $1`, [version!.id]),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await inForce('credit_multiplier', new Date())).toMatchObject({
      value: VALID.credit_multiplier.value,
    });
  });

  it('[TECH-052] o Titular não lê parâmetros globais e continua lendo as regras da própria Second Home', async () => {
    const global = await asUser(
      h.database.appUrl,
      owner.titular.userId,
      `SELECT id FROM app.parameter WHERE second_home_id IS NULL`,
    );
    expect(global).toEqual([]);
    const own = await asUser<{ key: string }>(
      h.database.appUrl,
      owner.titular.userId,
      `SELECT key FROM app.parameter WHERE second_home_id = $1`,
      [owner.homeId],
    );
    expect(own.map((row) => row.key)).toEqual(['guest_rules']);
    await expect(
      asUser(h.database.appUrl, owner.titular.userId, `SELECT currency FROM app.parameter LIMIT 1`),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
