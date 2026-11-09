import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyWebFirstPlan, webDependencyFailures} from '../../scripts/verify-web-first-plan.mjs';

test('web-first plan retains deferred native gates without direct or transitive platform blockers', async () => {
  assert.equal((await verifyWebFirstPlan()).hardNativeDependenciesForWeb, 0);
  const native = {id: 'N10-06', module: 'N10', depends_on: []};
  const web = {id: 'N06-07', module: 'N06', depends_on: []};
  const match = {id: 'N15-05', module: 'N15', depends_on: [], upstream_requires: ['N06-07']};
  assert.deepEqual(webDependencyFailures({tasks: [native, web]}, {tasks: [match]}), []);
  web.depends_on.push(native.id);
  assert.deepEqual(webDependencyFailures({tasks: [native, web]}, {tasks: [match]}), ['N06-07 -> N10-06', 'N15-05 -> N06-07 -> N10-06']);
  web.depends_on = []; match.upstream_requires = [native.id];
  assert.deepEqual(webDependencyFailures({tasks: [native, web]}, {tasks: [match]}), ['N15-05 -> N10-06']);
});
