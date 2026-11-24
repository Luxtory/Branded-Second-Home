import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../support/test-database';
import { ownerParty } from '../support/party-fixtures';
import { appDatabase, waitForLockWaiter } from '../support/platform-fixtures';
import { catalogHarness, controlledClock } from '../support/catalog-fixtures';

const down = async (name: string) => {
  const body = (await readFile(`migrations/${name}.sql`, 'utf8')).split('-- migrate:down')[1];
  if (body === undefined) throw new Error(`missing down: ${name}`);
  return body;
};

describe('W8 — rollback concorrente preserva fatos', () => {
  it.each(['institution', 'administration'] as const)(
    '[TECH-110] escritor pendente de %s comita antes de o down decidir se pode remover proteção',
    async (kind) => {
      const database = await createTestDatabase();
      const db = appDatabase(database.appUrl);
      const writer = new pg.Client({ connectionString: database.url });
      const rollback = new pg.Client({ connectionString: database.url });
      let pending: Promise<{ ok: boolean; error?: unknown }> | undefined;
      await Promise.all([writer.connect(), rollback.connect()]);
      try {
        if (kind === 'institution') {
          // Match reverse migration order: SPE's CNPJ FK is gone before legal_identity.down.
          // Later migrations (W13 booking lifecycle, W12 booking on stake/holding, W11 balance on stake, W10 custody on
          // stake, W9 draw tables on stake/holding) roll back first, newest first.
          for (const migration of [
            // W20 first: the snapshot nights reference the snapshot, the PRL and second_home_date, and its functions read
            // the credit lots, custody and bookings.
            '20261123211619_luxchange_deposit',
            // W17 next: credit lots reference party, operation and the snapshot; the snapshot references parameter.
            '20261122120003_credits_ledger',
            '20261122120001_pricing_economic_snapshot',
            // W16 next: the PRL references second_home_date and operation; the economic keys extend the W14 parameter.
            '20261120055435_pricing_prl',
            '20261120055433_admin_parameter_economic_keys',
            // W15 next: the Membership references party and operation and its trigger reads holding.
            '20261119234739_identity_membership',
            // W14 next: the guest nomination references booking; the selection rule rides on the W13 custody triggers.
            '20261119061707_inventory_luxtory_selection',
            '20261119061704_booking_guest_nomination',
            '20261119061701_admin_parameter',
            '20261104030106_booking_activation_readiness',
            '20261104030104_calendar_own_use_restore_and_correction',
            '20261104030102_inventory_own_use_lifecycle',
            '20261104030100_booking_lifecycle_and_independent_authorization',
            '20261031164135_calendar_own_use_consumption_and_booking_checks',
            '20261031164132_inventory_own_use_authorization',
            '20261031164128_booking_own_use',
            '20261030164714_calendar_use_right_invariant_checks',
            '20261030164712_calendar_use_right_balance',
            '20261030164710_calendar_use_right_ledger_movements',
            '20261029193232_inventory_projection_and_invariant_checks',
            '20261029193230_inventory_date_occupancy',
            '20261029193227_inventory_date_custody',
            '20261029193225_calendar_second_home_date',
            '20261029051805_ownership_initial_draw_commit_evidence',
            '20261028230907_ownership_initial_draw',
            '20261028230905_platform_outbox_available_at',
            '20261025160200_ownership_holder_projections',
            '20261025055044_ownership_acquisition_invariants',
            '20261025054112_identity_staff_authority_lock',
            '20261025054013_ownership_acquisition_structure',
          ])
            await database.pool.query(await down(migration));
        }
        const party = await ownerParty(database.pool, undefined, { type: 'cnpj' });
        let home: string | undefined;
        if (kind === 'administration') {
          const catalog = catalogHarness(db, controlledClock(new Date('2026-10-01T12:00:00Z')));
          const { homeEdition } = await catalog.build.finalizedHomeEdition();
          home = (await catalog.build.secondHome(homeEdition.id)).id;
        }
        await writer.query('BEGIN');
        if (kind === 'institution') {
          await writer.query('SELECT app.register_luxtory_legal_identity($1,$2)', [
            party,
            'Ata sintética',
          ]);
        } else {
          const operation = randomUUID();
          await writer.query(
            `INSERT INTO app.operation
            (id,command,actor_user_id,role,second_home_id,idempotency_key,correlation_id,authorization_ref,state,created_at,updated_at)
            VALUES ($1,'register_second_home_administration',$2,'admin',$3,$4,$4,'test:authority','committed',now(),now())`,
            [operation, randomUUID(), home, `rollback:${operation}`],
          );
          await writer.query(
            `INSERT INTO app.second_home_administration
            (id,second_home_id,provider_party_id,professional,scope,valid_from,basis_ref,operation_id,created_at)
            VALUES ($1,$2,$3,true,'professional_administration','2027-01-01','Contrato sintético',$4,now())`,
            [randomUUID(), home, party, operation],
          );
        }
        await rollback.query('BEGIN');
        const migration =
          kind === 'institution'
            ? '20261025041637_ownership_legal_identity'
            : '20261025055044_ownership_acquisition_invariants';
        // Attach both handlers immediately; the barrier must not cause an unhandled rejection.
        pending = rollback.query(await down(migration)).then(
          () => ({ ok: true }),
          (error: unknown) => ({ ok: false, error }),
        );
        await waitForLockWaiter(database.pool);
        await writer.query('COMMIT');
        const outcome = await pending;
        expect(outcome.ok).toBe(false);
        expect(outcome.error).toMatchObject({
          code: 'P0001',
          message: expect.stringMatching(/rollback/i),
        });
        await rollback.query('ROLLBACK');
        const table =
          kind === 'institution' ? 'luxtory_legal_identity' : 'second_home_administration';
        expect(
          (await database.pool.query(`SELECT count(*)::int AS n FROM app.${table}`)).rows,
        ).toEqual([{ n: 1 }]);
      } finally {
        await writer.query('ROLLBACK');
        if (pending !== undefined) await pending;
        await rollback.query('ROLLBACK');
        await Promise.all([writer.end(), rollback.end(), db.destroy()]);
        await database.drop();
      }
    },
  );
});
