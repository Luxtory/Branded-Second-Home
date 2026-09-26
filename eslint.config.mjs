import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // CLAUDE.md → Anti-patterns: tipos de escape só com comentário justificando.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  globalIgnores([
    // Nunca analisado (CLAUDE.md → Files & paths to ignore).
    'activate-ultronpx.mjs',
    // Gerados.
    '.next/**',
    'next-env.d.ts',
    'coverage/**',
    'reports/**',
    'test-results/**',
    'playwright-report/**',
    // Design System em CSS/HTML/JS sem dependências, com checagens próprias (ADR-0003).
    'src/design-system/lab/**',
    'src/design-system/scripts/**',
    // Ferramentas do repositório, fora do app.
    '.claude/**',
    '.vercel/**',
    '.playwright-mcp/**',
  ]),
]);
