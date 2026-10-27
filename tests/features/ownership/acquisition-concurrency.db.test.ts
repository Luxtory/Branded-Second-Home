import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acquisitionHarness, factCounts, type AcquisitionHarness } from './acquisition-support';
import { expectRejected } from '../../support/catalog-fixtures';
import { deferred, waitForLockWaiter } from '../../support/platform-fixtures';
import type { CommandHandler, DatabaseTransaction, JsonValue } from '@/features/platform';

describe('W8 atomicity and serialized authority [TECH-054] [REQ-026] [T-801] [T-802] [T-809]', () => {
  let h: AcquisitionHarness;
  beforeAll(async () => {
    h = await acquisitionHarness();
  });
  beforeEach(() => h.clock.set(new Date('2027-01-01T12:00:00Z')));
  afterAll(async () => {
    await h.close();
  });
  function paused<I, R extends JsonValue>(handler: CommandHandler<I, R, DatabaseTransaction>) {
    const reached = deferred();
    const resume = deferred();
    return {
      reached,
      resume,
      handler: {
        ...handler,
        async execute(ctx) {
          const result = await handler.execute(ctx);
          reached.resolve();
          await resume.promise;
          return result;
        },
      } satisfies CommandHandler<I, R, DatabaseTransaction>,
    };
  }
  it.each([false, true])('serializes competing formalizations (same key: %s)', async (sameKey) => {
    const { home } = await h.root();
    const input = await h.coOwner(home.id);
    const key = randomUUID();
    const responses = await Promise.all([
      h.run(h.handlers.formalizeAcquisition, input, key),
      h.run(h.handlers.formalizeAcquisition, input, sameKey ? key : randomUUID()),
    ]);
    expect(responses.filter((r) => r.status === 'committed')).toHaveLength(sameKey ? 2 : 1);
    expect(responses.filter((r) => r.status === 'committed' && !r.replayed)).toHaveLength(1);
    if (!sameKey)
      expectRejected(
        responses.find((r) => r.status === 'rejected')!,
        'ERR_STATE_TRANSITION',
      );
    expect(await factCounts(h.db, home.id)).toEqual([1, 2, 2, 1, 4]);
    const events = await h.db
      .selectFrom('app.outbox')
      .select('id')
      .where('payload', '@>', JSON.stringify({ second_home_id: home.id }))
      .execute();
    expect(events).toHaveLength(1);
  });
  it.each([
    'acquisition',
    'spe',
    'stake',
    'holding',
    'use_right_ledger',
    'audit_log',
    'outbox',
  ] as const)('rolls back every fact and the key if %s fails after insert', async (table) => {
    const { home } = await h.root();
    const input = await h.coOwner(home.id);
    const key = randomUUID();
    await h.database.pool.query(
      `CREATE OR REPLACE FUNCTION app.test_acquisition_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected W8 fault'; END $$`,
    );
    await h.database.pool.query(
      `CREATE TRIGGER test_w8_fault AFTER INSERT ON app.${table} FOR EACH ROW EXECUTE FUNCTION app.test_acquisition_fault()`,
    );
    try {
      await expect(h.run(h.handlers.formalizeAcquisition, input, key)).rejects.toThrow(
        'injected W8 fault',
      );
      expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
      expect(
        await h.db
          .selectFrom('app.operation')
          .select('id')
          .where('idempotency_key', '=', key)
          .execute(),
      ).toEqual([]);
      expect(
        await h.db
          .selectFrom('app.idempotency_record')
          .select('idempotency_key')
          .where('idempotency_key', '=', key)
          .execute(),
      ).toEqual([]);
    } finally {
      await h.database.pool.query(`DROP TRIGGER test_w8_fault ON app.${table}`);
    }
    expect((await h.run(h.handlers.formalizeAcquisition, input, key)).status).toBe('committed');
  });
  it('returns a functional conflict for a SPE party already assigned to another Second Home', async () => {
    const first = await h.root();
    const second = await h.root();
    const firstInput = await h.coOwner(first.home.id);
    const secondInput = {
      ...(await h.coOwner(second.home.id)),
      spe_party_id: firstInput.spe_party_id,
    };
    expect((await h.run(h.handlers.formalizeAcquisition, firstInput)).status).toBe('committed');
    expectRejected(
      await h.run(h.handlers.formalizeAcquisition, secondInput),
      'ERR_STATE_TRANSITION',
    );
    expect(await factCounts(h.db, second.home.id)).toEqual([0, 0, 0, 0, 0]);
  });
  it('resolves concurrent attempts to reuse a SPE party across homes as one success and one conflict', async () => {
    const first = await h.root();
    const other = await h.root();
    const a = await h.coOwner(first.home.id);
    const b = { ...(await h.coOwner(other.home.id)), spe_party_id: a.spe_party_id };
    const results = await Promise.all([
      h.run(h.handlers.formalizeAcquisition, a),
      h.run(h.handlers.formalizeAcquisition, b),
    ]);
    expect(results.filter((r) => r.status === 'committed')).toHaveLength(1);
    expectRejected(
      results.find((r) => r.status === 'rejected')!,
      'ERR_STATE_TRANSITION',
    );
  });
  it.each([
    'formalizeAcquisition',
    'initialAllocation',
    'administration',
    'operationStart',
  ] as const)('revalidates the exact authority inside %s after the guard', async (name) => {
    const { home } = await h.root();
    const input =
      name === 'formalizeAcquisition'
        ? await h.owner(home.id)
        : name === 'initialAllocation'
          ? {
              second_home_id: home.id,
              configuration_id: 2,
              operation_start_date: '2027-07-01',
              grants: [
                { position: 1, alta: 0, media: 0 },
                { position: 2, alta: 0, media: 0 },
              ],
              luxtory_capacity: { alta: 0, media: 0 },
              basis_ref: 'test',
            }
          : name === 'administration'
            ? {
                second_home_id: home.id,
                coverages: [
                  {
                    provider_party_id: await h.party(),
                    professional: true,
                    scope: 'professional_administration',
                    valid_from: '2027-01-01',
                  },
                ],
                basis_ref: 'test',
              }
            : { second_home_id: home.id, effective_start_date: '2027-01-01', basis_ref: 'test' };
    const handler: CommandHandler<unknown, JsonValue, DatabaseTransaction> = h.handlers[name];
    const interrupted = {
      ...handler,
      async assertAvailable() {
        await handler.assertAvailable?.();
        await h.database.pool.query(
          `SELECT app.revoke_staff_role(id,'Concurrent revocation') FROM app.staff_role WHERE user_id=$1 AND revoked_at IS NULL`,
          [h.userId],
        );
      },
    };
    try {
      expectRejected(await h.run(interrupted, input), 'ERR_PERMISSION');
      expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    } finally {
      await h.database.pool.query(
        `SELECT app.assign_staff_role($1,'admin','Restored synthetic authority')`,
        [h.userId],
      );
    }
  });
  it.each(['brand', 'investor'] as const)(
    'rejects new formalization when %s revocation wins the lock race',
    async (kind) => {
      const built = await h.catalog.build.finalizedHomeEdition();
      const investor = await h.catalog.build.authorization(
        built.homeConceptId,
        new Date('2026-01-01T00:00:00Z'),
      );
      const home = await h.catalog.build.secondHome(built.homeEdition.id, investor.id);
      const input = await h.owner(home.id);
      if (kind === 'brand') {
        const gate = paused(h.catalog.handlers.terminateBrandPartner);
        const revoked = h.catalog.run(gate.handler, {
          brand_partner_id: built.partner.id,
          terminated_effective_at: h.clock.now().toISOString(),
          termination_basis: 'Synthetic termination',
        });
        await gate.reached.promise;
        const acquisition = h.run(h.handlers.formalizeAcquisition, input);
        await waitForLockWaiter(h.database.pool);
        gate.resume.resolve();
        expect((await revoked).status).toBe('committed');
        expectRejected(await acquisition, 'ERR_STATE_TRANSITION');
      } else {
        const gate = paused(h.catalog.handlers.revokeInvestorAuthorization);
        const revoked = h.catalog.run(gate.handler, {
          investor_authorization_id: investor.id,
          revocation_basis: 'Synthetic revocation',
        });
        await gate.reached.promise;
        const acquisition = h.run(h.handlers.formalizeAcquisition, input);
        await waitForLockWaiter(h.database.pool);
        gate.resume.resolve();
        expect((await revoked).status).toBe('committed');
        expectRejected(await acquisition, 'ERR_STATE_TRANSITION');
      }
      expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    },
  );
  it('lets an authorized formalization finish before concurrent termination/revocation, preserving its facts', async () => {
    const built = await h.catalog.build.finalizedHomeEdition();
    const investor = await h.catalog.build.authorization(
      built.homeConceptId,
      new Date('2026-01-01T00:00:00Z'),
    );
    const home = await h.catalog.build.secondHome(built.homeEdition.id, investor.id);
    const gate = paused(h.handlers.formalizeAcquisition);
    const acquisition = h.run(gate.handler, await h.owner(home.id));
    await gate.reached.promise;
    const terminated = h.catalog.run(h.catalog.handlers.terminateBrandPartner, {
      brand_partner_id: built.partner.id,
      terminated_effective_at: h.clock.now().toISOString(),
      termination_basis: 'Synthetic termination',
    });
    const revoked = h.catalog.run(h.catalog.handlers.revokeInvestorAuthorization, {
      investor_authorization_id: investor.id,
      revocation_basis: 'Synthetic revocation',
    });
    await waitForLockWaiter(h.database.pool);
    gate.resume.resolve();
    expect((await acquisition).status).toBe('committed');
    expect((await terminated).status).toBe('committed');
    expect((await revoked).status).toBe('committed');
    expect(await factCounts(h.db, home.id)).toEqual([1, 1, 0, 0, 0]);
    expect(
      (
        await h.run(h.handlers.operationStart, {
          second_home_id: home.id,
          effective_start_date: '2027-01-01',
          basis_ref: 'Continuity',
        })
      ).status,
    ).toBe('committed');
  });
  it('serializes allocation versions and replacement commands without partial administration changes', async () => {
    const { home } = await h.root();
    const input = {
      second_home_id: home.id,
      configuration_id: 2,
      operation_start_date: '2027-07-01',
      grants: [
        { position: 1, alta: 0, media: 0 },
        { position: 2, alta: 0, media: 0 },
      ],
      luxtory_capacity: { alta: 0, media: 0 },
      basis_ref: 'test',
    };
    const allocations = await Promise.all([
      h.run(h.handlers.initialAllocation, input),
      h.run(h.handlers.initialAllocation, input),
    ]);
    expect(allocations.every((r) => r.status === 'committed')).toBe(true);
    expect(
      await h.db
        .selectFrom('app.second_home_initial_allocation')
        .select('version')
        .where('second_home_id', '=', home.id)
        .orderBy('version')
        .execute(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
    const body = {
      second_home_id: home.id,
      coverages: [
        {
          provider_party_id: await h.party(),
          professional: true,
          scope: 'professional_administration',
          valid_from: '2027-01-01',
        },
      ],
      basis_ref: 'test',
    };
    const original = await h.run(h.handlers.administration, body);
    expect(original.status).toBe('committed');
    const replacement = {
      ...body,
      coverages: [
        {
          ...body.coverages[0],
          valid_from: '2027-07-01',
          replaces_id: original.status === 'committed' ? original.result.id : '',
        },
      ],
    };
    const results = await Promise.all([
      h.run(h.handlers.administration, replacement),
      h.run(h.handlers.administration, replacement),
    ]);
    expect(results.filter((r) => r.status === 'committed')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
