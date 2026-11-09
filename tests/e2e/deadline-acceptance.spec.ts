import {evidenceOutput} from '../../scripts/evidence-output.mjs';
import { test,expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { guest,enter } from '../support/deadline-safety-fixtures';
import performanceBudget from '../../config/scene-performance.json';

// Separate one-browser rendering profile. API40actor/30seat measurements are
// recorded by bench:deadline and are not a40browser rendering claim.
test('Deadline keyboard focus,timer actions,reduced motion and readable controls remain accessible without canvas input',async({page,context},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await guest(context,'Deadline keyboard');await page.goto('/worlds/deadline');
 // Native Tab skips unavailable controls; start the keyboard path after async entry readiness.
 const enter=page.getByRole('button',{name:'Enter cafe',exact:true});await expect(enter).toBeEnabled();
 const skip=page.getByRole('link',{name:'Skip to room controls',exact:true});await skip.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('complementary',{name:'Your room',exact:true})).toBeFocused();await page.keyboard.press('Tab');
 await expect(enter).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Walk around',exact:true})).toBeFocused();
 const canvas=page.locator('canvas[data-scene="deadline"]');await expect(canvas).toHaveAttribute('data-reduced-motion','true');
 await expect(page.getByLabel('Reduce room motion',{exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Deadline desk 30',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Deadline desk 30, your seat',exact:true})).toBeVisible();
 const timer=page.getByRole('region',{name:'Private focus timer',exact:true});
 for(const [name,state] of [['Start focus','Focus in progress'],['Cancel timer','Timer cancelled']]){
  const button=timer.getByRole('button',{name,exact:true});await expect(button).toBeEnabled();await button.focus();await page.keyboard.press('Enter');await expect(timer.getByText(state,{exact:true})).toBeVisible();
 }
 await expect(timer.getByRole('button',{name:'Pause timer',exact:true})).toHaveCount(0);
 await expect(timer.getByRole('timer')).toHaveAttribute('aria-live','off');
 await expect(canvas).toHaveAttribute('data-active-animations','0');const frames=await canvas.getAttribute('data-render-count');await page.waitForTimeout(350);await expect(canvas).toHaveAttribute('data-render-count',frames!);
 const contrast=await page.evaluate(()=>{
  const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number);
  const luminance=(values:number[])=>values.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  return Array.from(document.querySelectorAll('.cafe-note,.cafe-scene-caption,.cafe-eyebrow,.cafe-occupancy,.cafe-seat-grid small,.focus-timer p,.focus-timer label,.focus-private')).filter(e=>e.getClientRects().length>0&&!e.closest('button:disabled')).map(e=>{
   let parent:Element|null=e,background='rgb(248, 250, 249)';while(parent){const color=getComputedStyle(parent).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){background=color;break;}parent=parent.parentElement;}
   const foreground=getComputedStyle(e).color,a=luminance(rgb(foreground)),b=luminance(rgb(background));return {selector:e.className||e.tagName,foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
 });expect(contrast.length).toBeGreaterThan(10);expect(contrast.every(row=>row.ratio>=4.5)).toBe(true);
 const targets=await page.locator('main button:visible').evaluateAll(elements=>elements.map(e=>({label:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 expect(targets.every(t=>t.width>=44&&t.height>=44)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const dir=evidenceOutput('docs/agent/evidence/m15-deadline-accessibility');await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/${info.project.name}-deadline.png`,fullPage:true});
 await page.getByRole('link',{name:'Back to visit controls',exact:true}).focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
 await expect(page.getByRole('button',{name:'Leave cafe',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(enter).toBeFocused();
 await writeFile(`${dir}/${info.project.name}-deadline.json`,JSON.stringify({nativeEntrySeatTimerAndExit:true,systemReducedMotion:true,noIdleFrames:true,timerLiveRegionOff:true,contrast,targets},null,2));
});

test('Deadline scene loading,cache,idle work and SPA lifetimes fit the unchanged local browser budget', async ({ page, context }) => {
  test.setTimeout(60000); // Dedicated CPU4x/network/remount profile, not an assertion retry.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.5 * 1024 * 1024, uploadThroughput: 768 * 1024 });
  await guest(context, 'Deadline performance');
  const loadedAsset = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/starter-v1.svg'));
  await enter(page, 'deadline'); const canvas = page.locator('canvas[data-scene="deadline"]'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
  const firstAsset = await loadedAsset; const cacheControl = (await firstAsset.allHeaders())['cache-control'];
  expect(cacheControl).toContain('max-age=31536000'); expect(cacheControl).toContain('immutable');
  const cold = await page.evaluate(() => {
    const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(entry => ({ path: new URL(entry.name).pathname, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize, transfer: entry.transferSize, durationMs: entry.duration }));
    return { readyMs: performance.now(), timeOrigin: performance.timeOrigin, resources };
  });
  const js = cold.resources.filter(entry => entry.path.endsWith('.js'));
  const jsDecoded = js.reduce((sum, entry) => sum + entry.decoded, 0), jsEncoded = js.reduce((sum, entry) => sum + entry.encoded, 0);
  const avatar = cold.resources.find(entry => entry.path.endsWith('/starter-v1.svg'))!;
  await mkdir('artifacts', { recursive: true }); await writeFile(evidenceOutput(`docs/agent/evidence/m15-deadline-performance-cold-${test.info().project.name}.json`), JSON.stringify({ ...cold, profile: performanceBudget.profile, jsDecoded, jsEncoded, cacheControl }, null, 2));
  expect(cold.readyMs).toBeLessThan(performanceBudget.readyMaxMs); expect(jsDecoded).toBeLessThan(performanceBudget.jsDecodedMaxBytes);
  expect(jsEncoded).toBeLessThan(performanceBudget.jsEncodedMaxBytes); expect(avatar.decoded).toBeGreaterThan(0); expect(avatar.decoded).toBeLessThan(performanceBudget.avatarDecodedMaxBytes);
  const beforeIdle = Number(await canvas.getAttribute('data-render-count')); await page.waitForTimeout(performanceBudget.idleWindowMs);
  const idleRenders = Number(await canvas.getAttribute('data-render-count')) - beforeIdle; expect(idleRenders).toBe(performanceBudget.idleMaxRenders);
  const profileCpu = process.env.SCENE_CPU_PROFILE === '1';
  if (profileCpu) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  await page.getByRole('button', { name: 'Walk to window aisle', exact: true }).click(); await expect(canvas).toHaveAttribute('data-moving-count', '1');
  const cadence = await canvas.evaluate(element => new Promise<number[]>((resolve, reject) => {
    const gaps: number[] = []; let last = performance.now(); const start = last;
    function sample(time: number) {
      gaps.push(time - last); last = time;
      if ((element as HTMLElement).dataset.movingCount === '0') resolve(gaps);
      else if (time - start > 8000) reject(new Error('Movement cadence profile timed out'));
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  if (profileCpu) { const { profile } = await cdp.send('Profiler.stop'); await writeFile(evidenceOutput(`docs/agent/evidence/m15-movement-cpu-${test.info().project.name}.cpuprofile`), JSON.stringify(profile)); await cdp.send('Profiler.disable'); }
  const sortedGaps = cadence.filter(gap => gap > 0).sort((a, b) => a - b); const rafP95GapMs = sortedGaps[Math.ceil(sortedGaps.length * .95) - 1];
  await writeFile(evidenceOutput(`docs/agent/evidence/m15-movement-cadence-${test.info().project.name}.json`), JSON.stringify({ profile: performanceBudget.profile, rawGapsMs: cadence, samples: sortedGaps.length, rafP95GapMs, minimumSamplesExclusive: 10, rafP95GapMaxMs: performanceBudget.rafP95GapMaxMs, observedBeforeAcceptance: true, cpuProfilerEnabled: profileCpu }, null, 2));
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
    await enter(second, 'deadline'); await expect(second.locator('canvas[data-scene="deadline"]')).toHaveAttribute('data-entity-count', '1');
    const warmAsset = await second.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find(entry => new URL(entry.name).pathname.endsWith('/starter-v1.svg'))?.toJSON());
    expect(warmAsset).toBeDefined(); expect(warmAsset!.transferSize).toBe(0);
    await second.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    await mkdir('artifacts', { recursive: true });
    await writeFile(evidenceOutput(`docs/agent/evidence/m15-deadline-performance-${test.info().project.name}.json`), JSON.stringify({ profile: performanceBudget.profile, readyMs: cold.readyMs, jsDecodedBytes: jsDecoded, jsEncodedBytes: jsEncoded, coldAvatar: avatar, cacheControl, warmAssetTransferBytes: warmAsset!.transferSize, idleWindowMs: performanceBudget.idleWindowMs, idleRenders, rafSamples: sortedGaps.length, rafP95GapMs, remountCycles: performanceBudget.remountCycles, warmHeapBytes, afterHeapBytes, heapGrowthBytes, atlasSourcePixelBytes: 512 * 768 * 4, resources: cold.resources, limits: 'Short local emulated Chromium profile; rAF cadence is not GPU throughput; forced-GC JS heap is not total browser/GPU memory or leak certification.' }, null, 2));
  } finally { await second.close(); }
});
