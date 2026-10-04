/**
 * Content Security Policy com nonce por requisição (ADR-0014, TECH-100): o `proxy.ts` gera o nonce, envia a política
 * no cabeçalho da requisição (o Next.js extrai o nonce e o aplica aos próprios scripts) e na resposta. Toda página
 * HTML é renderizada por requisição — página estática não teria nonce.
 */
export const CSP_HEADER = 'Content-Security-Policy';
export const NONCE_HEADER = 'x-nonce';

/** Nonce novo a cada requisição (122 bits aleatórios do `randomUUID`), em base64. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

/** `'unsafe-eval'` só no `next dev`; upgrade de HTTP só quando a própria requisição já chegou por HTTPS. */
export function contentSecurityPolicy(
  nonce: string,
  {
    development,
    secureTransport,
  }: {
    development: boolean;
    secureTransport: boolean;
  },
) {
  const script = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (development) script.push(`'unsafe-eval'`);
  const directives = [
    `default-src 'self'`,
    `script-src ${script.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
  // Em localhost HTTP, WebKit aplica o upgrade também aos assets self e tenta TLS em 127.0.0.1.
  // Em produção/preview HTTPS a diretiva permanece ativa.
  if (secureTransport) directives.push(`upgrade-insecure-requests`);
  return directives.join('; ');
}

/** Cópia dos cabeçalhos da requisição com os cabeçalhos da CSP (repassados ao render). */
export function withForwardedHeaders(
  headers: Headers,
  forwarded: Readonly<Record<string, string>>,
): Headers {
  const copy = new Headers(headers);
  for (const [key, value] of Object.entries(forwarded)) copy.set(key, value);
  return copy;
}
