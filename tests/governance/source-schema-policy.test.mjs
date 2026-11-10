import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {test} from 'node:test';
import {sourceSchemaPolicy} from '../../scripts/source-schema-policy.mjs';

test('release schema follows immutable source SQL instead of stale compatibility snapshots', async () => {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const policy = sourceSchemaPolicy(revision), directory = 'apps/platform-api/src/shared/database/migrations/';
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  assert.deepEqual(policy.migrations.map(row => row.name), names);
  for (const row of policy.migrations) assert.equal(row.checksum, createHash('sha256').update(await readFile(directory + row.name)).digest('hex'));
  assert.equal(policy.minimumDatabaseMigrations, names.length); assert.equal(policy.maximumDatabaseMigrations, names.length);
  assert.equal(policy.mode, 'strict'); assert.equal(policy.reviewRef, null);
  assert.equal(policy.runtimeManifestSha256, createHash('sha256').update(JSON.stringify(policy.migrations.map(row => [row.name, row.checksum]))).digest('hex'));
  for (const revision of ['HEAD', 'main', '--all', 'a'.repeat(39)]) assert.throws(() => sourceSchemaPolicy(revision));
});
