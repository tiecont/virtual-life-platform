import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTaskPlan} from '../../scripts/task-plan.mjs';

// The separate per-stage counts an M4 production claim must report. A readiness
// flag, roster row or manifest entry is never one of these counts.
const stages = ['combatBound', 'combatVerified', 'conceptApproved', 'modelProduced',
  'rigValidated', 'animationBound', 'unityAdmitted', 'renderReviewed', 'rightsCleared'];
const stagePhrases = ['canonical identities', 'combat bound', 'combat verified', 'concept approved',
  'model produced', 'rig validated', 'animation bound', 'unity admitted', 'render reviewed', 'rights cleared'];

test('content readiness records production per stage instead of one readiness flag', async () => {
  const plan = await readTaskPlan();
  const readiness = plan.mvpProgram.contentReadiness;
  assert(readiness, 'M4 needs an explicit per-stage content readiness ledger');
  assert.equal(readiness.schemaVersion, 1);
  assert.equal(readiness.canonicalIdentities, readiness.activeIdentities + readiness.gatedCandidates,
    'canonical identities must equal active + gated candidates');
  assert.equal(readiness.canonicalIdentities, 61);
  assert.equal(readiness.activeIdentities, 55);
  assert.equal(readiness.gatedCandidates, 6);
  for (const stage of stages) {
    assert(Object.hasOwn(readiness.stages, stage), 'ledger is missing stage ' + stage);
    const count = readiness.stages[stage];
    assert(Number.isInteger(count) && count >= 0, 'stage ' + stage + ' must be a non-negative integer count');
    assert(count <= readiness.activeIdentities, 'stage ' + stage + ' cannot exceed the active roster');
  }
  assert(Array.isArray(readiness.developerSubstitutes), 'developer substitutes must be itemized');
  for (const substitute of readiness.developerSubstitutes)
    assert.match(substitute.status, /DEVELOPER_SUBSTITUTE/,
      'a developer substitute is never counted as an accepted production asset');
});

test('M4 and VL-182 never accept a readiness field as a produced asset', async () => {
  const plan = await readTaskPlan();
  const m4 = plan.mvpProgram.milestones.find(milestone => milestone.id === 'M4');
  const exit = m4.exitCriteria.join(' ').toLowerCase();
  assert(/stage/.test(exit) && /(owner-accepted|production asset)/.test(exit),
    'M4 exit criteria must require per-stage production, not readiness');

  const vl182 = plan.tasks.find(task => task.id === 'VL-182');
  const acceptance = vl182.acceptance.join(' ').toLowerCase();
  assert(/missing/.test(acceptance), 'VL-182 must keep an explicit missing-asset status');
  assert(/owner-accepted/.test(acceptance), 'VL-182 must require an actual owner-accepted asset');
  assert(/never (satisfies|counts|a produced)/.test(acceptance),
    'VL-182 must state a readiness field or manifest entry never satisfies acceptance');
  for (const phrase of stagePhrases)
    assert(acceptance.includes(phrase), 'VL-182 acceptance must report the ' + phrase + ' count');
});