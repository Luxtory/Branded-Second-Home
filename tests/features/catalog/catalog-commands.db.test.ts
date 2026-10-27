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
  HOME_EDITION_CONTENT,
  ownerOperation,
} from '../../support/catalog-fixtures';
import { punctuatedCpf, validCpf } from '../../support/documents';
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

  describe('[REQ-096] versões do Home Concept', () => {
    it('[REQ-096] versões nascem "Não aprovado", numeradas 1, 2, 3; a aprovação grava referências, quem aprovou e o papel', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const v1 = await build.homeConcept(partner.id);
      const v2 = await build.version(v1.home_concept_id);
      const v3 = await build.version(v1.home_concept_id);

      expect([v1, v2, v3].map((v) => [v.version, v.state])).toEqual([
        [1, 'not_approved'],
        [2, 'not_approved'],
        [3, 'not_approved'],
      ]);
      expectRejected(
        await run(handlers.approveHomeConceptVersion, {
          home_concept_version_id: v1.id,
          approval_refs: [],
        }),
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
      const v1 = await build.homeConcept(partner.id);
      const v2 = await build.version(v1.home_concept_id);
      await build.approve(v2.id);
      const approve = (id: string) =>
        run(handlers.approveHomeConceptVersion, {
          home_concept_version_id: id,
          approval_refs: ['Ata'],
        });

      expectRejected(await approve(v2.id), 'ERR_STATE_TRANSITION');
      expectRejected(await approve(v1.id), 'ERR_STATE_TRANSITION');
      expectRejected(await approve(randomUUID()), 'ERR_NOT_FOUND');
      const v3 = await build.version(v1.home_concept_id);
      await expect(build.approve(v3.id)).resolves.toMatchObject({ state: 'approved', version: 3 });
    });

    it('[REQ-096] versão aprovada é imutável: luxtory_app sem privilégio no conteúdo; dono barrado pelo gatilho', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const version = await build.homeConcept(partner.id);
      await build.approve(version.id);

      await expect(
        db
          .updateTable('app.home_concept_version')
          .set({ specification: 'Outra' })
          .where('id', '=', version.id)
          .execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        database.pool.query(
          `UPDATE app.home_concept_version SET specification = 'Outra' WHERE id = $1`,
          [version.id],
        ),
      ).rejects.toThrow(/only the approval of a not approved version/);
      await expect(
        database.pool.query(
          `UPDATE app.home_concept_version SET state = 'not_approved' WHERE id = $1`,
          [version.id],
        ),
      ).rejects.toThrow(/only the approval of a not approved version/);
    });

    it('[REQ-096] aprovação que espera outra aprovação do mesmo Home Concept relê a vigente e é recusada se ficou menor', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const v1 = await build.homeConcept(partner.id);
      const v2 = await build.version(v1.home_concept_id);
      const v3 = await build.version(v1.home_concept_id);
      const op = await ownerOperation(database.pool, 'approve_home_concept_version');
      // A outra sessão trava a Brand Partner e aprova a versão 3 antes de liberar.
      const other = await holdInOwnerTransaction(
        [
          'SELECT id FROM app.brand_partner WHERE id = $1 FOR NO KEY UPDATE',
          `UPDATE app.home_concept_version SET state = 'approved', approval_refs = ARRAY['Ata'], approved_at = now(),
             approved_by_user_id = $2, approved_role = 'admin', approval_operation_id = $3 WHERE id = $1`,
        ],
        [[partner.id], [v3.id, randomUUID(), op]],
      );
      const waiting = run(handlers.approveHomeConceptVersion, {
        home_concept_version_id: v2.id,
        approval_refs: ['Ata'],
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expectRejected(await waiting, 'ERR_STATE_TRANSITION');
    });
  });

  describe('[REQ-020] Home Concept, Home Edition e Second Home', () => {
    it('[REQ-020] Home Edition — o único caminho para a Second Home — exige Home Concept com versão aprovada', async () => {
      const { build, handlers, run } = harness;
      const partner = await build.brandPartner();
      const version = await build.homeConcept(partner.id);
      const homeEdition = {
        home_concept_id: version.home_concept_id,
        ...HOME_EDITION_CONTENT,
      };

      expectRejected(await run(handlers.createHomeEdition, homeEdition), 'ERR_STATE_TRANSITION');
      expect(await count(database.pool, 'home_edition')).toBe(0);
      await build.approve(version.id);
      await expect(harness.ok(handlers.createHomeEdition, homeEdition)).resolves.toMatchObject({
        home_concept_id: version.home_concept_id,
        name: HOME_EDITION_CONTENT.name,
        material_state: 'draft',
        visibility: 'hidden',
      });
    });

    it('[REQ-020] Second Home sem Home Concept aprovado é recusada pelo banco, mesmo fora do command', async () => {
      const { build } = harness;
      const { homeEdition, homeConceptId } = await build.finalizedHomeEdition();
      const draft = await build.version(homeConceptId);

      await expect(
        database.pool.query(
          `INSERT INTO app.second_home (id, home_edition_id, home_concept_id, home_concept_version_id, commercially_approved_at, label,
                                      timezone, operation_id)
           VALUES ($1, $2, $3, $4, now(), 'Unidade', 'America/Sao_Paulo', $5)`,
          [
            randomUUID(),
            homeEdition.id,
            homeConceptId,
            draft.id,
            await ownerOperation(database.pool),
          ],
        ),
      ).rejects.toThrow(/is not the current approved version/);
    });

    it('[REQ-020] [BR-031] objetos distintos vinculados pelo banco: Home Edition, versão e autorização do mesmo Home Concept; nenhuma condição comercial no catálogo', async () => {
      const { build } = harness;
      const a = await build.finalizedHomeEdition();
      const b = await build.finalizedHomeEdition();
      const insertSecondHome = async (
        homeEditionId: string,
        homeConceptId: string,
        versionId: string,
      ) =>
        database.pool.query(
          `INSERT INTO app.second_home (id, home_edition_id, home_concept_id, home_concept_version_id, commercially_approved_at, label,
                                      timezone, operation_id)
           VALUES ($1, $2, $3, $4, now(), 'Unidade', 'America/Sao_Paulo', $5)`,
          [
            randomUUID(),
            homeEditionId,
            homeConceptId,
            versionId,
            await ownerOperation(database.pool),
          ],
        );

      // Versão de outro Concept: o gatilho BEFORE INSERT já recusa (a FK composta é a segunda barreira).
      await expect(
        insertSecondHome(a.homeEdition.id, a.homeConceptId, b.version.id),
      ).rejects.toThrow(/is not the current approved version/);
      await expect(
        insertSecondHome(b.homeEdition.id, a.homeConceptId, a.version.id),
      ).rejects.toThrow(/second_home_home_edition_fk/);
      const { rows } = await database.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'app' AND table_name = 'home_edition'
           AND column_name IN ('region', 'modality', 'commercial_conditions', 'location')`,
      );
      expect(rows).toEqual([]);
    });

    it('[REQ-020] referência inexistente → ERR_NOT_FOUND, sem gravar nada', async () => {
      const { handlers, run } = harness;
      const missing = randomUUID();

      expectRejected(
        await run(handlers.createHomeConceptVersion, { home_concept_id: missing, ...CONTENT }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.createHomeConceptVersion, {
          brand_partner_id: missing,
          title: 'Casa',
          ...CONTENT,
        }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.createHomeEdition, {
          home_concept_id: missing,
          ...HOME_EDITION_CONTENT,
        }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.registerSecondHome, {
          home_edition_id: missing,
          label: 'Unidade',
          timezone: 'America/Sao_Paulo',
        }),
        'ERR_NOT_FOUND',
      );
      expect(await count(database.pool, 'second_home')).toBe(0);
    });
  });

  describe('[REQ-027] Second Home de Investor', () => {
    it('[REQ-027] sem autorização válida a Second Home é recusada: inexistente, revogada, antes ou depois da vigência, de outro Concept', async () => {
      const { build, handlers, run } = harness;
      const { homeEdition, homeConceptId } = await build.finalizedHomeEdition();
      const other = await build.finalizedHomeEdition();
      const secondHome = (authorizationId: string) =>
        run(handlers.registerSecondHome, {
          home_edition_id: homeEdition.id,
          label: 'Unidade',
          timezone: 'America/Sao_Paulo',
          investor_authorization_id: authorizationId,
        });
      const future = await build.authorization(homeConceptId, new Date(START.getTime() + HOUR));
      const expired = await build.authorization(
        homeConceptId,
        new Date(START.getTime() - 2 * HOUR),
        START,
      );
      const foreign = await build.authorization(other.homeConceptId, START);
      const revoked = await build.authorization(homeConceptId, START);
      await harness.ok(handlers.revokeInvestorAuthorization, {
        investor_authorization_id: revoked.id,
        revocation_basis: 'Distrato 2026-09',
      });

      expectRejected(await secondHome(randomUUID()), 'ERR_NOT_FOUND');
      for (const authorization of [future, expired, foreign, revoked]) {
        expectRejected(await secondHome(authorization.id), 'ERR_STATE_TRANSITION');
      }
      expect(await count(database.pool, 'second_home')).toBe(0);
    });

    it('[REQ-027] com autorização válida, a Second Home existe sem adquirente; a Home Edition não restringe modalidade', async () => {
      const { build } = harness;
      for (const name of ['Edição A', 'Edição B', 'Edição C']) {
        const { homeEdition, homeConceptId } = await build.finalizedHomeEdition({ name });
        const authorization = await build.authorization(
          homeConceptId,
          new Date(START.getTime() - HOUR),
          new Date(START.getTime() + HOUR),
        );
        await expect(build.secondHome(homeEdition.id, authorization.id)).resolves.toMatchObject({
          home_edition_id: homeEdition.id,
          investor_authorization_id: authorization.id,
        });
      }
      // Sem adquirente: titularidade (holding) só nasce com a formalização da W8.
      expect(await count(database.pool, 'holding')).toBe(0);
      expect(await count(database.pool, 'stake')).toBe(0);
      expect(await count(database.pool, 'use_right_ledger')).toBe(0);
      expect(await count(database.pool, 'second_home')).toBe(3);
    });

    it('[REQ-027] o banco recusa Second Home com autorização revogada ou de outro Concept, mesmo fora do command', async () => {
      const { build, handlers } = harness;
      const a = await build.finalizedHomeEdition();
      const b = await build.finalizedHomeEdition();
      const revoked = await build.authorization(a.homeConceptId, START);
      await harness.ok(handlers.revokeInvestorAuthorization, {
        investor_authorization_id: revoked.id,
        revocation_basis: 'Distrato',
      });
      const foreign = await build.authorization(b.homeConceptId, START);
      const insert = async (authorizationId: string) =>
        database.pool.query(
          `INSERT INTO app.second_home (id, home_edition_id, home_concept_id, home_concept_version_id, commercially_approved_at, label,
                                      timezone, investor_authorization_id, operation_id)
           VALUES ($1, $2, $3, $4, $5, 'Unidade', 'America/Sao_Paulo', $6, $7)`,
          [
            randomUUID(),
            a.homeEdition.id,
            a.homeConceptId,
            a.version.id,
            START,
            authorizationId,
            await ownerOperation(database.pool),
          ],
        );

      await expect(insert(revoked.id)).rejects.toThrow(/investor authorization .* is not valid/);
      await expect(insert(foreign.id)).rejects.toThrow(/second_home_investor_authorization_fk/);
    });

    it('[REQ-027] revogação concorrente: o registro espera a revogação comitar e é recusado', async () => {
      const { build, handlers, run } = harness;
      const { homeEdition, homeConceptId } = await build.finalizedHomeEdition();
      const authorization = await build.authorization(homeConceptId, START);
      const other = await holdInOwnerTransaction(
        [
          `UPDATE app.investor_authorization SET revoked_at = now(), revocation_basis = 'Distrato'
           WHERE id = $1`,
        ],
        [[authorization.id]],
      );
      const waiting = run(handlers.registerSecondHome, {
        home_edition_id: homeEdition.id,
        label: 'Unidade',
        timezone: 'America/Sao_Paulo',
        investor_authorization_id: authorization.id,
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expectRejected(await waiting, 'ERR_STATE_TRANSITION');
      expect(await count(database.pool, 'second_home')).toBe(0);
    });

    it('[REQ-027] revogação é única e não muda Second Homes já registradas', async () => {
      const { build, handlers, run } = harness;
      const { homeEdition, homeConceptId } = await build.finalizedHomeEdition();
      const authorization = await build.authorization(homeConceptId, START);
      const secondHome = await build.secondHome(homeEdition.id, authorization.id);
      const revoke = () =>
        run(handlers.revokeInvestorAuthorization, {
          investor_authorization_id: authorization.id,
          revocation_basis: 'Distrato',
        });

      expect(await revoke()).toMatchObject({ status: 'committed' });
      expectRejected(await revoke(), 'ERR_STATE_TRANSITION');
      const { rows } = await database.pool.query(
        'SELECT investor_authorization_id FROM app.second_home WHERE id = $1',
        [secondHome.id],
      );
      expect(rows[0]?.investor_authorization_id).toBe(authorization.id);
    });
  });

  describe('[BR-025] versão fixada na aprovação comercial', () => {
    it('[BR-025] o registro fixa a versão vigente e o instante da aprovação comercial', async () => {
      const { build } = harness;
      const { homeEdition, homeConceptId } = await build.finalizedHomeEdition();
      const v2 = await build.version(homeConceptId);
      await build.approve(v2.id);
      await build.version(homeConceptId); // versão 3 ainda não aprovada: não conta
      clock.advance(HOUR);

      const secondHome = await build.secondHome(homeEdition.id);
      expect(secondHome).toMatchObject({
        home_concept_version_id: v2.id,
        home_concept_version: 2,
        commercially_approved_at: new Date(START.getTime() + HOUR).toISOString(),
      });
    });

    it('[BR-025] versão aprovada depois não altera a Second Home existente; a próxima fixa a nova', async () => {
      const { build } = harness;
      const { homeEdition, homeConceptId, version } = await build.finalizedHomeEdition();
      const first = await build.secondHome(homeEdition.id);
      const v2 = await build.version(homeConceptId);
      await build.approve(v2.id);
      const second = await build.secondHome(homeEdition.id);

      const { rows } = await database.pool.query<{ home_concept_version_id: string }>(
        'SELECT home_concept_version_id FROM app.second_home WHERE id = $1',
        [first.id],
      );
      expect(rows[0]?.home_concept_version_id).toBe(version.id);
      expect(second.home_concept_version_id).toBe(v2.id);
    });

    it('[BR-025] o banco recusa trocar a versão fixada: luxtory_app sem privilégio; dono barrado pelo gatilho', async () => {
      const { build } = harness;
      const { homeEdition, homeConceptId } = await build.finalizedHomeEdition();
      const secondHome = await build.secondHome(homeEdition.id);
      const v2 = await build.version(homeConceptId);
      await build.approve(v2.id);

      await expect(
        db
          .updateTable('app.second_home')
          .set({ home_concept_version_id: v2.id })
          .where('id', '=', secondHome.id)
          .execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(
        database.pool.query(
          'UPDATE app.second_home SET home_concept_version_id = $1 WHERE id = $2',
          [v2.id, secondHome.id],
        ),
      ).rejects.toThrow(/UPDATE on app.second_home is not allowed/);
    });

    it('[BR-025] o banco recusa Second Home que fixe uma versão aprovada que já não é a vigente', async () => {
      const { build } = harness;
      const { homeEdition, homeConceptId, version } = await build.finalizedHomeEdition();
      const v2 = await build.version(homeConceptId);
      await build.approve(v2.id);

      await expect(
        database.pool.query(
          `INSERT INTO app.second_home (id, home_edition_id, home_concept_id, home_concept_version_id, commercially_approved_at, label,
                                      timezone, operation_id)
           VALUES ($1, $2, $3, $4, now(), 'Unidade', 'America/Sao_Paulo', $5)`,
          [
            randomUUID(),
            homeEdition.id,
            homeConceptId,
            version.id,
            await ownerOperation(database.pool),
          ],
        ),
      ).rejects.toThrow(/is not the current approved version/);
    });

    it('[BR-025] aprovação concorrente: a Second Home espera e fixa a versão vigente no seu commit', async () => {
      const { build, handlers, run } = harness;
      const { homeEdition, homeConceptId, partner } = await build.finalizedHomeEdition();
      const v2 = await build.version(homeConceptId);
      const op = await ownerOperation(database.pool, 'approve_home_concept_version');
      const other = await holdInOwnerTransaction(
        [
          'SELECT id FROM app.brand_partner WHERE id = $1 FOR NO KEY UPDATE',
          `UPDATE app.home_concept_version SET state = 'approved', approval_refs = ARRAY['Ata'], approved_at = now(),
             approved_by_user_id = $2, approved_role = 'admin', approval_operation_id = $3 WHERE id = $1`,
        ],
        [[partner.id], [v2.id, randomUUID(), op]],
      );
      const waiting = run(handlers.registerSecondHome, {
        home_edition_id: homeEdition.id,
        label: 'Unidade',
        timezone: 'America/Sao_Paulo',
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expect(await waiting).toMatchObject({
        status: 'committed',
        result: { home_concept_version_id: v2.id, home_concept_version: 2 },
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
      const { partner, homeConceptId, homeEdition } = await build.finalizedHomeEdition();
      const draft = await build.version(homeConceptId);
      const authorization = await build.authorization(homeConceptId, START);
      const investor = await build.investorParty();
      expect(await terminate(partner.id, new Date(START.getTime() - HOUR))).toMatchObject({
        status: 'committed',
      });
      const before = await Promise.all(
        [
          'home_concept',
          'home_concept_version',
          'home_edition',
          'investor_authorization',
          'second_home',
        ].map((t) => count(database.pool, t)),
      );

      const attempts = [
        run(handlers.createHomeConceptVersion, {
          brand_partner_id: partner.id,
          title: 'Nova',
          ...CONTENT,
        }),
        run(handlers.createHomeConceptVersion, { home_concept_id: homeConceptId, ...CONTENT }),
        run(handlers.approveHomeConceptVersion, {
          home_concept_version_id: draft.id,
          approval_refs: ['Ata'],
        }),
        run(handlers.createHomeEdition, {
          home_concept_id: homeConceptId,
          ...HOME_EDITION_CONTENT,
        }),
        run(handlers.registerInvestorAuthorization, {
          home_concept_id: homeConceptId,
          investor_document: investor.document,
          instrument_ref: 'Instrumento',
          valid_from: START.toISOString(),
        }),
        run(handlers.registerSecondHome, {
          home_edition_id: homeEdition.id,
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
        [
          'home_concept',
          'home_concept_version',
          'home_edition',
          'investor_authorization',
          'second_home',
        ].map((t) => count(database.pool, t)),
      );
      expect(after).toEqual(before);
    });

    it('[BR-021] eficácia futura: novos usos seguem permitidos até ela e são recusados a partir dela', async () => {
      const { build, handlers, run } = harness;
      const { partner, homeConceptId } = await build.finalizedHomeEdition();
      await terminate(partner.id, new Date(START.getTime() + HOUR));
      const homeEdition = () =>
        run(handlers.createHomeEdition, {
          home_concept_id: homeConceptId,
          ...HOME_EDITION_CONTENT,
        });

      expect(await homeEdition()).toMatchObject({ status: 'committed' });
      clock.set(new Date(START.getTime() + HOUR));
      expectRejected(await homeEdition(), 'ERR_STATE_TRANSITION');
    });

    it('[BR-021] o encerramento não apaga a autorização de exposição nem muda o que existe; é registrado uma vez', async () => {
      const { build, handlers } = harness;
      const partner = await harness.ok(handlers.registerBrandPartner, {
        brand_name: 'Maison Exposta',
        exposure_authorization_ref: 'Autorização de exposição 2026-09',
      });
      const version = await build.homeConcept(partner.id);
      await build.approve(version.id);
      const homeEdition = await build.homeEdition(version.home_concept_id);
      await build.finalize(homeEdition.id);
      const secondHome = await build.secondHome(homeEdition.id);

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
        `SELECT (SELECT count(*)::int FROM app.second_home WHERE id = $1) AS second_homes,
                (SELECT state FROM app.home_concept_version WHERE id = $2) AS state`,
        [secondHome.id, version.id],
      );
      expect(rows[0]).toEqual({ second_homes: 1, state: 'approved' });
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

    it('[BR-021] encerramento concorrente: a Home Edition nova espera o encerramento comitar e é recusada', async () => {
      const { build, handlers, run } = harness;
      const { partner, homeConceptId } = await build.finalizedHomeEdition();
      const other = await holdInOwnerTransaction(
        [
          `UPDATE app.brand_partner SET terminated_effective_at = $2, termination_basis = 'Aditivo',
             termination_registered_at = now() WHERE id = $1`,
        ],
        [[partner.id, new Date(START.getTime() - HOUR)]],
      );
      const waiting = run(handlers.createHomeEdition, {
        home_concept_id: homeConceptId,
        ...HOME_EDITION_CONTENT,
      });
      await waitForLockWaiter(database.pool);
      await other.release();

      expectRejected(await waiting, 'ERR_STATE_TRANSITION');
      expect(await count(database.pool, 'home_edition')).toBe(1);
    });
  });

  describe('[BR-036] Home Edition: preparação, finalização material e visibilidade pública', () => {
    const editionColumns = (id: string) =>
      database.pool
        .query(
          `SELECT material_state, visibility, withdrawal_basis, name, description, typology, suites, finalized_at
           FROM app.home_edition WHERE id = $1`,
          [id],
        )
        .then(({ rows }) => rows[0]);

    it('[BR-036] em preparação a definição material é editável; a finalização acontece uma vez e congela o material', async () => {
      const { build, handlers, run, ok } = harness;
      const { homeEdition } = await build.approvedHomeEdition();
      const changed = { ...HOME_EDITION_CONTENT, typology: 'Casa em dois pavimentos', suites: 5 };

      await expect(
        ok(handlers.updateHomeEditionDraft, { home_edition_id: homeEdition.id, ...changed }),
      ).resolves.toMatchObject({
        typology: 'Casa em dois pavimentos',
        suites: 5,
        material_state: 'draft',
      });
      // Em preparação: não publica, não corrige texto editorial, não origina Second Home.
      expectRejected(
        await run(handlers.publishHomeEdition, { home_edition_id: homeEdition.id }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.correctHomeEditionEditorial, {
          home_edition_id: homeEdition.id,
          name: 'Outro nome',
          correction_basis: 'Ajuste',
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.registerSecondHome, {
          home_edition_id: homeEdition.id,
          label: 'Unidade',
          timezone: 'America/Sao_Paulo',
        }),
        'ERR_STATE_TRANSITION',
      );

      clock.advance(HOUR);
      await expect(build.finalize(homeEdition.id)).resolves.toMatchObject({
        material_state: 'finalized',
        visibility: 'hidden',
        finalized_at: new Date(START.getTime() + HOUR).toISOString(),
      });
      expectRejected(
        await run(handlers.finalizeHomeEdition, { home_edition_id: homeEdition.id }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.updateHomeEditionDraft, { home_edition_id: homeEdition.id, ...changed }),
        'ERR_STATE_TRANSITION',
      );
      // Finalizada e ainda fora do site: já origina Second Home (a visibilidade não é condição).
      await expect(build.secondHome(homeEdition.id)).resolves.toMatchObject({
        home_edition_id: homeEdition.id,
      });
    });

    it('[BR-036] publicar exige a finalização; retirar do público volta a fora do site sem reabrir a definição material', async () => {
      const { build, handlers, run, ok } = harness;
      const { homeEdition } = await build.finalizedHomeEdition();

      await expect(build.publish(homeEdition.id)).resolves.toMatchObject({ visibility: 'public' });
      expectRejected(
        await run(handlers.publishHomeEdition, { home_edition_id: homeEdition.id }),
        'ERR_STATE_TRANSITION',
      );
      await expect(
        ok(handlers.withdrawHomeEdition, {
          home_edition_id: homeEdition.id,
          withdrawal_basis: 'Revisão das imagens',
        }),
      ).resolves.toMatchObject({
        visibility: 'hidden',
        material_state: 'finalized',
        withdrawal_basis: 'Revisão das imagens',
      });
      expectRejected(
        await run(handlers.withdrawHomeEdition, {
          home_edition_id: homeEdition.id,
          withdrawal_basis: 'De novo',
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.updateHomeEditionDraft, {
          home_edition_id: homeEdition.id,
          ...HOME_EDITION_CONTENT,
        }),
        'ERR_STATE_TRANSITION',
      );
      // Pode ser publicada de novo; a base da retirada anterior sai com a publicação.
      await expect(build.publish(homeEdition.id)).resolves.toMatchObject({
        visibility: 'public',
        withdrawal_basis: null,
      });
    });

    it('[BR-036] correção editorial muda só nome e descrição de Home Edition finalizada, com base e auditoria', async () => {
      const { build, handlers, ok, run } = harness;
      const { homeEdition } = await build.finalizedHomeEdition();

      await expect(
        ok(handlers.correctHomeEditionEditorial, {
          home_edition_id: homeEdition.id,
          name: 'Casa do Pátio — Edição Maré',
          correction_basis: 'Ajuste de nome',
        }),
      ).resolves.toMatchObject({
        name: 'Casa do Pátio — Edição Maré',
        description: HOME_EDITION_CONTENT.description,
        typology: HOME_EDITION_CONTENT.typology,
      });
      expectRejected(
        await run(handlers.correctHomeEditionEditorial, {
          home_edition_id: homeEdition.id,
          name: 'Casa do Pátio — Edição Maré',
          correction_basis: 'Sem mudança',
        }),
        'ERR_VALIDATION',
      );
      const { rows } = await database.pool.query<{
        before: { home_edition_name: string };
        after: { home_edition_name: string; correction_basis: string };
      }>(
        `SELECT a.before, a.after FROM app.audit_log a JOIN app.operation o ON o.id = a.operation_id
         WHERE o.command = 'correct_home_edition_editorial'`,
      );
      expect(rows).toHaveLength(1);
      // `name` é chave redigida na auditoria (dado pessoal); o nome de produto vai como `home_edition_name`.
      expect(rows[0]?.before.home_edition_name).toBe(HOME_EDITION_CONTENT.name);
      expect(rows[0]?.after).toMatchObject({
        home_edition_name: 'Casa do Pátio — Edição Maré',
        correction_basis: 'Ajuste de nome',
      });
    });

    it('[BR-036] o banco congela a definição material finalizada em qualquer caminho de escrita; identidade nunca muda', async () => {
      const { build } = harness;
      const { homeEdition, homeConceptId: otherConcept } = await build.finalizedHomeEdition();
      const draft = await build.approvedHomeEdition();

      await expect(
        database.pool.query(`UPDATE app.home_edition SET suites = 9 WHERE id = $1`, [
          homeEdition.id,
        ]),
      ).rejects.toThrow(/home_edition_material_immutable|material/);
      await expect(
        database.pool.query(`UPDATE app.home_edition SET home_concept_id = $2 WHERE id = $1`, [
          draft.homeEdition.id,
          otherConcept,
        ]),
      ).rejects.toThrow(/home_edition_identity|identity/);
      expect(await editionColumns(homeEdition.id)).toMatchObject({
        suites: HOME_EDITION_CONTENT.suites,
        material_state: 'finalized',
      });
    });

    it('[BR-021] encerrada a marca, nada se expõe nem se finaliza; retirar do público continua valendo', async () => {
      const { build, handlers, run } = harness;
      const exposed = await build.finalizedHomeEdition();
      await build.publish(exposed.homeEdition.id);
      const draft = await build.homeEdition(exposed.homeConceptId, {
        name: 'Edição em preparação',
      });
      await harness.run(harness.handlers.terminateBrandPartner, {
        brand_partner_id: exposed.partner.id,
        terminated_effective_at: new Date(START.getTime() - HOUR).toISOString(),
        termination_basis: 'Aditivo',
      });

      expectRejected(
        await run(handlers.finalizeHomeEdition, { home_edition_id: draft.id }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await run(handlers.updateHomeEditionDraft, {
          home_edition_id: draft.id,
          ...HOME_EDITION_CONTENT,
        }),
        'ERR_STATE_TRANSITION',
      );
      await expect(
        harness.ok(handlers.withdrawHomeEdition, {
          home_edition_id: exposed.homeEdition.id,
          withdrawal_basis: 'Encerramento da parceria',
        }),
      ).resolves.toMatchObject({ visibility: 'hidden' });
    });
  });

  describe('[REQ-015] auditoria, idempotência e terminologia', () => {
    it('[REQ-015] [TECH-092] cada operação comitada grava operation e audit_log com antes/depois e o papel exercido', async () => {
      const { build } = harness;
      const partner = await build.brandPartner();
      const version = await build.homeConcept(partner.id);
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
          command: 'create_home_concept_version',
          state: 'committed',
          role: 'admin',
          object_type: 'home_concept',
          has_before: false,
        },
        {
          command: 'create_home_concept_version',
          state: 'committed',
          role: 'admin',
          object_type: 'home_concept_version',
          has_before: false,
        },
        {
          command: 'approve_home_concept_version',
          state: 'committed',
          role: 'admin',
          object_type: 'home_concept_version',
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

  describe('[REQ-027] party do Investor (W7, D-W3-1)', () => {
    async function persisted(table: string): Promise<string> {
      const { rows } = await database.pool.query(
        `SELECT to_jsonb(t)::text AS row FROM app.${table} t`,
      );
      return rows.map((row: { row: string }) => row.row).join('\n');
    }

    it('[REQ-027] nova autorização referencia exatamente a party existente; documento com outra máscara resolve para a mesma party', async () => {
      const { build } = harness;
      const { homeConceptId } = await build.finalizedHomeEdition();
      const investor = await build.investorParty();
      const plain = await build.authorization(homeConceptId, START, undefined, investor.document);
      const masked = await build.authorization(
        homeConceptId,
        START,
        undefined,
        punctuatedCpf(investor.document),
      );

      expect(plain.party_id).toBe(investor.id);
      expect(masked.party_id).toBe(investor.id);
      expect(await count(database.pool, 'party')).toBe(1);
    });

    it('[REQ-027] CPF/CNPJ sem party → ERR_NOT_FOUND, nada gravado; documento inválido → ERR_VALIDATION', async () => {
      const { build, handlers, run } = harness;
      const { homeConceptId } = await build.finalizedHomeEdition();
      const before = await Promise.all(
        ['party', 'investor_authorization'].map((t) => count(database.pool, t)),
      );
      const input = {
        home_concept_id: homeConceptId,
        instrument_ref: 'Contrato',
        valid_from: START.toISOString(),
      };

      expectRejected(
        await run(handlers.registerInvestorAuthorization, {
          ...input,
          investor_document: validCpf('192837465'),
        }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await run(handlers.registerInvestorAuthorization, {
          ...input,
          investor_document: '000.000.000-00',
        }),
        'ERR_VALIDATION',
      );
      expect(
        await Promise.all(['party', 'investor_authorization'].map((t) => count(database.pool, t))),
      ).toEqual(before);
    });

    it('[TECH-100] o CPF do Investor não fica no banco: nem na autorização, nem na operation, idempotência ou audit_log', async () => {
      const { build } = harness;
      const { homeConceptId } = await build.finalizedHomeEdition();
      const investor = await build.investorParty();
      await build.authorization(homeConceptId, START, undefined, punctuatedCpf(investor.document));

      for (const table of [
        'investor_authorization',
        'operation',
        'idempotency_record',
        'audit_log',
        'outbox',
      ]) {
        const text = await persisted(table);
        expect(text, table).not.toContain(investor.document);
        expect(text, table).not.toContain(punctuatedCpf(investor.document));
      }
    });

    it('[REQ-027] vigência e revogação da autorização continuam as da D-W3-1', async () => {
      const { build, handlers, ok } = harness;
      const { homeConceptId } = await build.finalizedHomeEdition();
      const authorization = await build.authorization(
        homeConceptId,
        START,
        new Date(START.getTime() + HOUR),
      );
      const revoked = await ok(handlers.revokeInvestorAuthorization, {
        investor_authorization_id: authorization.id,
        revocation_basis: 'Distrato',
      });

      expect(authorization.valid_until).toBe(new Date(START.getTime() + HOUR).toISOString());
      expect(revoked).toMatchObject({
        party_id: authorization.party_id,
        revocation_basis: 'Distrato',
      });
    });
  });
});
