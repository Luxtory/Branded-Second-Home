import { NextResponse, type NextRequest } from 'next/server';
import { unavailableKeys } from '@/features/platform';
import { createAuthGateway } from '../infrastructure/auth/auth-gateway';

/**
 * `proxy.ts` nas rotas de Auth e Admin: renova a sessão do Supabase Auth antes do render e grava os cookies novos na
 * resposta (`@supabase/ssr`). Não autoriza nada — isso fica com o guard e as páginas (ADR-0008). Auth indisponível no
 * ambiente segue sem renovação: as telas mostram o erro explícito.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  try {
    const gateway = createAuthGateway({
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
