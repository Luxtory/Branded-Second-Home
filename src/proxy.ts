import { NextResponse, type NextRequest } from 'next/server';
import { isSessionPath, refreshSession } from '@/features/identity/presentation/session-proxy';
import {
  contentSecurityPolicy,
  createNonce,
  CSP_HEADER,
  NONCE_HEADER,
  withForwardedHeaders,
} from '@/features/platform/presentation/csp';

/**
 * CSP com nonce em toda página HTML (ADR-0014) e renovação da sessão do Supabase Auth só onde há Auth (ADR-0008). Não
 * autoriza nada.
 */
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === 'development',
  });
  const forwarded = { [NONCE_HEADER]: nonce, [CSP_HEADER]: policy };
  const response = isSessionPath(request.nextUrl.pathname)
    ? await refreshSession(request, forwarded)
    : NextResponse.next({ request: { headers: withForwardedHeaders(request.headers, forwarded) } });
  response.headers.set(CSP_HEADER, policy);
  return response;
}

export const config = {
  // Toda página HTML, mais a API do Admin (renovação de sessão). Fora: JSON público e jobs (`/v1`, `/api`), assets do
  // Next, favicon, logos (`/brand`, com CSP própria mais restrita) e o Lab interno (`/lab`).
  matcher: ['/((?!api|v1|_next/static|_next/image|favicon.ico|brand|lab).*)', '/v1/admin/:path*'],
};
