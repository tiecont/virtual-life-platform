import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkWorkerBoundary} from '../../scripts/worker-boundary.mjs';
test('worker runtime graph excludes room/API/socket roots and dynamic loading while allowing erased type references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-boundary-'));
  try {
    const src = join(root, 'apps/platform-api/src'); await mkdir(join(src, 'features/rooms/modules/presence/application'), {recursive: true});
    const entry = join(src, 'worker.ts');
    await writeFile(entry, "import type {RoomService} from './features/rooms/modules/presence/application/service'; import {Pool} from 'pg'; export const db = new Pool();");
    assert.equal((await checkWorkerBoundary(root)).files.length, 1);
    for (const source of ["import './features/rooms/modules/presence/application/authority';", "import './features/identity/modules/accounts/application/service';", "import './app';", "import './main';", "import {Server} from 'socket.io';", "import {createServer} from 'node:http';", "require('./app');", "import('./app');", "const c = new Function('return 1');", "migrate(db);"]) {
      await writeFile(entry, source); await assert.rejects(() => checkWorkerBoundary(root));
    }
  } finally {await rm(root, {recursive: true, force: true});}
});
