import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '@/features/platform';
import {
  ConfigurationMissingError,
  loadRuntimeConfig,
} from '@/features/platform/infrastructure/env';

describe('loadEnv', () => {
  it('lê só as chaves do catálogo: outras variáveis não são exigidas, removidas nem alteradas', () => {
    const source = {
      VERCEL_ENV: 'preview',
      ULTRONPX_PURCHASE_EMAIL: 'valor-de-outro-sistema',
      OUTRA_VARIAVEL: 'x',
    };
    const snapshot = { ...source };

    expect(loadEnv(source)).toEqual({ VERCEL_ENV: 'preview' });
    expect(source).toEqual(snapshot);
  });

  it('não exige nenhuma variável e trata string vazia como ausente', () => {
    expect(loadEnv({})).toEqual({});
    expect(loadEnv({ VERCEL_ENV: '', VERCEL_GIT_COMMIT_SHA: '' })).toEqual({});
  });

  it('valor inválido falha com o nome da chave, sem expor o valor', () => {
    const attempt = () => loadEnv({ VERCEL_ENV: 'valor-secreto-invalido' });

    expect(attempt).toThrow(EnvValidationError);
    expect(attempt).toThrow(/VERCEL_ENV/);
    expect(attempt).not.toThrow(/valor-secreto-invalido/);
  });
});

describe('loadRuntimeConfig (TECH-001)', () => {
  const complete = {
    DATABASE_URL: 'postgresql://luxtory_app.ref:senha@host:6543/postgres?sslmode=verify-full',
    CRON_SECRET: 'x'.repeat(32),
    COMMAND_MAX_ATTEMPTS: '3',
    COMMAND_LOCK_TIMEOUT_MS: '5000',
    OUTBOX_BATCH_SIZE: '100',
  };

  it('[TECH-001] lê só as chaves pedidas e converte números, sem default', () => {
    expect(loadRuntimeConfig(['COMMAND_MAX_ATTEMPTS', 'OUTBOX_BATCH_SIZE'], complete)).toEqual({
      COMMAND_MAX_ATTEMPTS: 3,
      OUTBOX_BATCH_SIZE: 100,
    });
  });

  it('[TECH-001] chave ausente ou vazia bloqueia a função com erro que nomeia a chave', () => {
    const attempt = () =>
      loadRuntimeConfig(['CRON_SECRET', 'OUTBOX_BATCH_SIZE'], { CRON_SECRET: '' });

    expect(attempt).toThrow(ConfigurationMissingError);
    expect(attempt).toThrow('CRON_SECRET, OUTBOX_BATCH_SIZE');
  });

  it('valor inválido falha com o nome da chave, sem expor o valor', () => {
    const attempt = () =>
      loadRuntimeConfig(['CRON_SECRET', 'COMMAND_MAX_ATTEMPTS', 'DATABASE_URL'], {
        CRON_SECRET: 'curto-demais-segredo',
        COMMAND_MAX_ATTEMPTS: '0',
        DATABASE_URL: 'mysql://x',
      });

    expect(attempt).toThrow(EnvValidationError);
    expect(attempt).toThrow('CRON_SECRET, COMMAND_MAX_ATTEMPTS, DATABASE_URL');
    expect(attempt).not.toThrow(/curto-demais-segredo/);
  });
});

describe('AUTH_MODE e Auth (W2, ADR-0005 §7, ADR-0008)', () => {
  it('[ADR-0005] AUTH_MODE=test só fora da Vercel; com VERCEL_ENV falha nomeando AUTH_MODE', () => {
    expect(loadEnv({ AUTH_MODE: 'test' })).toEqual({ AUTH_MODE: 'test' });
    expect(loadEnv({ AUTH_MODE: 'supabase', VERCEL_ENV: 'production' })).toEqual({
      AUTH_MODE: 'supabase',
      VERCEL_ENV: 'production',
    });
    expect(() => loadEnv({ AUTH_MODE: 'test', VERCEL_ENV: 'preview' })).toThrow(/AUTH_MODE/);
    expect(() => loadEnv({ AUTH_MODE: 'outro' })).toThrow(EnvValidationError);
  });
});

describe('escrita pública de interesse (W5, spec ownership §5)', () => {
  it('[TECH-100] INTEREST_LIMITER_MODE=fake só fora da Vercel; com VERCEL_ENV falha nomeando a chave', () => {
    expect(loadEnv({ INTEREST_LIMITER_MODE: 'fake' })).toEqual({ INTEREST_LIMITER_MODE: 'fake' });
    expect(() => loadEnv({ INTEREST_LIMITER_MODE: 'fake', VERCEL_ENV: 'preview' })).toThrow(
      /INTEREST_LIMITER_MODE/,
    );
    expect(() => loadEnv({ INTEREST_WRITES: 'talvez' })).toThrow(EnvValidationError);
  });

  it('[TECH-001] limites e prazo do interesse sem default: ausentes nomeiam as chaves', () => {
    expect(() =>
      loadRuntimeConfig(['INTEREST_NETWORK_LIMIT', 'INTEREST_LIMITER_TIMEOUT_MS'], {}),
    ).toThrow(/INTEREST_NETWORK_LIMIT, INTEREST_LIMITER_TIMEOUT_MS/);
    expect(loadRuntimeConfig(['INTEREST_GLOBAL_LIMIT'], { INTEREST_GLOBAL_LIMIT: '60' })).toEqual({
      INTEREST_GLOBAL_LIMIT: 60,
    });
  });
});

describe('orçamentos do sorteio inicial (W9, spec ownership §16.3)', () => {
  const keys = [
    'DRAW_TRANSACTION_TIMEOUT_MS',
    'DRAW_BEACON_TIMEOUT_MS',
    'DRAW_BEACON_LEAD_SECONDS',
  ] as const;

  it('[TECH-001] lê os três valores do runbook como inteiros positivos, sem default', () => {
    expect(
      loadRuntimeConfig(keys, {
        DRAW_TRANSACTION_TIMEOUT_MS: '20000',
        DRAW_BEACON_TIMEOUT_MS: '8000',
        DRAW_BEACON_LEAD_SECONDS: '120',
      }),
    ).toEqual({
      DRAW_TRANSACTION_TIMEOUT_MS: 20000,
      DRAW_BEACON_TIMEOUT_MS: 8000,
      DRAW_BEACON_LEAD_SECONDS: 120,
    });
    expect(() => loadRuntimeConfig(keys, {})).toThrow(ConfigurationMissingError);
    expect(() =>
      loadRuntimeConfig(['DRAW_BEACON_LEAD_SECONDS'], { DRAW_BEACON_LEAD_SECONDS: '0' }),
    ).toThrow(EnvValidationError);
  });
});
