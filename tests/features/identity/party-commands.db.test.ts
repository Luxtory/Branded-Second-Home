import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExercisedAdminSession } from '@/features/admin';
import { createDocumentProtector } from '@/features/identity/infrastructure/pii/document-protector';
import {
  readPartyDetail,
  readPartyDirectory,
  readPartyDocument,
  lookupPartyByDocument,
} from '@/features/identity/presentation/party-admin-read';
import {
  readRepresentation,
  readTitularOverview,
} from '@/features/identity/presentation/titular-read';
import type { Database } from '@/features/platform';
import { expectRejected } from '../../support/catalog-fixtures';
import {
  fakeAccounts,
  keysOf,
  punctuatedCpf,
  partyHarness,
  ringSpec,
  rotated,
  STAFF_ID,
  titularActor,
  validCnpj,
  validCpf,
} from '../../support/party-fixtures';
import { appDatabase } from '../../support/platform-fixtures';
import { createTestDatabase, type TestDatabase } from '../../support/test-database';

// W7 com PostgreSQL real (spec identity §13): commands pelo executor de produção como `luxtory_app`, cifra e HMAC reais,
// leituras do Admin auditadas e da Área do Titular sob RLS.
const CPF = validCpf('123456789');
const CNPJ = validCnpj('12ABC34501DE');
const EMAIL = 'representante@exemplo.test';
const clock = { now: () => new Date() };
const ADMIN_SESSION: ExercisedAdminSession = {
  userId: STAFF_ID,
  roles: ['admin'],
  role: 'admin',
  authorizationRef: 'staff_role:test',
};

