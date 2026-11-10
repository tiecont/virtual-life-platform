import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {platform, release, cpus, totalmem} from 'node:os';
import {chromium, expect} from '@playwright/test';
import {workloadSourceFiles, workloadBundleFiles} from './scene3d-workload-evidence.mjs';
import {evaluateLoading, evaluateHeap} from './scene3d-loading-policy.mjs';

const profileRef = 'tests/renderer-workload/LOADING-PROFILE-v1.json';
const budgetRef = 'config/rendering/budgets-v1.json';
const json = async ref => JSON.parse(await readFile(ref));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const profile = await json(profileRef), budget = await json(budgetRef);
const evidenceSet = process.env.VLP_LOADING_EVIDENCE_SET ?? 'loading-v1';
assert(['loading-v1', 'cache-v1', 'groom-v1'].includes(evidenceSet), 'Unknown loading evidence set');
const output = 'artifacts/vnext/n06-11/' + evidenceSet + '/browser-' + randomUUID().slice(0, 8);
await mkdir(output, {recursive: true, mode: 0o700});
const sourceFiles = async () => [...await workloadSourceFiles(), ...await Promise.all([
  'scripts/verify-scene3d-loading.mjs', 'scripts/scene3d-loading-policy.mjs',
  'tests/governance/scene3d-loading.test.mjs', 'pnpm-lock.yaml', budgetRef
].map(async ref => ({ref, sha256: hash(await readFile(ref))})))];
const root = resolve('apps/mobile/dist'), bundleFiles = await workloadBundleFiles();
const bodies = new Map();
for (const file of bundleFiles) bodies.set('/' + file.ref, gzipSync(await readFile(root + '/' + file.ref)));
assert(bundleFiles.some(file => file.ref.endsWith('.js') && bodies.has('/' + file.ref)));
assert((await Promise.all(bundleFiles.filter(file => file.ref.endsWith('.js')).map(file => readFile(root + '/' + file.ref, 'utf8')))).some(text => text.includes('SYNTHETIC 20-ACTOR RENDERER BENCHMARK')), 'Build renderer-workload mode first');
assert((await readFile(root + '/index.html', 'utf8')).includes('Content-Security-Policy'));
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const serverRequests = [];
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') {res.writeHead(204); res.end(); return;}
  const path = pathname === '/' ? '/index.html' : pathname, body = bodies.get(path);
  if (!body) {res.writeHead(404); res.end(); return;}
  serverRequests.push({path, wireBodyBytes: body.length, at: new Date().toISOString()});
  res.writeHead(200, {'content-type': mime[extname(path)] ?? 'application/octet-stream', 'content-encoding': 'gzip', 'content-length': body.length, 'cache-control': path === '/index.html' ? 'no-store' : 'public, max-age=31536000, immutable'});
  res.end(body);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + server.address().port;
