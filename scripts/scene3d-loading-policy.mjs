// Measurements with missing samples/GC are unknown, never a zero-byte pass.
export function nearestRank(values, percentile) {
  if (!values.length || !Number.isFinite(percentile) || percentile <= 0 || percentile > 1 || values.some(value => !Number.isFinite(value) || value < 0)) return null;
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * percentile) - 1];
}

export function evaluateLoading(samples, expected, budget) {
  const complete = samples.length === expected && samples.every(sample => sample.actors === 20 && sample.quality === sample.requestedQuality && sample.canvasCount === 1);
  const p75Ms = nearestRank(samples.map(sample => sample.navigationToReadyMs), .75);
  const limitMs = budget.unchangedPhysicalGates.interactiveColdP75Ms;
  const warmLimitMs = budget.unchangedPhysicalGates.interactiveWarmP75Ms;
  const sameMode = samples.length > 0 && samples.every(sample => sample.mode === samples[0].mode) && ['cold', 'warm'].includes(samples[0].mode);
  const cacheEvidence = sameMode && samples.every(sample => sample.mode === 'cold' ? sample.cachedAssets === 0 && sample.networkAssetBytes > 0 : sample.cachedAssets > 0);
  const appliedLimitMs = samples[0]?.mode === 'warm' ? warmLimitMs : limitMs;
  return {complete, cacheEvidence, p75Ms, limitMs: appliedLimitMs, observedLimitMet: complete && sameMode && cacheEvidence && p75Ms !== null && p75Ms <= appliedLimitMs};
}

export function evaluateHeap(baseline, samples, expected, budget) {
  const valid = value => Number.isFinite(value?.usedSize) && value.usedSize > 0 && value.gcCompleted === true;
  const complete = valid(baseline) && samples.length === expected && samples.every(valid);
  const rules = budget.unchangedPhysicalGates.jsGrowthAfter20Visits;
  const allowedGrowthBytes = valid(baseline) ? Math.max(rules.absoluteMiB * 1024 ** 2, baseline.usedSize * rules.relativePercent / 100) : null;
  const growthBytes = complete ? samples.at(-1).usedSize - baseline.usedSize : null;
  const peakGrowthBytes = complete ? Math.max(...samples.map(sample => sample.usedSize - baseline.usedSize)) : null;
  return {complete, growthBytes, peakGrowthBytes, allowedGrowthBytes, observedLimitMet: complete && growthBytes <= allowedGrowthBytes};
}
