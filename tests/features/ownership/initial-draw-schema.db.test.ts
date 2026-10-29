import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roundTime } from '@/features/ownership/domain/initial-draw';
import { acquisitionHarness, type AcquisitionHarness } from './acquisition-support';
import {
  formalizedCoOwner,
  insertCommitment,
  sha256,
  waitUntil,
  type CommitmentRows,
  type FormalizedCoOwner,
} from './initial-draw-support';

const DRAW_TABLES = [
  'initial_draw',
  'initial_draw_participant',
  'initial_draw_seed',
  'initial_draw_reveal',
  'initial_draw_position',
  'initial_draw_commit_evidence',
] as const;

describe('W9 sorteio no PostgreSQL real [TECH-093]', () => {
  let h: AcquisitionHarness;
  let draw: FormalizedCoOwner;

  beforeEach(async () => {
    h = await acquisitionHarness();
    draw = await formalizedCoOwner(h, 4);
  });
  afterEach(async () => h.close());

  const count = async (table: (typeof DRAW_TABLES)[number]) =>
    Number((await h.database.pool.query(`SELECT count(*) FROM app.${table}`)).rows[0].count);

  const commit = (options: Parameters<typeof insertCommitment>[2] = {}) =>
    h.db.transaction().execute((tx) => insertCommitment(tx, draw, options));

  async function reveal(
    rows: CommitmentRows,
    overrides: { round?: number; positions?: number } = {},
  ) {
    const signature = randomBytes(48);
    // T-910: a revelação exige a evidência do COMMIT (calculada pelo servidor, em transação posterior ao compromisso).
    await h.db
      .insertInto('app.initial_draw_commit_evidence')
      .values({ draw_id: rows.drawId, committed_at: new Date(0) })
      .onConflict((conflict) => conflict.column('draw_id').doNothing())
      .execute();
    return h.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('app.initial_draw_reveal')
        .values({
          draw_id: rows.drawId,
          beacon_round: String(overrides.round ?? rows.round),
          beacon_signature: signature,
          beacon_randomness: sha256(signature),
          source_event_id: await scheduleEvent(),
        })
        .execute();
      const stakes = draw.stakes.slice(0, overrides.positions ?? draw.stakes.length);
      for (const [index, stake] of stakes.entries()) {
        await tx
          .insertInto('app.initial_draw_position')
          .values({ draw_id: rows.drawId, position: index + 1, stake_id: stake.id })
          .execute();
      }
    });
  }

  async function scheduleEvent(): Promise<string> {
    const id = randomUUID();
    await h.database.pool.query(
      `INSERT INTO app.outbox (id, operation_id, event_type, dedup_key, payload, occurred_at)
       VALUES ($1, $2, 'ownership.initial_draw_committed', $3, '{}', now())`,
      [id, draw.operationId, `test:${id}`],
    );
    return id;
  }

  it('[TECH-093] grava compromisso, participantes e seed numa transação dentro do prazo', async () => {
    const rows = await commit();
    expect(await count('initial_draw')).toBe(1);
    expect(await count('initial_draw_participant')).toBe(4);
    expect(rows.deadline.getTime()).toBeLessThan(roundTime(rows.round).getTime());
  });

  it('[TECH-093] o compromisso só se torna durável antes do prazo que antecede a rodada', async () => {
    const late = h.db.transaction().execute(async (tx) => {
      // transaction_timeout maior que o prazo: só o gatilho diferido, no COMMIT efetivo, decide.
      const rows = await insertCommitment(tx, draw, { deadlineMs: 600, timeoutMs: 5_000 });
      await sql`SELECT pg_sleep(0.9)`.execute(tx);
      return rows;
    });
    await expect(late).rejects.toThrow(/commit deadline exceeded at commit/);
    expect(await count('initial_draw')).toBe(0);
    expect(await count('initial_draw_seed')).toBe(0);
  });

  it('[TECH-093] transação de compromisso atrasada além do transaction_timeout é encerrada sem efeito', async () => {
    const stalled = h.db.transaction().execute(async (tx) => {
      const rows = await insertCommitment(tx, draw, { deadlineMs: 600 });
      await new Promise((resolve) => setTimeout(resolve, 900));
      return rows;
    });
    await expect(stalled).rejects.toThrow();
    expect(await count('initial_draw')).toBe(0);
  });

  it('[TECH-093] o banco carimba o instante do compromisso, ignorando o da aplicação', async () => {
    const before = Date.now();
    await commit({ recordedAt: new Date('2020-01-01T00:00:00Z') });
    const { rows } = await h.database.pool.query<{ recorded_at: Date }>(
      'SELECT recorded_at FROM app.initial_draw',
    );
    expect(rows[0]!.recorded_at.getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('[TECH-093] o banco recusa compromisso sem transaction_timeout armado na transação', async () => {
    await expect(commit({ armTimeout: false })).rejects.toThrow(/transaction_timeout/);
  });

  it.each([
    [
      'rodada fora da fórmula',
      {
        roundOverride: (r: number) => ({ round: r, at: new Date(roundTime(r).getTime() + 1_000) }),
      },
    ],
    [
      'rodada que não sucede o prazo',
      { roundOverride: (r: number) => ({ round: r - 2, at: roundTime(r - 2) }) },
    ],
    ['compromisso diferente da seed', { commitment: Buffer.alloc(32, 7) }],
    ['N diferente da configuração', { participantCount: 2 }],
  ])('[TECH-093] recusa %s', async (_label, options) => {
    await expect(commit(options)).rejects.toThrow();
    expect(await count('initial_draw')).toBe(0);
  });

  it.each([
    ['Ação faltando', (d: FormalizedCoOwner) => d.stakes.slice(0, 3)],
    [
      'ordem diferente de allocation_position',
      (d: FormalizedCoOwner) =>
        d.stakes.map((s, i) => ({
          id: s.id,
          position: d.stakes[(i + 1) % d.stakes.length]!.position,
        })),
    ],
  ])('[TECH-093] participantes inválidos: %s', async (_label, participants) => {
    await expect(commit({ participants: participants(draw) })).rejects.toThrow();
    expect(await count('initial_draw_participant')).toBe(0);
  });

  it('[TECH-093] Ação de outra aquisição não participa', async () => {
    const other = await formalizedCoOwner(h, 4);
    const mixed = [...draw.stakes.slice(0, 3), other.stakes[3]!];
    await expect(commit({ participants: mixed })).rejects.toThrow();
  });

  it('[TECH-093] Owner não tem sorteio e uma aquisição tem um único sorteio', async () => {
    await commit();
    await expect(commit()).rejects.toThrow();
    const { home } = await h.root();
    expect((await h.run(h.handlers.formalizeAcquisition, await h.owner(home.id))).status).toBe(
      'committed',
    );
    const owner = await h.db
      .selectFrom('app.acquisition')
      .select(['id', 'operation_id'])
      .where('second_home_id', '=', home.id)
      .executeTakeFirstOrThrow();
    const ownerDraw = {
      ...draw,
      homeId: home.id,
      acquisitionId: owner.id,
      operationId: owner.operation_id,
      stakes: [],
    };
    await expect(
      h.db
        .transaction()
        .execute((tx) =>
          insertCommitment(
            tx,
            { ...ownerDraw, scheduledEventId: draw.scheduledEventId },
            { participantCount: 2 },
          ),
        ),
    ).rejects.toThrow();
  });

  it('[TECH-093] revelação só depois da rodada, na rodada fixada e com permutação completa', async () => {
    const rows = await commit({ deadlineMs: 300 });
    await expect(reveal(rows)).rejects.toThrow(/before its round/);
    await waitUntil(roundTime(rows.round));
    await expect(reveal(rows, { round: rows.round + 1 })).rejects.toThrow(/target round/);
    await expect(reveal(rows, { positions: 3 })).rejects.toThrow(/permutation/);
    expect(await count('initial_draw_reveal')).toBe(0);
    await reveal(rows);
    expect(await count('initial_draw_position')).toBe(4);
    await expect(reveal(rows)).rejects.toThrow();
  });

  it('[TECH-093] randomness precisa ser SHA-256 da assinatura', async () => {
    const rows = await commit({ deadlineMs: 300 });
    await waitUntil(roundTime(rows.round));
    await h.database.pool.query(
      'INSERT INTO app.initial_draw_commit_evidence (draw_id, committed_at) VALUES ($1, now())',
      [rows.drawId],
    );
    await expect(
      h.database.pool.query(
        `INSERT INTO app.initial_draw_reveal VALUES ($1, $2, $3, $4, now(), $5)`,
        [rows.drawId, rows.round, randomBytes(48), randomBytes(32), await scheduleEvent()],
      ),
    ).rejects.toThrow(/initial_draw_reveal_randomness/);
  });

  it('[TECH-110] rollback das migrations W9 não descarta sorteios nem eventos agendados', async () => {
    await commit();
    await h.database.pool.query(
      `INSERT INTO app.outbox (id, operation_id, event_type, dedup_key, payload, occurred_at, available_at)
       VALUES ($1, $2, 'ownership.initial_draw_committed', $3, '{}', now(), now() + interval '1 hour')`,
      [randomUUID(), draw.operationId, `test:${randomUUID()}`],
    );
    for (const migration of [
      '20261029051805_ownership_initial_draw_commit_evidence',
      '20261028230907_ownership_initial_draw',
      '20261028230905_platform_outbox_available_at',
    ]) {
      const down = (await readFile(`migrations/${migration}.sql`, 'utf8')).split(
        '-- migrate:down',
      )[1];
      const client = await h.database.pool.connect();
      try {
        await client.query('BEGIN');
        await expect(client.query(down!)).rejects.toThrow(/rollback/i);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }
    expect(await count('initial_draw')).toBe(1);
  });

  it('[TECH-093] tabelas do sorteio não aceitam UPDATE, DELETE nem TRUNCATE', async () => {
    const rows = await commit({ deadlineMs: 300 });
    await waitUntil(roundTime(rows.round));
    await reveal(rows);
    for (const table of DRAW_TABLES) {
      for (const statement of [
        `UPDATE app.${table} SET draw_id = draw_id`,
        `DELETE FROM app.${table}`,
        `TRUNCATE app.${table} CASCADE`,
      ]) {
        const sqlText =
          table === 'initial_draw' ? statement.replace('draw_id = draw_id', 'id = id') : statement;
        await expect(h.database.pool.query(sqlText)).rejects.toThrow();
      }
    }
    expect(await count('initial_draw')).toBe(1);
  });
});
