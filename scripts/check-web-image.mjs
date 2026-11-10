import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {containsCredential} from './inspect-api-image.mjs';
import {imageTestTools, sha256} from './image-test-tools.mjs';

const args = process.argv.slice(2);
assert(args[0] === '--target=web' && (args.length === 1 || args.length === 3 && args[1] === '--source-revision' && /^[a-f0-9]{40}$/.test(args[2])));
const directory = resolve('artifacts/image-web-' + randomUUID().slice(0, 8)), {run, save, commands, signal, dispose} = await imageTestTools(directory);
const facts = {taskId: 'N03-03', target: 'web', publicRelease: false, scope: 'Local standalone artifact, generated-certificate TLS/Caddy/browser and runtime configuration; not hosted deployment, public release or physical mobile certification'};
try {
  const revision = (await run('source', 'git', ['rev-parse', args[2] ?? 'HEAD'])).stdout.trim(); assert(/^[a-f0-9]{40}$/.test(revision)); facts.sourceRevision = revision;
  const context = resolve(directory, 'source'); await mkdir(context);
  await run('source', 'git', ['archive', '--format=tar', '--output', resolve(directory, 'source.tar'), revision]);
  await run('source', 'tar', ['-xf', resolve(directory, 'source.tar'), '-C', context]);
  const tag = 'vlp-web:source-' + revision.slice(0, 12) + '-' + randomUUID().slice(0, 8);
  await run('build-web', 'docker', ['build', '--pull=false', '--build-arg', 'SOURCE_REVISION=' + revision, '-f', resolve(context, 'infra/docker/Dockerfile.web'), '--target', 'runtime', '-t', tag, context]);
  const image = JSON.parse((await run('metadata', 'docker', ['image', 'inspect', tag])).stdout)[0];
  assert.equal(image.Config.User, 'node'); assert.equal(image.Config.Labels['org.opencontainers.image.revision'], revision); assert.deepEqual(image.Config.Cmd, ['node', 'start-runtime.mjs']);
  facts.image = {id: image.Id, tag, sourceRevision: revision, user: image.Config.User, workdir: image.Config.WorkingDir, sizeBytes: image.Size, identityScope: 'Local Docker image ID, not published registry digest'};
  for (const environment of [{}, {API_INTERNAL_URL: 'http://user:synthetic-secret@invalid', PUBLIC_SOCKET_ORIGIN: 'https://public.invalid'}]) {
    const denied = await run('invalid-runtime-config', 'docker', ['run', '--rm', '--network', 'none', '--read-only', ...Object.keys(environment).flatMap(key => ['--env', key]), image.Id], {env: environment, allowFailure: true});
    assert.equal(denied.code, 1); assert(denied.stderr.includes('Portal runtime configuration unavailable')); assert(!denied.stderr.includes('synthetic-secret'));
  }
  facts.invalidRuntimeConfigDenied = true;
  const inspector = await readFile('scripts/inspect-web-image.mjs', 'utf8'), script = inspector + '\nconsole.log(JSON.stringify(await inspectWebImage(' + containsCredential.toString() + ')));';
  const inspected = JSON.parse((await run('inspection', 'docker', ['run', '--rm', '--read-only', '--network', 'none', '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'node', image.Id, '--input-type=module', '-e', script])).stdout);
  assert.equal(inspected.node, (await readFile(resolve(context, '.node-version'), 'utf8')).trim());
  facts.inspection = {uid: inspected.uid, node: inspected.node, filesystemWriteDenied: inspected.filesystemWriteDenied, buildId: inspected.buildId, files: inspected.inventory.length,
    inventorySha256: inspected.inventorySha256, clientJs: inspected.clientJs, clientCss: inspected.clientCss, scannedTextFiles: inspected.scannedTextFiles, definedCredentialFindings: inspected.definedCredentialFindings, browserBuildOriginAbsent: true};
  facts.inspectionCodeSha256 = sha256(script);
  facts.fileInspection = await save('inspection.json', inspected); facts.applicationSbom = await save('application-sbom.cdx.json', inspected.sbom);
  const api = JSON.parse((await run('same-source-api', 'node', ['scripts/check-image.mjs', '--target=api', '--source-revision', revision])).stdout);
  assert.equal(api.result, 'PASS'); assert.equal(api.sourceRevision, revision); facts.api = {image: api.image, actualArtifactAndSixScenarioChecks: 'PASS', artifacts: api.commandJournal};
  await run('tls-browser-smoke', 'node', ['scripts/web-image-smoke.mjs', '--web', image.Id, '--api', api.image.id, '--context', context, '--output', resolve(directory, 'smoke')]);
  facts.runtime = JSON.parse(await readFile(resolve(directory, 'smoke/result.json'))); assert.equal(facts.runtime.result, 'PASS'); assert(facts.runtime.cleanupComplete && facts.runtime.generatedSecretsRemoved); assert(!signal.aborted); facts.result = 'PASS';
} catch (error) {facts.result = 'FAIL'; facts.error = error.message; process.exitCode = 1;}
finally {facts.commandJournal = await save('commands.json', commands); await save('facts.json', facts); dispose(); console.log(JSON.stringify({...facts, artifactDirectory: directory}, null, 2));}
