import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POLICY_MECHANISMS, validatePolicyConfig } from '@/features/pricing';
import { bookingHarness, type BookingHarness } from '../features/booking/booking-support';
import { addAdmin, type Admin } from '../features/booking/lifecycle-support';
import { INVALID_POLICIES, TEST_POLICIES } from '../features/pricing/policy-fixtures';

/**
 * W18 E1 — `app.commercial_policy` (TECH-030, TECH-032, TECH-052; REQ-104; ADR-0034 §1–§3): esquema fechado no CHECK
 * do banco (paridade com o domínio), procedência, vigência e imutabilidade. Políticas de teste, só neste banco efêmero.
 */
const HOUR_MS = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const constraint = (name: string) => expect.objectContaining({ constraint: name });

describe('W18 — políticas comerciais no banco (TECH-030, TECH-032, REQ-104)', () => {
  let h: BookingHarness;
  let admin: Admin;

  async function connect(url: string = h.database.appUrl): Promise<pg.Client> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    return client;
  }

  async function openOperation(
    client: pg.Client,
    options: { command?: string; homeId?: string | null; actor?: string } = {},
  ): Promise<string> {
    const op = randomUUID();
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
         correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, 'admin', $4, $5, $6, $7, 'pending', now(), now())`,
      [
        op,
        options.command ?? 'publish_policy',
        options.actor ?? admin.userId,
        options.homeId ?? null,
        `w18:${op}`,
        randomUUID(),
        `staff_role:${admin.roleId}`,
      ],
    );
    return op;
  }

  interface Insert {
    readonly mechanism?: string;
    readonly config?: unknown;
    readonly from?: string | null;
    readonly to?: string | null;
    readonly createdBy?: string;
    readonly schemaVersion?: number;
  }

  async function insert(client: pg.Client, op: string, row: Insert = {}): Promise<string> {
    const id = randomUUID();
    const mechanism = row.mechanism ?? 'luxchange_request';
    await client.query(
      `INSERT INTO app.commercial_policy (id, mechanism, schema_version, config, effective_from, effective_to, authority,
         authorization_ref, created_at, created_by, operation_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin', 'Ata Luxtory W18', '2000-01-01T00:00:00Z', $7, $8)`,
      [
        id,
        mechanism,
        row.schemaVersion ?? 1,
        JSON.stringify(row.config ?? TEST_POLICIES[mechanism as keyof typeof TEST_POLICIES]),
        row.from ?? null,
        row.to ?? null,
        row.createdBy ?? admin.userId,
        op,
      ],
    );
    return id;
  }

  async function publish(row: Insert = {}): Promise<string> {
    const client = await connect();
    try {
      await client.query('BEGIN');
      const op = await openOperation(client);
      const id = await insert(client, op, row);
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

  async function attempt(row: Insert = {}, operation: Parameters<typeof openOperation>[1] = {}) {
    const client = await connect();
    try {
      await client.query('BEGIN');
      const op = await openOperation(client, operation);
      await insert(client, op, row);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
  }

  async function inForce(mechanism: string, at: string | Date) {
    const { rows } = await h.database.pool.query<{ id: string }>(
      `SELECT id FROM app.commercial_policy_at($1, $2::timestamptz)`,
      [mechanism, at],
    );
    return rows[0]?.id ?? null;
  }

  beforeAll(async () => {
    h = await bookingHarness();
    admin = await addAdmin(h);
  });

  afterAll(() => h.close());

  it('[TECH-001][REQ-082] nenhuma política existe por padrão: nenhum mecanismo tem versão vigente', async () => {
    const { rows } = await h.database.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM app.commercial_policy',
    );
    expect(rows[0]!.n).toBe('0');
    for (const mechanism of POLICY_MECHANISMS) expect(await inForce(mechanism, new Date())).toBeNull();
  });

  it('[REQ-104] o CHECK do banco aplica o mesmo esquema do domínio (paridade caso a caso)', async () => {
    const valid = async (mechanism: string, config: unknown) => {
      const { rows } = await h.database.pool.query<{ ok: boolean }>(
        'SELECT app.commercial_policy_config_valid($1, $2::jsonb) AS ok',
        [mechanism, JSON.stringify(config)],
      );
      return rows[0]!.ok;
    };
    for (const mechanism of POLICY_MECHANISMS) {
      expect(await valid(mechanism, TEST_POLICIES[mechanism])).toBe(true);
      for (const other of POLICY_MECHANISMS)
        expect(await valid(mechanism, TEST_POLICIES[other])).toBe(
          validatePolicyConfig(mechanism, TEST_POLICIES[other]).length === 0,
        );
    }
    for (const [label, mechanism, config] of INVALID_POLICIES) {
      expect({ label, ok: await valid(mechanism, config) }).toEqual({ label, ok: false });
      expect(validatePolicyConfig(mechanism, config).length).toBeGreaterThan(0);
    }
    expect(await valid('own_use', TEST_POLICIES.luxchange_request)).toBe(false);
  });

  it('[REQ-104][BR-163] política inválida nunca é gravada, mesmo pelo servidor', async () => {
    for (const [, mechanism, config] of INVALID_POLICIES)
      await expect(attempt({ mechanism, config })).rejects.toEqual(
        constraint('commercial_policy_config_check'),
      );
    await expect(attempt({ mechanism: 'own_use_booking', config: TEST_POLICIES.luxchange_request })).rejects.toMatchObject({
      constraint: expect.stringMatching(/^commercial_policy_(mechanism|config)_check$/),
    });
    await expect(attempt({ schemaVersion: 2 })).rejects.toEqual(
      constraint('commercial_policy_schema_version_check'),
    );
  });

  it('[TECH-051][TECH-052] só a operação publish_policy do Admin, com o autor da operação, grava a versão', async () => {
    await expect(attempt({}, { command: 'set_parameter' })).rejects.toEqual(
      constraint('commercial_policy_operation_provenance'),
    );
    await expect(attempt({}, { homeId: randomUUID() })).rejects.toBeTruthy();
    await expect(attempt({ createdBy: randomUUID() })).rejects.toEqual(
      constraint('commercial_policy_operation_provenance'),
    );
  });

  it('[TECH-030] vigência: carimbada pelo banco, nunca retroativa, sem sobreposição, término explícito respeitado', async () => {
    const now = Date.now();
    await expect(attempt({ mechanism: 'luxplus', from: iso(now - HOUR_MS) })).rejects.toEqual(
      constraint('conflict_commercial_policy_retroactive'),
    );
    const first = await publish({ mechanism: 'luxplus', to: iso(now + 10 * HOUR_MS) });
    const { rows } = await h.database.pool.query<{ from: Date; created: Date }>(
      `SELECT effective_from AS from, created_at AS created FROM app.commercial_policy WHERE id = $1`,
      [first],
    );
    expect(rows[0]!.from.getTime()).toBe(rows[0]!.created.getTime());
    expect(rows[0]!.created.getFullYear()).not.toBe(2000);
    expect(await inForce('luxplus', new Date())).toBe(first);
    await expect(attempt({ mechanism: 'luxplus', from: iso(now + 5 * HOUR_MS) })).rejects.toEqual(
      constraint('conflict_commercial_policy_overlap'),
    );
    const second = await publish({ mechanism: 'luxplus', from: iso(now + 20 * HOUR_MS) });
    expect(await inForce('luxplus', iso(now + 15 * HOUR_MS))).toBeNull();
    expect(await inForce('luxplus', iso(now + 20 * HOUR_MS))).toBe(second);
    expect(await inForce('luxchange_request', iso(now + 20 * HOUR_MS))).toBeNull();
  });

  it('[TECH-052] versões não admitem UPDATE, DELETE nem TRUNCATE, nem pelo dono do schema', async () => {
    const id = await publish({ mechanism: 'rental_external' });
    const app = await connect();
    try {
      await expect(
        app.query(`UPDATE app.commercial_policy SET authorization_ref = 'x' WHERE id = $1`, [id]),
      ).rejects.toBeTruthy();
      await expect(app.query(`DELETE FROM app.commercial_policy WHERE id = $1`, [id])).rejects.toBeTruthy();
    } finally {
      await app.end();
    }
    await expect(
      h.database.pool.query(`UPDATE app.commercial_policy SET config = '{}' WHERE id = $1`, [id]),
    ).rejects.toBeTruthy();
    await expect(h.database.pool.query(`DELETE FROM app.commercial_policy WHERE id = $1`, [id])).rejects.toBeTruthy();
    await expect(h.database.pool.query('TRUNCATE app.commercial_policy CASCADE')).rejects.toBeTruthy();
  });

  it('[TECH-052] anônimo e Titular autenticado não leem políticas nem executam as funções', async () => {
    for (const role of ['anon', 'authenticated']) {
      const client = await connect(h.database.url);
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query('SELECT * FROM app.commercial_policy')).rejects.toBeTruthy();
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.end();
      }
      const fn = await connect(h.database.url);
      try {
        await fn.query('BEGIN');
        await fn.query(`SET LOCAL ROLE ${role}`);
        await expect(
          fn.query(`SELECT * FROM app.commercial_policy_at('luxplus', now())`),
        ).rejects.toBeTruthy();
      } finally {
        await fn.query('ROLLBACK').catch(() => undefined);
        await fn.end();
      }
    }
  });
});
