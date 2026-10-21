import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { vi } from 'vitest';
import {
  activatePartyDelegationHandler,
  createPartyDelegationHandler,
  registerPartyHandler,
  revokePartyDelegationHandler,
} from '@/features/identity/application/party-commands';
import {
  AccountAlreadyConfirmedError,
  type AccountMatch,
  type PartyDocumentProtector,
  type RepresentativeAccounts,
} from '@/features/identity/application/party-ports';
import { createDocumentProtector } from '@/features/identity/infrastructure/pii/document-protector';
import { parseKeyRing, type PiiKeys } from '@/features/identity/infrastructure/pii/keyring';
import { postgresPartyStore } from '@/features/identity/infrastructure/postgres-parties';
import type {
  Actor,
  CommandGuard,
  CommandHandler,
  CommandOutcome,
  Database,
  DatabaseTransaction,
  JsonValue,
} from '@/features/platform';
import { createCommandExecutor } from '@/features/platform/application/commands/executor';
import { commandRegistry } from '@/features/platform/application/commands/registry';
import { createPostgresCommandStore } from '@/features/platform/infrastructure/commands/postgres-command-store';
import { allowAll } from './platform-fixtures';

export const STAFF_ID = '00000000-0000-4000-8000-0000000000e1';

export const PARTY_STAFF: Actor = {
  kind: 'user',
  userId: STAFF_ID,
  actingPartyId: null,
  role: 'admin',
};

export const titularActor = (userId: string): Actor => ({
  kind: 'user',
  userId,
  actingPartyId: null,
  role: 'titular',
});

const KEY_BYTES = 32;
const key = () => randomBytes(KEY_BYTES).toString('base64');

/** Anel `id:base64,…` de chaves aleatórias de teste (nunca chaves reais). */
export function testRing(ids: readonly string[]): string {
  return ids.map((id) => `${id}:${key()}`).join(',');
}

export interface RingSpec {
  readonly encryption: string;
  readonly encryptionActive: string;
  readonly hmac: string;
  readonly hmacActive: string;
}

export function ringSpec(encryptionIds = ['e1'], hmacIds = ['h1']): RingSpec {
  return {
    encryption: testRing(encryptionIds),
    encryptionActive: encryptionIds.at(-1) ?? 'e1',
    hmac: testRing(hmacIds),
    hmacActive: hmacIds.at(-1) ?? 'h1',
  };
}

export function ringEnv(spec: RingSpec): Record<string, string> {
  return {
    PII_ENCRYPTION_KEYRING: spec.encryption,
    PII_ENCRYPTION_ACTIVE_KEY_ID: spec.encryptionActive,
    PII_HMAC_KEYRING: spec.hmac,
    PII_HMAC_ACTIVE_KEY_ID: spec.hmacActive,
  };
}

export function keysOf(spec: RingSpec): PiiKeys {
  return {
    encryption: parseKeyRing('E', spec.encryption, 'EA', spec.encryptionActive),
    hmac: parseKeyRing('H', spec.hmac, 'HA', spec.hmacActive),
  };
}

/** Anel com uma chave nova acrescentada e ativa (rotação: a antiga continua no anel). */
export function rotated(ring: string, id: string): { ring: string; active: string } {
  return { ring: `${ring},${id}:${key()}`, active: id };
}

export const testProtector = (spec: RingSpec = ringSpec()): PartyDocumentProtector =>
  createDocumentProtector(keysOf(spec));

export { punctuatedCpf, validCnpj, validCpf } from './documents';

/** Mesmo documento com o último dígito verificador trocado (sempre inválido). */
export const wrongCheckDigit = (document: string) =>
  `${document.slice(0, -1)}${(Number(document.at(-1)) + 1) % 10}`;

/** Contas do Supabase Auth em memória: registra convites e permite simular conta confirmada ou corrida. */
export function fakeAccounts(initial: Record<string, AccountMatch> = {}) {
  const accounts = new Map(Object.entries(initial));
  const invites: string[] = [];
  const port: RepresentativeAccounts<DatabaseTransaction> = {
    find: (_tx, email) => Promise.resolve(accounts.get(email) ?? null),
    labels: (_tx, userIds) =>
      Promise.resolve(
        new Map(
          [...accounts.entries()]
            .filter(([, account]) => userIds.includes(account.userId))
            .map(([email, account]) => [
              account.userId,
              {
                maskedEmail: `${email.slice(0, 1)}***@${email.split('@')[1] ?? ''}`,
                confirmed: account.confirmed,
              },
            ]),
        ),
      ),
    invite(email) {
      const existing = accounts.get(email);
      if (existing?.confirmed === true) return Promise.reject(new AccountAlreadyConfirmedError());
      const userId = existing?.userId ?? randomUUID();
      accounts.set(email, { userId, confirmed: false });
      invites.push(email);
      return Promise.resolve(userId);
    },
  };
  return {
    port,
    invites,
    confirm(email: string) {
      const account = accounts.get(email);
      if (account !== undefined) accounts.set(email, { ...account, confirmed: true });
    },
    userId: (email: string) => accounts.get(email)?.userId,
  };
}

