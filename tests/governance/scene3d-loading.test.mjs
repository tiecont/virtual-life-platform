import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {nearestRank, evaluateLoading, evaluateHeap} from '../../scripts/scene3d-loading-policy.mjs';
const budget = JSON.parse(await readFile(new URL('../../config/rendering/budgets-v1.json', import.meta.url)));
const samples = mode => Array.from({length: 10}, (_, index) => ({mode, actors: 20, quality: 'balanced', requestedQuality: 'balanced', canvasCount: 1, navigationToReadyMs: 1000 + index * 100, cachedAssets: mode === 'warm' ? 2 : 0, networkAssetBytes: mode === 'cold' ? 1024 : 0}));
test('loading retains slow samples, rejects incomplete data and computes nearest rank', () => {
  assert.equal(nearestRank([10, 1, 9, 2, 8, 3, 7, 4, 6, 5], .75), 8);
  assert.equal(nearestRank([NaN], .75), null);
  const values = samples('cold');
  assert.equal(evaluateLoading(values, 10, budget).observedLimitMet, true);
  assert.equal(evaluateLoading(values.slice(1), 10, budget).observedLimitMet, false);
  values.slice(7).forEach(value => {value.navigationToReadyMs = 5001;});
  assert.equal(evaluateLoading(values, 10, budget).observedLimitMet, false);
});
test('wrong initial tier and absent warm-cache evidence cannot qualify loading', () => {
  const values = samples('warm');
  assert.equal(evaluateLoading(values, 10, budget).observedLimitMet, true);
  values[0].quality = 'low';
  assert.equal(evaluateLoading(values, 10, budget).observedLimitMet, false);
  values[0].quality = 'balanced'; values[0].cachedAssets = 0;
  assert.equal(evaluateLoading(values, 10, budget).observedLimitMet, false);
  values[0].mode = 'cold';
  assert.equal(evaluateLoading(values, 10, budget).observedLimitMet, false);
});
test('heap needs external GC for every cycle and applies original absolute/relative rule', () => {
  const baseline = {usedSize: 100 * 1024 ** 2, gcCompleted: true};
  const values = Array.from({length: 20}, () => ({usedSize: 119 * 1024 ** 2, gcCompleted: true}));
  assert.equal(evaluateHeap(baseline, values, 20, budget).observedLimitMet, true);
  values[19].usedSize = 121 * 1024 ** 2;
  assert.equal(evaluateHeap(baseline, values, 20, budget).observedLimitMet, false);
  values[19].usedSize = baseline.usedSize; values[3].gcCompleted = false;
  assert.equal(evaluateHeap(baseline, values, 20, budget).growthBytes, null);
  assert.equal(evaluateHeap(null, [], 20, budget).observedLimitMet, false);
  assert.equal(evaluateHeap({usedSize: 1024, gcCompleted: true}, [], 20, budget).allowedGrowthBytes, 16 * 1024 ** 2);
});
