import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Default runtime policy is strict and derived from bundled SQL, not an old
// qualification snapshot in config/. Keep historical compatibility files intact.
export function sourceSchemaPolicy(revision) {
  assert(/^[a-f0-9]{40}$/.test(revision));
  const directory = 'apps/platform-api/src/db/migrations/';
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', revision, '--', directory], {encoding: 'utf8'}).trim().split('\n').filter(path => path.endsWith('.sql')).sort();
  assert(paths.length > 0);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const rows = paths.map(path => [path.slice(directory.length), hash(execFileSync('git', ['show', revision + ':' + path]))]);
  return {schemaVersion: 1, policyVersion: 1, mode: 'strict', journal: 'city_schema_migrations', metadataVersion: 1,
    runtimeManifestSha256: hash(JSON.stringify(rows)), minimumDatabaseMigrations: rows.length, maximumDatabaseMigrations: rows.length,
    reviewRef: null, migrations: rows.map(([name, checksum]) => ({name, checksum}))};
}
