import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Nunca testado nem medido (CLAUDE.md → Files & paths to ignore).
const ULTRON = 'activate-ultronpx.mjs';
const COVERAGE_MINIMUM = 80;

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    reporters: ['default', ['json', { outputFile: 'reports/vitest.json' }]],
    coverage: {
      provider: 'v8',
      // Mínimo de 80% em domain/ e application/ (CLAUDE.md → Architecture rules).
      include: ['src/features/**/{domain,application}/**/*.{ts,tsx}'],
      exclude: [ULTRON],
      thresholds: {
        lines: COVERAGE_MINIMUM,
        functions: COVERAGE_MINIMUM,
        branches: COVERAGE_MINIMUM,
        statements: COVERAGE_MINIMUM,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.db.test.ts', 'tests/e2e/**', ULTRON],
        },
      },
      {
        extends: true,
        test: {
          // PostgreSQL real (ADR-0005): um servidor por execução, banco clonado por teste.
          name: 'db',
          include: ['tests/**/*.db.test.ts'],
          exclude: [ULTRON],
          globalSetup: ['tests/support/postgres-global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
