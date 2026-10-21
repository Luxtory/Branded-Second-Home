import { createClient } from '@supabase/supabase-js';
import { sql } from 'kysely';
import {
  EnvironmentRestrictionError,
  ExternalServiceUnavailableError,
  loadEnv,
  loadRuntimeConfig,
  rootLogger,
  type DatabaseTransaction,
  type EnvSource,
} from '@/features/platform';
import {
  AccountAlreadyConfirmedError,
  type AccountMatch,
  type RepresentativeAccounts,
} from '../../application/party-ports';
import { postgresPartyReader } from '../postgres-party-reader';
import { inviteTestAccount, testAccount, testAccountLabels } from './test-accounts';

const SERVICE = 'supabase_auth_admin';

/** Busca restrita (`app.auth_account_by_email`, ADR-0020 §8): só o id e se a conta está confirmada. */
export async function findAccountByEmail(
  tx: DatabaseTransaction,
  email: string,
): Promise<AccountMatch | null> {
  const { rows } = await sql<{ user_id: string; email_confirmed: boolean }>`
    SELECT user_id, email_confirmed FROM app.auth_account_by_email(${email})
  `.execute(tx);
  const row = rows[0];
  return row === undefined ? null : { userId: row.user_id, confirmed: row.email_confirmed };
}

/** Admin API do Supabase Auth, só no servidor, com a chave secreta (`sb_secret_…`); nada vai ao navegador. */
function supabaseInvite(source: EnvSource) {
  const config = loadRuntimeConfig(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'], source);
  const { admin } = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).auth;
  return async (email: string): Promise<string> => {
    // Sem `user_metadata` nem `redirectTo`: o convite não carrega party, documento nem link próprio (spec §13.4).
    const { data, error } = await admin.inviteUserByEmail(email);
    if (error === null && data.user !== null) {
      rootLogger.info('auth invite sent');
      return data.user.id;
    }
    if (error?.code === 'email_exists') throw new AccountAlreadyConfirmedError();
    const providerCode = error?.code ?? String(error?.status ?? 'unknown');
    rootLogger.error('auth invite failed', { provider_code: providerCode });
    throw new ExternalServiceUnavailableError(SERVICE, providerCode);
  };
}

const testAccounts: RepresentativeAccounts<DatabaseTransaction> = {
  find: (_tx, email) => Promise.resolve(testAccount(email)),
  labels: (_tx, userIds) => Promise.resolve(testAccountLabels(userIds)),
  invite(email) {
    const userId = inviteTestAccount(email);
    return userId === null
      ? Promise.reject(new AccountAlreadyConfirmedError())
      : Promise.resolve(userId);
  },
};

/**
 * Contas do convite (W7). Configuração lida no primeiro uso, dentro do command: ausente ou ambiente recusado vira
 * "indisponível" (TECH-001). Admin API só em Production enquanto a D3 estiver adiada (ADR-0007); `AUTH_MODE=test` usa
 * contas simuladas (só local e CI).
 */
export function createRepresentativeAccounts(
  source: EnvSource = process.env,
): RepresentativeAccounts<DatabaseTransaction> {
  let invite: ((email: string) => Promise<string>) | null = null;
  const production = (): ((email: string) => Promise<string>) => {
    const { VERCEL_ENV } = loadEnv(source);
    if (VERCEL_ENV !== undefined && VERCEL_ENV !== 'production') {
      throw new EnvironmentRestrictionError('Supabase Auth Admin API', VERCEL_ENV);
    }
    invite ??= supabaseInvite(source);
    return invite;
  };
  const isTest = () => loadEnv(source).AUTH_MODE === 'test';
  // `async`: configuração ausente ou ambiente recusado chegam como recusa da promessa, dentro do command.
  return {
    find: async (tx, email) =>
      isTest() ? testAccounts.find(tx, email) : findAccountByEmail(tx, email),
    labels: async (tx, userIds) =>
      isTest() ? testAccounts.labels(tx, userIds) : postgresPartyReader.accountLabels(tx, userIds),
    invite: async (email) => (isTest() ? testAccounts.invite(email) : production()(email)),
  };
}
