import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: 'tests/e2e', workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3300', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'pnpm db:migrate && pnpm --filter @virtual-city/platform-api start', url: 'http://127.0.0.1:4300/health/ready', env: { WORLD_FLAGS_FILE: resolve(process.env.BROWSER_LIBRARY_WORLD==='1'?'tests/fixtures/library-flags.json':'tests/fixtures/world-flags.json'), LOCAL_LIBRARY_WORLD:process.env.BROWSER_LIBRARY_WORLD==='1'?'1':'0', LOCAL_TRAVEL_FIXTURES: '1', SAFETY_EVIDENCE_KEY: '67'.repeat(32), SAFETY_EVIDENCE_KEY_ID: 'browser-test-v1' }, reuseExistingServer: false, timeout: 60000 },
    { command: 'pnpm --filter @virtual-city/portal-web start', url: 'http://127.0.0.1:3300', reuseExistingServer: false, timeout: 60000 },
  ],
});
