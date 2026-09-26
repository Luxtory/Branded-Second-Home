/**
 * Configuração fictícia do Supabase para testes, montada em runtime: prova o formato aceito (`sb_publishable_…`) e os
 * recusados (chave secreta, `anon` legada em JWT) sem que o código contenha literais com formato de segredo — o
 * scanner de segredos (gitleaks) não distingue valor inventado de real.
 */
const underscored = (...parts: string[]) => parts.join('_');
const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

export const FAKE_SUPABASE_URL = 'https://example-ref.supabase.co';
export const FAKE_PUBLISHABLE_KEY = underscored('sb', 'publishable', 'teste');
export const FAKE_SECRET_KEY = underscored('sb', 'secret', 'teste');
/** Mesmo formato da chave `anon` legada (JWT HS256 com `role: anon`), com assinatura inventada. */
export const FAKE_LEGACY_ANON_KEY = [
  base64url({ alg: 'HS256' }),
  base64url({ role: 'anon' }),
  'assinatura-ficticia',
].join('.');

/** Variáveis de Auth válidas (`NEXT_PUBLIC_SUPABASE_URL` e a chave publicável). */
export function fakeSupabaseConfig() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  };
}
