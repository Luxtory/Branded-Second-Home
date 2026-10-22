import { createHash } from 'node:crypto';

/**
 * Contas do Supabase Auth simuladas na autenticação de teste (`AUTH_MODE=test`, ADR-0005 §7): só local e na CI. Estado
 * do processo (o servidor de E2E é um processo só), compartilhado entre o adapter de Auth e o de convites: login por
 * código registra conta confirmada; convite registra conta não confirmada, que só confirma com o código do convite.
 */
interface TestAccount {
  readonly userId: string;
  confirmed: boolean;
  invited: boolean;
}

interface TestAccountState {
  readonly accounts: Map<string, TestAccount>;
  invitesSent: number;
}

const STATE_KEY = Symbol.for('luxtory.identity.testAccounts');
const shared = globalThis as typeof globalThis & { [STATE_KEY]?: TestAccountState };
const state: TestAccountState = (shared[STATE_KEY] ??= { accounts: new Map(), invitesSent: 0 });

const normalized = (email: string) => email.trim().toLowerCase();

/** Id determinístico por e-mail (sem guardar o e-mail): o E2E cadastra o papel de staff desse id. */
export function testUserId(email: string): string {
  const hex = createHash('sha256').update(normalized(email)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function testAccount(email: string): { userId: string; confirmed: boolean } | null {
  const account = state.accounts.get(normalized(email));
  return account === undefined ? null : { userId: account.userId, confirmed: account.confirmed };
}

/** Login por código de uma conta (a de teste aceita qualquer e-mail): a conta passa a existir confirmada. */
export function confirmTestAccount(email: string): string {
  const key = normalized(email);
  const account = state.accounts.get(key) ?? {
    userId: testUserId(key),
    confirmed: true,
    invited: false,
  };
  account.confirmed = true;
  state.accounts.set(key, account);
  return account.userId;
}

/** Convite: cria a conta não confirmada ou reenvia; conta confirmada → `null` (o Supabase recusa). */
export function inviteTestAccount(email: string): string | null {
  const key = normalized(email);
  const account = state.accounts.get(key) ?? {
    userId: testUserId(key),
    confirmed: false,
    invited: false,
  };
  if (account.confirmed) return null;
  account.invited = true;
  state.accounts.set(key, account);
  state.invitesSent += 1;
  return account.userId;
}

/** Código do convite: só para conta convidada e ainda não confirmada. */
export function acceptTestInvite(email: string): string | null {
  const account = state.accounts.get(normalized(email));
  if (account === undefined || !account.invited || account.confirmed) return null;
  account.confirmed = true;
  return account.userId;
}

/** Rótulos das contas simuladas, com o e-mail mascarado como faz `app.auth_account_labels`. */
export function testAccountLabels(
  userIds: readonly string[],
): ReadonlyMap<string, { readonly maskedEmail: string | null; readonly confirmed: boolean }> {
  const labels = new Map<
    string,
    { readonly maskedEmail: string | null; readonly confirmed: boolean }
  >();
  for (const [email, account] of state.accounts) {
    if (!userIds.includes(account.userId)) continue;
    const [local = '', domain = ''] = email.split('@');
    labels.set(account.userId, {
      maskedEmail: `${local.slice(0, 1)}***@${domain}`,
      confirmed: account.confirmed,
    });
  }
  return labels;
}

/** Convites enviados neste processo (testes). */
export function testInvitesSent(): number {
  return state.invitesSent;
}
