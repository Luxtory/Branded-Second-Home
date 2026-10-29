import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initialOrder } from '@/features/ownership/application/initial-draw-algorithm';
import { QUICKNET } from '@/features/ownership/domain/initial-draw';
import {
  readInitialDrawAdmin,
  readTitularInitialDraw,
  readTitularInitialDraws,
} from '@/features/ownership/presentation/initial-draw-read';
import { ownerDelegation } from '../../support/party-fixtures';
import { acquisitionHarness, type AcquisitionHarness } from './acquisition-support';
import { completeDraw, formalizedCoOwner, type FormalizedCoOwner } from './initial-draw-support';

describe('W9 evidência do sorteio sob RLS [PD-011]', () => {
  let h: AcquisitionHarness;
  let draw: FormalizedCoOwner;
  let titularUser: string;
  let ownStake: string;
  let parties: string[];

  beforeEach(async () => {
    h = await acquisitionHarness();
    // Holdings vigentes pelo relógio real do banco (RLS de holding usa now()).
    h.clock.set(new Date());
    draw = await formalizedCoOwner(h, 4);
    const holdings = await h.database.pool.query<{ party_id: string; stake_id: string }>(
      'SELECT party_id, stake_id FROM app.holding WHERE second_home_id = $1 ORDER BY stake_id',
      [draw.homeId],
    );
    parties = holdings.rows.map((row) => row.party_id);
    ownStake = holdings.rows[0]!.stake_id;
    titularUser = randomUUID();
    await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [titularUser]);
    await ownerDelegation(h.database.pool, {
      partyId: holdings.rows[0]!.party_id,
      userId: titularUser,
    });
  });
  afterEach(async () => h.close());

  const admin = () => ({
    userId: h.userId,
    role: 'admin' as const,
    roles: ['admin' as const],
    authorizationRef: `staff_role:${h.roleId}`,
  });

  it('[PD-011][TECH-093] a evidência mostra participantes, método e resultado ao Admin e ao Titular, sem identificar outros Co-Owners', async () => {
    await completeDraw(h);
    const forAdmin = await readInitialDrawAdmin(admin(), draw.homeId, { db: h.db });
    const forTitular = await readTitularInitialDraw({ userId: titularUser }, forAdmin!.drawId, {
      db: h.db,
    });
    for (const evidence of [forAdmin!, forTitular!]) {
      // Participantes: as N Ações na ordem congelada.
      expect(evidence.participants.map((p) => [p.ordinal, p.stakeId])).toEqual(
        draw.stakes.map((stake) => [stake.position, stake.id]),
      );
      // Método e insumo de aleatoriedade.
      expect(evidence.algorithm).toBe('fy-v1');
      expect(evidence.chainHash).toBe(QUICKNET.chainHash);
      expect(evidence.reveal!.round).toBe(evidence.targetRound);
      expect(evidence.reveal!.seed).toMatch(/^[0-9a-f]{64}$/);
      expect(evidence.reveal!.randomness).toMatch(/^[0-9a-f]{64}$/);
      expect(evidence.reveal!.signature).toMatch(/^[0-9a-f]{96}$/);
      expect(evidence.commitment).toMatch(/^[0-9a-f]{64}$/);
      expect(evidence.commitDeadline.getTime()).toBeLessThan(evidence.targetRoundAt.getTime());
      // Resultado reproduzível com os valores publicados.
      expect(evidence.reveal!.positions.map((p) => p.ordinal)).toEqual(
        initialOrder(
          Buffer.from(evidence.reveal!.seed, 'hex'),
          Buffer.from(evidence.reveal!.randomness, 'hex'),
          4,
        ),
      );
    }
    // Só a Ação do Titular aparece destacada; nenhum identificador de pessoa ou empresa nem operação.
    expect(forTitular!.participants.filter((p) => p.mine).map((p) => p.stakeId)).toEqual([
      ownStake,
    ]);
    expect(forAdmin!.participants.some((p) => p.mine)).toBe(false);
    const titularJson = JSON.stringify(forTitular);
    for (const party of parties) expect(titularJson).not.toContain(party);
    expect(titularJson).not.toContain(draw.operationId);
    // A leitura administrativa é auditada.
    const audited = await h.database.pool.query(
      "SELECT count(*)::int AS n FROM app.audit_log WHERE event_type = 'admin_read' AND object_type = 'initial_draw'",
    );
    expect(audited.rows[0].n).toBe(1);
  });

  it('[PD-011] antes da revelação o Titular vê o compromisso e a rodada, nunca a seed', async () => {
    await completeDraw(h, { reveal: false });
    const [listed] = await readTitularInitialDraws({ userId: titularUser }, { db: h.db });
    expect(listed).toMatchObject({ secondHomeId: draw.homeId, revealed: false });
    const evidence = await readTitularInitialDraw({ userId: titularUser }, listed!.drawId, {
      db: h.db,
    });
    expect(evidence!.commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence!.reveal).toBeNull();
    const seed = await h.db.transaction().execute(async (tx) => {
      const { sql } = await import('kysely');
      await sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: titularUser, role: 'authenticated' })}, true)`.execute(
        tx,
      );
      await sql`SET LOCAL ROLE authenticated`.execute(tx);
      return (
        await sql<{ n: number }>`SELECT count(*)::int AS n FROM app.initial_draw_seed`.execute(tx)
      ).rows[0]!.n;
    });
    expect(seed).toBe(0);
  });

  it('[TECH-052] quem não é titular da Second Home não vê o sorteio', async () => {
    await completeDraw(h, { reveal: false });
    const stranger = randomUUID();
    await h.database.pool.query('INSERT INTO auth.users(id) VALUES ($1)', [stranger]);
    const [listed] = await readTitularInitialDraws({ userId: titularUser }, { db: h.db });
    expect(await readTitularInitialDraws({ userId: stranger }, { db: h.db })).toEqual([]);
    expect(
      await readTitularInitialDraw({ userId: stranger }, listed!.drawId, { db: h.db }),
    ).toBeNull();
  });
});