const facts = {
  scope: profile.scope, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  trackedDiffSha256: hash(execFileSync('git', ['diff', '--binary', 'HEAD'], {maxBuffer: 32 * 1024 ** 2})),
  profileRef, profileSha256: hash(await readFile(profileRef)), budgetSha256: hash(await readFile(budgetRef)),
  profile, sourceFiles: await sourceFiles(), bundleFiles,
  environment: {os: platform(), kernel: release(), node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem()},
  startedAt: new Date().toISOString(), profiles: [], result: 'IN_PROGRESS',
  physicalPerformanceQualified: false, nativePackagedLoadingQualified: false,
  finalArtWaitQualified: false, starterCatalogQualified: false
};
const save = () => writeFile(output + '/facts.json', JSON.stringify(facts, null, 2) + '\n');
await save();
let browser;
async function gpu(page) {
  return page.locator('canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {version: gl.getParameter(gl.VERSION), renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'UNKNOWN'};
  });
}
async function target(setup, throttled) {
  const options = {...setup}; delete options.name;
  const context = await browser.newContext({...options, serviceWorkers: 'block'}), page = await context.newPage();
  const cdp = await context.newCDPSession(page), errors = [], foreign = [], sockets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('request', request => {if (!request.url().startsWith(origin + '/') && !/^(data:|blob:)/.test(request.url())) foreign.push(request.url());});
  page.on('websocket', socket => sockets.push(socket.url()));
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', {cacheDisabled: false});
  if (throttled) {
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.emulateNetworkConditions', profile.network);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: profile.cpuRate});
  }
  const check = () => {assert.deepEqual(errors, []); assert.deepEqual(foreign, []); assert.deepEqual(sockets, []);};
  return {context, page, cdp, errors, foreign, sockets, check};
}
async function ready(page, quality, reload = false) {
  if (reload) await page.reload({waitUntil: 'domcontentloaded', timeout: profile.navigationDeadlineMilliseconds});
  else await page.goto(origin + '/?quality=' + quality, {waitUntil: 'domcontentloaded', timeout: profile.navigationDeadlineMilliseconds});
  await expect(page.getByRole('status')).toHaveText('20 synthetic actors ready', {timeout: profile.navigationDeadlineMilliseconds});
  const current = await page.evaluate(() => window.rendererWorkload.facts());
  assert.equal(current.quality, quality);
  assert.equal(current.diagnostics.actors, 20);
  // Exactly one initial construction: Balanced cold must never warm Low first.
  assert.equal(current.starts.length, 1);
  return current;
}
async function gcSample(t) {
  for (let index = 0; index < profile.heap.garbageCollectionsPerSample; index++) {
    await t.page.waitForTimeout(profile.heap.idleMilliseconds);
    await t.cdp.send('HeapProfiler.collectGarbage');
  }
  const heap = await t.cdp.send('Runtime.getHeapUsage');
  assert(Number.isFinite(heap.usedSize) && heap.usedSize > 0, 'CDP heap unavailable');
  return {...heap, gcCompleted: true, at: new Date().toISOString()};
}
try {
  browser = await chromium.launch(); facts.environment.chromium = browser.version();
  for (const setup of profile.profiles) {
    const recorded = {name: setup.name, tiers: [], heap: null}; facts.profiles.push(recorded); await save();
    for (const quality of profile.tiers) {
      const tier = {quality, samples: [], evaluation: null}; recorded.tiers.push(tier);
      for (let pair = 1; pair <= profile.pairsPerTier; pair++) {
        const t = await target(setup, true), requests = new Map(), cached = new Set();
        t.cdp.on('Network.requestServedFromCache', event => cached.add(event.requestId));
        t.cdp.on('Network.responseReceived', event => requests.set(event.requestId, {path: new URL(event.response.url).pathname, fromDiskCache: event.response.fromDiskCache === true, fromServiceWorker: event.response.fromServiceWorker === true, encodedDataLength: 0}));
        t.cdp.on('Network.loadingFinished', event => {const response = requests.get(event.requestId); if (response) response.encodedDataLength = event.encodedDataLength;});
        try {
          for (const mode of ['cold', 'warm']) {
            requests.clear(); cached.clear();
            const current = await ready(t.page, quality, mode === 'warm');
            const timing = await t.page.evaluate(() => ({
              navigation: window.performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
              resources: window.performance.getEntriesByType('resource').map(entry => entry.toJSON()),
              canvasCount: document.querySelectorAll('canvas').length
            }));
            const responses = [...requests.entries()].map(([id, response]) => ({...response, fromCache: cached.has(id) || response.fromDiskCache}));
            assert(responses.every(response => !response.fromServiceWorker));
            const assets = responses.filter(response => response.path.startsWith('/assets/'));
            tier.samples.push({mode, pair, requestedQuality: quality, quality: current.quality, actors: current.diagnostics.actors,
              navigationToReadyMs: current.coldNavigationToFirst20Ms, rendererInitToReadyMs: current.starts[0],
              cachedAssets: assets.filter(response => response.fromCache).length,
              networkAssetBytes: assets.filter(response => !response.fromCache).reduce((sum, response) => sum + response.encodedDataLength, 0),
              ...timing, responses, diagnostics: current.diagnostics});
            t.check();
            if (pair === 1 && mode === 'cold') {recorded.gpu ??= await gpu(t.page); await t.page.screenshot({path: output + '/' + setup.name + '-' + quality + '.png'});}
            await save();
          }
          console.log(JSON.stringify({profile: setup.name, quality, pair, samples: tier.samples.length, artifactDirectory: output}));
        } finally {await t.context.close();}
      }
      tier.evaluation = Object.fromEntries(['cold', 'warm'].map(mode => [mode, evaluateLoading(tier.samples.filter(sample => sample.mode === mode), profile.pairsPerTier, budget)]));
      await save();
    }
    const t = await target(setup, false), heap = {baseline: null, samples: [], stopped: null, evaluation: null}; recorded.heap = heap;
    try {
      await ready(t.page, profile.heap.quality);
      for (let cycle = 0; cycle < profile.heap.warmRecreates; cycle++) await t.page.evaluate(quality => window.rendererWorkload.start(quality), profile.heap.quality);
      await t.cdp.send('HeapProfiler.enable');
      heap.baseline = await gcSample(t); await save();
      for (let cycle = 1; cycle <= profile.heap.cycles; cycle++) {
        const stopped = await t.page.evaluate(() => ({facts: window.rendererWorkload.stop(), canvases: document.querySelectorAll('canvas').length}));
        assert.equal(stopped.facts.cache.references, 0); assert.equal(stopped.canvases, 0);
        const active = await t.page.evaluate(quality => window.rendererWorkload.start(quality), profile.heap.quality);
        assert.equal(active.diagnostics.actors, 20); assert.equal(active.cache.references, 20);
        heap.samples.push({cycle, ...await gcSample(t), teardown: {references: stopped.facts.cache.references, canvases: stopped.canvases}});
        t.check(); await save();
      }
      const stopped = await t.page.evaluate(() => ({facts: window.rendererWorkload.stop(), canvases: document.querySelectorAll('canvas').length}));
      assert.equal(stopped.facts.cache.references, 0); assert.equal(stopped.canvases, 0);
      heap.stopped = {...await gcSample(t), references: stopped.facts.cache.references, canvases: stopped.canvases};
      heap.evaluation = evaluateHeap(heap.baseline, heap.samples, profile.heap.cycles, budget);
      t.check(); await save();
    } finally {await t.context.close();}
  }
  assert.deepEqual(await sourceFiles(), facts.sourceFiles, 'Source changed during measurements');
  assert.deepEqual(await workloadBundleFiles(), bundleFiles, 'Bundle changed during measurements');
  facts.result = facts.profiles.every(value => value.tiers.every(tier => Object.values(tier.evaluation).every(evaluation => evaluation.observedLimitMet)) && value.heap.evaluation.observedLimitMet) ? 'OBSERVED_LIMITS_MET_NOT_PHYSICAL_OR_FINAL_ART_QUALIFICATION' : 'OBSERVED_LIMITS_EXCEEDED_NOT_PHYSICAL_OR_FINAL_ART_QUALIFICATION';
  if (facts.result.startsWith('OBSERVED_LIMITS_EXCEEDED')) process.exitCode = 1;
} catch (error) {
  facts.result = 'FUNCTIONAL_FAILURE'; facts.error = error.stack; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(ok => server.close(ok));
  facts.serverRequests = serverRequests; facts.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({result: facts.result, error: facts.error, profiles: facts.profiles.map(value => ({name: value.name, gpu: value.gpu, loading: value.tiers.map(tier => ({quality: tier.quality, evaluation: tier.evaluation})), heap: value.heap?.evaluation})), artifactDirectory: output}));
}
