import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationDown } from '../support/catalog-snapshot';
import { connect, deactivate } from '../features/booking/lifecycle-support';
import { reactivate, secondTitular, suspend } from '../features/credits/credits-support';
import {
  activeCustody,
  book,
  cedeOwnerNight,
  coOwnerTitular,
  depositDate,
  depositHarness,
  depositRunner,
  economicFacts,
  expectedCredits,
  insertDepositLot,
  openDepositOperation,
  publishPrl,
  recordDepositSnapshot,
  type CreditTitular,
  type DepositHarness,
} from '../features/luxchange/luxchange-support';
import { TEST_VALIDITY_MONTHS } from '../features/credits/credits-support';

/**
 * W20 E1 — barreiras do banco do depósito (ADR-0036 §3–§7): o papel da aplicação (`luxtory_app`) tenta gravar fatos de
 * depósito por SQL direto, como um servidor comprometido, e o PostgreSQL recusa tudo o que não for o depósito completo,
 * do Titular, das noites do snapshot, com a quantidade da BR-201.
 */
const FIRST_W20 = '20261123211619_luxchange_deposit';
const PRL = '45678';

const constraint = (name: string) => expect.objectContaining({ constraint: name });

describe('W20 — barreiras do depósito no banco (REQ-060, INV-2, INV-3, INV-6)', () => {
  let d: DepositHarness;
  let owner: CreditTitular;
  const night = (offset: number) => depositDate(offset);

  beforeAll(async () => {
    d = await depositHarness();
    owner = d.c.titular;
    await publishPrl(
      d,
      owner.homeId,
      Object.fromEntries(Array.from({ length: 12 }, (_, i) => [night(i), PRL])),
    );
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  /** Uma transação do `luxtory_app` com a operação `pending` do depósito, marcada `committed` e confirmada no fim. */
  async function forge(
    work: (client: pg.Client, op: string) => Promise<unknown>,
    options: { titular?: CreditTitular; homeId?: string } = {},
  ): Promise<void> {
    const client = await connect(d.c.h.database.appUrl);
    try {
      await client.query('BEGIN');
      const op = await openDepositOperation(
        client,
        options.titular ?? owner,
        options.homeId ?? owner.homeId,
      );
      await work(client, op);
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  const quantity = (nights: number) => expectedCredits(BigInt(PRL) * BigInt(nights));

  it('[REQ-060][ADR-0036 §6] o depósito completo forjado com os fatos certos confirma (controle)', async () => {
    await forge(async (client, op) => {
      await recordDepositSnapshot(client, op, owner.homeId, [night(0)]);
      await insertDepositLot(client, op, owner.partyId, quantity(1));
      await cedeOwnerNight(client, op, owner.homeId, night(0));
    });
  });

  it('[INV-6][REQ-060] Créditos sem capacidade cedida → recusado no COMMIT', async () => {
    const before = await economicFacts(d.c.h.database.pool);
    await expect(
      forge(async (client, op) => {
        await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
        await insertDepositLot(client, op, owner.partyId, quantity(1));
      }),
    ).rejects.toEqual(constraint('luxchange_deposit_complete'));
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
  });

  it('[INV-2][REQ-060] cessão sem Créditos → recusada no COMMIT', async () => {
    await expect(
      forge(async (client, op) => {
        await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
        await cedeOwnerNight(client, op, owner.homeId, night(1));
      }),
    ).rejects.toEqual(constraint('luxchange_deposit_complete'));
  });

  it('[BR-201] quantidade diferente de Σ PRL × multiplicador do snapshot → recusada', async () => {
    await expect(
      forge(async (client, op) => {
        await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
        await insertDepositLot(client, op, owner.partyId, expectedCredits(BigInt(PRL) + 1n));
      }),
    ).rejects.toEqual(constraint('credit_lot_deposit_quantity'));
  });

  it('[REQ-052] noite fora do snapshot ou versão de PRL que não é a vigente → recusada', async () => {
    await expect(
      forge(async (client, op) => {
        await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
        await insertDepositLot(client, op, owner.partyId, quantity(1));
        await cedeOwnerNight(client, op, owner.homeId, night(2));
      }),
    ).rejects.toEqual(constraint('luxchange_deposit_snapshot'));
    const { rows } = await d.c.h.database.pool.query<{ id: string }>(
      `SELECT id FROM app.prl WHERE second_home_id = $1 AND stay_date = $2`,
      [owner.homeId, night(3)],
    );
    await expect(
      forge(async (client, op) => {
        await client.query(
          `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
          [op],
        );
        await client.query(
          `INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
           VALUES ($1, $2, $3, $4)`,
          [op, owner.homeId, night(2), rows[0]!.id],
        );
      }),
    ).rejects.toEqual(constraint('economic_snapshot_night_version'));
  });

  it('[INV-3][BR-161] cessão sem a referência do depósito → recusada', async () => {
    await expect(
      forge(async (client, op) => {
        await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
        await insertDepositLot(client, op, owner.partyId, quantity(1));
        await cedeOwnerNight(client, op, owner.homeId, night(1), 'Ata qualquer');
      }),
    ).rejects.toEqual(constraint('custody_deposit_successor'));
  });

  it('[TECH-050] operação de outra Second Home ou party sem a holding → recusada', async () => {
    const other = await secondTitular(d.c);
    await expect(
      forge(
        async (client, op) => {
          await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
          await cedeOwnerNight(client, op, owner.homeId, night(1));
        },
        { titular: other, homeId: other.homeId },
      ),
    ).rejects.toEqual(constraint('luxchange_deposit_binding'));
    await expect(
      forge(
        async (client, op) => {
          await recordDepositSnapshot(client, op, owner.homeId, [night(1)]);
          await cedeOwnerNight(client, op, owner.homeId, night(1));
        },
        { titular: other, homeId: owner.homeId },
      ),
    ).rejects.toEqual(constraint('permission_representation'));
  });

  it('[TECH-043] noite a menos de 14 dias do check-in → recusada pelo relógio do banco', async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await publishPrl(d, owner.homeId, { [soon]: PRL });
    await expect(
      forge(async (client, op) => {
        await recordDepositSnapshot(client, op, owner.homeId, [soon]);
        await cedeOwnerNight(client, op, owner.homeId, soon);
      }),
    ).rejects.toEqual(constraint('deposit_min_notice'));
  });

  it('[BR-146] Membership suspenso → recusado no banco', async () => {
    await suspend(d.c, owner.partyId);
    try {
      await expect(
        forge(async (client, op) => {
          await recordDepositSnapshot(client, op, owner.homeId, [night(4)]);
          await cedeOwnerNight(client, op, owner.homeId, night(4));
        }),
      ).rejects.toEqual(constraint('credit_membership_ineligible'));
    } finally {
      await reactivate(d.c, owner.partyId);
    }
  });

  it('[ADR-0036 §7] sem a K6, o papel da aplicação não grava cessão', async () => {
    await deactivate(d.c.h, 'luxchange_deposit');
    try {
      await expect(
        forge(async (client, op) => {
          await recordDepositSnapshot(client, op, owner.homeId, [night(5)]);
          await cedeOwnerNight(client, op, owner.homeId, night(5));
        }),
      ).rejects.toEqual(constraint('luxchange_deposit_not_activated'));
    } finally {
      await d.c.h.database.pool.query(
        `INSERT INTO app.capability_activation VALUES ('luxchange_deposit', now(), 'test:activation')`,
      );
    }
  });

  it('[TECH-052] snapshot por noite é só-inserção, até para o dono do schema', async () => {
    await expect(
      d.c.h.database.pool.query(`UPDATE app.economic_snapshot_night SET stay_date = stay_date`),
    ).rejects.toThrow();
    await expect(d.c.h.database.pool.query(`DELETE FROM app.economic_snapshot_night`)).rejects.toThrow();
  });

  it('[TECH-110] desfazer a W20 com fatos de depósito é recusado', async () => {
    await expect(d.c.h.database.pool.query(await migrationDown(FIRST_W20))).rejects.toThrow(
      /W20 rollback would discard deposit facts/,
    );
  });
});

describe('W20 — barreiras do depósito do Co-Owner no banco (REQ-060, TECH-022, TECH-023)', () => {
  let d: DepositHarness;
  let co: CreditTitular;
  const PRICE = '33333';

  beforeAll(async () => {
    d = await depositHarness();
    co = await coOwnerTitular(d);
    await publishPrl(
      d,
      co.homeId,
      Object.fromEntries(Array.from({ length: 12 }, (_, i) => [depositDate(i), PRICE])),
    );
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  async function forgeCo(work: (client: pg.Client, op: string) => Promise<unknown>) {
    const client = await connect(d.c.h.database.appUrl);
    try {
      await client.query('BEGIN');
      const op = await openDepositOperation(client, co, co.homeId);
      await work(client, op);
      await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  const transition = (client: pg.Client, op: string, bookingId: string) =>
    client.query(
      `INSERT INTO app.booking_state_transition (id, booking_id, previous_transition_id, from_state, to_state, kind,
         operation_id, recorded_at)
       SELECT $1, b.id, b.last_transition_id, b.state, 'cancelled', 'cession', $2, now() FROM app.booking b
        WHERE b.id = $3`,
      [randomUUID(), op, bookingId],
    );

  it('[REQ-060][TECH-022] a operação de depósito não devolve o Direito de Uso: sucessora spe_pool é recusada', async () => {
    const bookingId = await book(d, co, depositDate(0), 1);
    await expect(
      forgeCo(async (client, op) => {
        await recordDepositSnapshot(client, op, co.homeId, [depositDate(0)]);
        await transition(client, op, bookingId);
        await client.query(
          `UPDATE app.date_occupancy SET released_at = now(), release_reason = 'ceded', released_by_operation = $1
            WHERE booking_id = $2`,
          [op, bookingId],
        );
        const { rows } = await client.query<{ id: string }>(
          `UPDATE app.date_custody SET closed_at = now(), closed_by_operation = $1
            WHERE second_home_id = $2 AND stay_date = $3 AND closed_at IS NULL RETURNING id`,
          [op, co.homeId, depositDate(0)],
        );
        await client.query(
          `INSERT INTO app.date_custody (id, second_home_id, stay_date, holder_kind, parent_custody_id,
             opened_by_operation) VALUES ($1, $2, $3, 'spe_pool', $4, $5)`,
          [randomUUID(), co.homeId, depositDate(0), rows[0]!.id, op],
        );
      }),
    ).rejects.toEqual(constraint('custody_deposit_successor'));
  });

  it('[ADR-0036 §2] cessão de reserva com noites fora do snapshot (parcial) → recusada', async () => {
    const bookingId = await book(d, co, depositDate(3), 2);
    await expect(
      forgeCo(async (client, op) => {
        await recordDepositSnapshot(client, op, co.homeId, [depositDate(3)]);
        await transition(client, op, bookingId);
      }),
    ).rejects.toEqual(constraint('luxchange_deposit_snapshot'));
  });

  it('[BR-162] capacidade da SPE (não reservada) nunca é depositada pelo Co-Owner', async () => {
    await expect(
      forgeCo(async (client, op) => {
        await recordDepositSnapshot(client, op, co.homeId, [depositDate(8)]);
        await cedeOwnerNight(client, op, co.homeId, depositDate(8));
      }),
    ).rejects.toEqual(constraint('custody_deposit_source'));
  });

  it('[REQ-060] o depósito do Co-Owner pelo command satisfaz todas as regras do banco (controle)', async () => {
    await book(d, co, depositDate(10), 1);
    const outcome = await depositRunner(d, co)({
      second_home_id: co.homeId,
      nights: [depositDate(10)],
      expected_night_credits: [expectedCredits(BigInt(PRICE))],
      expected_credits: expectedCredits(BigInt(PRICE)),
      expected_validity_months: TEST_VALIDITY_MONTHS,
    });
    expect(outcome).toMatchObject({ status: 'committed' });
  });
});

/**
 * W20 auditoria — ativação segura (ADR-0036 §7): com K4 e K6 ligadas para o depósito e o `luxtory_app` tratado como
 * comprometido, nenhum mecanismo de Request/Direct (W21–W23, ainda sem lastro no banco) origina, retém ou consome
 * Créditos, e uma operação `pending` reaproveitada noutra transação não acrescenta fatos a um depósito já conferido.
 */
describe('W20 — ativação do depósito não abre Request/Direct nem fatos fora da transação (INV-6, REQ-060)', () => {
  let d: DepositHarness;
  let owner: CreditTitular;
  const PRICE = '22222';

  beforeAll(async () => {
    d = await depositHarness();
    owner = d.c.titular;
    await publishPrl(
      d,
      owner.homeId,
      Object.fromEntries(Array.from({ length: 6 }, (_, i) => [depositDate(i), PRICE])),
    );
  }, 240_000);
  afterAll(async () => {
    await d?.c.h.close();
  });

  async function inOperation(
    command: string,
    work: (client: pg.Client, op: string) => Promise<unknown>,
    options: { commitOperation?: boolean } = {},
  ): Promise<string> {
    const client = await connect(d.c.h.database.appUrl);
    try {
      await client.query('BEGIN');
      const op = await openDepositOperation(client, owner, owner.homeId, command);
      await work(client, op);
      if (options.commitOperation !== false)
        await client.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
      await client.query('COMMIT');
      return op;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  }

  const depositLot = async () => {
    const outcome = await depositRunner(d, owner)({
      second_home_id: owner.homeId,
      nights: [depositDate(0)],
      expected_night_credits: [expectedCredits(BigInt(PRICE))],
      expected_credits: expectedCredits(BigInt(PRICE)),
      expected_validity_months: TEST_VALIDITY_MONTHS,
    });
    if (outcome.status !== 'committed') throw new Error(JSON.stringify(outcome));
    return (outcome.result as { lot_id: string }).lot_id;
  };

  it('[INV-6] aceite forjado não origina Créditos sem lastro, mesmo com K4 e K6 ligadas', async () => {
    const before = await economicFacts(d.c.h.database.pool);
    await expect(
      inOperation('accept_request', async (client, op) => {
        await client.query(
          `INSERT INTO app.economic_snapshot (operation_id, resolved_at) VALUES ($1, clock_timestamp())`,
          [op],
        );
        await client.query(
          `INSERT INTO app.economic_snapshot_parameter (operation_id, parameter_key, parameter_id)
           SELECT $1, 'credit_validity_months', v.id
             FROM app.economic_snapshot s, app.parameter_at('credit_validity_months', NULL, s.resolved_at) v
            WHERE s.operation_id = $1`,
          [op],
        );
        await insertDepositLot(client, op, owner.partyId, '999999');
      }),
    ).rejects.toEqual(constraint('luxchange_exchange_not_activated'));
    expect(await economicFacts(d.c.h.database.pool)).toEqual(before);
  });

  it('[INV-6] Garantia ou consumo forjados (send_request/create_direct) não movem Créditos do depósito', async () => {
    const lotId = await depositLot();
    for (const [command, movement, from, to] of [
      ['send_request', 'hold', 'available', 'held'],
      ['create_direct', 'consume', 'available', 'consumed'],
    ] as const)
      await expect(
        inOperation(command, (client, op) =>
          client.query(
            `INSERT INTO app.credit_entry (id, lot_id, operation_id, movement, from_bucket, to_bucket, quantity)
             VALUES ($1, $2, $3, $4, $5, $6, 1)`,
            [randomUUID(), lotId, op, movement, from, to],
          ),
        ),
      ).rejects.toEqual(constraint('luxchange_exchange_not_activated'));
  });

  it('[REQ-060][INV-2] operação pendente reaproveitada noutra transação não cede noites sem Créditos', async () => {
    // 1ª transação: depósito completo, mas a operação fica `pending` (servidor comprometido).
    const op = await inOperation(
      'deposit_capacity',
      async (client, id) => {
        await recordDepositSnapshot(client, id, owner.homeId, [depositDate(2)]);
        await insertDepositLot(client, id, owner.partyId, expectedCredits(BigInt(PRICE)));
        await cedeOwnerNight(client, id, owner.homeId, depositDate(2));
      },
      { commitOperation: false },
    );
    // 2ª transação, mesma operação: acrescentar uma noite ao snapshot e cedê-la sem Créditos.
    const client = await connect(d.c.h.database.appUrl);
    try {
      await client.query('BEGIN');
      await expect(
        (async () => {
          await client.query(
            `INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
             SELECT $1, $2, $3::date, v.id
               FROM app.economic_snapshot s, app.prl_at($2, $3::date, s.resolved_at) v WHERE s.operation_id = $1`,
            [op, owner.homeId, depositDate(3)],
          );
          await cedeOwnerNight(client, op, owner.homeId, depositDate(3));
          await client.query('COMMIT');
        })(),
      ).rejects.toEqual(constraint('economic_snapshot_night_transaction'));
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }
    expect(
      (await activeCustody(d.c.h.database.pool, owner.homeId, [depositDate(3)]))[0]!.holder_kind,
    ).toBe('owner');
    // A operação forjada termina coerente: nenhuma cessão ou lote fora do depósito conferido.
    await d.c.h.database.pool.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
  });

  it('[REQ-060][INV-2] concorrência: transação iniciada antes do snapshot de outra não reaproveita a operação pendente', async () => {
    // B começa primeiro: o `now()` de B (início da transação) fica anterior ao snapshot que A ainda vai gravar.
    const b = await connect(d.c.h.database.appUrl);
    let op = '';
    try {
      await b.query('BEGIN');
      await b.query('SELECT now()');
      // A: depósito completo de uma noite, comitado com a operação ainda `pending` (servidor comprometido).
      op = await inOperation(
        'deposit_capacity',
        async (client, id) => {
          await recordDepositSnapshot(client, id, owner.homeId, [depositDate(4)]);
          await insertDepositLot(client, id, owner.partyId, expectedCredits(BigInt(PRICE)));
          await cedeOwnerNight(client, id, owner.homeId, depositDate(4));
        },
        { commitOperation: false },
      );
      // B, depois do COMMIT de A: acrescenta outra noite ao snapshot de A e a cede, sem Créditos.
      await expect(
        (async () => {
          await b.query(
            `INSERT INTO app.economic_snapshot_night (operation_id, second_home_id, stay_date, prl_id)
             SELECT $1, $2, $3::date, v.id
               FROM app.economic_snapshot s, app.prl_at($2, $3::date, s.resolved_at) v WHERE s.operation_id = $1`,
            [op, owner.homeId, depositDate(5)],
          );
          await cedeOwnerNight(b, op, owner.homeId, depositDate(5));
          await b.query('COMMIT');
        })(),
      ).rejects.toEqual(constraint('economic_snapshot_night_transaction'));
    } finally {
      await b.query('ROLLBACK').catch(() => undefined);
      await b.end();
    }
    expect(
      (await activeCustody(d.c.h.database.pool, owner.homeId, [depositDate(5)]))[0]!.holder_kind,
    ).toBe('owner');
    await d.c.h.database.pool.query(`UPDATE app.operation SET state = 'committed' WHERE id = $1`, [op]);
  });
});
