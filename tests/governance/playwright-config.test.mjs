import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';

const expectedConfigs=[
  'playwright.admin.config.ts',
  'playwright.calendar.config.ts',
  'playwright.config.ts',
  'playwright.lodge.config.ts',
  'playwright.privacy.config.ts',
  'playwright.queue.config.ts',
  'playwright.runtime.config.ts',
];

test('all Playwright configs live under config/playwright and leave the repository root',async()=>{
  const root=await readdir('.'),configured=await readdir('config/playwright');
  assert.deepEqual(root.filter(name=>/^playwright.*\.config\.ts$/.test(name)),[]);
  assert.deepEqual(configured.filter(name=>/^playwright.*\.config\.ts$/.test(name)).sort(),expectedConfigs);
});

test('the browser runner, package script and TypeScript projects reference moved configs',async()=>{
  const [runner,manifest,admin,legacy]=await Promise.all([
    readFile('scripts/run-browser-tests.mjs','utf8'),
    readFile('package.json','utf8'),
    readFile('tests/admin-tsconfig.json','utf8'),
    readFile('tests/legacy-tsconfig.json','utf8'),
  ]);
  for(const name of expectedConfigs)assert.match(runner,new RegExp(`config/playwright/${name.replaceAll('.','\\.')}`));
  assert.match(manifest,/"test:e2e": "pnpm build && node scripts\/run-browser-tests\.mjs"/);
  for(const name of ['admin','privacy','calendar','runtime'])assert.match(admin,new RegExp(`config/playwright/playwright\\.${name}\\.config\\.ts`));
  assert.match(legacy,/config\/playwright\/playwright\.queue\.config\.ts/);
});

test('moved configs anchor tests, reports and web servers to the repository root',async()=>{
  for(const name of expectedConfigs){
    const source=await readFile(`config/playwright/${name}`,'utf8');
    assert.match(source,/repositoryRoot/);
    assert.match(source,/cwd:repositoryRoot|cwd: repositoryRoot/);
  }
  const base=await readFile('config/playwright/playwright.config.ts','utf8');
  assert.match(base,/testDir: resolve\(repositoryRoot,'tests\/e2e'\)/);
  assert.match(base,/outputFolder: resolve\(repositoryRoot,reportDirectory\)/);
});
