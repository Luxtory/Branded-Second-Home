import { defineConfig } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;
const SERVER_START_TIMEOUT_MS = 60_000;

// E2E sobre o build de produção (npm run test:e2e = next build && playwright test), com o Chrome do sistema.
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/activate-ultronpx.mjs'],
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }]],
  use: { baseURL, channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: `npx next start --port ${PORT} --hostname 127.0.0.1`,
    url: `${baseURL}/v1/health`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
  },
});
