import { cookies, headers } from 'next/headers';
import {
  resolveCorrelationId,
  rootLogger,
  unavailableKeys,
  type Logger,
} from '@/features/platform';
import type { AuthGateway } from '../application/ports';
import type { VerifiedSession } from '../domain/session';
import { createAuthGateway } from '../infrastructure/auth/auth-gateway';
import type { CookieJar } from '../infrastructure/auth/cookie-jar';

/**
 * Adapter de Auth do request atual. `writable`: Server Actions podem gravar cookies; em Server Components não há
 * resposta, e a renovação da sessão fica com o `proxy.ts`.
 */
export async function requestAuthGateway(writable: boolean): Promise<AuthGateway> {
  const store = await cookies();
  const jar: CookieJar = {
    getAll: () => store.getAll(),
    setAll: (list) => {
      if (!writable) return;
      for (const { name, value, options } of list) store.set(name, value, options);
    },
  };
  return createAuthGateway(jar);
}

export async function requestLogger(): Promise<Logger> {
  return rootLogger.child({ correlation_id: resolveCorrelationId(await headers()) });
}

/**
 * Roda `work` com o Auth do request. Configuração ausente ou Auth recusado no ambiente → `'unavailable'`, com log que
 * nomeia só as chaves (TECH-001). Outros erros seguem.
 */
export async function withAuth<T>(
  writable: boolean,
  work: (gateway: AuthGateway, log: Logger) => Promise<T>,
): Promise<T | 'unavailable'> {
  const log = await requestLogger();
  try {
    return await work(await requestAuthGateway(writable), log);
  } catch (error) {
    const keys = unavailableKeys(error);
    if (keys === null) throw error;
    log.error('auth unavailable', { keys });
    return 'unavailable';
  }
}

/** Sessão verificada do request (Server Components). */
export function currentSession(): Promise<VerifiedSession | null | 'unavailable'> {
  return withAuth(false, (gateway) => gateway.session());
}
