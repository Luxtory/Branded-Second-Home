import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountAlreadyConfirmedError } from '@/features/identity/application/party-ports';
import { createRepresentativeAccounts } from '@/features/identity/infrastructure/auth/representative-accounts';
import {
  createTestAuthGateway,
  TEST_AUTH_CODE,
} from '@/features/identity/infrastructure/auth/test-auth-gateway';
import {
  EnvironmentRestrictionError,
  ExternalServiceUnavailableError,
  type DatabaseTransaction,
} from '@/features/platform';

// Admin API do Supabase Auth simulada: o adapter só chama `inviteUserByEmail`, sem metadata nem redirect.
const { invite, createClient } = vi.hoisted(() => {
  const inviteUserByEmail = vi.fn();
  return {
    invite: inviteUserByEmail,
    createClient: vi.fn((...args: unknown[]) => ({
      args,
      auth: { admin: { inviteUserByEmail } },
    })),
  };
});
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const production = {
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_teste_0000000000000000',
};
const tx = {} as DatabaseTransaction;

describe('contas do convite — Admin API do Supabase (TECH-050, ADR-0020 §8)', () => {
  beforeEach(() => {
    invite.mockReset();
    createClient.mockClear();
  });

  it('[TECH-050] convite cria a conta não confirmada pela Admin API, só com o e-mail, e devolve o id', async () => {
    const userId = randomUUID();
    invite.mockResolvedValue({ data: { user: { id: userId } }, error: null });

    await expect(
      createRepresentativeAccounts(production).invite('pessoa@exemplo.test'),
    ).resolves.toBe(userId);
    expect(invite).toHaveBeenCalledWith('pessoa@exemplo.test');
    expect(createClient).toHaveBeenCalledWith(
      'https://projeto.supabase.co',
      'sb_secret_teste_0000000000000000',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });

  it('[TECH-050] conta já confirmada (email_exists) → AccountAlreadyConfirmedError; outra falha → indisponível sem o e-mail', async () => {
    invite.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'email_exists', status: 422 },
    });
    invite.mockResolvedValueOnce({
      data: { user: null },
      error: { code: 'over_email_send_rate_limit', status: 429 },
    });
    const accounts = createRepresentativeAccounts(production);

    await expect(accounts.invite('pessoa@exemplo.test')).rejects.toBeInstanceOf(
      AccountAlreadyConfirmedError,
    );
    const failure = accounts.invite('pessoa@exemplo.test');
    await expect(failure).rejects.toBeInstanceOf(ExternalServiceUnavailableError);
    await expect(failure).rejects.not.toThrow(/pessoa@exemplo/);
  });

  it('[ADR-0007] Admin API recusada fora de Production (Preview), sem chamar o Supabase', async () => {
    const accounts = createRepresentativeAccounts({ ...production, VERCEL_ENV: 'preview' });

    await expect(accounts.invite('pessoa@exemplo.test')).rejects.toBeInstanceOf(
      EnvironmentRestrictionError,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it('[ADR-0005] autenticação de teste: convite simulado; código do convite confirma; conta confirmada recusa novo convite', async () => {
    const accounts = createRepresentativeAccounts({ AUTH_MODE: 'test' });
    const email = `convite-${randomUUID()}@luxtory.test`;
    const cookies: { name: string; value: string }[] = [];
    const gateway = createTestAuthGateway(
      {
        getAll: () => cookies,
        setAll: (list) => {
          for (const cookie of list) cookies.push({ name: cookie.name, value: cookie.value });
        },
      },
      { now: () => new Date() },
    );

    await expect(accounts.find(tx, email)).resolves.toBeNull();
    const userId = await accounts.invite(email);
    await expect(accounts.find(tx, email)).resolves.toEqual({ userId, confirmed: false });
    await expect(gateway.verifyInviteCode(email, '000000')).resolves.toBe(false);
    await expect(gateway.verifyInviteCode(email, TEST_AUTH_CODE)).resolves.toBe(true);
    await expect(accounts.find(tx, email)).resolves.toEqual({ userId, confirmed: true });
    await expect(accounts.invite(email)).rejects.toBeInstanceOf(AccountAlreadyConfirmedError);
    await expect(gateway.verifyInviteCode(`outro-${email}`, TEST_AUTH_CODE)).resolves.toBe(false);
    expect((await accounts.labels(tx, [userId])).get(userId)).toEqual({
      maskedEmail: 'c***@luxtory.test',
      confirmed: true,
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
