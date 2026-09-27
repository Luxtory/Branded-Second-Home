/** Opções de cookie que os adapters de Auth repassam ao Next.js (subconjunto de `ResponseCookie`). */
export interface AuthCookieOptions {
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: 'lax' | 'strict' | 'none' | boolean;
  readonly path?: string;
  readonly maxAge?: number;
  readonly expires?: Date;
  readonly domain?: string;
}

export interface AuthCookie {
  readonly name: string;
  readonly value: string;
  readonly options: AuthCookieOptions;
}

/**
 * Cookies do request visto pelos adapters de Auth. `setAll` grava na resposta (Server Actions, route handlers e
 * `proxy.ts`); em Server Components não há resposta e a renovação da sessão fica com o `proxy.ts`.
 */
export interface CookieJar {
  getAll(): readonly { readonly name: string; readonly value: string }[];
  setAll(cookies: readonly AuthCookie[], headers: Readonly<Record<string, string>>): void;
}

/** Cookies de sessão só no servidor: nada de script no navegador lê o token (ADR-0008, TECH-100). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const satisfies AuthCookieOptions;
