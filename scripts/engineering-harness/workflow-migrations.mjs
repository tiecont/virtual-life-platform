import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {readBounded, safePath} from '../media/private-art-manifest.mjs';
import {sourceMigrationDirectory, sourceSchemaPolicy} from '../source-schema-policy.mjs';

const git = args => execFileSync('git', args, {encoding: 'utf8', timeout: 5000});
const hash = data => createHash('sha256').update(data).digest('hex');
const args = process.argv.slice(2);
assert(args.length <= 1, 'Expected at most one immutable source revision');
const revision = args[0] ?? git(['rev-parse', 'HEAD']).trim();
assert(/^[a-f0-9]{40}$/.test(revision), 'Expected an immutable source revision');

const policy = sourceSchemaPolicy(revision);
const directory = sourceMigrationDirectory(revision);
const frozenRef = '67d28a47f3a03a6ba4e51040d5efe41a156d308d:config/schema-compatibility-0048-artifact-expand.json';
const frozen = JSON.parse(git(['show', frozenRef]));
assert.equal(frozen.migrations.length, frozen.maximumDatabaseMigrations);
assert(frozen.migrations.length >= 56, 'Expected the reviewed 56-migration prefix');
assert.deepEqual(policy.migrations.slice(0, frozen.migrations.length), frozen.migrations,
  'The frozen compatibility prefix differs from the source revision');
const workspace = process.cwd();
const rows = await readdir(await safePath(workspace, directory.slice(0, -1)), {withFileTypes: true});
const migrationFiles = rows.filter(row => row.name.endsWith('.sql')).sort((a, b) => a.name.localeCompare(b.name, 'en'));
assert(migrationFiles.every(row => row.isFile()), 'Working migration entries must be regular files');
assert.deepEqual(migrationFiles.map(row => row.name), policy.migrations.map(row => row.name),
  'The working SQL file set differs from the source revision');
for (const {name, checksum} of policy.migrations) {
  assert.equal(hash(await readBounded(workspace, directory + name, 4 * 1024 * 1024)), checksum, 'Working SQL bytes differ from the source revision');
}
console.log(JSON.stringify({revision, migrationCount: policy.migrations.length, sha256: policy.runtimeManifestSha256,
  frozenCount: frozen.migrations.length}));
