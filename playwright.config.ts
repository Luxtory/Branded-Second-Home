import { defineConfig } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 120_000;
const SERVER_STOP_TIMEOUT_MS = 30_000;

// E2E sobre o build de produção (npm run test:e2e = next build && playwright test), com o Chrome do sistema. O
// servidor sobe o PostgreSQL embutido com as migrations e a autenticação de teste (tests/support/e2e-server.mjs).
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/activate-ultronpx.mjs'],
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }]],
  use: { baseURL, channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: `node tests/support/e2e-server.mjs ${PORT}`,
    url: `${baseURL}/v1/health`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
    // SIGTERM para o servidor de E2E parar o `next start` e o PostgreSQL (e apagar a pasta de dados).
    gracefulShutdown: { signal: 'SIGTERM', timeout: SERVER_STOP_TIMEOUT_MS },
  },
});
