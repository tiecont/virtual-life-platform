import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkBoundaries } from './check-boundaries.mjs';
import {inspectApiModules} from './api-module-graph.mjs';
const ownership = JSON.parse(await readFile('config/architecture/ownership.json', 'utf8'));
assert.equal(ownership.apiReplicas, 1, 'Multi-instance ownership is not implemented');
assert.equal(ownership.redisRequired, false);
const tables = new Set();
for (const file of await readdir('apps/platform-api/src/shared/database/migrations')) {
  if (!file.endsWith('.sql')) continue;
  const sql = await readFile('apps/platform-api/src/shared/database/migrations/' + file, 'utf8');
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)) {
    const table = match[1];
    assert(!tables.has(table), `Table created twice: ${table}`);
    assert(ownership.tables[table], `Table without declared owner: ${table}`);
    tables.add(table);
  }
}
for (const table of Object.keys(ownership.tables)) {
  assert(tables.has(table) || table === ownership.journalTable, `Owner declared for missing table: ${table}`);
}
console.log(`Architecture consistency passed: ${tables.size} SQL tables + journal; ${await checkBoundaries(process.cwd())} source files checked. Future gameplay invariants remain runtime gates.`);
const graph=await inspectApiModules();
console.log(`API ownership checked: ${graph.productionFiles} production files, ${Object.keys(graph.owners).length} areas, ${graph.crossModuleEdges.length} static cross-area edges; existing type/metrics cycles retained.`);
const {checkWorkerBoundary} = await import('./worker-boundary.mjs');
const worker = await checkWorkerBoundary();
console.log(`Worker boundary checked: ${worker.files.length} runtime source files; no API/room/socket bootstrap.`);
