/**
 * CSRF por origem (TECH-100): uma mutation só é aceita com `Origin` do mesmo host do request — a mesma regra que o
 * Next.js aplica às Server Actions (`X-Forwarded-Host`, senão `Host`). `Origin` ausente é recusada.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
