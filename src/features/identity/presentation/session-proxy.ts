import { NextResponse, type NextRequest } from 'next/server';
import { unavailableKeys } from '@/features/platform';
import { withForwardedHeaders } from '@/features/platform/presentation/csp';
import { createAuthGateway } from '../infrastructure/auth/auth-gateway';

/**
 * `proxy.ts` nas rotas de Auth e Admin: renova a sessão do Supabase Auth antes do render e grava os cookies novos na
 * resposta (`@supabase/ssr`). Não autoriza nada — isso fica com o guard e as páginas (ADR-0008). Auth indisponível no
 * ambiente segue sem renovação: as telas mostram o erro explícito.
 */
export async function refreshSession(
  request: NextRequest,
  forwarded: Readonly<Record<string, string>> = {},
): Promise<NextResponse> {
  // `forwarded` (ex.: a CSP do `proxy.ts`) segue para o render junto com os cookies renovados.
  const next = () =>
    NextResponse.next({ request: { headers: withForwardedHeaders(request.headers, forwarded) } });
  let response = next();
  try {
    const gateway = createAuthGateway({
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    });
    await gateway.session();
  } catch (error) {
    if (unavailableKeys(error) === null) throw error;
  }
  return response;
}

/** Rotas com Auth (ADR-0008; W7: Área do Titular): só nelas a sessão é renovada. */
export function isSessionPath(pathname: string): boolean {
  return /^\/(entrar|admin|titular|v1\/admin)(\/|$)/.test(pathname);
}
