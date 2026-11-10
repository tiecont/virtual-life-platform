import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {readKubernetesSource, verifyKubernetesPolicy, verifyClusterInventory} from '../../scripts/kubernetes-policy.mjs';
import {verifyKubernetesToolchain, ensureKubernetesTools} from '../../scripts/kubernetes-tools.mjs';

test('staging and production preserve private singleton preparation and separate prerequisites', async () => {
  for (const environment of ['staging', 'production']) {
    const input = await readKubernetesSource(environment), result = verifyKubernetesPolicy(input.objects, environment, input.budget);
    assert.equal(result.result, 'PREPARATION_ONLY'); assert.equal(result.workloads, 2); assert.equal(result.persistentResourcesManaged, 0); assert.equal(result.deploymentEligible, false);
    assert.equal(result.peak.cpuMillicores <= 2000, true); assert.equal(result.peak.memoryMiB <= 4096, true);
  }
});
test('policy rejects owner overlap, unsafe runtime/network/prune changes and unqualified images', async () => {
  const input = await readKubernetesSource('staging');
  const cases = [
    objects => {objects.find(o => o.metadata.name === 'vlp-api' && o.kind === 'Deployment').spec.replicas = 2;},
    objects => {objects.find(o => o.metadata.name === 'vlp-api' && o.kind === 'Deployment').spec.strategy = {type: 'RollingUpdate'};},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.terminationGracePeriodSeconds = 5;},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].image = 'ghcr.io/tiecont/vlp-api:latest';},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].image = 'ghcr.io/tiecont/vlp-api@sha256:' + 'a'.repeat(64);},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].command = ['node', 'dist/worker.js'];},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].env.push({name: 'LOCAL_MAID_WORLD', value: '1'});},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.automountServiceAccountToken = true;},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.hostNetwork = true;},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].securityContext.privileged = true;},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem = false;},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].resources.limits.cpu = '4000m';},
    objects => {delete objects.find(o => o.kind === 'Deployment').spec.template.spec.containers[0].readinessProbe;},
    objects => {objects.find(o => o.kind === 'Deployment').spec.template.spec.volumes[0] = {name: 'tmp', hostPath: {path: '/'}};},
    objects => {objects.find(o => o.kind === 'Service').spec.type = 'LoadBalancer';},
    objects => {objects.find(o => o.metadata.name === 'vlp-default-deny').spec.ingress = [{}];},
    objects => {objects.find(o => o.metadata.name === 'vlp-api-from-web').spec.ingress[0].from = [{}];},
    objects => {objects.find(o => o.metadata.name === 'vlp-database').spec.egress[0].to = [{ipBlock: {cidr: '0.0.0.0/0'}}];},
    objects => {objects.push({apiVersion: 'v1', kind: 'Secret', metadata: {name: 'database', namespace: 'vlp-staging'}});},
    objects => {objects.push({apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: {name: 'database', namespace: 'vlp-staging'}});},
    objects => {objects[0].metadata.namespace = 'vlp-production';},
  ];
  for (const mutate of cases) {const objects = globalThis.structuredClone(input.objects); mutate(objects); assert.throws(() => verifyKubernetesPolicy(objects, 'staging', input.budget));}
});
test('cluster inventory distinguishes observed prerequisites from unknown credential/ingress qualifications', () => {
  const current = {schemaVersion: 1, environment: 'staging', observedAt: new Date().toISOString(), nodeArchitectures: ['amd64'], nodeOperatingSystems: ['linux'], networkPolicyEnforcement: 'UNKNOWN', ingressQualified: false, registryPullQualified: false, externalPrerequisitesVerified: false};
  assert.equal(verifyClusterInventory(current, 'staging').deploymentEligible, false);
  assert.equal(verifyClusterInventory({...current, networkPolicyEnforcement: 'VERIFIED', ingressQualified: true, registryPullQualified: true, externalPrerequisitesVerified: true}, 'staging').deploymentEligible, false);
  for (const patch of [{environment: 'production'}, {nodeArchitectures: ['arm64']}, {observedAt: '2000-01-01T00:00:00Z'}]) assert.throws(() => verifyClusterInventory({...current, ...patch}, 'staging'));
});
test('toolchain refuses mutable/foreign sources, missing pins and mismatched schema versions', async () => {
  const lock = JSON.parse(await readFile('infra/k8s/toolchain.json', 'utf8')); verifyKubernetesToolchain(lock);
  for (const mutate of [copy => {copy.tools[0].url = 'https://example.com/kustomize';}, copy => {copy.tools[0].binarySha256 = '';}, copy => {copy.schemas[0].url = copy.schemas[0].url.replace(/\/[a-f0-9]{40}\//, '/master/');}, copy => {copy.kubernetesVersion = '1.36.0';}]) {
    const copy = globalThis.structuredClone(lock); mutate(copy); assert.throws(() => verifyKubernetesToolchain(copy));
  }
});
test('corrupt downloads and cached executables fail before extraction or execution', async () => {
  const root = 'artifacts/kubernetes-tool-tests/' + randomUUID(); let downloads = 0;
  const fetchBytes = async () => {downloads++; return Buffer.from('corrupt fixture; never executable');};
  try {
    await assert.rejects(ensureKubernetesTools(['kustomize'], {cacheRoot: root, fetchBytes}), /checksum mismatch/);
    assert.equal(downloads, 1); assert.deepEqual(await readdir(root), ['schemas']);
    await writeFile(root + '/kustomize', 'corrupt cached fixture'); downloads = 0;
    await assert.rejects(ensureKubernetesTools(['kustomize'], {cacheRoot: root, fetchBytes}), /checksum mismatch/); assert.equal(downloads, 0);
  } finally {await rm(root, {recursive: true, force: true});}
});
