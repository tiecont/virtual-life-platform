import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertImportAllowed } from '../../scripts/check-boundaries.mjs';
import {relative,dirname} from 'node:path';
const root = '/repo';
test('admin consumes only public UI CSS and cannot import another app or private UI implementation',()=>{
 const admin='/repo/apps/admin-web/app/layout.tsx';
 for(const target of ['@virtual-city/ui/tokens.css','@virtual-city/ui/components.css'])assert.doesNotThrow(()=>assertImportAllowed(admin,target,root));
 for(const target of ['@virtual-city/ui/private','@virtual-city/ui','../../platform-api/src/config'])assert.throws(()=>assertImportAllowed(admin,target,root));
 assert.throws(()=>assertImportAllowed('/repo/packages/deadline-world/src/index.ts','@virtual-city/ui/tokens.css',root));
});
test('API areas use declared public entry files and isolate composition and migration internals',()=>{
 const social='/repo/apps/platform-api/src/features/social/modules/relationships/application/service.ts';
 const base='/repo/apps/platform-api/src/';
 const dependency=(from,target)=>{const value=relative(dirname(from),base+target);return value.startsWith('.')?value:'./'+value;};
 for(const target of ['features/identity/modules/accounts/infrastructure/passwords','shared/database/schema','shared/database/migrations','app'])assert.throws(()=>assertImportAllowed(social,dependency(social,target),root));
 assert.doesNotThrow(()=>assertImportAllowed(social,dependency(social,'features/identity/modules/accounts/application/service'),root));
 assert.doesNotThrow(()=>assertImportAllowed('/repo/apps/platform-api/src/app.ts','./shared/database/migrations',root));
 assert.doesNotThrow(()=>assertImportAllowed('/repo/apps/platform-api/src/main.ts','./app',root));
 assert.throws(()=>assertImportAllowed(social,dependency(social,'worker'),root));
 assert.doesNotThrow(()=>assertImportAllowed('/repo/apps/platform-api/src/worker.ts','./shared/database/migrations',root));
 assert.throws(()=>assertImportAllowed(base+'features/admission/modules/allocation/domain/model.ts','../infrastructure/store',root),/outer layer/);
 assert.throws(()=>assertImportAllowed(base+'shared/common/errors.ts',dependency(base+'shared/common/errors.ts','features/identity/modules/accounts/application/service'),root));
 for(const area of ['unowned','constructor','__proto__'])assert.throws(()=>assertImportAllowed('/repo/apps/platform-api/src/'+area+'/service.ts','../identity/service',root));
});
test('world implementations reject SQL drivers and schema imports while public SDK access remains valid',()=>{
 for(const from of ['/repo/worlds/deadline/adapter.ts','/repo/packages/deadline-world/src/index.ts']){
  for(const target of ['pg','pg/lib/client','drizzle-orm/pg-core','postgres','mysql2','better-sqlite3','node:sqlite','./private.sql','./private.sql?raw'])assert.throws(()=>assertImportAllowed(from,target,root));
  assert.doesNotThrow(()=>assertImportAllowed(from,'@virtual-city/world-sdk',root));
 }
});
test('worlds cannot import another world repository, platform internals or application code', () => {
  for (const target of ['../../worlds/maid/repository', '../../domains/platform/identity', '../../apps/platform-api/src/db', '@virtual-city/platform-api']) {
    assert.throws(() => assertImportAllowed('/repo/worlds/deadline/adapter.ts', target, root));
  }
  assert.doesNotThrow(() => assertImportAllowed('/repo/worlds/deadline/adapter.ts', '@virtual-city/world-sdk', root));
  assert.throws(()=>assertImportAllowed('/repo/packages/pixi-scene/src/renderer.ts','@virtual-city/library-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/pixi-scene/src/renderer.ts','../../library-world/src/index',root),/Shared package imports/);
  assert.doesNotThrow(()=>assertImportAllowed('/repo/apps/platform-api/src/features/worlds/modules/registry/application/service.ts','@virtual-city/library-world',root));
  assert.throws(()=>assertImportAllowed('/repo/packages/library-world/src/index.ts','@virtual-city/restaurant-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/restaurant-world/src/index.ts','@virtual-city/library-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/pixi-scene/src/renderer.ts','@virtual-city/lounge-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/lounge-world/src/index.ts','@virtual-city/restaurant-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/pixi-scene/src/renderer.ts','@virtual-city/deadline-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/deadline-world/src/index.ts','@virtual-city/library-world',root),/Shared package imports/);
  assert.throws(()=>assertImportAllowed('/repo/packages/deadline-world/src/index.ts','../../../apps/platform-api/src/features/focus/modules/timers/application/service',root),/Cross-app|higher layer/);
  assert.doesNotThrow(()=>assertImportAllowed('/repo/apps/platform-api/src/features/worlds/modules/registry/application/service.ts','@virtual-city/deadline-world',root));
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
    await mkdir(join(dir,'apps/platform-api/src/features/social/modules/relationships/application'),{recursive:true});
    await mkdir(join(dir,'apps/platform-api/src/features/identity/modules/accounts/application'),{recursive:true});
    await writeFile(join(dir,'apps/platform-api/package.json'),JSON.stringify({name:'@virtual-city/platform-api'}));
    await writeFile(join(dir,'apps/platform-api/src/features/identity/modules/accounts/application/service.ts'),'export class IdentityService {}');
    const apiFile=join(dir,'apps/platform-api/src/features/social/modules/relationships/application/service.ts');
    await writeFile(apiFile,"import { privateHelper } from '../../../../identity/modules/accounts/infrastructure/passwords';");
    await assert.rejects(checkBoundaries(dir),/API module private import/);
    await writeFile(apiFile,"import { IdentityService } from '../../../../identity/modules/accounts/application/service';");
    await assert.doesNotReject(checkBoundaries(dir));
    await writeFile(join(dir, 'packages/contracts/package.json'), JSON.stringify({ name: '@virtual-city/contracts', dependencies: { '@virtual-city/world-sdk': 'workspace:*' } }));
    await writeFile(join(dir, 'packages/world-sdk/package.json'), JSON.stringify({ name: '@virtual-city/world-sdk', dependencies: { '@virtual-city/contracts': 'workspace:*' } }));
    await assert.rejects(checkBoundaries(dir), /cycle/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
