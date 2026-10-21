import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDelegation, ownerParty } from '../support/party-fixtures';
import { createTestDatabase, type TestDatabase } from '../support/test-database';

// W7 no banco (spec identity §13.3, §13.9): party imutável, delegação com transições fechadas, RLS por party (TECH-052)
// e funções de conta restritas (ADR-0020 §8).
const USER_A = '00000000-0000-4000-8000-00000000a0a1';
const USER_B = '00000000-0000-4000-8000-00000000a0b1';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

const claims = (sub: string) => JSON.stringify({ sub, role: 'authenticated' });

describe('party e party_delegation no banco (TECH-052, TECH-100)', () => {
  let database: TestDatabase;
  let app: pg.Client;

  /** Leitura como o servidor faz (`withUserRead`): `authenticated` + claims só na transação. */
  async function asUser<T>(sub: string, query: string): Promise<T[]> {
    await app.query('BEGIN READ ONLY');
    try {
      await app.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims(sub)]);
      await app.query('SET LOCAL ROLE authenticated');
      return (await app.query(query)).rows as T[];
    } finally {
      await app.query('ROLLBACK');
    }
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  it('[TECH-100] party: nenhuma coluna de documento em claro; cifra e HMAC com tamanho fixo e HMAC UNIQUE', async () => {
    const { rows } = await database.pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'party' ORDER BY column_name`,
    );
    const partyId = await ownerParty(database.pool);
    const { rows: hmac } = await database.pool.query<{ document_hmac: Buffer }>(
      `SELECT document_hmac FROM app.party WHERE id = $1`,
      [partyId],
    );

    expect(rows.map((row) => row.column_name)).toEqual([
      'created_at',
      'document_ciphertext',
      'document_hmac',
      'document_hmac_key_id',
      'document_key_id',
      'document_type',
      'id',
      'operation_id',
      'registered_by_user_id',
      'registered_role',
    ]);
    expect(rows.find((row) => row.column_name === 'document_ciphertext')?.data_type).toBe('bytea');
    await expect(
      ownerParty(database.pool, randomUUID(), { hmac: hmac[0]?.document_hmac }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'conflict_party_document_hmac' });
    expect(hmac[0]?.document_hmac).toHaveLength(32);
  });

  it('[TECH-052] party é imutável: sem UPDATE/DELETE/TRUNCATE, nem pelo dono; luxtory_app só lê e insere', async () => {
    const partyId = await ownerParty(database.pool);

    await expect(
      database.pool.query(`UPDATE app.party SET document_key_id = 'e9' WHERE id = $1`, [partyId]),
    ).rejects.toThrow(/not allowed/);
    await expect(database.pool.query(`DELETE FROM app.party WHERE id = $1`, [partyId])).rejects.toThrow(
      /not allowed/,
    );
    await expect(database.pool.query('TRUNCATE app.party CASCADE')).rejects.toThrow(/not allowed/);
    await expect(app.query(`UPDATE app.party SET document_key_id = 'e9'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      ownerParty(database.pool, randomUUID(), { type: 'cnpj', ciphertextBytes: 39 }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint: 'party_document_ciphertext_check' });
    await expect(
      ownerParty(database.pool, randomUUID(), { hmac: randomBytes(16) }),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('[TECH-050] delegação: só pending → active e pending|active → revoked; o resto é imutável e nada é apagado', async () => {
    const partyId = await ownerParty(database.pool);
    const delegationId = await ownerDelegation(database.pool, {
      partyId,
      userId: USER_A,
      state: 'pending',
    });
    const operation = randomUUID();
    await database.pool.query(
      `INSERT INTO app.operation VALUES ($1, 'activate_party_delegation', NULL, NULL, 'system', NULL, $2, $2,
         'runbook:test', 'committed', now(), now())`,
      [operation, `test:${operation}`],
    );

    await expect(
      database.pool.query(`UPDATE app.party_delegation SET basis = 'outra' WHERE id = $1`, [delegationId]),
    ).rejects.toThrow(/only state, activation and revocation can change/);
    await expect(
      app.query(
        `UPDATE app.party_delegation SET state = 'active', activated_at = now(), activation_operation_id = $2
          WHERE id = $1`,
        [delegationId, operation],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      app.query(`UPDATE app.party_delegation SET state = 'pending', activated_at = NULL,
                   activation_operation_id = NULL WHERE id = $1`, [delegationId]),
    ).rejects.toThrow(/invalid state transition active -> pending/);
    await expect(app.query(`UPDATE app.party_delegation SET user_id = $2 WHERE id = $1`, [delegationId, USER_B])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      database.pool.query(`DELETE FROM app.party_delegation WHERE id = $1`, [delegationId]),
    ).rejects.toThrow(/not allowed/);
  });

  it('[TECH-050] no máximo uma delegação pendente ou ativa por par usuário × party; revogada libera o par', async () => {
    const partyId = await ownerParty(database.pool);
    await ownerDelegation(database.pool, { partyId, userId: USER_A, state: 'revoked' });
    await ownerDelegation(database.pool, { partyId, userId: USER_A, state: 'pending' });

    await expect(
      ownerDelegation(database.pool, { partyId, userId: USER_A, state: 'active' }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION, constraint: 'conflict_party_delegation_open' });
    await expect(
      ownerDelegation(database.pool, { partyId, userId: USER_B, state: 'active' }),
    ).resolves.toBeDefined();
  });

  it('[TECH-052] RLS: Titular A não lê a party de B; sem delegação vigente (nenhuma, pendente, expirada, revogada) nada aparece', async () => {
    // Usuários próprios deste caso: o banco do bloco é compartilhado entre os testes.
    const userA = randomUUID();
    const userB = randomUUID();
    const partyA = await ownerParty(database.pool);
    const partyB = await ownerParty(database.pool);
    const pendingParty = await ownerParty(database.pool);
    const expiredParty = await ownerParty(database.pool);
    const revokedParty = await ownerParty(database.pool);
    await ownerDelegation(database.pool, { partyId: partyA, userId: userA });
    await ownerDelegation(database.pool, { partyId: partyB, userId: userB });
    await ownerDelegation(database.pool, { partyId: pendingParty, userId: userA, state: 'pending' });
    await ownerDelegation(database.pool, {
      partyId: expiredParty,
      userId: userA,
      validFrom: "now() - interval '10 days'",
      validUntil: "now() - interval '1 day'",
    });
    await ownerDelegation(database.pool, { partyId: revokedParty, userId: userA, state: 'revoked' });

    const visibleToA = await asUser<{ id: string }>(userA, 'SELECT id FROM app.party ORDER BY id');
    const directB = await asUser<{ id: string }>(userA, `SELECT id FROM app.party WHERE id = '${partyB}'`);
    const ownDelegations = await asUser<{ user_id: string }>(userA, 'SELECT user_id FROM app.party_delegation');
    const nobody = await asUser<{ id: string }>(randomUUID(), 'SELECT id FROM app.party');

    expect(visibleToA.map((row) => row.id)).toEqual([partyA]);
    expect(directB).toEqual([]);
    expect(ownDelegations.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ownDelegations.map((row) => row.user_id))).toEqual(new Set([userA]));
    expect(nobody).toEqual([]);
  });

  it('[TECH-052] authenticated não lê HMAC, bases, ids de staff nem outras tabelas de app', async () => {
    const user = randomUUID();
    const partyId = await ownerParty(database.pool);
    await ownerDelegation(database.pool, { partyId, userId: user });

    for (const query of [
      'SELECT document_hmac FROM app.party',
      'SELECT document_hmac_key_id FROM app.party',
      'SELECT basis FROM app.party_delegation',
      'SELECT invited_by_user_id FROM app.party_delegation',
      'SELECT revocation_basis FROM app.party_delegation',
      'SELECT * FROM app.party',
      'SELECT id FROM app.audit_log',
      'SELECT id FROM app.authorization_grant',
      'SELECT id FROM app.interest',
      'SELECT id FROM app.investor_authorization',
    ]) {
      await expect(asUser(user, query), query).rejects.toThrow(/permission denied/);
    }
    await expect(
      asUser(user, 'SELECT id, document_type, document_ciphertext, document_key_id, created_at FROM app.party'),
    ).resolves.toHaveLength(1);
  });

  it('[TECH-052] claims não vazam: fora da transação o papel volta a luxtory_app sem claims', async () => {
    await asUser(USER_A, 'SELECT 1');
    const { rows } = await app.query<{ role: string; claims: string | null }>(
      `SELECT current_user AS role, nullif(current_setting('request.jwt.claims', true), '') AS claims`,
    );

    expect(rows[0]).toEqual({ role: 'luxtory_app', claims: null });
  });
});

describe('funções de conta do Supabase Auth (ADR-0020 §8)', () => {
  let database: TestDatabase;
  let app: pg.Client;
  const CONFIRMED = randomUUID();
  const INVITED = randomUUID();

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.pool.query(
      `INSERT INTO auth.users (id, email, email_confirmed_at, deleted_at, is_sso_user) VALUES
         ($1, 'Pessoa.Um@Exemplo.test', now(), NULL, false),
         ($2, 'convidada@exemplo.test', NULL, NULL, false),
         ($3, 'apagada@exemplo.test', now(), now(), false),
         ($4, 'sso@exemplo.test', now(), NULL, true)`,
      [CONFIRMED, INVITED, randomUUID(), randomUUID()],
    );
    app = new pg.Client({ connectionString: database.appUrl });
    await app.connect();
  });

  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  it('[TECH-050] busca por e-mail devolve só id e confirmação (sem diferença de maiúsculas); apagada e SSO ficam fora', async () => {
    const lookup = async (email: string) =>
      (await app.query(`SELECT * FROM app.auth_account_by_email($1)`, [email])).rows;

    expect(await lookup(' pessoa.um@exemplo.test ')).toEqual([{ user_id: CONFIRMED, email_confirmed: true }]);
    expect(await lookup('convidada@exemplo.test')).toEqual([{ user_id: INVITED, email_confirmed: false }]);
    expect(await lookup('apagada@exemplo.test')).toEqual([]);
    expect(await lookup('sso@exemplo.test')).toEqual([]);
    expect(await lookup('ninguem@exemplo.test')).toEqual([]);
  });

  it('[TECH-050] mais de uma conta para o mesmo e-mail → erro (nunca escolhe uma)', async () => {
    await database.pool.query(
      `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, 'PESSOA.UM@exemplo.test', now())`,
      [randomUUID()],
    );

    await expect(
      app.query(`SELECT * FROM app.auth_account_by_email('pessoa.um@exemplo.test')`),
    ).rejects.toThrow(/ambiguous account/);
  });

  it('[TECH-100] rótulos devolvem o e-mail já mascarado no SQL, nunca completo', async () => {
    const { rows } = await app.query(`SELECT * FROM app.auth_account_labels($1::uuid[])`, [[CONFIRMED, INVITED]]);

    expect(rows).toEqual(
      expect.arrayContaining([
        { user_id: CONFIRMED, email_masked: 'P***@Exemplo.test', email_confirmed: true },
        { user_id: INVITED, email_masked: 'c***@exemplo.test', email_confirmed: false },
      ]),
    );
  });

  it('[TECH-052] só o papel de aplicação executa as funções de conta (anon e authenticated não)', async () => {
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await database.pool.query<{ by_email: boolean; labels: boolean }>(
        `SELECT has_function_privilege($1, 'app.auth_account_by_email(text)', 'EXECUTE') AS by_email,
                has_function_privilege($1, 'app.auth_account_labels(uuid[])', 'EXECUTE') AS labels`,
        [role],
      );
      expect(rows[0], role).toEqual({ by_email: false, labels: false });
    }
  });
});

describe('investor_authorization → party (D-W3-1, REQ-027)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  it('[REQ-027] party_id é obrigatório e referencia uma party existente (FK), sem backfill', async () => {
    const { rows } = await database.pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'investor_authorization' AND column_name = 'party_id'`,
    );
    const fk = await database.pool.query<{ target: string }>(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint
        WHERE conrelid = 'app.investor_authorization'::regclass AND contype = 'f'
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                               WHERE attrelid = 'app.investor_authorization'::regclass AND attname = 'party_id')]`,
    );

    expect(rows).toEqual([{ is_nullable: 'NO' }]);
    expect(fk.rows).toEqual([{ target: 'app.party' }]);
  });
});
