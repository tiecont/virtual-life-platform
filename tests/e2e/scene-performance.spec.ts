import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {evidenceOutput} from '../../scripts/evidence-output.mjs';
import {profileSceneMovement} from '../support/scene-profile';
import {armSceneCadence} from '../support/scene-cadence';
import {sceneRenderingProfile,assertSceneRenderingProfile} from '../support/scene-rendering-profile';
import performanceBudget from '../../config/scene-performance.json';
import {guest,enter} from '../support/sandbox-browser-fixtures';

// Worker-scoped launch settings belong to this measurement-only spec.
test.use({launchOptions:{args:[...sceneRenderingProfile.launchArguments]},trace:{mode:'retain-on-failure',screenshots:false,snapshots:true,sources:true}});

test('scene loading, immutable cache, idle work and repeated scene lifetime fit the local performance profile', async ({ page, context }) => {
  test.setTimeout(60000); // Dedicated CPU4x/network/remount profile, not an assertion retry.
  const renderingProfile = await assertSceneRenderingProfile(context);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.5 * 1024 * 1024, uploadThroughput: 768 * 1024 });
  await guest(context, 'Performance Visitor');
  const loadedAsset = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/starter-v1.svg'));
  await enter(page); const canvas = page.locator('canvas[data-scene]'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
  const firstAsset = await loadedAsset; const cacheControl = (await firstAsset.allHeaders())['cache-control'];
  expect(cacheControl).toContain('max-age=31536000'); expect(cacheControl).toContain('immutable');
  const cold = await page.evaluate(() => {
    const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(entry => ({ path: new URL(entry.name).pathname, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize, transfer: entry.transferSize, durationMs: entry.duration }));
    return { readyMs: performance.now(), timeOrigin: performance.timeOrigin, resources };
  });
  const js = cold.resources.filter(entry => entry.path.endsWith('.js'));
  const jsDecoded = js.reduce((sum, entry) => sum + entry.decoded, 0), jsEncoded = js.reduce((sum, entry) => sum + entry.encoded, 0);
  const avatar = cold.resources.find(entry => entry.path.endsWith('/starter-v1.svg'))!;
  await mkdir('artifacts', { recursive: true }); await writeFile(evidenceOutput(`docs/agent/evidence/cafe-performance-cold-${test.info().project.name}.json`), JSON.stringify({ ...cold, profile: performanceBudget.profile, renderingProfile, jsDecoded, jsEncoded, cacheControl }, null, 2));
  expect(cold.readyMs).toBeLessThan(performanceBudget.readyMaxMs); expect(jsDecoded).toBeLessThan(performanceBudget.jsDecodedMaxBytes);
  expect(jsEncoded).toBeLessThan(performanceBudget.jsEncodedMaxBytes); expect(avatar.decoded).toBeGreaterThan(0); expect(avatar.decoded).toBeLessThan(performanceBudget.avatarDecodedMaxBytes);
  const beforeIdle = Number(await canvas.getAttribute('data-render-count')); await page.waitForTimeout(performanceBudget.idleWindowMs);
  const idleRenders = Number(await canvas.getAttribute('data-render-count')) - beforeIdle; expect(idleRenders).toBe(performanceBudget.idleMaxRenders);
  const profileCpu = process.env.SCENE_CPU_PROFILE === '1';
  const stopProfile = profileCpu ? await profileSceneMovement(cdp, 'm07', test.info().project.name) : null;
  const observation=await armSceneCadence(canvas);
  let cadence;
  try{await page.getByRole('button', { name: 'Walk to window aisle', exact: true }).click();cadence=await observation.finish();}
  finally{await observation.dispose();await stopProfile?.();}
  const sortedGaps = cadence.rawGapsMs.filter(gap => gap > 0).sort((a, b) => a - b); const rafP95GapMs = sortedGaps[Math.ceil(sortedGaps.length * .95) - 1];
  await writeFile(evidenceOutput(`docs/agent/evidence/m07-movement-cadence-${test.info().project.name}.json`), JSON.stringify({ profile: performanceBudget.profile, renderingProfile, recordingProfile:'playwright-trace-no-screencast-v1',...cadence, samples: sortedGaps.length, rafP95GapMs, minimumSamplesExclusive: 10, rafP95GapMaxMs: performanceBudget.rafP95GapMaxMs, observedBeforeAcceptance: true, cpuProfilerEnabled: profileCpu }, null, 2));
  expect(cadence.initialMoving).toBe('0');expect(cadence.status).toBe('settled');expect(cadence.connectedThroughout).toBe(true);
  expect(sortedGaps.length).toBeGreaterThan(10); expect(rafP95GapMs).toBeLessThan(performanceBudget.rafP95GapMaxMs);
  await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); await page.getByRole('link', { name: 'Identity', exact: true }).click(); await expect(canvas).toHaveCount(0);
  async function heapBytes() { await cdp.send('HeapProfiler.collectGarbage'); const result = await cdp.send('Performance.getMetrics'); return result.metrics.find(metric => metric.name === 'JSHeapUsedSize')!.value; }
  const warmHeapBytes = await heapBytes();
  for (let i = 0; i < performanceBudget.remountCycles; i++) {
    await page.goBack(); await page.getByRole('button', { name: 'Enter cafe', exact: true }).click(); await expect(canvas).toHaveCount(1); await expect(canvas).toHaveAttribute('data-entity-count', '1');
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); await page.getByRole('link', { name: 'Identity', exact: true }).click(); await expect(canvas).toHaveCount(0);
  }
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(cold.timeOrigin); // Same browser JS realm across actual SPA remounts.
  const afterHeapBytes = await heapBytes(); const heapGrowthBytes = afterHeapBytes - warmHeapBytes;
  expect(heapGrowthBytes).toBeLessThan(performanceBudget.postGcHeapGrowthMaxBytes);
  const second = await context.newPage();
  try {
    await enter(second); await expect(second.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1');
    const warmAsset = await second.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find(entry => new URL(entry.name).pathname.endsWith('/starter-v1.svg'))?.toJSON());
    expect(warmAsset).toBeDefined(); expect(warmAsset!.transferSize).toBe(0);
    await second.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    await mkdir('artifacts', { recursive: true });
    await writeFile(evidenceOutput(`docs/agent/evidence/cafe-performance-${test.info().project.name}.json`), JSON.stringify({ profile: performanceBudget.profile, renderingProfile, readyMs: cold.readyMs, jsDecodedBytes: jsDecoded, jsEncodedBytes: jsEncoded, coldAvatar: avatar, cacheControl, warmAssetTransferBytes: warmAsset!.transferSize, idleWindowMs: performanceBudget.idleWindowMs, idleRenders, rafSamples: sortedGaps.length, rafP95GapMs, remountCycles: performanceBudget.remountCycles, warmHeapBytes, afterHeapBytes, heapGrowthBytes, atlasSourcePixelBytes: 512 * 768 * 4, resources: cold.resources, limits: 'Short local emulated Chromium profile; rAF cadence is not GPU throughput; forced-GC JS heap is not total browser/GPU memory or leak certification.' }, null, 2));
  } finally { await second.close(); }
});
