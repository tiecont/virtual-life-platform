import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const PLAYWRIGHT_CONFIGS = Object.freeze([
  'playwright.admin.config.ts',
  'playwright.calendar.config.ts',
  'playwright.config.ts',
  'playwright.lodge.config.ts',
  'playwright.privacy.config.ts',
  'playwright.queue.config.ts',
  'playwright.runtime.config.ts',
]);

export async function verifyPlaywrightConfigLayout(root = process.cwd()) {
  const targetsE2E = /testDir:\s*(?:['"]\.\.\/\.\.\/tests\/e2e['"]|resolve\(repositoryRoot,\s*['"]tests\/e2e['"]\))/u;
  const entries = await readdir(root);
  const staleRoot = entries.filter(name => /^playwright(?:\.[a-z]+)?\.config\.ts$/i.test(name));
  assert.deepEqual(staleRoot, [], 'Playwright configs must live under config/playwright/');

  const directory = join(root, 'config/playwright');
  const actual = (await readdir(directory)).filter(name => name.endsWith('.config.ts')).sort();
  assert.deepEqual(actual, [...PLAYWRIGHT_CONFIGS].sort(), 'Unexpected or missing Playwright config');

  for (const name of ['playwright.admin.config.ts', 'playwright.privacy.config.ts']) {
    const text = await readFile(join(directory, name), 'utf8');
    assert.match(text, targetsE2E, `${name} must target tests/e2e`);
  }
  const base = await readFile(join(directory, 'playwright.config.ts'), 'utf8');
  assert.match(
    base,
    targetsE2E,
    'Base config must target tests/e2e',
  );
  assert.match(
    base,
    /\.\.\/\.\.\/scripts\/browser-report-directory\.mjs/u,
    'Base config must resolve the report helper from the repository root',
  );
  return PLAYWRIGHT_CONFIGS.map(name => `config/playwright/${name}`);
}

function listConfig(path) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', path, '--list', '--reporter=line'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {...process.env, CI: '1'},
      timeout: 30_000,
    },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().slice(-4000);
    throw new Error(`Playwright config failed to load: ${path}\n${detail}`);
  }
}

async function main() {
  const configs = await verifyPlaywrightConfigLayout();
  for (const config of configs) listConfig(config);
  console.log(`Playwright config check passed for ${configs.length} isolated configurations`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
