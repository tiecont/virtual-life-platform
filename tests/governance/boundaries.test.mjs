import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertImportAllowed } from '../../scripts/check-boundaries.mjs';
const root = '/repo';
test('worlds cannot import another world repository, platform internals or application code', () => {
  for (const target of ['../../worlds/maid/repository', '../../domains/platform/identity', '../../apps/platform-api/src/db', '@virtual-city/platform-api']) {
    assert.throws(() => assertImportAllowed('/repo/worlds/deadline/adapter.ts', target, root));
  }
  assert.doesNotThrow(() => assertImportAllowed('/repo/worlds/deadline/adapter.ts', '@virtual-city/world-sdk', root));
  assert.throws(()=>assertImportAllowed('/repo/packages/pixi-scene/src/renderer.ts','@virtual-city/library-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/pixi-scene/src/renderer.ts','../../library-world/src/index',root),/Shared package imports/);
  assert.doesNotThrow(()=>assertImportAllowed('/repo/apps/platform-api/src/worlds/service.ts','@virtual-city/library-world',root));
  assert.throws(()=>assertImportAllowed('/repo/packages/library-world/src/index.ts','@virtual-city/restaurant-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/restaurant-world/src/index.ts','@virtual-city/library-world',root),/Shared package imports/);
});
test('contracts cannot import SDK and apps cannot import another application internals', () => {
  assert.throws(() => assertImportAllowed('/repo/packages/contracts/src/index.ts', '@virtual-city/world-sdk', root));
  assert.throws(() => assertImportAllowed('/repo/packages/contracts/src/index.ts', '../../world-sdk/src/private', root));
  assert.throws(() => assertImportAllowed('/repo/apps/portal-web/app/page.tsx', '@virtual-city/platform-api', root));
  assert.throws(() => assertImportAllowed('/repo/apps/portal-web/app/page.tsx', '../../platform-api/src/app', root));
  assert.throws(() => assertImportAllowed('/repo/apps/portal-web/app/page.tsx', '@virtual-city/contracts/src/private', root));
  assert.doesNotThrow(() => assertImportAllowed('/repo/apps/portal-web/app/page.tsx', '@virtual-city/contracts', root));
  assert.doesNotThrow(() => assertImportAllowed('/repo/apps/portal-web/app/page.tsx', '@virtual-city/pixi-scene/renderer', root));
  assert.throws(() => assertImportAllowed('/repo/apps/platform-api/src/app.ts', '@virtual-city/pixi-scene/renderer', root));
  assert.throws(() => assertImportAllowed('/repo/apps/portal-web/app/page.tsx', '@virtual-city/pixi-scene/src/renderer', root));
});
test('the scanner rejects actual source imports and manifest cycles', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { checkBoundaries } = await import('../../scripts/check-boundaries.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'city-boundaries-'));
  try {
    for (const name of ['apps/app', 'packages/contracts', 'packages/world-sdk', 'worlds/deadline']) await mkdir(join(dir, name), { recursive: true });
    for (const name of ['apps/app', 'packages/contracts', 'packages/world-sdk']) {
      await writeFile(join(dir, name, 'package.json'), JSON.stringify({ name: '@virtual-city/' + name.split('/')[1] }));
    }
    const file = join(dir, 'worlds/deadline/adapter.ts');
    await writeFile(file, "import { repo } from '../../domains/platform/private';");
    await assert.rejects(checkBoundaries(dir), /World imports/);
    await writeFile(file, "import { publicPort } from '@virtual-city/world-sdk';");
    await assert.doesNotReject(checkBoundaries(dir));
    await writeFile(join(dir, 'packages/contracts/package.json'), JSON.stringify({ name: '@virtual-city/contracts', dependencies: { '@virtual-city/world-sdk': 'workspace:*' } }));
    await writeFile(join(dir, 'packages/world-sdk/package.json'), JSON.stringify({ name: '@virtual-city/world-sdk', dependencies: { '@virtual-city/contracts': 'workspace:*' } }));
    await assert.rejects(checkBoundaries(dir), /cycle/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
