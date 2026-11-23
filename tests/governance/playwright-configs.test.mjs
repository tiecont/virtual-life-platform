import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAYWRIGHT_CONFIGS,
  verifyPlaywrightConfigLayout,
} from '../../scripts/check-playwright-configs.mjs';

test('all Playwright configurations are isolated below config/playwright', async () => {
  assert.deepEqual(
    await verifyPlaywrightConfigLayout(),
    PLAYWRIGHT_CONFIGS.map(name => `config/playwright/${name}`),
  );
});
