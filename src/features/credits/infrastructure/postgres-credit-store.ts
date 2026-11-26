import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '@/features/platform';
import type { UsableLot } from '../domain/credit';
import type { CreditStore, LockedLot, OpenEntry, OriginatedLot } from '../application/ports';

/** Instante em ISO 8601 UTC com microssegundos: mesma ordem do PostgreSQL na comparação de texto (TECH-053). */
const iso = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);

interface OpenRow {
  readonly entry_id: string;
  readonly lot_id: string;
  readonly remaining: string;
  readonly valid: boolean;
  readonly expires_at: string;
  readonly originated_at: string;
}

const toOpen = (row: OpenRow): OpenEntry => ({
  entryId: row.entry_id,
  lotId: row.lot_id,
  remaining: row.remaining,
  valid: row.valid,
  expiresAt: row.expires_at,
  originatedAt: row.originated_at,
});

/**
 * Créditos no PostgreSQL (ADR-0033). Travas de linha em ordem FEFO = ordem da classe 7 da TECH-053; saldos lidos depois
 * das travas (READ COMMITTED relê a versão confirmada). Validade sempre pelo relógio do banco.
 */
export function createPostgresCreditStore(): CreditStore<DatabaseTransaction> {
  /** Trava os lotes que `filter` seleciona, em ordem FEFO; devolve os ids travados. */
  async function lockLots(tx: DatabaseTransaction, filter: ReturnType<typeof sql>): Promise<void> {
    await sql`SELECT l.id FROM app.credit_lot l WHERE ${filter}
               ORDER BY l.expires_at, l.originated_at, l.id FOR UPDATE`.execute(tx);
  }

  /** Movimentos (de `filter`) com o saldo que ainda não saiu deles, depois de os lotes estarem travados. */
  async function openEntries(
    tx: DatabaseTransaction,
    filter: ReturnType<typeof sql>,
  ): Promise<OpenEntry[]> {
    const { rows } = await sql<OpenRow>`
      SELECT e.id AS entry_id, e.lot_id,
             (e.quantity - coalesce((SELECT sum(c.quantity) FROM app.credit_entry c WHERE c.parent_entry_id = e.id), 0))::text
               AS remaining,
             clock_timestamp() < l.expires_at AS valid,
             ${iso('l.expires_at')} AS expires_at, ${iso('l.originated_at')} AS originated_at
        FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
       WHERE ${filter}
       ORDER BY l.expires_at, l.originated_at, l.id`.execute(tx);
    return rows.filter((row) => !/^0(\.0*)?$/.test(row.remaining)).map(toOpen);
  }

  return {
    async lockUsableLots(tx, partyId) {
      const { rows } = await sql<{
        id: string;
        available: string;
        expires_at: string;
        originated_at: string;
      }>`SELECT id, available::text AS available, ${iso('expires_at')} AS expires_at,
                ${iso('originated_at')} AS originated_at
           FROM app.credit_lot
          WHERE party_id = ${partyId}::uuid AND available > 0 AND expires_at > clock_timestamp()
          ORDER BY expires_at, originated_at, id
            FOR UPDATE`.execute(tx);
      return rows.map((row): UsableLot => ({
        id: row.id,
        available: row.available,
        expiresAt: row.expires_at,
        originatedAt: row.originated_at,
      }));
    },

    async lockOpenEntries(tx, operationId, movement) {
      await lockLots(
        tx,
        sql`l.id IN (SELECT e.lot_id FROM app.credit_entry e
                      WHERE e.operation_id = ${operationId}::uuid AND e.movement = ${movement})`,
      );
      return openEntries(
        tx,
        sql`e.operation_id = ${operationId}::uuid AND e.movement = ${movement}`,
      );
    },

    async lockConsumption(tx, entryId) {
      await lockLots(
        tx,
        sql`l.id = (SELECT e.lot_id FROM app.credit_entry e WHERE e.id = ${entryId}::uuid AND e.movement = 'consume')`,
      );
      const { rows } = await sql<OpenRow>`
        SELECT e.id AS entry_id, e.lot_id,
               (e.quantity - coalesce((SELECT sum(c.quantity) FROM app.credit_entry c WHERE c.parent_entry_id = e.id), 0))::text
                 AS remaining,
               clock_timestamp() < l.expires_at AS valid,
               ${iso('l.expires_at')} AS expires_at, ${iso('l.originated_at')} AS originated_at
          FROM app.credit_entry e JOIN app.credit_lot l ON l.id = e.lot_id
         WHERE e.id = ${entryId}::uuid AND e.movement = 'consume'`.execute(tx);
      return rows[0] === undefined ? null : toOpen(rows[0]);
    },

    async lockLot(tx, lotId) {
      const { rows } = await sql<{
        id: string;
        available: string;
        valid: boolean;
        expires_at: string;
        originated_at: string;
      }>`SELECT id, available::text AS available, clock_timestamp() < expires_at AS valid,
                ${iso('expires_at')} AS expires_at, ${iso('originated_at')} AS originated_at
           FROM app.credit_lot WHERE id = ${lotId}::uuid FOR UPDATE`.execute(tx);
      const row = rows[0];
      return row === undefined
        ? null
        : ({
            id: row.id,
            available: row.available,
            valid: row.valid,
            expiresAt: row.expires_at,
            originatedAt: row.originated_at,
          } satisfies LockedLot);
    },

    async lockLotsReleasing(tx, partyId, holdOperationIds) {
      const releasing = sql`l.id IN (SELECT e.lot_id FROM app.credit_entry e
                                      WHERE e.operation_id = ANY (${[...holdOperationIds]}::uuid[])
                                        AND e.movement = 'hold')`;
      const scope = sql`((l.party_id = ${partyId}::uuid AND l.available > 0 AND l.expires_at > clock_timestamp())
                         OR ${releasing})`;
      await lockLots(tx, scope);
      const { rows } = await sql<{
        id: string;
        available: string;
        valid: boolean;
        expires_at: string;
        originated_at: string;
      }>`SELECT l.id, l.available::text AS available, clock_timestamp() < l.expires_at AS valid,
                ${iso('l.expires_at')} AS expires_at, ${iso('l.originated_at')} AS originated_at
           FROM app.credit_lot l WHERE ${scope}
          ORDER BY l.expires_at, l.originated_at, l.id`.execute(tx);
      const open = await openEntries(
        tx,
        sql`e.operation_id = ANY (${[...holdOperationIds]}::uuid[]) AND e.movement = 'hold'`,
      );
      return {
        lots: rows.map((row): LockedLot => ({
          id: row.id,
          available: row.available,
          valid: row.valid,
          expiresAt: row.expires_at,
          originatedAt: row.originated_at,
        })),
        open,
      };
    },

    async insertLot(tx, input) {
      const { rows } = await sql<{
        id: string;
        quantity: string;
        originated_at: string;
        expires_at: string;
      }>`INSERT INTO app.credit_lot (id, party_id, quantity, origin_operation_id)
         VALUES (${randomUUID()}::uuid, ${input.partyId}::uuid, ${input.quantity}::numeric, ${input.operationId}::uuid)
         RETURNING id, quantity::text AS quantity, ${iso('originated_at')} AS originated_at,
                   ${iso('expires_at')} AS expires_at`.execute(tx);
      const row = rows[0]!;
      return {
        lotId: row.id,
        quantity: row.quantity,
        originatedAt: row.originated_at,
        expiresAt: row.expires_at,
      } satisfies OriginatedLot;
    },

    async insertEntries(tx, operationId, entries) {
      const ids: string[] = [];
      for (const entry of entries) {
        const id = randomUUID();
        await sql`INSERT INTO app.credit_entry
                    (id, lot_id, operation_id, movement, from_bucket, to_bucket, quantity, parent_entry_id, basis)
                  VALUES (${id}::uuid, ${entry.lotId}::uuid, ${operationId}::uuid, ${entry.movement}, ${entry.from},
                          ${entry.to}, ${entry.quantity}::numeric, ${entry.parentEntryId ?? null}::uuid,
                          ${entry.basis ?? null})`.execute(tx);
        ids.push(id);
      }
      return ids;
    },
  };
}
