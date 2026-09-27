import { describe, expect, it } from 'vitest';
import {
  DatabaseConfigError,
  DatabaseEnvironmentError,
} from '@/features/platform/infrastructure/database/connection';
import {
  ConfigurationMissingError,
  EnvironmentRestrictionError,
  EnvValidationError,
} from '@/features/platform/infrastructure/env';
import { unavailableKeys } from '@/features/platform/presentation/unavailable';

describe('configuração indisponível → chaves (TECH-001)', () => {
  it('[TECH-001] nomeia só as chaves; Auth e banco recusados no ambiente apontam VERCEL_ENV', () => {
    expect(unavailableKeys(new ConfigurationMissingError(['CRON_SECRET']))).toEqual([
      'CRON_SECRET',
    ]);
    expect(unavailableKeys(new EnvValidationError(['AUTH_MODE']))).toEqual(['AUTH_MODE']);
    expect(unavailableKeys(new DatabaseEnvironmentError('preview'))).toEqual(['VERCEL_ENV']);
    expect(unavailableKeys(new EnvironmentRestrictionError('Supabase Auth', 'preview'))).toEqual([
      'VERCEL_ENV',
    ]);
    expect(unavailableKeys(new DatabaseConfigError('x'))).toEqual(['DATABASE_URL']);
    expect(unavailableKeys(new Error('outro'))).toBeNull();
  });
});
