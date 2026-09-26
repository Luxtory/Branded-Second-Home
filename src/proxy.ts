import type { NextRequest } from 'next/server';
import { refreshSession } from '@/features/identity/presentation/session-proxy';

/** Renova a sessão do Supabase Auth só onde há Auth (ADR-0008); não autoriza nada. */
export function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: ['/entrar/:path*', '/admin/:path*', '/v1/admin/:path*'],
};
