import { defineConfig, devices } from '@playwright/test';

const PORT = 8123;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  forbidOnly: CI,
  // The app tests download chess.js and Stockfish from public CDNs. One retry in CI absorbs a slow download.
  retries: CI ? 1 : 0,
  use: { baseURL: `http://127.0.0.1:${PORT}/`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/serve.mjs',
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !CI,
  },
});
