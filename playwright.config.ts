import {browserReportDirectory} from './scripts/browser-report-directory.mjs';
import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const journey=process.env.BROWSER_CITY_JOURNEY==='1';
const maid=journey||process.env.BROWSER_MAID_WORLD==='1';
const deadlineWorld=process.env.BROWSER_DEADLINE_WORLD==='1';
const deadline=process.env.BROWSER_DEADLINE_IDENTITY==='1';
const park=process.env.BROWSER_PARK_WORLD==='1';
const lounge=process.env.BROWSER_LOUNGE_WORLD==='1';
const privateProfile=process.env.BROWSER_DATING_PROFILE==='1';
const worldFlags=journey?'journey-flags':maid?'maid-flags':deadlineWorld?'deadline-flags':park?'park-flags':lounge?'lounge-flags':process.env.BROWSER_RESTAURANT_WORLD==='1'?(process.env.BROWSER_LIBRARY_WORLD==='1'?'restaurant-library-flags':'restaurant-flags'):process.env.BROWSER_LIBRARY_WORLD==='1'?'library-flags':'world-flags';
export default defineConfig({
  testDir: 'tests/e2e', workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: browserReportDirectory(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR) }]],
  use: { baseURL: 'http://127.0.0.1:3300', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    ...(deadline?[{command:'node --import tsx tests/support/deadline-browser-runtime.ts',url:'http://127.0.0.1:4400/api/v1/me',reuseExistingServer:false,timeout:60000}]:[]),
    { command: 'pnpm db:migrate && pnpm --filter @virtual-city/platform-api start', url: 'http://127.0.0.1:4300/health/ready', env: { LOCAL_MAID_WORLD:maid?'1':'0',LOCAL_DEADLINE_WORLD:maid||deadlineWorld||process.env.BROWSER_LIBRARY_WORLD==='1'?'1':'0',LOCAL_DEADLINE_IDENTITY:deadline?'1':'0',DEADLINE_LEGACY_API_URL:deadline?'http://127.0.0.1:4400':'',WORLD_FLAGS_FILE: resolve('tests/fixtures/'+worldFlags+'.json'), LOCAL_PARK_WORLD:park?'1':'0',LOCAL_LIBRARY_WORLD:maid||deadlineWorld||park||lounge||process.env.BROWSER_LIBRARY_WORLD==='1'?'1':'0', LOCAL_RESTAURANT_WORLD:journey||lounge||process.env.BROWSER_RESTAURANT_WORLD==='1'?'1':'0', LOCAL_LOUNGE_WORLD:lounge?'1':'0', LOCAL_DATING_PROTOTYPE:privateProfile?'1':'0',DATING_TEST_PROOFS:privateProfile?'1':'0',...(privateProfile?{DATING_PROFILE_KEY:'89'.repeat(32),DATING_PROFILE_KEY_ID:'synthetic-browser'}:{}), LOCAL_TRAVEL_FIXTURES: '1', SAFETY_EVIDENCE_KEY: '67'.repeat(32), SAFETY_EVIDENCE_KEY_ID: 'browser-test-v1' }, reuseExistingServer: false, timeout: 60000 },
    { command: 'pnpm --filter @virtual-city/portal-web start', url: 'http://127.0.0.1:3300', reuseExistingServer: false, timeout: 60000 },
  ],
});
