import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadOverlayRelease} from './overlay-release.mjs';
import {validateOverlayRelease} from './promotion-contract.mjs';

const baseFiles = ['api-deployment.json', 'web-deployment.json', 'api-service.json', 'web-service.json', 'default-deny.json', 'dns-egress.json', 'web-to-api.json', 'api-from-web.json'];
const part = {'app.kubernetes.io/part-of': 'virtual-life-platform'};
const labels = name => ({...part, 'app.kubernetes.io/name': 'vlp-' + name});
const keys = (object, expected) => assert.deepEqual(Object.keys(object).sort(), [...expected].sort());
const ref = (name, key, secret = false, optional = false) => ({[secret ? 'secretKeyRef' : 'configMapKeyRef']: {name, key, ...(optional ? {optional: true} : {})}});
const value = value => ({value});
const reference = valueFrom => ({valueFrom});
const apiEnvironment = {
  NODE_ENV: value('production'), HOST: value('0.0.0.0'), PORT: value('4300'), DURABLE_JOB_ROLE: value('api'),
  WEB_ORIGIN: reference(ref('vlp-runtime', 'WEB_ORIGIN')), TRUSTED_PROXY_IP: reference(ref('vlp-runtime', 'TRUSTED_PROXY_IP')),
  RELEASE_ENVIRONMENT: reference(ref('vlp-runtime', 'RELEASE_ENVIRONMENT')),
  RELEASE_POLICY_FILE: value('/run/vlp-policy/release.json'), RUNTIME_WORLD_POLICY_FILE: value('/run/vlp-policy/runtime-worlds.json'), SAFETY_POLICY_FILE: value('/run/vlp-policy/safety.json'),
  DATABASE_URL: reference(ref('vlp-runtime-secrets', 'DATABASE_URL', true)), SESSION_SECRET: reference(ref('vlp-runtime-secrets', 'SESSION_SECRET', true)), SAFETY_EVIDENCE_KEY: reference(ref('vlp-runtime-secrets', 'SAFETY_EVIDENCE_KEY', true, true)),
};
const webEnvironment = {
  NODE_ENV: value('production'), HOSTNAME: value('0.0.0.0'), PORT: value('3300'), NEXT_TELEMETRY_DISABLED: value('1'), API_INTERNAL_URL: value('http://vlp-api:4300'), PUBLIC_SOCKET_ORIGIN: reference(ref('vlp-runtime', 'WEB_ORIGIN')),
};
const runtimeSecurity = {runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: {type: 'RuntimeDefault'}};
const containerSecurity = {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: ['ALL']}};
const health = path => ['node', '-e', `fetch('http://127.0.0.1:4300/health/${path}',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`];
function environment(name) {assert(['staging', 'production'].includes(name), 'Unknown Kubernetes environment'); return 'vlp-' + name;}
async function json(path) {return JSON.parse(await readFile(path, 'utf8'));}
function kustomization(input, fields) {
  keys(input, ['apiVersion', 'kind', ...fields]);
  assert.equal(input.apiVersion, 'kustomize.config.k8s.io/v1beta1'); assert.equal(input.kind, 'Kustomization');
}
// JSON resource files are valid Kustomize inputs. Only namespace transformation
// is permitted here; remote bases, generators, patches and plugins are refused.
export async function readKubernetesSource(name) {
  const namespace = environment(name), base = 'infra/k8s/base/', overlay = 'infra/k8s/overlays/' + name + '/';
  const common = await json(base + 'kustomization.yaml'), target = await json(overlay + 'kustomization.yaml');
  kustomization(common, ['resources']); kustomization(target, ['resources', 'namespace', ...(Object.hasOwn(target, 'images') ? ['images'] : [])]);
  assert.deepEqual(common.resources, baseFiles); assert.deepEqual(target.resources, ['../../base', 'database-egress.json']); assert.equal(target.namespace, namespace);
  const release = await loadOverlayRelease(name, target);
  const paths = [...baseFiles.map(file => base + file), overlay + 'database-egress.json'];
  const objects = await Promise.all(paths.map(json));
  for (const object of objects) {assert(!Object.hasOwn(object.metadata, 'namespace'), 'Namespace must come from the environment overlay'); object.metadata.namespace = namespace;}
  if (release) for (const object of objects.filter(object => object.kind === 'Deployment')) {
    const component = object.metadata.name === 'vlp-api' ? 'api' : object.metadata.name === 'vlp-web' ? 'web' : null; assert(component);
    const container = object.spec.template.spec.containers[0]; assert.equal(container.image, 'registry.invalid/vlp-' + component + ':release-required'); container.image = release.images[component];
  }
  const prerequisites = await json('infra/k8s/prerequisites.json');
  assert.equal(prerequisites.schemaVersion, 1); assert.equal(prerequisites.status, 'REQUIRED_NOT_VERIFIED'); assert.equal(prerequisites.deploymentEligible, false);
  keys(prerequisites.environments, ['staging', 'production']);
  const required = prerequisites.environments[name]; assert.equal(required.applicationNamespace, namespace); assert.equal(required.dataNamespace, 'vlp-data-' + name); assert.deepEqual(required.architecture, {os: 'linux', architecture: 'amd64'});
  assert.deepEqual(required.databasePeer, {namespace: 'vlp-data-' + name, podLabels: {'app.kubernetes.io/name': 'vlp-postgres'}, port: 5432});
  const references = new Set();
  for (const object of objects.filter(object => object.kind === 'Deployment')) {
    const pod = object.spec.template.spec; references.add('ServiceAccount/' + pod.serviceAccountName);
    for (const secret of pod.imagePullSecrets) references.add('Secret/' + secret.name);
    for (const volume of pod.volumes) if (volume.configMap) references.add('ConfigMap/' + volume.configMap.name);
    for (const container of pod.containers) for (const input of container.env) {
      if (input.valueFrom?.configMapKeyRef) references.add('ConfigMap/' + input.valueFrom.configMapKeyRef.name);
      if (input.valueFrom?.secretKeyRef) references.add('Secret/' + input.valueFrom.secretKeyRef.name);
    }
  }
  assert.deepEqual(required.externalObjects.map(object => object.kind + '/' + object.name).sort(), [...references].sort(), 'Prerequisites must enumerate actual external references');
  return {objects, release, prerequisites: required, budget: await json('infra/k8s/resource-budget.json'), paths: [base + 'kustomization.yaml', overlay + 'kustomization.yaml', ...paths, 'infra/k8s/resource-budget.json', 'infra/k8s/prerequisites.json', ...(release?.files ?? [])]};
}
function quantity(value, suffix) {assert(typeof value === 'string' && new RegExp('^[1-9][0-9]*' + suffix + '$').test(value)); return Number(value.slice(0, -suffix.length));}
function resources(input) {
  keys(input, ['requests', 'limits']);
  for (const side of ['requests', 'limits']) keys(input[side], ['cpu', 'memory']);
  const cpuMillicores = quantity(input.limits.cpu, 'm'), memoryMiB = quantity(input.limits.memory, 'Mi');
  assert(quantity(input.requests.cpu, 'm') <= cpuMillicores && quantity(input.requests.memory, 'Mi') <= memoryMiB);
  return {cpuMillicores, memoryMiB};
}
function workload(object, name, release) {
  keys(object.spec, ['replicas', 'revisionHistoryLimit', 'progressDeadlineSeconds', 'strategy', 'selector', 'template']);
  assert.equal(object.spec.replicas, 1, 'Singleton baseline'); assert.equal(object.spec.revisionHistoryLimit, 2); assert.equal(object.spec.progressDeadlineSeconds, 180);
  assert.deepEqual(object.spec.strategy, name === 'api' ? {type: 'Recreate'} : {type: 'RollingUpdate', rollingUpdate: {maxSurge: 1, maxUnavailable: 0}});
  assert.deepEqual(object.spec.selector, {matchLabels: labels(name)}); assert.deepEqual(object.spec.template.metadata, {labels: labels(name)});
  const pod = object.spec.template.spec;
  keys(pod, ['serviceAccountName', 'automountServiceAccountToken', 'enableServiceLinks', 'hostNetwork', 'nodeSelector', 'imagePullSecrets', 'terminationGracePeriodSeconds', 'securityContext', 'containers', 'volumes']);
  assert.equal(pod.serviceAccountName, 'vlp-runtime'); assert.equal(pod.automountServiceAccountToken, false); assert.equal(pod.enableServiceLinks, false); assert.equal(pod.hostNetwork, false);
  assert.deepEqual(pod.nodeSelector, {'kubernetes.io/os': 'linux', 'kubernetes.io/arch': 'amd64'}); assert.deepEqual(pod.imagePullSecrets, [{name: 'vlp-registry-pull'}]); assert.equal(pod.terminationGracePeriodSeconds, 20);
  assert.deepEqual(pod.securityContext, runtimeSecurity); assert.equal(pod.containers.length, 1);
  const container = pod.containers[0];
  keys(container, ['name', 'image', 'imagePullPolicy', 'command', 'ports', 'env', 'resources', 'securityContext', 'startupProbe', 'livenessProbe', 'readinessProbe', 'volumeMounts']);
  assert.equal(container.name, name); assert.equal(container.image, release?.images[name] ?? 'registry.invalid/vlp-' + name + ':release-required', 'Image must match the integrity-checked release binding or inert sentinel'); assert.equal(container.imagePullPolicy, 'Always');
  assert.deepEqual(container.command, ['node', name === 'api' ? 'dist/main.js' : 'start-runtime.mjs']); assert.deepEqual(container.securityContext, containerSecurity);
  assert.deepEqual(container.ports, [{name: 'http', containerPort: name === 'api' ? 4300 : 3300}]);
  const entries = container.env.map(({name, ...entry}) => [name, entry]); assert.equal(new Set(entries.map(([name]) => name)).size, entries.length);
  assert.deepEqual(Object.fromEntries(entries), name === 'api' ? apiEnvironment : webEnvironment);
  for (const key of ['startupProbe', 'livenessProbe', 'readinessProbe']) {
    const probe = container[key]; assert.equal(probe.timeoutSeconds, 3); assert.equal(probe.periodSeconds, name === 'web' && key === 'livenessProbe' ? 5 : 3); assert.equal(probe.failureThreshold, key === 'startupProbe' ? 40 : 3);
    if (name === 'api') {keys(probe, ['exec', 'timeoutSeconds', 'periodSeconds', 'failureThreshold']); assert.deepEqual(probe.exec, {command: health(key === 'readinessProbe' ? 'ready' : 'live')});}
    else if (key === 'readinessProbe') {keys(probe, ['httpGet', 'timeoutSeconds', 'periodSeconds', 'failureThreshold']); assert.deepEqual(probe.httpGet, {path: '/', port: 'http'});}
    else {keys(probe, ['tcpSocket', 'timeoutSeconds', 'periodSeconds', 'failureThreshold']); assert.deepEqual(probe.tcpSocket, {port: 'http'});}
  }
  const volumes = [{name: 'tmp', emptyDir: {sizeLimit: '16Mi'}}], mounts = [{name: 'tmp', mountPath: '/tmp'}];
  if (name === 'api') {
    volumes.push({name: 'policy', configMap: {name: 'vlp-installation-policy', items: ['release.json', 'runtime-worlds.json', 'safety.json'].map(key => ({key, path: key}))}});
    mounts.push({name: 'policy', mountPath: '/run/vlp-policy', readOnly: true});
  } else {volumes.push({name: 'cache', emptyDir: {sizeLimit: '64Mi'}}); mounts.push({name: 'cache', mountPath: '/app/apps/portal-web/.next/cache'});}
  assert.deepEqual(pod.volumes, volumes); assert.deepEqual(container.volumeMounts, mounts);
  return resources(container.resources);
}
function networkPolicies(name) {
  const selector = labels('api'), tcp = port => [{protocol: 'TCP', port}];
  return {
    'vlp-default-deny': {podSelector: {matchLabels: part}, policyTypes: ['Ingress', 'Egress'], ingress: [], egress: []},
    'vlp-dns': {podSelector: {matchLabels: part}, policyTypes: ['Egress'], egress: [{to: [{namespaceSelector: {matchLabels: {'kubernetes.io/metadata.name': 'kube-system'}}, podSelector: {matchLabels: {'k8s-app': 'kube-dns'}}}], ports: [{protocol: 'UDP', port: 53}, {protocol: 'TCP', port: 53}]}]},
    'vlp-web-to-api': {podSelector: {matchLabels: labels('web')}, policyTypes: ['Egress'], egress: [{to: [{podSelector: {matchLabels: selector}}], ports: tcp(4300)}]},
    'vlp-api-from-web': {podSelector: {matchLabels: selector}, policyTypes: ['Ingress'], ingress: [{from: [{podSelector: {matchLabels: labels('web')}}], ports: tcp(4300)}]},
    'vlp-database': {podSelector: {matchLabels: selector}, policyTypes: ['Egress'], egress: [{to: [{namespaceSelector: {matchLabels: {'kubernetes.io/metadata.name': 'vlp-data-' + name}}, podSelector: {matchLabels: {'app.kubernetes.io/name': 'vlp-postgres'}}}], ports: tcp(5432)}]},
  };
}
export function verifyKubernetesPolicy(objects, name, budget, release = null) {
  const namespace = environment(name), policies = networkPolicies(name), identities = new Set(), limits = {};
  assert.equal(objects.length, 9); assert.equal(budget.schemaVersion, 1); assert.equal(budget.workerEnabled, false); assert.equal(budget.automaticScaling, false);
  assert.deepEqual(budget.applicationCeiling, {cpuMillicores: 2000, memoryMiB: 4096}); assert.deepEqual(budget.migrationReserve, {cpuMillicores: 200, memoryMiB: 512}); assert.equal(budget.webSurgeReplicas, 1);
  if (release) {validateOverlayRelease(release.binding); assert.deepEqual(release.images, release.binding.images); assert.equal(release.evidence, 'LOCAL_INTEGRITY_ONLY'); assert.equal(release.remoteEvidenceVerified, false); assert.equal(release.deploymentEligible, false);}
  for (const object of objects) {
    keys(object, ['apiVersion', 'kind', 'metadata', 'spec']); keys(object.metadata, ['name', 'namespace', 'labels']); assert.equal(object.metadata.namespace, namespace);
    const id = object.kind + '/' + object.metadata.name; assert(!identities.has(id)); identities.add(id);
    if (object.kind === 'NetworkPolicy') {assert.equal(object.apiVersion, 'networking.k8s.io/v1'); assert(Object.hasOwn(policies, object.metadata.name)); assert.deepEqual(object.metadata.labels, part); assert.deepEqual(object.spec, policies[object.metadata.name]);}
    else {
      const component = object.metadata.name === 'vlp-api' ? 'api' : object.metadata.name === 'vlp-web' ? 'web' : null; assert(component); assert.deepEqual(object.metadata.labels, labels(component));
      if (object.kind === 'Deployment') {assert.equal(object.apiVersion, 'apps/v1'); limits[component] = workload(object, component, release);}
      else {assert.equal(object.kind, 'Service', 'No persistent/privileged/public resources in application prune ownership'); assert.equal(object.apiVersion, 'v1'); assert.deepEqual(object.spec, {type: 'ClusterIP', selector: labels(component), ports: [{name: 'http', port: component === 'api' ? 4300 : 3300, targetPort: 'http', protocol: 'TCP'}]});}
    }
  }
  assert.equal(identities.size, 9); assert(limits.api && limits.web);
  const peak = {cpuMillicores: limits.api.cpuMillicores + 2 * limits.web.cpuMillicores + budget.migrationReserve.cpuMillicores, memoryMiB: limits.api.memoryMiB + 2 * limits.web.memoryMiB + budget.migrationReserve.memoryMiB};
  assert(peak.cpuMillicores <= budget.applicationCeiling.cpuMillicores && peak.memoryMiB <= budget.applicationCeiling.memoryMiB, 'Application peak including web surge and migration reserve exceeds ceiling');
  return {result: 'PREPARATION_ONLY', deploymentEligible: false, namespace, workloads: 2, persistentResourcesManaged: 0, peak, limits, artifactEvidence: release ? 'LOCAL_INTEGRITY_ONLY' : 'UNBOUND', scope: 'Closed source policy; actual pinned render/schema checks are separate. Local release hashes never prove remote registry/hosted/ingress qualification.'};
}
export function verifyClusterInventory(input, name, now = Date.now()) {
  environment(name); assert.equal(input.schemaVersion, 1); assert.equal(input.environment, name);
  const age = now - Date.parse(input.observedAt); assert(Number.isFinite(age) && age >= 0 && age <= 15 * 60 * 1000, 'Fresh inventory required');
  assert(Array.isArray(input.nodeArchitectures) && input.nodeArchitectures.length > 0 && input.nodeArchitectures.every(value => value === 'amd64'));
  assert(Array.isArray(input.nodeOperatingSystems) && input.nodeOperatingSystems.length > 0 && input.nodeOperatingSystems.every(value => value === 'linux'));
  assert(['UNKNOWN', 'ABSENT', 'VERIFIED'].includes(input.networkPolicyEnforcement));
  for (const key of ['ingressQualified', 'registryPullQualified', 'externalPrerequisitesVerified']) assert.equal(typeof input[key], 'boolean');
  return {result: 'INVENTORY_ONLY', deploymentEligible: false, prerequisitesDeclaredReady: input.networkPolicyEnforcement === 'VERIFIED' && input.ingressQualified && input.registryPullQualified && input.externalPrerequisitesVerified, scope: 'Declarations and bounded observations are not tested image/ingress/secret/release proof. N04-02/N04-03/N04-04 remain required.'};
}
