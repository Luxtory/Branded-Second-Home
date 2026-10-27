import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acquisitionHarness, factCounts, type AcquisitionHarness } from './acquisition-support';
import { expectRejected } from '../../support/catalog-fixtures';
import { waitForLockWaiter } from '../../support/platform-fixtures';

describe('W8 allocations, administration and civil operation start [REQ-025] [REQ-026] [BR-022] [BR-107] [BR-108]', () => {
  let h: AcquisitionHarness;
  beforeAll(async () => {
    h = await acquisitionHarness();
  });
  beforeEach(() => h.clock.set(new Date('2027-01-01T12:00:00Z')));
  afterAll(async () => {
    await h.close();
  });
  const allocation = (home: string, quantity = 30) => ({
    second_home_id: home,
    configuration_id: 2,
    operation_start_date: '2027-07-01',
    grants: [
      { position: 1, alta: quantity, media: 61 },
      { position: 2, alta: quantity, media: 61 },
    ],
    luxtory_capacity: { alta: 2, media: 0 },
    basis_ref: 'allocation:synthetic',
  });
  const start = (home: string, date = '2027-01-01') => ({
    second_home_id: home,
    effective_start_date: date,
    basis_ref: 'start:synthetic',
  });
  async function coverage(home: string, from: string, until?: string, replaces?: string) {
    return {
      second_home_id: home,
      basis_ref: 'administration:synthetic',
      coverages: [
        {
          provider_party_id: await h.party(),
          professional: true,
          scope: 'professional_administration',
          valid_from: from,
          ...(until === undefined ? {} : { valid_until: until }),
          ...(replaces === undefined ? {} : { replaces_id: replaces }),
        },
      ],
    };
  }
  it('persists no rights before formalization and uses the explicitly selected immutable allocation version', async () => {
    const { home } = await h.root();
    const selected = await h.run(h.handlers.initialAllocation, allocation(home.id, 29));
    const newer = await h.run(h.handlers.initialAllocation, allocation(home.id));
    expect(selected.status).toBe('committed');
    expect(newer.status).toBe('committed');
    const admin = await h.run(h.handlers.administration, await coverage(home.id, '2027-07-01'));
    expect(admin.status).toBe('committed');
    expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    const input = {
      ...(await h.coOwner(home.id)),
      operation_start_date: '2027-07-01',
      initial_allocation_id: selected.status === 'committed' ? selected.result.id : '',
    };
    expect((await h.run(h.handlers.formalizeAcquisition, input)).status).toBe('committed');
    const grants = await h.db
      .selectFrom('app.use_right_ledger')
      .select(['bucket', 'quantity', 'source', 'initial_allocation_id'])
      .where('second_home_id', '=', home.id)
      .execute();
    expect(grants.filter((g) => g.bucket === 'alta')).toEqual(
      Array.from({ length: 2 }, () => ({
        bucket: 'alta',
        quantity: 29,
        source: 'initial_allocation',
        initial_allocation_id: input.initial_allocation_id,
      })),
    );
    expectRejected(
      await h.run(h.handlers.initialAllocation, allocation(home.id)),
      'ERR_STATE_TRANSITION',
    );
    const versions = await h.db
      .selectFrom('app.second_home_initial_allocation')
      .select('version')
      .where('second_home_id', '=', home.id)
      .orderBy('version')
      .execute();
    expect(versions).toEqual([{ version: 1 }, { version: 2 }]);
  });
  it('rejects equality/category/capacity violations without leaving an allocation', async () => {
    const { home } = await h.root();
    for (const input of [
      allocation(home.id, 31),
      {
        ...allocation(home.id),
        grants: [
          { position: 1, alta: 30, media: 61 },
          { position: 2, alta: 29, media: 61 },
        ],
      },
      { ...allocation(home.id), luxtory_capacity: { alta: 2, media: 1 } },
    ])
      expectRejected(await h.run(h.handlers.initialAllocation, input), 'ERR_CAPACITY_UNAVAILABLE');
    expect(
      await h.db
        .selectFrom('app.second_home_initial_allocation')
        .select('id')
        .where('second_home_id', '=', home.id)
        .execute(),
    ).toEqual([]);
  });
  it('allows a civil base before today when explicit quantities still fit strictly future nights', async () => {
    const { home } = await h.root();
    h.clock.set(new Date('2027-07-10T17:00:00Z'));
    const input = {
      ...allocation(home.id, 20),
      grants: [
        { position: 1, alta: 20, media: 20 },
        { position: 2, alta: 20, media: 20 },
      ],
    };
    const selected = await h.run(h.handlers.initialAllocation, input);
    expect(selected.status).toBe('committed');
    expect(
      (
        await h.run(h.handlers.formalizeAcquisition, {
          ...(await h.coOwner(home.id)),
          operation_start_date: '2027-07-01',
          initial_allocation_id: selected.status === 'committed' ? selected.result.id : '',
        })
      ).status,
    ).toBe('committed');
  });
  it('refreshes the clock after waiting for the root lock and rejects a newly elapsed night', async () => {
    const { home } = await h.root();
    h.clock.set(new Date('2027-12-31T16:59:00Z'));
    const selected = await h.run(h.handlers.initialAllocation, {
      ...allocation(home.id, 0),
      operation_start_date: '2027-12-31',
      grants: [
        { position: 1, alta: 0, media: 0 },
        { position: 2, alta: 0, media: 0 },
      ],
      luxtory_capacity: { alta: 1, media: 0 },
    });
    expect(selected.status).toBe('committed');
    const input = {
      ...(await h.coOwner(home.id)),
      operation_start_date: '2027-12-31',
      initial_allocation_id: selected.status === 'committed' ? selected.result.id : '',
    };
    const blocker = await h.database.pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('app.second_home:' || $1::text,0))`,
        [home.id],
      );
      const pending = h.run(h.handlers.formalizeAcquisition, input);
      await waitForLockWaiter(h.database.pool);
      h.clock.set(new Date('2027-12-31T17:00:00Z'));
      await blocker.query('COMMIT');
      expectRejected(await pending, 'ERR_CAPACITY_UNAVAILABLE');
      expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  });
  it('does not reduce annual grants when formalization is too late for the full configuration', async () => {
    const { home } = await h.root();
    h.clock.set(new Date('2027-01-01T17:00:00Z'));
    expectRejected(
      await h.run(h.handlers.formalizeAcquisition, await h.coOwner(home.id)),
      'ERR_CAPACITY_UNAVAILABLE',
    );
  });
  it('rejects a selected allocation from another home or another civil base', async () => {
    const { home } = await h.root();
    const other = await h.root();
    const selected = await h.run(h.handlers.initialAllocation, allocation(home.id));
    const id = selected.status === 'committed' ? selected.result.id : '';
    expectRejected(
      await h.run(h.handlers.formalizeAcquisition, {
        ...(await h.coOwner(other.home.id)),
        operation_start_date: '2027-07-01',
        initial_allocation_id: id,
      }),
      'ERR_STATE_TRANSITION',
    );
    expectRejected(
      await h.run(h.handlers.formalizeAcquisition, {
        ...(await h.coOwner(home.id)),
        operation_start_date: '2027-07-02',
        initial_allocation_id: id,
      }),
      'ERR_STATE_TRANSITION',
    );
  });
  it('requires formalization, matching nonfuture base and a single operation start', async () => {
    const { home } = await h.root();
    expectRejected(await h.run(h.handlers.operationStart, start(home.id)), 'ERR_STATE_TRANSITION');
    expect(
      (
        await h.run(h.handlers.formalizeAcquisition, {
          ...(await h.owner(home.id)),
          operation_start_date: '2027-01-02',
        })
      ).status,
    ).toBe('committed');
    expectRejected(await h.run(h.handlers.operationStart, start(home.id)), 'ERR_STATE_TRANSITION');
    expectRejected(
      await h.run(h.handlers.operationStart, start(home.id, '2027-01-02')),
      'ERR_STATE_TRANSITION',
    );
    h.clock.set(new Date('2027-01-02T03:00:00Z'));
    expect((await h.run(h.handlers.operationStart, start(home.id, '2027-01-02'))).status).toBe(
      'committed',
    );
    expectRejected(
      await h.run(h.handlers.operationStart, start(home.id, '2027-01-02')),
      'ERR_STATE_TRANSITION',
    );
  });
  it('accepts continuous finite-to-open professional coverage; rejects gaps and only-finite contracts', async () => {
    const { home } = await h.root();
    expect((await h.run(h.handlers.formalizeAcquisition, await h.coOwner(home.id))).status).toBe(
      'committed',
    );
    expectRejected(await h.run(h.handlers.operationStart, start(home.id)), 'ERR_STATE_TRANSITION');
    expect(
      (await h.run(h.handlers.administration, await coverage(home.id, '2027-01-01', '2027-07-01')))
        .status,
    ).toBe('committed');
    expectRejected(await h.run(h.handlers.operationStart, start(home.id)), 'ERR_STATE_TRANSITION');
    expect(
      (await h.run(h.handlers.administration, await coverage(home.id, '2027-07-02'))).status,
    ).toBe('committed');
    expectRejected(await h.run(h.handlers.operationStart, start(home.id)), 'ERR_STATE_TRANSITION');
    expect(
      (await h.run(h.handlers.administration, await coverage(home.id, '2027-07-01', '2027-07-02')))
        .status,
    ).toBe('committed');
    expect((await h.run(h.handlers.operationStart, start(home.id))).status).toBe('committed');
  });
  it('preserves history and rejects a replacement that would open a gap in an operating home', async () => {
    const { home } = await h.root();
    expect((await h.run(h.handlers.formalizeAcquisition, await h.coOwner(home.id))).status).toBe(
      'committed',
    );
    const original = await h.run(h.handlers.administration, await coverage(home.id, '2027-01-01'));
    expect(original.status).toBe('committed');
    expect((await h.run(h.handlers.operationStart, start(home.id))).status).toBe('committed');
    const id = original.status === 'committed' ? original.result.id : '';
    expectRejected(
      await h.run(
        h.handlers.administration,
        await coverage(home.id, '2027-07-01', '2028-01-01', id),
      ),
      'ERR_STATE_TRANSITION',
    );
    const finite = await coverage(home.id, '2027-07-01', '2028-01-01', id);
    const open = await coverage(home.id, '2028-01-01');
    expect(
      (
        await h.run(h.handlers.administration, {
          ...finite,
          coverages: [...finite.coverages, ...open.coverages],
        })
      ).status,
    ).toBe('committed');
    expectRejected(
      await h.run(h.handlers.administration, await coverage(home.id, '2028-01-01', undefined, id)),
      'ERR_STATE_TRANSITION',
    );
    expect(
      await h.db
        .selectFrom('app.second_home_administration')
        .select('id')
        .where('second_home_id', '=', home.id)
        .execute(),
    ).toHaveLength(3);
  });
  it('does not extinguish an already formalized home when its Brand Partner subsequently terminates [BR-022]', async () => {
    const { home, partner } = await h.root();
    expect((await h.run(h.handlers.formalizeAcquisition, await h.coOwner(home.id))).status).toBe(
      'committed',
    );
    const termination = await h.catalog.run(h.catalog.handlers.terminateBrandPartner, {
      brand_partner_id: partner.id,
      termination_basis: 'Synthetic termination',
      terminated_effective_at: h.clock.now().toISOString(),
    });
    expect(termination.status).toBe('committed');
    expect(
      (await h.run(h.handlers.administration, await coverage(home.id, '2027-01-01'))).status,
    ).toBe('committed');
    expect((await h.run(h.handlers.operationStart, start(home.id))).status).toBe('committed');
  });
  it('requires the registered institution for full Luxtory administration', async () => {
    const { home } = await h.root();
    const input = await coverage(home.id, '2027-01-01');
    expectRejected(
      await h.run(h.handlers.administration, {
        ...input,
        coverages: [{ ...input.coverages[0], scope: 'full_luxtory_administration' }],
      }),
      'ERR_VALIDATION',
    );
    expect(
      (
        await h.run(h.handlers.administration, {
          ...input,
          coverages: [
            {
              ...input.coverages[0],
              scope: 'full_luxtory_administration',
              provider_party_id: h.institutionId,
            },
          ],
        })
      ).status,
    ).toBe('committed');
  });
});
