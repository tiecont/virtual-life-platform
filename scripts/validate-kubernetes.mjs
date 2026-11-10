import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ensureKubernetesTools} from './kubernetes-tools.mjs';
import {readKubernetesSource, verifyKubernetesPolicy} from './kubernetes-policy.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = object => object.kind + '/' + object.metadata.name;
const sorted = objects => [...objects].sort((a, b) => identity(a).localeCompare(identity(b)));
export async function validateKubernetes() {
  const root = 'artifacts/k8s-validation/' + randomUUID(); await mkdir(root, {recursive: true, mode: 0o700});
  const report = {schemaVersion: 1, result: 'RUNNING', scope: 'Preparation render/schema/source policy only; no Kubernetes context read or workload deployed', deploymentEligible: false, startedAt: new Date().toISOString(), commands: [], environments: []};
  async function save() {await writeFile(root + '/report.json', JSON.stringify(report, null, 2) + '\n', {mode: 0o600});}
  async function run(command, argv, expected = 0) {
    const startedAt = new Date().toISOString(), result = spawnSync(command, argv, {encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024});
    const prefix = root + '/step-' + report.commands.length, stdout = result.stdout ?? '', stderr = result.stderr ?? '';
    await writeFile(prefix + '.stdout', stdout, {mode: 0o600}); await writeFile(prefix + '.stderr', stderr, {mode: 0o600});
    report.commands.push({command, argv, startedAt, endedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, stdout: {ref: prefix + '.stdout', sha256: sha256(stdout)}, stderr: {ref: prefix + '.stderr', sha256: sha256(stderr)}, expectedExitCode: expected}); await save();
    assert(!result.error && result.status === expected, 'Kubernetes tool outcome mismatch'); return stdout;
  }
  await save();
  try {
    const {lock, tools, schemaDirectory} = await ensureKubernetesTools();
    report.toolchainSha256 = sha256(await readFile('infra/k8s/toolchain.json')); report.kubernetesSchemaVersion = lock.kubernetesVersion;
    const schemaArgs = ['-strict', '-summary', '-verbose', '-output', 'json', '-kubernetes-version', lock.kubernetesVersion, '-schema-location', schemaDirectory + '/{{.ResourceKind}}{{.KindSuffix}}.json'];
    for (const environment of ['staging', 'production']) {
      const source = await readKubernetesSource(environment); verifyKubernetesPolicy(source.objects, environment, source.budget, source.release);
      const directory = resolve(root, environment); await mkdir(directory);
      await run(tools.kustomize, ['build', 'infra/k8s/overlays/' + environment, '--load-restrictor', 'LoadRestrictionsRootOnly', '--output', directory]);
      const files = (await readdir(directory)).sort(); assert.equal(files.length, 9); assert(files.every(file => /^[a-z0-9_.-]+\.yaml$/.test(file)));
      const objects = [], artifacts = [];
      for (const file of files) {
        const path = join(directory, file);
        // kubectl is an offline YAML decoder here. Empty credentials plus an
        // unusable loopback server ensure no default/user context is consulted.
        const decoded = await run(tools.kubectl, ['--kubeconfig=/dev/null', '--server=https://127.0.0.1:1', '--request-timeout=1s', 'patch', '--local=true', '--type=json', '--patch=[]', '-f', path, '-o', 'json']);
        objects.push(JSON.parse(decoded)); artifacts.push({ref: path, sha256: sha256(await readFile(path))});
      }
      assert.deepEqual(sorted(objects), sorted(source.objects), 'Actual Kustomize output differs from the constrained source graph');
      const policy = verifyKubernetesPolicy(objects, environment, source.budget, source.release);
      const validation = JSON.parse(await run(tools.kubeconform, [...schemaArgs, ...files.map(file => join(directory, file))]));
      assert.deepEqual(validation.summary, {valid: 9, invalid: 0, errors: 0, skipped: 0}); assert.equal(validation.resources.length, 9); assert(validation.resources.every(resource => resource.status === 'statusValid'));
      report.environments.push({environment, policy, schema: validation.summary, decodedSha256: sha256(JSON.stringify(sorted(objects))), artifacts}); await save();
    }
    // Exercise the actual schema validator, with no missing-schema skips.
    const input = (await readKubernetesSource('staging')).objects.find(object => object.kind === 'Deployment');
    for (const name of ['unknown-field', 'invalid-type']) {
      const invalid = globalThis.structuredClone(input);
      if (name === 'unknown-field') invalid.spec.unreviewedField = true; else invalid.spec.replicas = 'two';
      const path = root + '/' + name + '.json'; await writeFile(path, JSON.stringify(invalid));
      const validation = JSON.parse(await run(tools.kubeconform, [...schemaArgs, path], 1));
      assert.deepEqual(validation.summary, {valid: 0, invalid: 1, errors: 0, skipped: 0});
    }
    report.result = 'PASS'; report.endedAt = new Date().toISOString(); await save();
    return {result: 'PASS', scope: report.scope, deploymentEligible: false, environments: report.environments.map(item => ({environment: item.environment, resources: item.schema.valid, peak: item.policy.peak})), negativeSchemasRejected: 2, report: root + '/report.json', reportSha256: sha256(await readFile(root + '/report.json'))};
  } catch (error) {report.result = 'FAIL'; report.endedAt = new Date().toISOString(); report.failure = error.name; await save(); throw Error('Kubernetes preparation validation failed; private report: ' + root + '/report.json');}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateKubernetes().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {console.error(error.message); process.exitCode = 1;});
}
