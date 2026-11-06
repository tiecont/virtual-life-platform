import {evidenceOutput} from '../../scripts/evidence-output.mjs';
import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {guest} from '../support/deadline-safety-fixtures';
import performanceBudget from '../../config/scene-performance.json';
async function enterMaid(page:Page){await page.goto('/worlds/maid');await page.getByRole('button',{name:'Enter cafe',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Connected');}
test('Maid keyboard service withdrawal,reduced motion and readable controls work without canvas input',async({page,context},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await guest(context,'Maid keyboard');await page.goto('/worlds/maid');await page.getByRole('link',{name:'Skip to room controls',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('complementary',{name:'Your room',exact:true})).toBeFocused();await page.keyboard.press('Tab');const entry=page.getByRole('button',{name:'Enter cafe',exact:true});await expect(entry).toBeFocused();await expect(page.getByRole('button',{name:'Enter cafe',exact:true})).toBeEnabled();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Walk around',exact:true})).toBeFocused();const canvas=page.locator('canvas[data-scene="maid"]');await expect(canvas).toHaveAttribute('data-reduced-motion','true');await expect(page.getByLabel('Reduce room motion',{exact:true})).toBeChecked();await page.getByRole('button',{name:'Sakura chair 24',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Sakura chair 24, your seat',exact:true})).toBeVisible();await page.getByRole('button',{name:'Order Coffee',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByText('Order state: PENDING',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Withdraw unfinished service',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByText('Order state: CANCELLED',{exact:true})).toBeVisible();await expect(canvas).toHaveAttribute('data-active-animations','0');const frames=await canvas.getAttribute('data-render-count');await page.waitForTimeout(350);await expect(canvas).toHaveAttribute('data-render-count',frames!);
 const contrast=await page.evaluate(()=>{
  const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number),lum=(values:number[])=>values.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  return Array.from(document.querySelectorAll('.cafe-note,.cafe-scene-caption,.cafe-eyebrow,.cafe-occupancy,.cafe-seat-grid small,.maid-service p,.room-events p')).filter(e=>e.getClientRects().length>0&&!e.closest('button:disabled')).map(e=>{let parent:Element|null=e,background='rgb(248, 250, 249)';while(parent){const color=getComputedStyle(parent).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent'){background=color;break;}parent=parent.parentElement;}const foreground=getComputedStyle(e).color,a=lum(rgb(foreground)),b=lum(rgb(background));return {selector:e.className||e.tagName,foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
 });expect(contrast.length).toBeGreaterThan(10);expect(contrast.every(row=>row.ratio>=4.5)).toBe(true);const targets=await page.locator('main button:visible').evaluateAll(elements=>elements.map(e=>({label:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));expect(targets.every(t=>t.width>=44&&t.height>=44)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('audio,video,iframe').count()).toBe(0);const dir=evidenceOutput('docs/agent/evidence/m16-maid-accessibility');await mkdir(dir,{recursive:true});await page.screenshot({path:`${dir}/${info.project.name}.png`,fullPage:true});await page.getByRole('link',{name:'Back to visit controls',exact:true}).focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Leave cafe',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(entry).toBeFocused();await writeFile(`${dir}/${info.project.name}.json`,JSON.stringify({keyboardEntryChair24OrderWithdrawExit:true,reducedMotion:true,noIdleFrames:true,noMedia:true,contrast,targets},null,2));
});

test('Maid scene loading,cache,idle work and SPA lifetimes fit the unchanged local browser budget', async ({ page, context }) => {
  test.setTimeout(60000); // Dedicated CPU4x/network/remount profile, not an assertion retry.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.5 * 1024 * 1024, uploadThroughput: 768 * 1024 });
  await guest(context, 'Maid performance');
  const loadedAsset = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/starter-v1.svg'));
  await enterMaid(page); const canvas = page.locator('canvas[data-scene="maid"]'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
  const firstAsset = await loadedAsset; const cacheControl = (await firstAsset.allHeaders())['cache-control'];
  expect(cacheControl).toContain('max-age=31536000'); expect(cacheControl).toContain('immutable');
  const cold = await page.evaluate(() => {
    const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(entry => ({ path: new URL(entry.name).pathname, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize, transfer: entry.transferSize, durationMs: entry.duration }));
    return { readyMs: performance.now(), timeOrigin: performance.timeOrigin, resources };
  });
  const js = cold.resources.filter(entry => entry.path.endsWith('.js'));
  const jsDecoded = js.reduce((sum, entry) => sum + entry.decoded, 0), jsEncoded = js.reduce((sum, entry) => sum + entry.encoded, 0);
  const avatar = cold.resources.find(entry => entry.path.endsWith('/starter-v1.svg'))!;
  await mkdir('artifacts', { recursive: true }); await writeFile(evidenceOutput(`docs/agent/evidence/m16-maid-performance-cold-${test.info().project.name}.json`), JSON.stringify({ ...cold, profile: performanceBudget.profile, jsDecoded, jsEncoded, cacheControl }, null, 2));
  expect(cold.readyMs).toBeLessThan(performanceBudget.readyMaxMs); expect(jsDecoded).toBeLessThan(performanceBudget.jsDecodedMaxBytes);
  expect(jsEncoded).toBeLessThan(performanceBudget.jsEncodedMaxBytes); expect(avatar.decoded).toBeGreaterThan(0); expect(avatar.decoded).toBeLessThan(performanceBudget.avatarDecodedMaxBytes);
  const beforeIdle = Number(await canvas.getAttribute('data-render-count')); await page.waitForTimeout(performanceBudget.idleWindowMs);
  const idleRenders = Number(await canvas.getAttribute('data-render-count')) - beforeIdle; expect(idleRenders).toBe(performanceBudget.idleMaxRenders);
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
  const sortedGaps = cadence.filter(gap => gap > 0).sort((a, b) => a - b); const rafP95GapMs = sortedGaps[Math.ceil(sortedGaps.length * .95) - 1];
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
    await enterMaid(second); await expect(second.locator('canvas[data-scene="maid"]')).toHaveAttribute('data-entity-count', '1');
    const warmAsset = await second.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find(entry => new URL(entry.name).pathname.endsWith('/starter-v1.svg'))?.toJSON());
    expect(warmAsset).toBeDefined(); expect(warmAsset!.transferSize).toBe(0);
    await second.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    await mkdir('artifacts', { recursive: true });
    await writeFile(evidenceOutput(`docs/agent/evidence/m16-maid-performance-${test.info().project.name}.json`), JSON.stringify({ profile: performanceBudget.profile, readyMs: cold.readyMs, jsDecodedBytes: jsDecoded, jsEncodedBytes: jsEncoded, coldAvatar: avatar, cacheControl, warmAssetTransferBytes: warmAsset!.transferSize, idleWindowMs: performanceBudget.idleWindowMs, idleRenders, rafSamples: sortedGaps.length, rafP95GapMs, remountCycles: performanceBudget.remountCycles, warmHeapBytes, afterHeapBytes, heapGrowthBytes, atlasSourcePixelBytes: 512 * 768 * 4, resources: cold.resources, limits: 'Short local emulated Chromium profile; rAF cadence is not GPU throughput; forced-GC JS heap is not total browser/GPU memory or leak certification.' }, null, 2));
  } finally { await second.close(); }
});
