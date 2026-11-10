import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {imageTestTools, sha256} from './image-test-tools.mjs';

const args = process.argv.slice(2);
assert(args[0] === '--target=api' && (args.length === 1 || args.length === 3 && args[1] === '--source-revision' && /^[a-f0-9]{40}$/.test(args[2])), 'Expected --target=api and optional immutable --source-revision');
const id = randomUUID().slice(0, 8), directory = resolve('artifacts/image-api-' + id), {run, save, commands, signal, dispose} = await imageTestTools(directory);
const facts = {taskId: 'N03-02', target: 'api', publicRelease: false, scope: 'Local source-built image/file/SBOM and disposable production-mode HTTP/socket test; no registry, TLS deployment, CVE or capacity certification'};
try {
  const revision = (await run('source', 'git', ['rev-parse', args[2] ?? 'HEAD'])).stdout.trim();
  assert(/^[a-f0-9]{40}$/.test(revision)); facts.sourceRevision = revision;
  const context = resolve(directory, 'source'); await mkdir(context);
  await run('source', 'git', ['archive', '--format=tar', '--output', resolve(directory, 'source.tar'), revision]);
  await run('source', 'tar', ['-xf', resolve(directory, 'source.tar'), '-C', context]);
  const tag = 'vlp-api:source-' + revision.slice(0, 12) + '-' + id;
  await run('build', 'docker', ['build', '--pull=false', '--build-arg', 'SOURCE_REVISION=' + revision, '-f', resolve(context, 'infra/docker/Dockerfile.api'), '--target', 'runtime', '-t', tag, context]);
  const image = JSON.parse((await run('metadata', 'docker', ['image', 'inspect', tag])).stdout)[0];
  assert.equal(image.Config.User, 'node'); assert.equal(image.Config.Labels['org.opencontainers.image.revision'], revision);
  assert.deepEqual(image.Config.Cmd, ['node', 'dist/main.js']);
  facts.image = {id: image.Id, tag, sourceRevision: revision, user: image.Config.User, workdir: image.Config.WorkingDir, sizeBytes: image.Size, identityScope: 'Local Docker image ID, not a published registry digest'};
  const inspector = await readFile('scripts/inspect-api-image.mjs', 'utf8');
  const inspected = JSON.parse((await run('inspection', 'docker', ['run', '--rm', '--read-only', '--network', 'none', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'node', image.Id, '--input-type=module', '-e', inspector + '\nconsole.log(JSON.stringify(await inspectApiImage()));'])).stdout);
  const expected = {}, sqlDirectory = resolve(context, 'apps/platform-api/src/shared/database/migrations');
  for (const name of (await readdir(sqlDirectory)).filter(name => name.endsWith('.sql')).sort()) expected[name] = sha256(await readFile(resolve(sqlDirectory, name)));
  assert.deepEqual(inspected.migrations, expected, 'Image SQL does not match source');
  assert.equal(inspected.node, (await readFile(resolve(context, '.node-version'), 'utf8')).trim());
  facts.inspection = {uid: inspected.uid, node: inspected.node, firstPartyPackages: inspected.firstPartyPackages, files: inspected.inventory.length, inventorySha256: inspected.inventorySha256, migrations: Object.keys(expected).length, credentialScan: inspected.credentialScan, filesystemWriteDenied: inspected.filesystemWriteDenied};
  facts.applicationSbom = await save('application-sbom.cdx.json', inspected.sbom);
  facts.fileInspection = await save('inspection.json', inspected);
  await run('runtime-smoke', 'node', ['scripts/with-test-db.mjs', 'node', 'scripts/api-image-smoke.mjs', '--image', image.Id, '--output', resolve(directory, 'smoke')]);
  facts.runtime = JSON.parse(await readFile(resolve(directory, 'smoke/result.json')));
  assert.equal(facts.runtime.result, 'PASS'); assert.equal(facts.runtime.cleanupComplete, true);
  assert.equal(facts.runtime.image, image.Id); assert(!signal.aborted); facts.result = 'PASS';
} catch (error) { facts.result = 'FAIL'; facts.error = error.message; process.exitCode = 1; }
finally {
  facts.commandJournal = await save('commands.json', commands);
  await save('facts.json', facts);
  console.log(JSON.stringify({...facts, artifactDirectory: directory}, null, 2));
  dispose();
}
