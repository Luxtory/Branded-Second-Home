import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createParameterHandlers } from '@/features/admin/parameters';
import { CommandRejection, LockSequence } from '@/features/platform';
import {
  createPostgresEconomicTermsStore,
  creditsForPrl,
  resolveEconomicTerms,
  type EconomicTerms,
  type EconomicTermsRequest,
} from '@/features/pricing';
import { createPrlHandlers } from '@/features/pricing/prl';
import { deferred, waitForLockWaiter } from '../../support/platform-fixtures';
import type { BookingHarness, OwnerScenario } from '../booking/booking-support';
import { NEXT_YEAR } from '../calendar/sealing-support';
import { addStaff, connect, pricingHarness, staffRunner, type Staff } from './pricing-support';

/**
 * W16 E3 — contrato `EconomicTerms` (TECH-030, TECH-031, TECH-053, TECH-054; ADR-0032 §8) e `set_parameter` global.
 * Valores de teste deliberadamente diferentes dos valores iniciais canônicos.
 */
const next = (monthDay: string) => `${NEXT_YEAR}-${monthDay}`;

describe('W16 E3 — EconomicTerms num único instante do banco e parâmetros globais (TECH-031, REQ-052)', () => {
  let h: BookingHarness;
  let owner: OwnerScenario;
  let run: ReturnType<typeof staffRunner>;
  let admin: Staff;
  let superAdmin: Staff;
  const parameters = createParameterHandlers();
  const prl = createPrlHandlers();
  const store = createPostgresEconomicTermsStore();

  const resolve = (request: EconomicTermsRequest) =>
    h.db
      .transaction()
      .execute((tx) => resolveEconomicTerms(tx, new LockSequence(), store, request));

  const setGlobal = (
    key: string,
    value: string,
    extra: Record<string, unknown> = {},
    who?: Staff,
  ) =>
    run.as(who ?? admin, parameters.setParameter, {
      second_home_id: null,
      key,
      value,
      effective_from: null,
      effective_to: null,
      basis: 'Ata Luxtory W16',
      ...extra,
    });

  async function rejection(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof CommandRejection) return error.code;
      throw error;
    }
    throw new Error('expected a rejection');
  }

  /** Publicação manual numa transação aberta (operação `pending`), para segurar a trava exclusiva. */
  async function openOperation(
    client: pg.Client,
    command: string,
    staff: Staff,
    homeId: string | null,
  ) {
    const op = randomUUID();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
         correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 'pending', now(), now())`,
      [
        op,
        command,
        staff.userId,
        staff.role,
        homeId,
        `w16:${op}`,
        randomUUID(),
        `staff_role:${staff.roleId}`,
      ],
    );
    return op;
  }

  async function commit(client: pg.Client, op: string) {
    await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
    await client.query('COMMIT');
  }

  beforeAll(async () => {
    ({ h, owner } = await pricingHarness());
    run = staffRunner(h);
    admin = await addStaff(h, 'admin');
    superAdmin = await addStaff(h, 'super_admin');
  });

  afterAll(() => h.close());

  it('[TECH-001] parâmetro exigido ausente → ERR_PARAMETER_MISSING; nunca padrão nem resolução parcial', async () => {
    expect(await rejection(resolve({ parameters: ['credit_multiplier'] }))).toBe(
      'ERR_PARAMETER_MISSING',
    );
  });

  it('[REQ-013][TECH-030] set_parameter global: só Admin, valor tipado, escopo correto, auditoria com valor e moeda', async () => {
    const values: Record<string, string> = {
      credit_multiplier: '7.25',
      credit_validity_months: '13',
      luxchange_fee_rate: '0.08',
      luxchange_fee_minimum: '4321',
      request_deadline_hours: '36',
      membership_base_annual_price: '123456',
    };
    for (const [key, value] of Object.entries(values))
      expect(await setGlobal(key, value), key).toMatchObject({
        status: 'committed',
        result: { key },
      });
    const { rows } = await h.database.pool.query(
      `SELECT a.after->>'value' AS value, a.after->>'currency' AS currency, a.after->>'second_home_id' AS home
         FROM app.audit_log a JOIN app.operation o ON o.id = a.operation_id
        WHERE o.command = 'set_parameter' AND a.after->>'key' = 'luxchange_fee_minimum'`,
    );
    expect(rows).toEqual([{ value: '4321', currency: 'BRL', home: null }]);

    const refuse = async (outcome: Promise<unknown>, code: string) =>
      expect(await outcome).toEqual(expect.objectContaining({ status: 'rejected', code }));
    await refuse(setGlobal('credit_multiplier', '8', {}, superAdmin), 'ERR_PERMISSION');
    for (const [key, value] of [
      ['credit_multiplier', '0'],
      ['credit_multiplier', '1.50'],
      ['luxchange_fee_rate', '1.5'],
      ['luxchange_fee_minimum', '12,5'],
      ['request_deadline_hours', '0'],
      ['administration_fee', '1'],
    ])
      await refuse(setGlobal(key!, value!), 'ERR_VALIDATION');
    await refuse(
      setGlobal('credit_multiplier', '8', { second_home_id: owner.homeId }),
      'ERR_VALIDATION',
    );
    await refuse(setGlobal('guest_rules', 'Regras (teste)'), 'ERR_VALIDATION');
    // Regressão W14: guest_rules por Second Home continua igual.
    expect(
      await run.as(admin, parameters.setParameter, {
        second_home_id: owner.homeId,
        key: 'guest_rules',
        value: 'Regras de convidados (teste W16)',
        effective_from: null,
        effective_to: null,
        basis: 'Ata Luxtory W16',
      }),
    ).toMatchObject({ status: 'committed', result: { key: 'guest_rules' } });
  });

  it('[REQ-052] noite sem PRL no período → ERR_PRL_MISSING', async () => {
    expect(
      await rejection(
        resolve({
          parameters: ['credit_multiplier'],
          period: { secondHomeId: owner.homeId, checkin: next('04-01'), checkout: next('04-03') },
        }),
      ),
    ).toBe('ERR_PRL_MISSING');
  });

  it('[TECH-031][REQ-052] um único resolvedAt do banco; ids das versões, valores canônicos, unidades e moeda; soma exata', async () => {
    const published = await run.as(admin, prl.publishInitialPrl, {
      second_home_id: owner.homeId,
      nights: [
        { stay_date: next('04-01'), amount_minor: '10001' },
        { stay_date: next('04-02'), amount_minor: '20002' },
      ],
      effective_from: null,
      basis: 'Ata Luxtory W16',
    });
    expect(published.status).toBe('committed');
    const terms = await resolve({
      parameters: ['luxchange_fee_rate', 'credit_multiplier', 'luxchange_fee_minimum'],
      period: { secondHomeId: owner.homeId, checkin: next('04-01'), checkout: next('04-03') },
    });
    expect(terms.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(
      terms.nights.map((night) => [night.stayDate, night.amountMinor, night.currency]),
    ).toEqual([
      [next('04-01'), '10001', 'BRL'],
      [next('04-02'), '20002', 'BRL'],
    ]);
    expect(terms.prlTotal).toEqual({ amountMinor: '30003', currency: 'BRL' });
    const ids = await h.database.pool.query<{ id: string }>(
      `SELECT id FROM app.prl_at($1, $2::date, $3::timestamptz)
        UNION ALL SELECT id FROM app.prl_at($1, $4::date, $3::timestamptz)`,
      [owner.homeId, next('04-01'), terms.resolvedAt, next('04-02')],
    );
    expect(terms.nights.map((night) => night.prlId)).toEqual(ids.rows.map((row) => row.id));
    expect(terms.parameters).toEqual({
      credit_multiplier: {
        parameterId: expect.any(String),
        value: '7.25',
        unit: 'decimal',
        currency: null,
      },
      luxchange_fee_minimum: {
        parameterId: expect.any(String),
        value: '4321',
        unit: 'money',
        currency: 'BRL',
      },
      luxchange_fee_rate: {
        parameterId: expect.any(String),
        value: '0.08',
        unit: 'fraction',
        currency: null,
      },
    });
    const at = await h.database.pool.query<{ id: string }>(
      `SELECT id FROM app.parameter_at('credit_multiplier', NULL, $1::timestamptz)`,
      [terms.resolvedAt],
    );
    expect(terms.parameters.credit_multiplier?.parameterId).toBe(at.rows[0]!.id);
    // Créditos do período com o multiplicador resolvido: centavos → reais antes do multiplicador.
    expect(creditsForPrl(BigInt(terms.prlTotal!.amountMinor), 'BRL', '7.25')).toBe('2175.2175');
    expect(JSON.parse(JSON.stringify(terms))).toEqual(terms);
  });

  it('[TECH-031] resolução sem período: instante do banco, sem PRL', async () => {
    const terms = await resolve({ parameters: ['credit_validity_months'] });
    expect(terms).toMatchObject({ secondHomeId: null, nights: [], prlTotal: null });
    expect(terms.parameters.credit_validity_months).toMatchObject({ value: '13', unit: 'months' });
    expect(
      await rejection(
        resolve({
          parameters: [],
          period: { secondHomeId: owner.homeId, checkin: next('04-02'), checkout: next('04-02') },
        }),
      ),
    ).toBe('ERR_VALIDATION');
  });

  it('[TECH-053][TECH-054] publicação de parâmetro em curso: a resolução espera a trava e vê a versão nova', async () => {
    const before = await resolve({ parameters: ['request_deadline_hours'] });
    const writer = await connect(h.database.appUrl);
    try {
      const op = await openOperation(writer, 'set_parameter', admin, null);
      const id = randomUUID();
      await writer.query(
        `INSERT INTO app.parameter (id, key, second_home_id, value, currency, effective_from, effective_to, authority,
           authorization_ref, created_at, created_by, operation_id)
         VALUES ($1, 'request_deadline_hours', NULL, '48', NULL, NULL, NULL, 'admin', 'Ata Luxtory W16', now(), $2, $3)`,
        [id, admin.userId, op],
      );
      const pending = resolve({ parameters: ['request_deadline_hours'] });
      await waitForLockWaiter(h.database.pool);
      await commit(writer, op);
      const terms = await pending;
      expect(terms.parameters.request_deadline_hours).toMatchObject({
        parameterId: id,
        value: '48',
      });
      expect(before.parameters.request_deadline_hours?.value).toBe('36');
    } finally {
      await writer.end();
    }
  });

  it('[TECH-053][TECH-054] resolução em curso segura parâmetros e PRL: as publicações esperam e começam depois do resolvedAt', async () => {
    const resolved = deferred<EconomicTerms>();
    const release = deferred();
    const holding = h.db.transaction().execute(async (tx) => {
      const terms = await resolveEconomicTerms(tx, new LockSequence(), store, {
        parameters: ['luxchange_fee_rate'],
        period: { secondHomeId: owner.homeId, checkin: next('04-01'), checkout: next('04-02') },
      });
      resolved.resolve(terms);
      await release.promise;
      return terms;
    });
    const terms = await resolved.promise;
    const parameter = setGlobal('luxchange_fee_rate', '0.09');
    await waitForLockWaiter(h.database.pool);
    const change = run.as(superAdmin, prl.changePublishedPrl, {
      second_home_id: owner.homeId,
      nights: [{ stay_date: next('04-01'), amount_minor: '11001' }],
      effective_from: null,
      basis: 'Ata Luxtory W16',
    });
    release.resolve();
    await holding;
    const [parameterOutcome, changeOutcome] = await Promise.all([parameter, change]);
    if (parameterOutcome.status !== 'committed' || changeOutcome.status !== 'committed')
      throw new Error(`expected commits: ${parameterOutcome.status} ${changeOutcome.status}`);
    expect(Date.parse(parameterOutcome.result.effective_from)).toBeGreaterThanOrEqual(
      Date.parse(terms.resolvedAt),
    );
    expect(Date.parse(changeOutcome.result.effective_from)).toBeGreaterThanOrEqual(
      Date.parse(terms.resolvedAt),
    );
    expect(terms.parameters.luxchange_fee_rate?.value).toBe('0.08');
    expect(terms.nights[0]?.amountMinor).toBe('10001');
    const after = await resolve({
      parameters: ['luxchange_fee_rate'],
      period: { secondHomeId: owner.homeId, checkin: next('04-01'), checkout: next('04-02') },
    });
    expect(after.parameters.luxchange_fee_rate?.value).toBe('0.09');
    expect(after.nights[0]?.amountMinor).toBe('11001');
  });

  it('[TECH-053][REQ-052] alteração de PRL em curso: a resolução espera a trava e vê a versão nova', async () => {
    const writer = await connect(h.database.appUrl);
    try {
      const op = await openOperation(writer, 'change_published_prl', superAdmin, owner.homeId);
      const publication = randomUUID();
      const night = randomUUID();
      await writer.query(
        `INSERT INTO app.prl_publication (id, second_home_id, kind, effective_from, authority, authorization_ref,
           created_at, created_by, operation_id)
         VALUES ($1, $2, 'change', NULL, 'super_admin', 'Ata Luxtory W16', now(), $3, $4)`,
        [publication, owner.homeId, superAdmin.userId, op],
      );
      await writer.query(
        `INSERT INTO app.prl (id, publication_id, second_home_id, stay_date, amount_minor, currency, effective_from)
         VALUES ($1, $2, $3, $4, 22002, 'BRL', NULL)`,
        [night, publication, owner.homeId, next('04-02')],
      );
      const pending = resolve({
        parameters: [],
        period: { secondHomeId: owner.homeId, checkin: next('04-02'), checkout: next('04-03') },
      });
      await waitForLockWaiter(h.database.pool);
      await commit(writer, op);
      const terms = await pending;
      expect(terms.nights).toEqual([
        { stayDate: next('04-02'), prlId: night, amountMinor: '22002', currency: 'BRL' },
      ]);
    } finally {
      await writer.end();
    }
  });
});