/** Executor real (PostgreSQL, idempotência, auditoria) com o registro de produção e os handlers da W7. */
export function partyHarness(
  db: Database,
  clock: { now(): Date },
  {
    protector = testProtector(),
    accounts = fakeAccounts(),
    guard = allowAll,
  }: {
    protector?: PartyDocumentProtector;
    accounts?: ReturnType<typeof fakeAccounts>;
    guard?: CommandGuard;
  } = {},
) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const executor = createCommandExecutor({
    store: createPostgresCommandStore(db),
    guard,
    clock,
    limits: { maxAttempts: 3, lockTimeoutMs: 5_000 },
    log,
    registry: commandRegistry,
  });
  const base = { store: postgresPartyStore, protector, newId: randomUUID };
  const handlers = {
    registerParty: registerPartyHandler<DatabaseTransaction>(base),
    createPartyDelegation: createPartyDelegationHandler<DatabaseTransaction>({
      ...base,
      accounts: accounts.port,
    }),
    revokePartyDelegation: revokePartyDelegationHandler<DatabaseTransaction>(base),
    activatePartyDelegation: activatePartyDelegationHandler<DatabaseTransaction>(base),
  };
  const run = <I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
    { actor = PARTY_STAFF, key = randomUUID() }: { actor?: Actor; key?: string } = {},
  ): Promise<CommandOutcome<R>> =>
    executor.execute(handler, { actor, idempotencyKey: key, correlationId: randomUUID(), input });

  async function ok<I, R extends JsonValue>(
    handler: CommandHandler<I, R, DatabaseTransaction>,
    input: unknown,
    options: { actor?: Actor; key?: string } = {},
  ): Promise<R> {
    const outcome = await run(handler, input, options);
    if (outcome.status !== 'committed')
      throw new Error(`expected commit, got ${JSON.stringify(outcome)}`);
    return outcome.result;
  }

  return { executor, handlers, run, ok, accounts, protector, log };
}

/** Insere a party pelo dono, com bytes de forma válida (para provar gatilhos e RLS sem passar pela cifra). */
export async function ownerParty(
  admin: pg.Pool,
  id: string = randomUUID(),
  {
    type = 'cpf',
    ciphertextBytes = type === 'cpf' ? 39 : 42,
    hmac = randomBytes(32),
  }: { type?: 'cpf' | 'cnpj'; ciphertextBytes?: number; hmac?: Buffer } = {},
): Promise<string> {
  const operation = randomUUID();
  await admin.query(
    `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
                                correlation_id, authorization_ref, state, created_at, updated_at)
     VALUES ($1, 'register_party', NULL, NULL, 'system', NULL, $2, $2, 'runbook:test', 'committed', now(), now())`,
    [operation, `test:${operation}`],
  );
  await admin.query(
    `INSERT INTO app.party (id, document_type, document_ciphertext, document_key_id, document_hmac, document_hmac_key_id,
                            registered_by_user_id, registered_role, operation_id, created_at)
     VALUES ($1, $2, $3, 'e1', $4, 'h1', $5, 'admin', $6, now())`,
    [id, type, randomBytes(ciphertextBytes), hmac, STAFF_ID, operation],
  );
  return id;
}

/** Delegação inserida pelo dono, no estado e na vigência pedidos (RLS e transições). */
export async function ownerDelegation(
  admin: pg.Pool,
  {
    partyId,
    userId,
    state = 'active',
    validFrom = "now() - interval '1 day'",
    validUntil = 'NULL',
  }: {
    partyId: string;
    userId: string;
    state?: 'pending' | 'active' | 'revoked';
    validFrom?: string;
    validUntil?: string;
  },
): Promise<string> {
  const id = randomUUID();
  const operation = randomUUID();
  const activation = state === 'pending' ? null : randomUUID();
  const revocation = state === 'revoked' ? randomUUID() : null;
  for (const op of [operation, activation, revocation]) {
    if (op === null) continue;
    await admin.query(
      `INSERT INTO app.operation (id, command, actor_user_id, acting_party_id, role, second_home_id, idempotency_key,
                                  correlation_id, authorization_ref, state, created_at, updated_at)
       VALUES ($1, 'create_party_delegation', NULL, NULL, 'system', NULL, $2, $2, 'runbook:test', 'committed', now(),
               now())`,
      [op, `test:${op}`],
    );
  }
  await admin.query(
    `INSERT INTO app.party_delegation (id, party_id, user_id, scope, state, valid_from, valid_until, basis,
        invited_by_user_id, invited_role, operation_id, created_at, activated_at, activation_operation_id, revoked_at,
        revocation_basis, revoked_by_user_id, revoked_role, revocation_operation_id)
     VALUES ($1, $2, $3, 'party', $4, ${validFrom}, ${validUntil}, 'Procuração de teste', $5, 'admin', $6,
             ${validFrom}, ${activation === null ? 'NULL' : validFrom}, $7,
             ${revocation === null ? 'NULL' : 'now()'}, $8, $9, $10, $11)`,
    [
      id,
      partyId,
      userId,
      state,
      STAFF_ID,
      operation,
      activation,
      revocation === null ? null : 'Fim da procuração',
      revocation === null ? null : STAFF_ID,
      revocation === null ? null : 'admin',
      revocation,
    ],
  );
  return id;
}
