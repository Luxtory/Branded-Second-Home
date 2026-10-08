import type { NextConfig } from 'next';

// Cabeçalhos mínimos de segurança (TECH-100). CSP entra com a primeira página pública (W4).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Capa do Concept (ADR-0015): arquivo de até 3 MiB pela Server Action do Admin, abaixo do limite de 4,5 MB da Vercel.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // A rota interna /lab lê os arquivos do Design System em tempo de execução (ADR-0003).
  outputFileTracingIncludes: {
    '/lab/[[...path]]': ['./src/design-system/{lab,styles,tokens,fonts,brand,icons}/**/*'],
    '/favicon.ico': ['./src/design-system/brand/logo/*.svg'],
    '/brand/logo/[family]/[color]': ['./src/design-system/brand/logo/*.svg'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
