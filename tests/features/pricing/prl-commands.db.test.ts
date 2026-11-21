import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrlHandlers } from '@/features/pricing/prl';
import type { BookingHarness, OwnerScenario } from '../booking/booking-support';
import { NEXT_YEAR } from '../calendar/sealing-support';
import { addStaff, pricingHarness, staffRunner, type Staff } from './pricing-support';

/** W16 E3 — `publish_initial_prl` e `change_published_prl` pelo executor real (TECH-054; REQ-013, REQ-052). */
const next = (monthDay: string) => `${NEXT_YEAR}-${monthDay}`;
const HOUR_MS = 3_600_000;

describe('W16 E3 — commands de PRL pelo executor real (REQ-013, REQ-052, TECH-051)', () => {
  let h: BookingHarness;
  let owner: OwnerScenario;
  let run: ReturnType<typeof staffRunner>;
  let admin: Staff;
  let superAdmin: Staff;
  const prl = createPrlHandlers();

  const input = (
    nights: readonly (readonly [string, string])[],
    extra: Record<string, unknown> = {},
  ) => ({
    second_home_id: owner.homeId,
    nights: nights.map(([stay_date, amount_minor]) => ({ stay_date, amount_minor })),
    effective_from: null,
    basis: 'Ata Luxtory W16',
    ...extra,
  });

  async function versions(stayDate: string) {
    const { rows } = await h.database.pool.query<{
      amount_minor: string;
      kind: string;
      authority: string;
    }>(
      `SELECT amount_minor, kind, authority FROM app.prl_version
        WHERE second_home_id = $1 AND stay_date = $2 ORDER BY effective_from`,
      [owner.homeId, stayDate],
    );
    return rows;
  }

  beforeAll(async () => {
    ({ h, owner } = await pricingHarness());
    run = staffRunner(h);
    admin = await addStaff(h, 'admin');
    superAdmin = await addStaff(h, 'super_admin');
  });

  afterAll(() => h.close());

  it('[REQ-013][TECH-030] Admin publica o PRL inicial: resultado, operação, auditoria e versões', async () => {
    const outcome = await run.as(
      admin,
      prl.publishInitialPrl,
      input([
        [next('03-02'), '30002'],
        [next('03-01'), '30001'],
      ]),
    );
    expect(outcome).toMatchObject({
      status: 'committed',
      result: {
        kind: 'initial',
        currency: 'BRL',
        nights_count: 2,
        first_stay_date: next('03-01'),
        last_stay_date: next('03-02'),
      },
    });
    if (outcome.status !== 'committed') throw new Error('unreachable');
    const result = outcome.result;
    const { rows } = await h.database.pool.query(
      `SELECT o.command, o.role, o.state, a.object_type, a.after->>'nights_count' AS nights
         FROM app.operation o JOIN app.audit_log a ON a.operation_id = o.id
        WHERE o.id = $1`,
      [result.operation_id],
    );
    expect(rows).toEqual([
      {
        command: 'publish_initial_prl',
        role: 'admin',
        state: 'committed',
        object_type: 'prl_publication',
        nights: '2',
      },
    ]);
    expect(await versions(next('03-01'))).toEqual([
      { amount_minor: '30001', kind: 'initial', authority: 'admin' },
    ]);
  });

  it('[REQ-013] o Super Admin também publica o PRL inicial; o Admin não altera, o Super Admin altera', async () => {
    expect(
      await run.as(superAdmin, prl.publishInitialPrl, input([[next('03-03'), '30003']])),
    ).toMatchObject({ status: 'committed', result: { kind: 'initial' } });
    expect(await run.as(admin, prl.changePublishedPrl, input([[next('03-01'), '31001']]))).toEqual(
      expect.objectContaining({ status: 'rejected', code: 'ERR_PERMISSION' }),
    );
    // Admin declarando o papel Super Admin sem a atribuição: o guard nega.
    expect(
      await run.as(admin, prl.changePublishedPrl, input([[next('03-01'), '31001']]), {
        role: 'super_admin',
      }),
    ).toEqual(expect.objectContaining({ status: 'rejected', code: 'ERR_PERMISSION' }));
    expect(
      await run.as(superAdmin, prl.changePublishedPrl, input([[next('03-01'), '31001']])),
    ).toMatchObject({ status: 'committed', result: { kind: 'change' } });
    expect(
      (await versions(next('03-01'))).map((v) => [v.amount_minor, v.kind, v.authority]),
    ).toEqual([
      ['30001', 'initial', 'admin'],
      ['31001', 'change', 'super_admin'],
    ]);
  });

  it('[TECH-050] sem MFA (AAL1) nenhum command de PRL passa', async () => {
    expect(
      await run.as(admin, prl.publishInitialPrl, input([[next('03-04'), '1']]), {
        assurance: 'aal1',
      }),
    ).toEqual(expect.objectContaining({ status: 'rejected', code: 'ERR_PERMISSION' }));
  });

  it('[REQ-013][REQ-052] recusas funcionais fecham antes de gravar: noite publicada, não publicada, não selada, início retroativo ou não posterior', async () => {
    const reject = async (outcome: Promise<unknown>, code: string) =>
      expect(await outcome).toEqual(expect.objectContaining({ status: 'rejected', code }));
    await reject(
      run.as(
        admin,
        prl.publishInitialPrl,
        input([
          [next('03-05'), '1'],
          [next('03-01'), '1'],
        ]),
      ),
      'ERR_STATE_TRANSITION',
    );
    await reject(
      run.as(superAdmin, prl.changePublishedPrl, input([[next('03-20'), '1']])),
      'ERR_STATE_TRANSITION',
    );
    await reject(
      run.as(admin, prl.publishInitialPrl, input([[`${NEXT_YEAR + 1}-01-10`, '1']])),
      'ERR_STATE_TRANSITION',
    );
    await reject(
      run.as(
        superAdmin,
        prl.changePublishedPrl,
        input([[next('03-03'), '1']], {
          effective_from: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
      'ERR_STATE_TRANSITION',
    );
    const scheduled = new Date(Date.now() + 2 * HOUR_MS).toISOString();
    expect(
      await run.as(
        superAdmin,
        prl.changePublishedPrl,
        input([[next('03-03'), '32003']], {
          effective_from: scheduled,
        }),
      ),
    ).toMatchObject({ status: 'committed', result: { effective_from: scheduled } });
    // Imediata ou antes da agendada: nunca antecipa a versão agendada.
    await reject(
      run.as(superAdmin, prl.changePublishedPrl, input([[next('03-03'), '1']])),
      'ERR_STATE_TRANSITION',
    );
    await reject(
      run.as(
        superAdmin,
        prl.changePublishedPrl,
        input([[next('03-03'), '1']], {
          effective_from: new Date(Date.now() + HOUR_MS).toISOString(),
        }),
      ),
      'ERR_STATE_TRANSITION',
    );
    expect(await versions(next('03-05'))).toEqual([]);
    expect((await versions(next('03-03'))).map((v) => v.amount_minor)).toEqual(['30003', '32003']);
  });

  it('[TECH-033][TECH-056] entrada inválida → ERR_VALIDATION; Second Home inexistente → ERR_NOT_FOUND', async () => {
    const invalid = [
      input([[next('03-06'), '0']]),
      input([[next('03-06'), '12.5']]),
      input([[next('03-06'), '1000000000000000']]),
      {
        ...input([[next('03-06'), '1']]),
        nights: [{ stay_date: next('03-06'), amount_minor: 1000 }],
      },
      input([
        [next('03-06'), '1'],
        [next('03-06'), '2'],
      ]),
      input([]),
      input(
        Array.from(
          { length: 367 },
          (_, i) =>
            [new Date(Date.UTC(NEXT_YEAR, 0, 1 + i)).toISOString().slice(0, 10), '1'] as const,
        ),
      ),
      input([[next('03-06'), '1']], { basis: '   ' }),
      input([[next('03-06'), '1']], { basis: 'contato@exemplo.com' }),
      input([[next('03-06'), '1']], { currency: 'BRL' }),
    ];
    for (const body of invalid)
      expect(await run.as(admin, prl.publishInitialPrl, body)).toEqual(
        expect.objectContaining({ status: 'rejected', code: 'ERR_VALIDATION' }),
      );
    expect(
      await run.as(admin, prl.publishInitialPrl, {
        ...input([[next('03-06'), '1']]),
        second_home_id: randomUUID(),
      }),
    ).toEqual(expect.objectContaining({ status: 'rejected', code: 'ERR_NOT_FOUND' }));
    expect(await versions(next('03-06'))).toEqual([]);
  });

  it('[REQ-015][TECH-056] mesma chave e mesmo corpo → replay sem nova versão; mesma chave e outro corpo → ERR_IDEMPOTENCY_CONFLICT', async () => {
    const key = randomUUID();
    const body = input([[next('03-07'), '30007']]);
    const first = await run.as(admin, prl.publishInitialPrl, body, { key });
    const replay = await run.as(admin, prl.publishInitialPrl, body, { key });
    expect(replay).toMatchObject({ status: 'committed', replayed: true });
    if (first.status !== 'committed' || replay.status !== 'committed')
      throw new Error('unreachable');
    expect(replay.result).toEqual(first.result);
    expect(
      await run.as(admin, prl.publishInitialPrl, input([[next('03-07'), '30008']]), { key }),
    ).toEqual(expect.objectContaining({ status: 'rejected', code: 'ERR_IDEMPOTENCY_CONFLICT' }));
    expect(await versions(next('03-07'))).toEqual([
      { amount_minor: '30007', kind: 'initial', authority: 'admin' },
    ]);
  });

  it('[TECH-052] nenhum valor de PRL nem base vai a log', () => {
    const text = JSON.stringify(run.logs());
    expect(text).not.toContain('30001');
    expect(text).not.toContain('Ata Luxtory W16');
  });
});
