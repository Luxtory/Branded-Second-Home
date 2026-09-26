import {
  EnvironmentRestrictionError,
  loadEnv,
  loadRuntimeConfig,
  systemClock,
  type Clock,
  type EnvSource,
} from '@/features/platform';
import type { AuthGateway } from '../../application/ports';
import type { CookieJar } from './cookie-jar';
import { createSupabaseAuthGateway } from './supabase-auth-gateway';
import { createTestAuthGateway } from './test-auth-gateway';

/**
 * Escolhe o adapter de Auth. `AUTH_MODE=test` com `VERCEL_ENV` presente já falha na validação de ambiente (ADR-0005
 * §7). Auth real só em Production enquanto a D3 estiver adiada (ADR-0007, ADR-0008): em Preview e Development da
 * Vercel a recusa acontece aqui, no uso — o build não lê essas variáveis.
 */
export function createAuthGateway(
  jar: CookieJar,
  source: EnvSource = process.env,
  clock: Clock = systemClock,
): AuthGateway {
  const { AUTH_MODE, VERCEL_ENV } = loadEnv(source);
  if (AUTH_MODE === 'test') return createTestAuthGateway(jar, clock);
  if (VERCEL_ENV !== undefined && VERCEL_ENV !== 'production') {
    throw new EnvironmentRestrictionError('Supabase Auth', VERCEL_ENV);
  }
  const config = loadRuntimeConfig(
    ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
    source,
  );
  return createSupabaseAuthGateway(jar, config);
}
