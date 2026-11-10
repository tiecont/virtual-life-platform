import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { summarize } from './plan-status.mjs';
import {historicalEvidence} from './evidence-reader.mjs';

// Read-only candidate audit. Human approval is never inferred from passing tests.
export function validateRelease(train, rollout, safety, dating, manifest, checkpoint) {
  assert.equal(train.schemaVersion, 1);
  assert.equal(train.scope, 'offline-candidate');
  assert.equal(train.publicRelease, false, 'No public release authorized');
  assert.equal(rollout.publicRelease, false);
  assert(Object.values(rollout.worlds).every(world => world.enabled === false), 'Real world flags must remain OFF');
  assert.equal(rollout.worlds.dating.requiresReviewedAdultVerification, true);
  assert.equal(rollout.worlds.dating.globallyDiscoverable, false);
  assert.equal(rollout.worlds.lounge.unlicensedMediaAllowed, false);
  assert.equal(safety.defaults.chatEnabled, false);
  assert.equal(safety.defaults.unsolicitedDm, false);
  assert(Object.values(safety.approval).every(value => value === false));
  assert.equal(Object.keys(dating.approvals).length, 8);
  assert(Object.values(dating.approvals).every(value => value === false), 'Dating approvals require a separate human review');
  assert.equal(dating.eligibility.provider, null);
  assert.equal(train.roles.implementation, 'project-owner-offline');
  for (const role of ['releaseApprover', 'incidentCommander', 'safetyOnDuty', 'privacyOwner', 'legalReviewer', 'backupCustodian']) {
    assert.equal(train.roles[role], null, 'No real operator assignment supplied: ' + role);
  }
  assert.deepEqual(Object.keys(train.waves), ['W2', 'W3', 'W4', 'W5', 'W6']);
  assert.deepEqual(train.waves.W2.worlds, ['deadline', 'maid']);
  assert.deepEqual(train.waves.W2.priorWaves, [], 'W2 must ship independently of later waves');
  assert.deepEqual(train.waves.W2.extraGates, [], 'Later-world gates must not delay W2');
  const baseline = ['M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M14', 'M15', 'M16', 'M21', 'M22'];
  assert.deepEqual(train.waves.W2.modules, baseline, 'W2 requires its own baseline,not later worlds');
  const worlds = Object.values(train.waves).flatMap(wave => wave.worlds).sort();
  assert.deepEqual(worlds, Object.keys(rollout.worlds).sort(), 'Each real world belongs to one wave');
  assert.deepEqual(train.waves.W6.worlds, ['dating']);
  assert.deepEqual(train.waves.W5.worlds, ['lounge']);
  assert(train.waves.W6.extraGates.includes('dating-reviewed-adult-provider'));
  assert(train.waves.W5.extraGates.includes('lounge-media-review'));
  assert(train.publicGates.includes('explicit-wave-owner-approval'));
  assert(train.publicGates.includes('reviewed-production-installation'));
  const summary = summarize(manifest, checkpoint);
  const waves = {};
  for (const [id, wave] of Object.entries(train.waves)) {
    assert(new Set(wave.modules).size === wave.modules.length);
    for (const module of wave.modules) assert(module in summary.modules, 'Unknown module ' + module);
    for (const prior of wave.priorWaves) assert.equal(prior, 'W2');
    waves[id] = {
      worlds: wave.worlds,
      pendingModules: wave.modules.filter(module => summary.modules[module] !== 'VERIFIED'),
      publicStatus: 'BLOCKED_EXTERNAL',
      gates: [...train.publicGates, ...wave.extraGates],
    };
  }
  return { schemaVersion: 1, publicRelease: false, scope: train.scope, waves, unassignedRoles: Object.keys(train.roles).filter(role => train.roles[role] === null) };
}

export async function checkRelease() {
  const paths = ['config/release-trains.json', 'config/rollout.json', 'config/safety-policy.json', 'config/dating-policy.json', 'tests/fixtures/historical-release/manifest.json', 'tests/fixtures/historical-release/task-state.json'];
  const values = await Promise.all(paths.map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const result = validateRelease(...values);
  assert.equal(values[0].controls.length, 8);
  for (const control of values[0].controls) {
    assert(control.ownerRole in values[0].roles);
    assert(control.id && control.runtime && control.default);
    assert(!control.source.startsWith('/') && !control.source.split('/').includes('..'));
    await access(control.source);
  }
  const decision = JSON.parse(await readFile('config/release-decision.json', 'utf8'));
  validateDecision(decision);
  for (const path of decision.evidence) {
    assert(/^(docs\/agent\/evidence\/|integrations\/legacy-snapshots\/)[a-z0-9/-]+\.json$/.test(path));
    if(path.startsWith('docs/agent/evidence/')) await (await historicalEvidence()).bytes(path);
    else await access(path);
  }
  return { ...result, decision: decision.decision };
}
export function validateDecision(decision) {
  assert.equal(decision.schemaVersion, 1);
  assert.equal(decision.decision, 'NO_GO_PUBLIC');
  assert.equal(decision.publicRelease, false);
  assert.equal(decision.localScope, 'OFFLINE_ONLY');
  assert.deepEqual(decision.authorization, { offlineImplementation: true, selectedSourceSnapshots: true, publicDeployment: false, realStaffProvisioning: false, purchases: false });
  assert.deepEqual(Object.keys(decision.approvals).sort(), ['publicOwner', 'productionDomainCredentials', 'safetyCoverage', 'privacyRetention', 'contentRightsPublic', 'backupCustody', 'monitoringRouting', 'datingProviderLegalPilot', 'loungeLiveOperatorMedia'].sort());
  assert(Object.values(decision.approvals).every(value => value === null), 'No human public signoffs supplied');
  assert.deepEqual(decision.blockedTasks, ['M20-07', 'M23-03', 'M23-05']);
  assert(decision.evidence.length >= 6);
  return { publicRelease: false, localScope: decision.localScope };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await checkRelease(), null, 2));
}
