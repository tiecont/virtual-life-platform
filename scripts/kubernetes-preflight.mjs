import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {lstat, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ensureKubernetesTools} from './kubernetes-tools.mjs';
import {verifyClusterInventory} from './kubernetes-policy.mjs';

// Explicit context only. Never inspect the default kubeconfig, secret/configmap
// values, identities, logs or application data; observations cannot grant release.
export async function inspectKubernetesCluster({environment, kubeconfig, context}) {
  assert(['staging', 'production'].includes(environment)); assert(typeof context === 'string' && /^[A-Za-z0-9._:@/-]{1,128}$/.test(context));
  assert(typeof kubeconfig === 'string' && kubeconfig.length > 0); const config = resolve(kubeconfig), stat = await lstat(config);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'Explicit private kubeconfig file required');
  const {tools} = await ensureKubernetesTools(['kubectl']), commands = [];
  function query(args) {
    const argv = ['--kubeconfig', config, '--context', context, '--request-timeout=5s', ...args], startedAt = new Date().toISOString();
    const response = spawnSync(tools.kubectl, argv, {encoding: 'utf8', timeout: 10000, maxBuffer: 10 * 1024 * 1024});
    commands.push({command: 'pinned kubectl with explicit private configuration/context', args, startedAt, endedAt: new Date().toISOString(), exitCode: response.status, signal: response.signal});
    assert(!response.error && response.status === 0, 'Cluster inventory unavailable'); return JSON.parse(response.stdout);
  }
  const version = query(['version', '-o', 'json']); assert(/^v1\.37\./.test(version.serverVersion.gitVersion), 'Server minor has not been schema-qualified');
  const nodes = query(['get', 'nodes', '-o', 'json']), ingress = query(['get', 'ingressclasses', '-o', 'json']);
  assert(Array.isArray(nodes.items) && nodes.items.length > 0 && nodes.items.every(node => node.status.conditions.some(condition => condition.type === 'Ready' && condition.status === 'True')));
  const inventory = {
    schemaVersion: 1, environment, observedAt: new Date().toISOString(), serverVersion: version.serverVersion.gitVersion,
    nodeArchitectures: nodes.items.map(node => node.status.nodeInfo.architecture), nodeOperatingSystems: nodes.items.map(node => node.status.nodeInfo.operatingSystem), readyNodes: nodes.items.length,
    ingressClassesObserved: ingress.items.length, networkPolicyEnforcement: 'UNKNOWN', ingressQualified: false, registryPullQualified: false, externalPrerequisitesVerified: false,
    scope: 'Explicit target metadata only; ingress class presence is not TLS/WSS/auth qualification and API availability is not NetworkPolicy enforcement. No Secret/ConfigMap values read. No image pull, app deployment or release qualified.',
  };
  const result = verifyClusterInventory(inventory, environment), root = 'artifacts/k8s-preflight/' + randomUUID(); await mkdir(root, {recursive: true, mode: 0o700});
  const report = root + '/inventory.json'; await writeFile(report, JSON.stringify({inventory, result, commands}, null, 2) + '\n', {mode: 0o600});
  return {result: 'INVENTORY_ONLY', deploymentEligible: false, readyNodes: inventory.readyNodes, nodeArchitectures: inventory.nodeArchitectures, ingressClassesObserved: inventory.ingressClassesObserved, report};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [environment, kubeconfig, context, ...extra] = process.argv.slice(2);
  if (!environment || !kubeconfig || !context || extra.length) {console.error('Usage: pnpm k8s:preflight <staging|production> <explicit-private-kubeconfig> <explicit-context>; read-only inventory, never release approval'); process.exitCode = 1;}
  else inspectKubernetesCluster({environment, kubeconfig, context}).then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {console.error('Cluster preflight failed; explicit private configuration, qualified version and prerequisites required; no sensitive values emitted'); process.exitCode = 1;});
}