describe('party, delegação e leituras (TECH-050, TECH-052, TECH-100, ADR-0002)', () => {
  let database: TestDatabase;
  let db: Database;
  let spec = ringSpec();
  let harness: ReturnType<typeof partyHarness>;

  beforeEach(async () => {
    database = await createTestDatabase();
    db = appDatabase(database.appUrl);
    spec = ringSpec();
    harness = partyHarness(db, clock, { protector: createDocumentProtector(keysOf(spec)) });
  });

  afterEach(async () => {
    await db.destroy();
    await database.drop();
  });

  /** Texto de todas as tabelas onde um documento ou e-mail poderia vazar por engano (TECH-100). */
  async function persistedText(): Promise<string> {
    const tables = [
      'party',
      'party_delegation',
      'operation',
      'idempotency_record',
      'audit_log',
      'outbox',
      'notification',
    ];
    const dumps = await Promise.all(
      tables.map(async (table) => {
        const { rows } = await database.pool.query(
          `SELECT to_jsonb(t)::text AS row FROM app.${table} t`,
        );
        return rows.map((row: { row: string }) => row.row).join('\n');
      }),
    );
    return dumps.join('\n');
  }

  const register = (document: string) => harness.ok(harness.handlers.registerParty, { document });

  async function invite(partyId: string, email = EMAIL, extra: Record<string, unknown> = {}) {
    return harness.ok(harness.handlers.createPartyDelegation, {
      party_id: partyId,
      email,
      basis: 'Procuração 2026-10',
      ...extra,
    });
  }

  describe('[TECH-100] cadastro: cifra, HMAC e nenhum documento em claro', () => {
    it('[TECH-100] CPF/CNPJ nunca em claro no banco (party, operation, idempotência, audit, outbox) nem na resposta', async () => {
      const cpfParty = await register(punctuatedCpf(CPF));
      const cnpjParty = await register(CNPJ.toLowerCase());
      const text = await persistedText();

      expect(cpfParty).toEqual({
        id: expect.any(String),
        document_type: 'cpf',
        operation_id: expect.any(String),
        created_at: expect.any(String),
      });
      expect(cnpjParty.document_type).toBe('cnpj');
      const middle = `${CPF.slice(3, 6)}.${CPF.slice(6, 9)}`;
      for (const leaked of [CPF, punctuatedCpf(CPF), middle, CNPJ, CNPJ.toLowerCase()]) {
        expect(text).not.toContain(leaked);
      }
      const { rows } = await database.pool.query(
        `SELECT object_type, after FROM app.audit_log WHERE object_type = 'party' ORDER BY id`,
      );
      expect(rows[0]?.after).toEqual(cpfParty);
    });

    it('[TECH-100] HMAC barra duplicidade: mesmo documento com outra máscara → ERR_STATE_TRANSITION', async () => {
      await register(CPF);

      expectRejected(
        await harness.run(harness.handlers.registerParty, { document: punctuatedCpf(CPF) }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await harness.run(harness.handlers.registerParty, { document: `${CPF.slice(0, 10)}x` }),
        'ERR_VALIDATION',
      );
    });

    it('[TECH-100] corrida entre dois cadastros do mesmo documento: um entra, o outro cai no UNIQUE (ERR_STATE_TRANSITION)', async () => {
      const outcomes = await Promise.all([
        harness.run(harness.handlers.registerParty, { document: CPF }),
        harness.run(harness.handlers.registerParty, { document: punctuatedCpf(CPF) }),
      ]);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['committed', 'rejected']);
      expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
        code: 'ERR_STATE_TRANSITION',
      });
    });

    it('[TECH-100] idempotência: replay com o mesmo documento; o hash usa o pseudônimo chaveado, não o documento', async () => {
      const key = randomUUID();
      const first = await harness.run(harness.handlers.registerParty, { document: CPF }, { key });
      const replay = await harness.run(
        harness.handlers.registerParty,
        { document: punctuatedCpf(CPF) },
        { key },
      );
      const conflict = await harness.run(
        harness.handlers.registerParty,
        { document: validCpf('111222333') },
        { key },
      );

      expect(replay).toMatchObject({ status: 'committed', replayed: true });
      expect(
        first.status === 'committed' && replay.status === 'committed' && replay.result.id,
      ).toBe(first.status === 'committed' ? first.result.id : null);
      expectRejected(conflict, 'ERR_IDEMPOTENCY_CONFLICT');
    });
  });

  describe('[TECH-100] logs sem PII', () => {
    it('[TECH-100] logs do executor (commit, recusa) nunca levam documento nem e-mail', async () => {
      const party = await register(punctuatedCpf(CPF));
      await harness.run(harness.handlers.registerParty, { document: CPF });
      await invite(party.id);
      await harness.run(harness.handlers.createPartyDelegation, {
        party_id: party.id,
        email: EMAIL,
        basis: 'B',
      });
      const logged = JSON.stringify([
        harness.log.info.mock.calls,
        harness.log.warn.mock.calls,
        harness.log.error.mock.calls,
      ]);

      expect(logged).toContain('command committed');
      expect(logged).toContain('command rejected');
      for (const leaked of [CPF, punctuatedCpf(CPF), EMAIL, 'representante']) {
        expect(logged).not.toContain(leaked);
      }
    });
  });

  describe('[ADR-0002] rotação de chaves', () => {
    it('[ADR-0002] rotação da chave de cifra: party antiga legível no Admin; party nova com o key_id novo', async () => {
      const old = await register(CPF);
      const next = rotated(spec.encryption, 'e2');
      const rotatedProtector = createDocumentProtector(
        keysOf({ ...spec, encryption: next.ring, encryptionActive: next.active }),
      );
      const after = partyHarness(db, clock, { protector: rotatedProtector });
      const fresh = await after.ok(after.handlers.registerParty, { document: CNPJ });

      const oldDocument = await readPartyDocument(ADMIN_SESSION, old.id, {
        db,
        protector: rotatedProtector,
      });
      const { rows } = await database.pool.query<{ id: string; document_key_id: string }>(
        `SELECT id, document_key_id FROM app.party ORDER BY created_at`,
      );
      expect(oldDocument).toEqual({ documentType: 'cpf', document: punctuatedCpf(CPF) });
      expect(rows).toEqual([
        { id: old.id, document_key_id: 'e1' },
        { id: fresh.id, document_key_id: 'e2' },
      ]);
    });

    it('[ADR-0002] rotação do segredo do HMAC: party antiga encontrada e duplicidade continua barrada', async () => {
      const old = await register(CPF);
      const next = rotated(spec.hmac, 'h2');
      const rotatedProtector = createDocumentProtector(
        keysOf({ ...spec, hmac: next.ring, hmacActive: next.active }),
      );
      const after = partyHarness(db, clock, { protector: rotatedProtector });

      expectRejected(
        await after.run(after.handlers.registerParty, { document: punctuatedCpf(CPF) }),
        'ERR_STATE_TRANSITION',
      );
      await expect(
        lookupPartyByDocument(
          ADMIN_SESSION,
          { type: 'cpf', value: CPF },
          { db, protector: rotatedProtector },
        ),
      ).resolves.toBe(old.id);
      const fresh = await after.ok(after.handlers.registerParty, { document: CNPJ });
      const { rows } = await database.pool.query(
        `SELECT document_hmac_key_id FROM app.party WHERE id = $1`,
        [fresh.id],
      );
      expect(rows[0]).toEqual({ document_hmac_key_id: 'h2' });
    });
  });

  describe('[TECH-050] convite, ativação e revogação', () => {
    it('[TECH-050] conta nova: convite pelo Supabase, delegação pendente; o e-mail não fica no banco da aplicação', async () => {
      const party = await register(CPF);
      const delegation = await invite(party.id, ' Representante@Exemplo.test ');

      expect(delegation).toMatchObject({
        party_id: party.id,
        scope: 'party',
        state: 'pending',
        activated_at: null,
      });
      expect(harness.accounts.invites).toEqual([EMAIL]);
      expect(await persistedText()).not.toContain('representante@exemplo');
    });

    it('[TECH-050] conta já confirmada: vinculada sem conta nova nem e-mail; continua pendente até a ativação', async () => {
      const userId = randomUUID();
      const accounts = fakeAccounts({ [EMAIL]: { userId, confirmed: true } });
      const withAccount = partyHarness(db, clock, { protector: harness.protector, accounts });
      const party = await register(CPF);
      const delegation = await withAccount.ok(withAccount.handlers.createPartyDelegation, {
        party_id: party.id,
        email: EMAIL,
        basis: 'Contrato social',
      });

      expect(delegation).toMatchObject({ user_id: userId, state: 'pending' });
      expect(accounts.invites).toEqual([]);
    });

    it('[TECH-050] par com delegação aberta → ERR_STATE_TRANSITION antes de qualquer e-mail; party inexistente → ERR_NOT_FOUND', async () => {
      const party = await register(CPF);
      await invite(party.id);
      harness.accounts.invites.length = 0;

      expectRejected(
        await harness.run(harness.handlers.createPartyDelegation, {
          party_id: party.id,
          email: EMAIL,
          basis: 'B',
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await harness.run(harness.handlers.createPartyDelegation, {
          party_id: randomUUID(),
          email: EMAIL,
          basis: 'B',
        }),
        'ERR_NOT_FOUND',
      );
      expectRejected(
        await harness.run(harness.handlers.createPartyDelegation, {
          party_id: party.id,
          email: 'outra@exemplo.test',
          basis: 'B',
          valid_until: new Date(Date.now() - 60_000).toISOString(),
        }),
        'ERR_VALIDATION',
      );
      expect(harness.accounts.invites).toEqual([]);
    });

    it('[TECH-050] ativação só pelo próprio convidado; de outro usuário → ERR_PERMISSION; já ativa ou revogada → ERR_STATE_TRANSITION', async () => {
      const party = await register(CPF);
      const delegation = await invite(party.id);
      const owner = titularActor(delegation.user_id);
      const stranger = titularActor(randomUUID());
      const activate = (actor = owner) =>
        harness.run(
          harness.handlers.activatePartyDelegation,
          { party_delegation_id: delegation.id },
          { actor },
        );

      expectRejected(await activate(stranger), 'ERR_PERMISSION');
      expect(await activate()).toMatchObject({ status: 'committed', result: { state: 'active' } });
      expectRejected(await activate(), 'ERR_STATE_TRANSITION');
      const { rows } = await database.pool.query(
        `SELECT o.role, o.authorization_ref, a.before ->> 'state' AS before, a.after ->> 'state' AS after
           FROM app.operation o JOIN app.audit_log a ON a.operation_id = o.id
          WHERE o.command = 'activate_party_delegation' AND o.state = 'committed'`,
      );
      expect(rows).toEqual([
        { role: 'titular', authorization_ref: 'base:test', before: 'pending', after: 'active' },
      ]);
    });

    it('[TECH-050] delegação pendente expirada não ativa; revogada não ativa', async () => {
      const party = await register(CPF);
      const soon = new Date(Date.now() + 60_000);
      const delegation = await invite(party.id, EMAIL, { valid_until: soon.toISOString() });
      const late = partyHarness(
        db,
        { now: () => new Date(soon.getTime() + 1) },
        { protector: harness.protector },
      );

      expectRejected(
        await late.run(
          late.handlers.activatePartyDelegation,
          { party_delegation_id: delegation.id },
          {
            actor: titularActor(delegation.user_id),
          },
        ),
        'ERR_STATE_TRANSITION',
      );
      await harness.ok(harness.handlers.revokePartyDelegation, {
        party_delegation_id: delegation.id,
        revocation_basis: 'Convite cancelado',
      });
      expectRejected(
        await harness.run(
          harness.handlers.activatePartyDelegation,
          { party_delegation_id: delegation.id },
          {
            actor: titularActor(delegation.user_id),
          },
        ),
        'ERR_STATE_TRANSITION',
      );
    });

    it('[TECH-050] revogação: pendente ou ativa → revogada com base e auditoria; revogada de novo → 409; inexistente → 404', async () => {
      const party = await register(CPF);
      const delegation = await invite(party.id);
      await harness.ok(
        harness.handlers.activatePartyDelegation,
        { party_delegation_id: delegation.id },
        {
          actor: titularActor(delegation.user_id),
        },
      );
      const revoked = await harness.ok(harness.handlers.revokePartyDelegation, {
        party_delegation_id: delegation.id,
        revocation_basis: 'Fim da procuração',
      });

      expect(revoked).toMatchObject({ state: 'revoked', revocation_basis: 'Fim da procuração' });
      expectRejected(
        await harness.run(harness.handlers.revokePartyDelegation, {
          party_delegation_id: delegation.id,
          revocation_basis: 'De novo',
        }),
        'ERR_STATE_TRANSITION',
      );
      expectRejected(
        await harness.run(harness.handlers.revokePartyDelegation, {
          party_delegation_id: randomUUID(),
          revocation_basis: 'X',
        }),
        'ERR_NOT_FOUND',
      );
    });
  });

  describe('[TECH-052] Área do Titular sob RLS e leituras do Admin', () => {
    async function activeFor(document: string, email: string) {
      const party = await register(document);
      const delegation = await invite(party.id, email);
      await harness.ok(
        harness.handlers.activatePartyDelegation,
        { party_delegation_id: delegation.id },
        {
          actor: titularActor(delegation.user_id),
        },
      );
      return {
        party,
        delegation,
        session: { userId: delegation.user_id, assurance: 'aal1' as const },
      };
    }

    it('[TECH-052] Titular A vê só a própria party (mascarada); não lê a de B nem pelo id', async () => {
      const a = await activeFor(CPF, 'a@exemplo.test');
      const b = await activeFor(CNPJ, 'b@exemplo.test');
      const deps = { db, protector: harness.protector };

      const overview = await readTitularOverview(a.session, deps);
      expect(overview.representations).toEqual([
        expect.objectContaining({
          partyId: a.party.id,
          documentType: 'cpf',
          maskedDocument: `***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`,
        }),
      ]);
      await expect(readRepresentation(a.session, b.party.id, deps)).resolves.toBeNull();
      await expect(readRepresentation(b.session, b.party.id, deps)).resolves.toMatchObject({
        documentType: 'cnpj',
        maskedDocument: '**.ABC.345/01DE-**',
      });
    });

    it('[TECH-050] sem delegação vigente nada aparece: convite pendente sem documento; revogada some na hora', async () => {
      const party = await register(CPF);
      const delegation = await invite(party.id);
      const session = { userId: delegation.user_id, assurance: 'aal1' as const };
      const deps = { db, protector: harness.protector };

      const pending = await readTitularOverview(session, deps);
      expect(pending).toEqual({
        representations: [],
        pending: [{ delegationId: delegation.id, invitedAt: expect.any(Date) }],
      });
      await harness.ok(
        harness.handlers.activatePartyDelegation,
        { party_delegation_id: delegation.id },
        {
          actor: titularActor(delegation.user_id),
        },
      );
      expect((await readTitularOverview(session, deps)).representations).toHaveLength(1);
      await harness.ok(harness.handlers.revokePartyDelegation, {
        party_delegation_id: delegation.id,
        revocation_basis: 'Fim',
      });
      await expect(readTitularOverview(session, deps)).resolves.toEqual({
        representations: [],
        pending: [],
      });
      await expect(
        readTitularOverview({ userId: randomUUID(), assurance: 'aal2' }, deps),
      ).resolves.toEqual({
        representations: [],
        pending: [],
      });
    });

    it('[TECH-092] leituras do Admin gravam admin_read (lista, busca, detalhe, documento completo) sem o documento', async () => {
      const party = await register(CPF);
      await invite(party.id);
      const deps = { db, protector: harness.protector };

      const list = await readPartyDirectory(ADMIN_SESSION, deps);
      const detail = await readPartyDetail(ADMIN_SESSION, party.id, deps);
      const document = await readPartyDocument(ADMIN_SESSION, party.id, deps);
      const missing = await lookupPartyByDocument(
        ADMIN_SESSION,
        { type: 'cpf', value: validCpf('555666777') },
        deps,
      );
      const { rows } = await database.pool.query(
        `SELECT object_type, object_id, role, authorization_ref FROM app.audit_log
          WHERE event_type = 'admin_read' ORDER BY id`,
      );

      expect(list).toEqual([
        expect.objectContaining({
          id: party.id,
          maskedDocument: `***.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-**`,
        }),
      ]);
      expect(detail?.delegations).toEqual([expect.objectContaining({ state: 'pending' })]);
      expect(document).toEqual({ documentType: 'cpf', document: punctuatedCpf(CPF) });
      expect(missing).toBeNull();
      expect(rows).toEqual([
        {
          object_type: 'party_directory',
          object_id: 'list',
          role: 'admin',
          authorization_ref: 'staff_role:test',
        },
        {
          object_type: 'party',
          object_id: party.id,
          role: 'admin',
          authorization_ref: 'staff_role:test',
        },
        {
          object_type: 'party_document',
          object_id: party.id,
          role: 'admin',
          authorization_ref: 'staff_role:test',
        },
        {
          object_type: 'party_directory',
          object_id: 'not_found',
          role: 'admin',
          authorization_ref: 'staff_role:test',
        },
      ]);
      expect(await persistedText()).not.toContain(CPF);
    });
  });
});
