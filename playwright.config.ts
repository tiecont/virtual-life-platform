import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3300', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'pnpm db:migrate && pnpm --filter @virtual-city/platform-api start', url: 'http://127.0.0.1:4300/health/ready', reuseExistingServer: false, timeout: 60000 },
    { command: 'pnpm --filter @virtual-city/portal-web start', url: 'http://127.0.0.1:3300', reuseExistingServer: false, timeout: 60000 },
  ],
});
