import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const wrapper = 'scripts/with-test-db.mjs';

async function fixture(t, initialError) {
  const dir = await mkdtemp(join(tmpdir(), 'aetheria-db-network-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.jsonl');
  await writeFile(join(dir, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const override = args.find(arg => arg.endsWith('/network.json'));
const subnet = override && JSON.parse(fs.readFileSync(override)).networks.default.ipam.config[0].subnet;
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, override, subnet}) + '\\n');
if (args[0] === 'context') console.log('"unix:///var/run/docker.sock"');
else if (args[1] === 'ls') console.log('existing-network');
else if (args[1] === 'inspect') console.log('[{"Subnet":"172.16.0.0/16"}]');
else if (args.includes('up') && !override) {
  console.error(${JSON.stringify(initialError)});
  process.exitCode = 1;
} else if (args.includes('up') && subnet === '172.18.0.0/28') {
  console.error('invalid pool request: Pool overlaps with other one on this address space');
  process.exitCode = 1;
} else if (args.includes('port')) console.log('127.0.0.1:54321');
`, { mode: 0o700 });
  await writeFile(join(dir, 'ip'), '#!/bin/sh\nprintf \'%s\\n\' \'[{"dst":"default"},{"dst":"172.17.0.0/16"}]\'\n', {mode: 0o700});
  const env = { ...process.env, PATH: dir + ':' + process.env.PATH, TMPDIR: dir };
  delete env.TEST_DATABASE_URL;
  delete env.DOCKER_HOST;
  return {
    run: () => exec(process.execPath, [wrapper, process.execPath, '-e', 'console.log("child ran")'], { env }),
    calls: async () => (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  };
}

test('test database retries pool exhaustion on its own subnet and removes its override', async t => {
  const {run, calls} = await fixture(t, 'all predefined address pools have been fully subnetted');
  assert.match((await run()).stdout, /child ran/);
  const operations = await calls();
  const compose = operations.filter(({args}) => args[0] === 'compose');
  assert.equal(new Set(compose.map(({args}) => args[2])).size, 1);
  assert.deepEqual(compose.map(({args}) => args.find(arg => ['up', 'port', 'down'].includes(arg))), [
    'up', 'up', 'up', 'port', 'down'
  ]);
  assert.deepEqual(compose.map(({subnet}) => subnet), [
    undefined, '172.18.0.0/28', '172.18.0.16/28', '172.18.0.16/28', '172.18.0.16/28'
  ]);
  await assert.rejects(readFile(compose.at(-1).override), {code: 'ENOENT'});
});

test('test database preserves unrelated Compose failures and cleans the original project', async t => {
  const {run, calls} = await fixture(t, 'container failed its health check');
  await assert.rejects(run(), {code: 1});
  const operations = (await calls()).slice(1);
  assert.equal(operations.length, 2);
  assert(operations[0].args.includes('up'));
  assert(operations[1].args.includes('down'));
  assert.equal(operations[0].args[2], operations[1].args[2]);
  assert(operations.every(({override}) => override === undefined));
});
