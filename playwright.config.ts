import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 120_000;
const SERVER_STOP_TIMEOUT_MS = 30_000;
const IGNORED = '**/activate-ultronpx.mjs';
// Smoke Playwright WebKit (ADR-0009): motor do Safari em emulação de iPhone — não equivale a Safari/iOS real (esse fica
// na QA de release). Liga com PLAYWRIGHT_WEBKIT=1: a CI instala as dependências de sistema; localmente elas exigem
// `sudo npx playwright install-deps webkit`.
const WEBKIT_SMOKE = process.env.PLAYWRIGHT_WEBKIT === '1';
const WEBKIT_SPECS = '**/*.webkit.spec.ts';
const SETUP_SPECS = '**/*.setup.ts';

// E2E sobre o build de produção (npm run test:e2e = next build && playwright test), com o Chrome do sistema. O
// servidor sobe o PostgreSQL embutido com as migrations e a autenticação de teste (tests/support/e2e-server.mjs).
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: [IGNORED],
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }]],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    // Estado compartilhado preparado antes dos testes paralelos (TOTP dos usuários de teste; ver auth.setup.ts).
    { name: 'setup', testMatch: [SETUP_SPECS], use: { channel: 'chrome' } },
    {
      name: 'chrome',
      testIgnore: [IGNORED, WEBKIT_SPECS],
      dependencies: ['setup'],
      use: { channel: 'chrome' },
    },
    ...(WEBKIT_SMOKE
      ? [
          {
            name: 'webkit',
            testMatch: [WEBKIT_SPECS],
            dependencies: ['setup'],
            use: { ...devices['iPhone 13'] },
          },
        ]
      : []),
  ],
  webServer: {
    command: `node tests/support/e2e-server.mjs ${PORT}`,
    url: `${baseURL}/v1/health`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
    // SIGTERM para o servidor de E2E parar o `next start` e o PostgreSQL (e apagar a pasta de dados).
    gracefulShutdown: { signal: 'SIGTERM', timeout: SERVER_STOP_TIMEOUT_MS },
  },
});
