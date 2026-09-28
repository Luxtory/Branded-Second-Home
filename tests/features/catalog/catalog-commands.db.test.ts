import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@/features/platform';
import {
  catalogHarness,
  CONTENT,
  controlledClock,
  count,
  expectRejected,
  ownerOperation,
} from '../../support/catalog-fixtures';
import { appDatabase, waitForLockWaiter } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// Catálogo com PostgreSQL real (docs/specs/catalog.md §6): commands pelo executor de produção, papel de aplicação real,
// gatilhos e FKs do banco, e concorrência com barreira determinística (sessão esperando lock).
const START = new Date('2026-09-15T12:00:00.000Z');
const HOUR = 3_600_000;

describe('catálogo — commands, constraints e concorrência', () => {
  let database: TestDatabase;
  let db: Database;
  let clock: ReturnType<typeof controlledClock>;
  let harness: ReturnType<typeof catalogHarness>;

  // Um banco por teste (clone do modelo migrado): contagens e travas de um teste não vazam para outro.
  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    clock = controlledClock(START);
    harness = catalogHarness(db, clock);
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  /** Transação do dono que segura uma trava até `release()` — a outra sessão fica esperando. */
  async function holdInOwnerTransaction(statements: readonly string[], params: unknown[][] = []) {
    const client: pg.PoolClient = await database.pool.connect();
    await client.query('BEGIN');
    for (const [index, statement] of statements.entries()) {
      await client.query(statement, params[index] ?? []);
    }
    return {
      async release() {
        await client.query('COMMIT');
        client.release();
      },
    };
  }

  describe('[REQ-096] versões do Concept', () => {
    it('[REQ-096] versões nascem "Não aprovado", numeradas 1, 2, 3; a aprovação grava referências, quem aprovou e o papel', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const v1 = await build.concept(partner.id);
      const v2 = await build.version(v1.concept_id);
      const v3 = await build.version(v1.concept_id);

      expect([v1, v2, v3].map((v) => [v.version, v.state])).toEqual([
        [1, 'not_approved'],
        [2, 'not_approved'],
        [3, 'not_approved'],
      ]);
      expectRejected(
        await run(handlers.approveConceptVersion, { concept_version_id: v1.id, approval_refs: [] }),
        'ERR_VALIDATION',
      );
      const approved = await build.approve(v2.id);
      expect(approved).toMatchObject({
        version: 2,
        state: 'approved',
        approval_refs: ['Plano estratégico aprovado — ata 2026-09'],
        approved_by_user_id: '00000000-0000-4000-8000-0000000000d1',
        approved_role: 'admin',
        approved_at: START.toISOString(),
      });
    });

    it('[REQ-096] versão já aprovada, igual ou menor que a vigente não é aprovada', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const v1 = await build.concept(partner.id);
      const v2 = await build.version(v1.concept_id);
      await build.approve(v2.id);
      const approve = (id: string) =>
        run(handlers.approveConceptVersion, { concept_version_id: id, approval_refs: ['Ata'] });

      expectRejected(await approve(v2.id), 'ERR_STATE_TRANSITION');
      expectRejected(await approve(v1.id), 'ERR_STATE_TRANSITION');
      expectRejected(await approve(randomUUID()), 'ERR_NOT_FOUND');
      const v3 = await build.version(v1.concept_id);
      await expect(build.approve(v3.id)).resolves.toMatchObject({ state: 'approved', version: 3 });
    });

    it('[REQ-096] versão aprovada é imutável: luxtory_app sem privilégio no conteúdo; dono barrado pelo gatilho', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const version = await build.concept(partner.id);
      await build.approve(version.id);

      await expect(
        db
          .updateTable('app.concept_version')
          .set({ specification: 'Outra' })
          .where('id', '=', version.id)
          .execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        database.pool.query(
          `UPDATE app.concept_version SET specification = 'Outra' WHERE id = $1`,
          [version.id],
        ),
      ).rejects.toThrow(/only the approval of a not approved version/);
      await expect(
        database.pool.query(`UPDATE app.concept_version SET state = 'not_approved' WHERE id = $1`, [
          version.id,
        ]),
      ).rejects.toThrow(/only the approval of a not approved version/);
    });

    it('[REQ-096] aprovação que espera outra aprovação do mesmo Concept relê a vigente e é recusada se ficou menor', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const v1 = await build.concept(partner.id);
      const v2 = await build.version(v1.concept_id);
      const v3 = await build.version(v1.concept_id);
      const op = await ownerOperation(database.pool, 'approve_concept_version');
      // A outra sessão trava a Brand Partner e aprova a versão 3 antes de liberar.
      const other = await holdInOwnerTransaction(
        [
          'SELECT id FROM app.brand_partner WHERE id = $1 FOR NO KEY UPDATE',
          `UPDATE app.concept_version SET state = 'approved', approval_refs = ARRAY['Ata'], approved_at = now(),
             approved_by_user_id = $2, approved_role = 'admin', approval_operation_id = $3 WHERE id = $1`,
        ],
        [[partner.id], [v3.id, randomUUID(), op]],
      );
      const waiting = run(handlers.approveConceptVersion, {
        concept_version_id: v2.id,
        approval_refs: ['Ata'],
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expectRejected(await waiting, 'ERR_STATE_TRANSITION');
    });
  });

  describe('[REQ-020] Concept, Edition e Residence', () => {
    it('[REQ-020] Edition — o único caminho para a Residence — exige Concept com versão aprovada', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const version = await build.concept(partner.id);
      const edition = {
        concept_id: version.concept_id,
        region: 'Serra da Mantiqueira',
        modality: 'owner',
        commercial_conditions: 'Condições registradas.',
      };

      expectRejected(await run(handlers.createEdition, edition), 'ERR_STATE_TRANSITION');
      expect(await count(database.pool, 'edition')).toBe(0);
      await build.approve(version.id);
      await expect(harness.ok(handlers.createEdition, edition)).resolves.toMatchObject({
        concept_id: version.concept_id,
        modality: 'owner',
      });
    });

    it('[REQ-020] Residence sem Concept aprovado é recusada pelo banco, mesmo fora do command', async () => {
      const { build } = harness;
      const { edition, conceptId } = await build.approvedEdition();
      const draft = await build.version(conceptId);

      await expect(
        database.pool.query(
          `INSERT INTO app.residence (id, edition_id, concept_id, concept_version_id, commercially_approved_at, label,
                                      timezone, operation_id)
           VALUES ($1, $2, $3, $4, now(), 'Unidade', 'America/Sao_Paulo', $5)`,
          [randomUUID(), edition.id, conceptId, draft.id, await ownerOperation(database.pool)],
        ),
      ).rejects.toThrow(/is not the current approved version/);
    });

    it('[REQ-020] objetos distintos vinculados pelo banco: Edition, versão e autorização do mesmo Concept; oferta só na Edition', async () => {
      const { build } = harness;
      const a = await build.approvedEdition();
      const b = await build.approvedEdition();
      const insertResidence = async (editionId: string, conceptId: string, versionId: string) =>
        database.pool.query(
          `INSERT INTO app.residence (id, edition_id, concept_id, concept_version_id, commercially_approved_at, label,
                                      timezone, operation_id)
           VALUES ($1, $2, $3, $4, now(), 'Unidade', 'America/Sao_Paulo', $5)`,
          [randomUUID(), editionId, conceptId, versionId, await ownerOperation(database.pool)],
        );

      // Versão de outro Concept: o gatilho BEFORE INSERT já recusa (a FK composta é a segunda barreira).
      await expect(insertResidence(a.edition.id, a.conceptId, b.version.id)).rejects.toThrow(
        /is not the current approved version/,
      );
      await expect(insertResidence(b.edition.id, a.conceptId, a.version.id)).rejects.toThrow(
        /residence_edition_fk/,
      );
      const { rows } = await database.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.columns
         WHERE table_schema = 'app' AND column_name = 'commercial_conditions'`,
      );
      expect(rows.map((row) => row.table_name)).toEqual(['edition']);
    });

    it('[REQ-020] referência inexistente → ERR_NOT_FOUND, sem gravar nada', async () => {
      const { handlers, run } = harness;
      const missing = randomUUID();

      expectRejected(
        await run(handlers.createConceptVersion, { concept_id: missing, ...CONTENT }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.createConceptVersion, {
          brand_partner_id: missing,
          title: 'Casa',
          ...CONTENT,
        }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.createEdition, {
          concept_id: missing,
          region: 'Região',
          modality: 'co_owner',
          commercial_conditions: 'Condições.',
        }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.registerResidence, {
          edition_id: missing,
          label: 'Unidade',
          timezone: 'America/Sao_Paulo',
        }),
        'ERR_NOT_FOUND',
      );
      expect(await count(database.pool, 'residence')).toBe(0);
    });
  });

  describe('[REQ-027] Residence de Investor', () => {
    it('[REQ-027] sem autorização válida a Residence é recusada: inexistente, revogada, antes ou depois da vigência, de outro Concept', async () => {
      const { build, handlers, run } = harness;
      const { edition, conceptId } = await build.approvedEdition();
      const other = await build.approvedEdition();
      const residence = (authorizationId: string) =>
        run(handlers.registerResidence, {
          edition_id: edition.id,
          label: 'Unidade',
          timezone: 'America/Sao_Paulo',
          investor_authorization_id: authorizationId,
        });
      const future = await build.authorization(conceptId, new Date(START.getTime() + HOUR));
      const expired = await build.authorization(
        conceptId,
        new Date(START.getTime() - 2 * HOUR),
        START,
      );
      const foreign = await build.authorization(other.conceptId, START);
      const revoked = await build.authorization(conceptId, START);
      await harness.ok(handlers.revokeInvestorAuthorization, {
        investor_authorization_id: revoked.id,
        revocation_basis: 'Distrato 2026-09',
      });

      expectRejected(await residence(randomUUID()), 'ERR_NOT_FOUND');
      for (const authorization of [future, expired, foreign, revoked]) {
        expectRejected(await residence(authorization.id), 'ERR_STATE_TRANSITION');
      }
      expect(await count(database.pool, 'residence')).toBe(0);
    });

    it('[REQ-027] com autorização válida, a Residence existe sem adquirente numa Edition Owner, Co-Owner ou ambas', async () => {
      const { build } = harness;
      for (const modality of ['owner', 'co_owner', 'owner_and_co_owner'] as const) {
        const { edition, conceptId } = await build.approvedEdition(modality);
        const authorization = await build.authorization(
          conceptId,
          new Date(START.getTime() - HOUR),
          new Date(START.getTime() + HOUR),
        );
        await expect(build.residence(edition.id, authorization.id)).resolves.toMatchObject({
          edition_id: edition.id,
          investor_authorization_id: authorization.id,
        });
      }
      // Sem adquirente: titularidade (holding) só nasce com a formalização da W8.
      const { rows } = await database.pool.query<{ holding: string | null }>(
        `SELECT to_regclass('app.holding')::text AS holding`,
      );
      expect(rows[0]?.holding).toBeNull();
      expect(await count(database.pool, 'residence')).toBe(3);
    });

    it('[REQ-027] o banco recusa Residence com autorização revogada ou de outro Concept, mesmo fora do command', async () => {
      const { build, handlers } = harness;
      const a = await build.approvedEdition();
      const b = await build.approvedEdition();
      const revoked = await build.authorization(a.conceptId, START);
      await harness.ok(handlers.revokeInvestorAuthorization, {
        investor_authorization_id: revoked.id,
        revocation_basis: 'Distrato',
      });
      const foreign = await build.authorization(b.conceptId, START);
      const insert = async (authorizationId: string) =>
        database.pool.query(
          `INSERT INTO app.residence (id, edition_id, concept_id, concept_version_id, commercially_approved_at, label,
                                      timezone, investor_authorization_id, operation_id)
           VALUES ($1, $2, $3, $4, $5, 'Unidade', 'America/Sao_Paulo', $6, $7)`,
          [
            randomUUID(),
            a.edition.id,
            a.conceptId,
            a.version.id,
            START,
            authorizationId,
            await ownerOperation(database.pool),
          ],
        );

      await expect(insert(revoked.id)).rejects.toThrow(/investor authorization .* is not valid/);
      await expect(insert(foreign.id)).rejects.toThrow(/residence_investor_authorization_fk/);
    });

    it('[REQ-027] revogação concorrente: o registro espera a revogação comitar e é recusado', async () => {
      const { build, handlers, run } = harness;
      const { edition, conceptId } = await build.approvedEdition();
      const authorization = await build.authorization(conceptId, START);
      const other = await holdInOwnerTransaction(
        [
          `UPDATE app.investor_authorization SET revoked_at = now(), revocation_basis = 'Distrato'
           WHERE id = $1`,
        ],
        [[authorization.id]],
      );
      const waiting = run(handlers.registerResidence, {
        edition_id: edition.id,
        label: 'Unidade',
        timezone: 'America/Sao_Paulo',
        investor_authorization_id: authorization.id,
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expectRejected(await waiting, 'ERR_STATE_TRANSITION');
      expect(await count(database.pool, 'residence')).toBe(0);
    });

    it('[REQ-027] revogação é única e não muda Residences já registradas', async () => {
      const { build, handlers, run } = harness;
      const { edition, conceptId } = await build.approvedEdition();
      const authorization = await build.authorization(conceptId, START);
      const residence = await build.residence(edition.id, authorization.id);
      const revoke = () =>
        run(handlers.revokeInvestorAuthorization, {
          investor_authorization_id: authorization.id,
          revocation_basis: 'Distrato',
        });

      expect(await revoke()).toMatchObject({ status: 'committed' });
      expectRejected(await revoke(), 'ERR_STATE_TRANSITION');
      const { rows } = await database.pool.query(
        'SELECT investor_authorization_id FROM app.residence WHERE id = $1',
        [residence.id],
      );
      expect(rows[0]?.investor_authorization_id).toBe(authorization.id);
    });
  });

  describe('[BR-025] versão fixada na aprovação comercial', () => {
    it('[BR-025] o registro fixa a versão vigente e o instante da aprovação comercial', async () => {
      const { build } = harness;
      const { edition, conceptId } = await build.approvedEdition();
      const v2 = await build.version(conceptId);
      await build.approve(v2.id);
      await build.version(conceptId); // versão 3 ainda não aprovada: não conta
      clock.advance(HOUR);

      const residence = await build.residence(edition.id);
      expect(residence).toMatchObject({
        concept_version_id: v2.id,
        concept_version: 2,
        commercially_approved_at: new Date(START.getTime() + HOUR).toISOString(),
      });
    });

    it('[BR-025] versão aprovada depois não altera a Residence existente; a próxima fixa a nova', async () => {
      const { build } = harness;
      const { edition, conceptId, version } = await build.approvedEdition();
      const first = await build.residence(edition.id);
      const v2 = await build.version(conceptId);
      await build.approve(v2.id);
      const second = await build.residence(edition.id);

      const { rows } = await database.pool.query<{ concept_version_id: string }>(
        'SELECT concept_version_id FROM app.residence WHERE id = $1',
        [first.id],
      );
      expect(rows[0]?.concept_version_id).toBe(version.id);
      expect(second.concept_version_id).toBe(v2.id);
    });

    it('[BR-025] o banco recusa trocar a versão fixada: luxtory_app sem privilégio; dono barrado pelo gatilho', async () => {
      const { build } = harness;
      const { edition, conceptId } = await build.approvedEdition();
      const residence = await build.residence(edition.id);
      const v2 = await build.version(conceptId);
      await build.approve(v2.id);

      await expect(
        db
          .updateTable('app.residence')
          .set({ concept_version_id: v2.id })
          .where('id', '=', residence.id)
          .execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        database.pool.query('UPDATE app.residence SET concept_version_id = $1 WHERE id = $2', [
          v2.id,
          residence.id,
        ]),
      ).rejects.toThrow(/UPDATE on app.residence is not allowed/);
    });

    it('[BR-025] o banco recusa Residence que fixe uma versão aprovada que já não é a vigente', async () => {
      const { build } = harness;
      const { edition, conceptId, version } = await build.approvedEdition();
      const v2 = await build.version(conceptId);
      await build.approve(v2.id);

      await expect(
        database.pool.query(
          `INSERT INTO app.residence (id, edition_id, concept_id, concept_version_id, commercially_approved_at, label,
                                      timezone, operation_id)
           VALUES ($1, $2, $3, $4, now(), 'Unidade', 'America/Sao_Paulo', $5)`,
          [randomUUID(), edition.id, conceptId, version.id, await ownerOperation(database.pool)],
        ),
      ).rejects.toThrow(/is not the current approved version/);
    });

    it('[BR-025] aprovação concorrente: a Residence espera e fixa a versão vigente no seu commit', async () => {
      const { build, handlers, run } = harness;
      const { edition, conceptId, partner } = await build.approvedEdition();
      const v2 = await build.version(conceptId);
      const op = await ownerOperation(database.pool, 'approve_concept_version');
      const other = await holdInOwnerTransaction(
        [
          'SELECT id FROM app.brand_partner WHERE id = $1 FOR NO KEY UPDATE',
          `UPDATE app.concept_version SET state = 'approved', approval_refs = ARRAY['Ata'], approved_at = now(),
             approved_by_user_id = $2, approved_role = 'admin', approval_operation_id = $3 WHERE id = $1`,
        ],
        [[partner.id], [v2.id, randomUUID(), op]],
      );
      const waiting = run(handlers.registerResidence, {
        edition_id: edition.id,
        label: 'Unidade',
        timezone: 'America/Sao_Paulo',
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expect(await waiting).toMatchObject({
        status: 'committed',
        result: { concept_version_id: v2.id, concept_version: 2 },
      });
    });
  });

  describe('[BR-021] encerramento da Brand Partner', () => {
    async function terminate(partnerId: string, effectiveAt: Date) {
      return harness.run(harness.handlers.terminateBrandPartner, {
        brand_partner_id: partnerId,
        terminated_effective_at: effectiveAt.toISOString(),
        termination_basis: 'Aditivo de encerramento 07/2026',
      });
    }

    it('[BR-021] depois da eficácia, todo novo uso da marca é recusado e nada é gravado', async () => {
      const { build, handlers, run } = harness;
      const { partner, conceptId, edition } = await build.approvedEdition();
      const draft = await build.version(conceptId);
      const authorization = await build.authorization(conceptId, START);
      expect(await terminate(partner.id, new Date(START.getTime() - HOUR))).toMatchObject({
        status: 'committed',
      });
      const before = await Promise.all(
        ['concept', 'concept_version', 'edition', 'investor_authorization', 'residence'].map((t) =>
          count(database.pool, t),
        ),
      );

      const attempts = [
        run(handlers.createConceptVersion, {
          brand_partner_id: partner.id,
          title: 'Nova',
          ...CONTENT,
        }),
        run(handlers.createConceptVersion, { concept_id: conceptId, ...CONTENT }),
        run(handlers.approveConceptVersion, {
          concept_version_id: draft.id,
          approval_refs: ['Ata'],
        }),
        run(handlers.createEdition, {
          concept_id: conceptId,
          region: 'Região',
          modality: 'owner',
          commercial_conditions: 'Condições.',
        }),
        run(handlers.registerInvestorAuthorization, {
          concept_id: conceptId,
          instrument_ref: 'Instrumento',
          valid_from: START.toISOString(),
        }),
        run(handlers.registerResidence, {
          edition_id: edition.id,
          label: 'Unidade',
          timezone: 'America/Sao_Paulo',
          investor_authorization_id: authorization.id,
        }),
        run(handlers.authorizeBrandExposure, {
          brand_partner_id: partner.id,
          exposure_authorization_ref: 'Autorização de exposição',
        }),
      ];
      for (const outcome of await Promise.all(attempts)) {
        expectRejected(outcome, 'ERR_STATE_TRANSITION');
      }
      const after = await Promise.all(
        ['concept', 'concept_version', 'edition', 'investor_authorization', 'residence'].map((t) =>
          count(database.pool, t),
        ),
      );
      expect(after).toEqual(before);
    });

    it('[BR-021] eficácia futura: novos usos seguem permitidos até ela e são recusados a partir dela', async () => {
      const { build, handlers, run } = harness;
      const { partner, conceptId } = await build.approvedEdition();
      await terminate(partner.id, new Date(START.getTime() + HOUR));
      const edition = () =>
        run(handlers.createEdition, {
          concept_id: conceptId,
          region: 'Região',
          modality: 'co_owner',
          commercial_conditions: 'Condições.',
        });

      expect(await edition()).toMatchObject({ status: 'committed' });
      clock.set(new Date(START.getTime() + HOUR));
      expectRejected(await edition(), 'ERR_STATE_TRANSITION');
    });

    it('[BR-021] o encerramento não apaga a autorização de exposição nem muda o que existe; é registrado uma vez', async () => {
      const { build, handlers } = harness;
      const partner = await harness.ok(handlers.registerBrandPartner, {
        brand_name: 'Maison Exposta',
        exposure_authorization_ref: 'Autorização de exposição 2026-09',
      });
      const version = await build.concept(partner.id);
      await build.approve(version.id);
      const edition = await build.edition(version.concept_id);
      const residence = await build.residence(edition.id);

      expect(await terminate(partner.id, START)).toMatchObject({
        status: 'committed',
        result: {
          exposure_authorization_ref: 'Autorização de exposição 2026-09',
          exposure_authorized_at: START.toISOString(),
          terminated_effective_at: START.toISOString(),
        },
      });
      expectRejected(await terminate(partner.id, START), 'ERR_STATE_TRANSITION');
      const { rows } = await database.pool.query(
        `SELECT (SELECT count(*)::int FROM app.residence WHERE id = $1) AS residences,
                (SELECT state FROM app.concept_version WHERE id = $2) AS state`,
        [residence.id, version.id],
      );
      expect(rows[0]).toEqual({ residences: 1, state: 'approved' });
      await expect(
        database.pool.query(
          `UPDATE app.brand_partner SET exposure_authorization_ref = NULL, exposure_authorized_at = NULL
           WHERE id = $1`,
          [partner.id],
        ),
      ).rejects.toThrow(/single exposure authorization and a single termination/);
      await expect(
        database.pool.query(
          `UPDATE app.brand_partner SET terminated_effective_at = now() WHERE id = $1`,
          [partner.id],
        ),
      ).rejects.toThrow(/single exposure authorization and a single termination/);
    });

    it('[BR-021] encerramento concorrente: a Edition nova espera o encerramento comitar e é recusada', async () => {
      const { build, handlers, run } = harness;
      const { partner, conceptId } = await build.approvedEdition();
      const other = await holdInOwnerTransaction(
        [
          `UPDATE app.brand_partner SET terminated_effective_at = $2, termination_basis = 'Aditivo',
             termination_registered_at = now() WHERE id = $1`,
        ],
        [[partner.id, new Date(START.getTime() - HOUR)]],
      );
      const waiting = run(handlers.createEdition, {
        concept_id: conceptId,
        region: 'Região',
        modality: 'owner',
        commercial_conditions: 'Condições.',
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expectRejected(await waiting, 'ERR_STATE_TRANSITION');
      expect(await count(database.pool, 'edition')).toBe(1);
    });
  });

  describe('[REQ-015] auditoria, idempotência e terminologia', () => {
    it('[REQ-015] [TECH-092] cada operação comitada grava operation e audit_log com antes/depois e o papel exercido', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const version = await build.concept(partner.id);
      await build.approve(version.id);

      const { rows } = await database.pool.query<{
        command: string;
        state: string;
        role: string;
        object_type: string;
        has_before: boolean;
      }>(
        `SELECT o.command, o.state, a.role, a.object_type, a.before IS NOT NULL AS has_before
         FROM app.audit_log a JOIN app.operation o ON o.id = a.operation_id
         WHERE a.event_type = 'command' ORDER BY a.id`,
      );
      expect(rows).toEqual([
        {
          command: 'register_brand_partner',
          state: 'committed',
          role: 'admin',
          object_type: 'brand_partner',
          has_before: false,
        },
        {
          command: 'create_concept_version',
          state: 'committed',
          role: 'admin',
          object_type: 'concept',
          has_before: false,
        },
        {
          command: 'create_concept_version',
          state: 'committed',
          role: 'admin',
          object_type: 'concept_version',
          has_before: false,
        },
        {
          command: 'approve_concept_version',
          state: 'committed',
          role: 'admin',
          object_type: 'concept_version',
          has_before: true,
        },
      ]);
    });

    it('[REQ-015] repetir a chave com o mesmo corpo devolve o mesmo resultado; com outro corpo → ERR_IDEMPOTENCY_CONFLICT', async () => {
      const { handlers, run } = harness;
      const key = randomUUID();
      const first = await run(handlers.registerBrandPartner, { brand_name: 'Maison Única' }, key);
      const again = await run(handlers.registerBrandPartner, { brand_name: 'Maison Única' }, key);
      const conflict = await run(handlers.registerBrandPartner, { brand_name: 'Outra' }, key);

      expect(again).toEqual({ ...first, replayed: true });
      expectRejected(conflict, 'ERR_IDEMPOTENCY_CONFLICT');
      expect(await count(database.pool, 'brand_partner')).toBe(1);
    });

    it('[REQ-100] [REQ-101] texto com termo vedado ou promessa explícita de retorno é recusado sem gravar operação', async () => {
      const { handlers, run } = harness;
      const before = await count(database.pool, 'operation');

      expectRejected(
        await run(handlers.registerBrandPartner, { brand_name: 'Casa da Cota' }),
        'ERR_VALIDATION',
      );
      expectRejected(
        await run(handlers.registerBrandPartner, {
          brand_name: 'Maison — rentabilidade garantida',
        }),
        'ERR_VALIDATION',
      );
      expect(await count(database.pool, 'operation')).toBe(before);
    });
  });
});
