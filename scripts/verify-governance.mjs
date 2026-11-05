import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { summarize } from './plan-status.mjs';
import { checkRelease } from './verify-release.mjs';
import { checkOpsWatch } from './ops-watch.mjs';
import {historicalEvidence} from './evidence-reader.mjs';

const manifest = JSON.parse(await readFile('PLAN-MANIFEST.json', 'utf8'));
for (const module of manifest.plans) await access(module.file);
for (const original of manifest.originalPlans) await access(original);
for (const name of ['PRD', 'WORLD-MATRIX', 'JOURNEYS', 'CONTENT-POLICY', 'ANALYTICS', 'RISKS']) {
  const content = await readFile(`docs/product/${name}.md`, 'utf8');
  assert(content.trim().length > 300, `Missing substantive ${name}`);
}
const policy = JSON.parse(await readFile('config/rollout.json', 'utf8'));
assert.equal(policy.publicRelease, false, 'Release is not authorized');
assert.deepEqual(Object.keys(policy.worlds).sort(), ['dating', 'deadline', 'library', 'lounge', 'maid', 'park', 'restaurant']);
assert(Object.values(policy.worlds).every(w => w.enabled === false), 'W0 worlds must be OFF');
assert.equal(policy.worlds.dating.requiresReviewedAdultVerification, true);
assert.equal(policy.worlds.dating.globallyDiscoverable, false);
assert.equal(policy.worlds.lounge.unlicensedMediaAllowed, false);
console.log(JSON.stringify(summarize(manifest, JSON.parse(await readFile('docs/agent/task-state.json', 'utf8'))), null, 2));
console.log('Governance consistency verified; no gameplay or release claim.');
await checkRelease();
console.log('Release inventory checked; public release remains blocked.');
await checkOpsWatch();
console.log('Monitoring preparation checked; no live collector or business metrics inferred.');
console.log(JSON.stringify(await (await historicalEvidence()).verifyAll()));
