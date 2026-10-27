import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquisitionHarness, factCounts, type AcquisitionHarness } from './acquisition-support';
import { expectRejected } from '../../support/catalog-fixtures';

describe('W8 formalization using the real guard, registry, executor and PostgreSQL [REQ-010] [REQ-022] [REQ-024] [REQ-025] [REQ-026]', () => {
  let h: AcquisitionHarness;
  beforeAll(async () => {
    h = await acquisitionHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('creates exactly one integral Owner; replay and another key cannot create a second acquisition', async () => {
    const { home } = await h.root();
    const input = await h.owner(home.id);
    expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    const key = randomUUID();
    const result = await h.run(h.handlers.formalizeAcquisition, input, key);
    expect(result.status).toBe('committed');
    expect(await factCounts(h.db, home.id)).toEqual([1, 1, 0, 0, 0]);
    const holding = await h.db
      .selectFrom('app.holding')
      .select(['role', 'participation_bps', 'stake_id'])
      .where('second_home_id', '=', home.id)
      .executeTakeFirstOrThrow();
    expect(holding).toEqual({ role: 'owner', participation_bps: 10000, stake_id: null });
    expect(await h.run(h.handlers.formalizeAcquisition, input, key)).toMatchObject({
      ...result,
      replayed: true,
    });
    expectRejected(
      await h.run(h.handlers.formalizeAcquisition, { ...input, location: 'Different' }, key),
      'ERR_IDEMPOTENCY_CONFLICT',
    );
    expectRejected(await h.run(h.handlers.formalizeAcquisition, input), 'ERR_STATE_TRANSITION');
  });
  it.each([
    [10, 1000, 10, 25],
    [8, 1250, 12, 32],
    [4, 2500, 24, 64],
    [2, 5000, 48, 128],
  ])(
    'formalizes configuration %i with equivalent holdings, grants and one pending draw',
    async (n, bps, alta, media) => {
      const { home } = await h.root();
      const input = await h.coOwner(home.id, n);
      const result = await h.run(h.handlers.formalizeAcquisition, input);
      expect(result.status).toBe('committed');
      expect(await factCounts(h.db, home.id)).toEqual([1, n, n, 1, 2 * n]);
      expect(
        (
          await h.db
            .selectFrom('app.holding')
            .select('participation_bps')
            .where('second_home_id', '=', home.id)
            .execute()
        ).every((row) => row.participation_bps === bps),
      ).toBe(true);
      const grants = await h.db
        .selectFrom('app.use_right_ledger')
        .select(['bucket', 'quantity', 'source'])
        .where('second_home_id', '=', home.id)
        .execute();
      expect(grants.filter((g) => g.bucket === 'alta')).toEqual(
        Array.from({ length: n }, () => ({
          bucket: 'alta',
          quantity: alta,
          source: 'configuration',
        })),
      );
      expect(grants.filter((g) => g.bucket === 'media')).toEqual(
        Array.from({ length: n }, () => ({
          bucket: 'media',
          quantity: media,
          source: 'configuration',
        })),
      );
      const outbox = await h.db
        .selectFrom('app.outbox')
        .select(['event_type', 'payload', 'attempts', 'delivered_at'])
        .where('operation_id', '=', result.operationId!)
        .execute();
      expect(outbox).toEqual([
        {
          event_type: 'ownership.initial_draw_scheduled',
          payload: {
            acquisition_id: result.status === 'committed' ? result.result.id : '',
            second_home_id: home.id,
          },
          attempts: 0,
          delivered_at: null,
        },
      ]);
    },
  );
  it('refuses CPF SPE, institutional shareholder and nonexistent party with zero rights', async () => {
    for (const kind of ['cpf', 'institution', 'missing'] as const) {
      const { home } = await h.root();
      const input = await h.coOwner(home.id);
      const bad =
        kind === 'cpf'
          ? { ...input, spe_party_id: await h.party() }
          : {
              ...input,
              acquirer_party_ids: [
                input.acquirer_party_ids[0],
                kind === 'institution' ? h.institutionId : randomUUID(),
              ],
            };
      expectRejected(
        await h.run(h.handlers.formalizeAcquisition, bad),
        kind === 'missing' ? 'ERR_NOT_FOUND' : 'ERR_VALIDATION',
      );
      expect(await factCounts(h.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    }
  });
  it('does not require the latest approved concept version or public visibility', async () => {
    const { home, homeEdition, homeConceptId, version } = await h.root();
    await h.catalog.build.publish(homeEdition.id);
    expect(
      (
        await h.catalog.run(h.catalog.handlers.withdrawHomeEdition, {
          home_edition_id: homeEdition.id,
          withdrawal_basis: 'Synthetic withdrawal',
        })
      ).status,
    ).toBe('committed');
    const next = await h.catalog.build.version(homeConceptId);
    await h.catalog.build.approve(next.id);
    expect((await h.run(h.handlers.formalizeAcquisition, await h.owner(home.id))).status).toBe(
      'committed',
    );
    expect(
      (
        await h.db
          .selectFrom('app.second_home')
          .select('home_concept_version_id')
          .where('id', '=', home.id)
          .executeTakeFirstOrThrow()
      ).home_concept_version_id,
    ).toBe(version.id);
  });
  it('requires institutional configuration before Co-Owner effects', async () => {
    const empty = await acquisitionHarness(false);
    try {
      const { home } = await empty.root();
      expectRejected(
        await empty.run(empty.handlers.formalizeAcquisition, await empty.coOwner(home.id)),
        'ERR_PARAMETER_MISSING',
      );
      expect(await factCounts(empty.db, home.id)).toEqual([0, 0, 0, 0, 0]);
    } finally {
      await empty.close();
    }
  });
  it('allows one party to be Owner of one home and Co-Owner of another without a global titular role [REQ-010]', async () => {
    const first = await h.root();
    const other = await h.root();
    const owner = await h.owner(first.home.id);
    expect((await h.run(h.handlers.formalizeAcquisition, owner)).status).toBe('committed');
    const coOwner = await h.coOwner(other.home.id);
    expect(
      (
        await h.run(h.handlers.formalizeAcquisition, {
          ...coOwner,
          acquirer_party_ids: [owner.acquirer_party_ids[0], coOwner.acquirer_party_ids[1]],
        })
      ).status,
    ).toBe('committed');
    const roles = await h.db
      .selectFrom('app.holding')
      .select('role')
      .where('party_id', '=', owner.acquirer_party_ids[0]!)
      .orderBy('role')
      .execute();
    expect(roles).toEqual([{ role: 'co_owner' }, { role: 'owner' }]);
    expectRejected(
      await h.run(h.handlers.formalizeAcquisition, { ...coOwner, second_home_id: first.home.id }),
      'ERR_STATE_TRANSITION',
    );
    expect(await factCounts(h.db, first.home.id)).toEqual([1, 1, 0, 0, 0]);
  });
});
