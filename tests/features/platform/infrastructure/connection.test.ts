import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DatabaseConfigError,
  DatabaseEnvironmentError,
  getDatabase,
  parseDatabaseUrl,
} from '@/features/platform/infrastructure/database/connection';
import {
  SUPABASE_ROOT_CA,
  SUPABASE_ROOT_CA_SHA256,
} from '@/features/platform/infrastructure/database/supabase-root-ca';
import { ConfigurationMissingError } from '@/features/platform/infrastructure/env';

const POOLER = 'aws-0-sa-east-1.pooler.supabase.com';

describe('conexão com o banco (ADR-0006, ADR-0007)', () => {
  it('[ADR-0007] fora de Production na Vercel nenhuma conexão é aberta, mesmo com DATABASE_URL', () => {
    const url = `postgresql://luxtory_app.ref:x@${POOLER}:6543/postgres?sslmode=verify-full`;

    expect(() => getDatabase({ VERCEL_ENV: 'preview', DATABASE_URL: url })).toThrow(
      DatabaseEnvironmentError,
    );
    expect(() => getDatabase({ VERCEL_ENV: 'development', DATABASE_URL: url })).toThrow(
      DatabaseEnvironmentError,
    );
  });

  it('[ADR-0007] sem DATABASE_URL a função fica bloqueada com erro explícito (TECH-001)', () => {
    expect(() => getDatabase({ VERCEL_ENV: 'production' })).toThrow(ConfigurationMissingError);
  });

  it('[TECH-100] Supabase exige verify-full com a CA raiz fixada e o host conferido', () => {
    const settings = parseDatabaseUrl(
      `postgresql://luxtory_app.ref:s%40nha@${POOLER}:6543/postgres?sslmode=verify-full`,
    );

    expect(settings).toMatchObject({
      host: POOLER,
      port: 6543,
      user: 'luxtory_app.ref',
      password: 's@nha',
      database: 'postgres',
      ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true, servername: POOLER },
    });
  });

  it('[TECH-100] sslmode ausente, fraco ou URL incompleta é recusado sem expor a URL', () => {
    for (const url of [
      `postgresql://u:segredo@${POOLER}/postgres`,
      `postgresql://u:segredo@${POOLER}/postgres?sslmode=require`,
      `postgresql://u:segredo@${POOLER}/?sslmode=verify-full`,
    ]) {
      expect(() => parseDatabaseUrl(url)).toThrow(DatabaseConfigError);
      expect(() => parseDatabaseUrl(url)).not.toThrow(/segredo/);
    }
    expect(parseDatabaseUrl('postgres://u:p@127.0.0.1/db?sslmode=disable')).toMatchObject({
      port: 5432,
      ssl: false,
    });
  });

  it('a CA fixada é a Supabase Root 2021 CA do runbook', () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA);

    expect(certificate.subject).toContain('CN=Supabase Root 2021 CA');
    expect(certificate.fingerprint256).toBe(SUPABASE_ROOT_CA_SHA256);
    expect(new Date(certificate.validTo).getUTCFullYear()).toBe(2031);
  });
});
