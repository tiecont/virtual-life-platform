import { test, expect, type Page, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { MeSchema } from '@virtual-city/contracts';
import { isWalkable, sandboxScene } from '@virtual-city/world-sdk';
import performanceBudget from '../../config/scene-performance.json';

const origin = 'http://127.0.0.1:3300';
let bootstrapSerial = 1;
async function guest(context: BrowserContext, displayName: string) {
  // Real HTTP setup with independent loopback sources; do not weaken API guest/IP limits for a larger browser suite.
  const payload = JSON.stringify({ requestId: randomUUID(), displayName, avatarKey: 'mint' });
  const result = await new Promise<{ cookie: string; body: unknown }>((resolve, reject) => {
    const req = request('http://127.0.0.1:4300/v1/session/guest', { method: 'POST', localAddress: '127.22.0.' + bootstrapSerial++, headers: { origin, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => {
        try { expect(res.statusCode).toBe(201); resolve({ cookie: res.headers['set-cookie']![0].split(';')[0], body: JSON.parse(body) }); } catch (error) { reject(error); }
      });
    }); req.on('error', reject); req.end(payload);
  });
  const separator = result.cookie.indexOf('=');
  await context.addCookies([{ name: result.cookie.slice(0, separator), value: result.cookie.slice(separator + 1), url: origin, httpOnly: true, sameSite: 'Lax' }]);
  return MeSchema.parse(result.body);
}
async function visible(context: BrowserContext, csrf: string) {
  const response = await context.request.patch('/v1/me/privacy', { headers: { origin, 'x-csrf-token': csrf, 'idempotency-key': randomUUID() }, data: { presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden' } } });
  expect(response.status()).toBe(200);
}
async function enter(page: Page) {
  await page.goto('/worlds/sdk-sandbox'); await page.getByRole('button', { name: 'Enter cafe', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
}
async function pixels(page: Page) {
  const canvas = page.locator('canvas[data-scene="sdk-sandbox"]'); await expect(canvas).toBeVisible();
  const image = await canvas.screenshot();
  return page.evaluate(async data => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const surface = document.createElement('canvas'); surface.width = img.width; surface.height = img.height;
    const ctx = surface.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const buffer = ctx.getImageData(0, 0, img.width, img.height).data; const colors = new Set<string>();
    for (let i = 0; i < buffer.length; i += 16) colors.add(buffer[i] + ':' + buffer[i + 1] + ':' + buffer[i + 2]);
    return { width: img.width, height: img.height, uniqueColors: colors.size, hasColoredPixels: [...colors].some(c => c !== '0:0:0' && c !== '255:255:255') };
  }, image.toString('base64'));
}

test('actual cafe scene and keyboard seat controls reflect authoritative rooms on desktop/mobile', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const identity = await guest(context, 'Scene Visitor'); await enter(page);
  const canvas = page.locator('canvas[data-scene="sdk-sandbox"]'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
  await expect(canvas).toHaveAttribute('data-avatar-core', 'starter-v1'); await expect(canvas).toHaveAttribute('data-avatar-outfit', 'casual');
  await expect(canvas).toHaveAttribute('data-avatar-palettes', 'mint');
  const changed = await context.request.patch('/v1/me', { headers: { origin, 'x-csrf-token': identity.csrfToken, 'idempotency-key': randomUUID() }, data: { avatarKey: 'indigo' } });
  expect(changed.status()).toBe(200); await expect(canvas).toHaveAttribute('data-avatar-palettes', 'indigo');
  const forged = await context.request.patch('/v1/me', { headers: { origin, 'x-csrf-token': identity.csrfToken, 'idempotency-key': randomUUID() }, data: { avatarKey: 'indigo', outfit: 'staff' } });
  expect(forged.status()).toBe(422);
  const seat = page.getByRole('button', { name: 'Window table 01', exact: true });
  await seat.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Your seat is confirmed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Window table 01, your seat', exact: true })).toBeDisabled();
  await expect(page.getByText('Seated at Window table 01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stand up', exact: true }).click(); await expect(page.getByText('You stood up.', { exact: true })).toBeVisible();
  await expect(seat).toBeEnabled();
  const sample = await pixels(page); expect(sample.width).toBeGreaterThan(250); expect(sample.height).toBeGreaterThan(150); expect(sample.uniqueColors).toBeGreaterThan(25); expect(sample.hasColoredPixels).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: `artifacts/cafe-${test.info().project.name}.png`, fullPage: true });
  await writeFile(`artifacts/cafe-pixels-${test.info().project.name}.json`, JSON.stringify(sample));
  await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Ready to enter');
  await expect(canvas).toHaveAttribute('data-entity-count', '0'); expect(errors).toEqual([]);
});

test('viewer-filtered scene never fabricates peers and a bilateral block clears the visible visitor', async ({ page, context, browser }) => {
  const peer = await browser.newContext({ baseURL: origin });
  try {
    const a = await guest(context, 'Cafe Alice'); const b = await guest(peer, 'Cafe Bob');
    await visible(context, a.csrfToken); await visible(peer, b.csrfToken);
    const other = await peer.newPage(); await enter(page); await enter(other);
    await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '2');
    await expect(other.getByRole('complementary', { name: 'Your room' }).getByText('Cafe Alice', { exact: true })).toBeVisible();
    const response = await context.request.post('/v1/blocks', { headers: { origin, 'x-csrf-token': a.csrfToken, 'idempotency-key': randomUUID() }, data: { targetId: b.profile.id, blocked: true } });
    expect(response.status()).toBe(200);
    await expect(other.getByRole('complementary', { name: 'Your room' }).getByText('Cafe Alice', { exact: true })).toHaveCount(0);
    await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1');
    await expect(other.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1');
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); await other.getByRole('button', { name: 'Leave cafe', exact: true }).click();
  } finally { await peer.close(); }
});

test('private report receipt and block flow works with keyboard focus on desktop/mobile without target disclosure', async ({ page, context, browser }) => {
  test.setTimeout(45000); // Includes the real 15-second room resync while drafting.
  const peer = await browser.newContext({ baseURL: origin });
  try {
    const a = await guest(context, 'Safety Reporter'); const b = await guest(peer, 'Safety Visitor');
    await visible(context, a.csrfToken); await visible(peer, b.csrfToken);
    const other = await peer.newPage(); await enter(page); await enter(other);
    const trigger = page.getByRole('button', { name: 'Report or block Safety Visitor', exact: true }); await expect(trigger).toBeVisible();
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Report or block Safety Visitor', exact: true }); await expect(dialog).toBeVisible();
    await dialog.getByLabel('Reason', { exact: true }).selectOption('harassment'); await dialog.getByLabel('Note (optional)', { exact: true }).fill('Private browser allegation, not a finding.');
    await page.waitForTimeout(15500); await expect(dialog).toBeVisible(); await expect(dialog.getByLabel('Note (optional)', { exact: true })).toHaveValue('Private browser allegation, not a finding.');
    let interrupted = false; let firstReceipt: unknown;
    await page.route('**/v1/reports', async route => {
      if (interrupted) { await route.continue(); return; } interrupted = true;
      const accepted = await route.fetch(); expect(accepted.status()).toBe(201); firstReceipt = await accepted.json(); await route.abort('failed');
    });
    await dialog.getByRole('button', { name: 'Send private report', exact: true }).click();
    await expect(dialog.getByText('Your report was not confirmed. Try again.', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Note (optional)', { exact: true })).toHaveValue('Private browser allegation, not a finding.');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/v1/reports') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Send private report', exact: true }).click(); const response = await responsePromise; expect(response.status()).toBe(201);
    const receipt = await response.json(); expect(receipt).toEqual(firstReceipt); await expect(dialog.getByText(/Report received. Receipt:/)).toBeFocused();
    const exported = await context.request.get('/v1/me/export'); expect((await exported.json()).domains.safety.submittedReports).toEqual([receipt]);
    expect((await peer.request.get('/v1/reports/' + receipt.receiptId)).status()).toBe(404);
    expect(await other.getByText('Private browser allegation, not a finding.', { exact: true }).count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await dialog.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: `artifacts/report-${test.info().project.name}.png`, fullPage: true }); await page.screenshot({ path: `artifacts/report-viewport-${test.info().project.name}.png` });
    await dialog.getByRole('button', { name: 'Block visitor', exact: true }).click(); await expect(dialog.getByText('Blocked. Your contact settings were updated.', { exact: true })).toBeVisible();
    await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1'); await expect(other.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await expect(page.locator('#cafe-action-title')).toBeFocused();
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); await other.getByRole('button', { name: 'Leave cafe', exact: true }).click();
  } finally { await peer.close(); }
});

test('keyed sprites follow real seat deltas, resize and leave without allocating duplicate avatars', async ({ page, context, browser }) => {
  const peer = await browser.newContext({ baseURL: origin });
  try {
    const a = await guest(context, 'Lifecycle Alice'); const b = await guest(peer, 'Lifecycle Bob');
    await visible(context, a.csrfToken); await visible(peer, b.csrfToken);
    await enter(page); const other = await peer.newPage(); await enter(other);
    const canvas = page.locator('canvas[data-scene]');
    await expect(canvas).toHaveAttribute('data-entity-count', '2');
    const created = await canvas.getAttribute('data-created-entities');
    await other.getByRole('button', { name: 'Window table 01', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-sitting-count', '1');
    await expect(canvas).toHaveAttribute('data-created-entities', created!);
    await other.getByRole('button', { name: 'Stand up', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-sitting-count', '0');
    await expect(canvas).toHaveAttribute('data-created-entities', created!);
    await expect(canvas).toHaveAttribute('data-active-animations', '0');
    const frames = await canvas.getAttribute('data-render-count');
    await page.waitForTimeout(350); // An idle scene must not run a frame ticker.
    await expect(canvas).toHaveAttribute('data-render-count', frames!);
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width - 40, height: viewport.height });
    await expect.poll(() => canvas.getAttribute('data-render-count')).not.toBe(frames);
    await expect(canvas).toHaveAttribute('data-created-entities', created!);
    expect((await pixels(page)).uniqueColors).toBeGreaterThan(25);
    await other.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-entity-count', '1');
    await expect(canvas).toHaveAttribute('data-removed-entities', '1');
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-entity-count', '0');
  } finally { await peer.close(); }
});

test('actual transport interruption hides stale seats then reconnects to one retained avatar and seat', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let transport: WebSocketRoute | undefined; let server: WebSocketRoute | undefined;
  let connects = 0; let resume: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  await page.routeWebSocket('**/socket.io/**', async route => {
    connects++;
    if (connects > 1) await gate;
    transport = route; server = route.connectToServer(); // Real backend messages, no fabricated snapshots.
  });
  try {
    await guest(context, 'Recovering Visitor'); await enter(page);
    const canvas = page.locator('canvas[data-scene]');
    await page.getByRole('button', { name: 'Window table 01', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-sitting-count', '1');
    await transport!.close({ code: 1012, reason: 'Test transport interruption' }); await server!.close();
    await expect(page.getByRole('status')).toHaveText('Connection lost. Your place is unconfirmed.');
    await expect(page.getByText('Your seat is confirmed.', { exact: true })).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-entity-count', '0');
    await expect(page.getByRole('button', { name: 'Window table 01', exact: true })).toBeDisabled();
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/cafe-reconnecting-${test.info().project.name}.png`, fullPage: true });
    resume!();
    await expect(page.getByRole('status')).toHaveText('Connected', { timeout: 10000 });
    await expect(canvas).toHaveCount(1); await expect(canvas).toHaveAttribute('data-entity-count', '1');
    await expect(canvas).toHaveAttribute('data-sitting-count', '1');
    await expect(page.getByText('Seated at Window table 01', { exact: true })).toBeVisible();
    await writeFile(`artifacts/cafe-recovery-${test.info().project.name}.json`, JSON.stringify({
      actualConnections: connects, entities: await canvas.getAttribute('data-entity-count'), created: await canvas.getAttribute('data-created-entities'),
      removed: await canvas.getAttribute('data-removed-entities'), sitting: await canvas.getAttribute('data-sitting-count'),
    }, null, 2));
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    expect(errors).toEqual([]);
  } finally { resume!(); }
});

test('identity replacement clears sprites and a remounted scene owns only one canvas', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await guest(context, 'Old Scene Identity'); await enter(page);
  const canvas = page.locator('canvas[data-scene]'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
  const identity = await context.newPage();
  try {
    await identity.goto('/identity'); await identity.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(identity.getByRole('status')).toContainText('Logged out.');
    await expect(canvas).toHaveAttribute('data-entity-count', '0');
    await expect(page.getByRole('link', { name: 'Open identity', exact: true })).toBeVisible();
    await expect(page.getByText('Old Scene Identity', { exact: true })).toHaveCount(0);
    await guest(context, 'New Scene Identity');
    // The real guest HTTP setup changed cookies; trigger the same identity notification as the identity UI.
    await identity.evaluate(() => { const bus = new BroadcastChannel('virtual-city-identity'); bus.postMessage({ type: 'session' }); bus.close(); });
    // The shared header also shows the current identity. Assert the room's own
    // refreshed identity rather than racing two legitimate copies of the name.
    await expect(page.getByRole('complementary',{name:'Your room'}).getByText('New Scene Identity', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enter cafe', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Connected'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
    await page.getByRole('link', { name: 'Identity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    await expect(canvas).toHaveCount(0);
    await enter(page); await expect(canvas).toHaveCount(1); await expect(canvas).toHaveAttribute('data-entity-count', '1');
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); expect(errors).toEqual([]);
  } finally { await identity.close(); }
});

test('asset failure retains real room and keyboard controls without a blank successful scene', async ({ page, context }) => {
  await page.route('**/assets/avatars/**/starter-v1.svg', route => route.abort());
  await guest(context, 'Fallback Visitor'); await enter(page);
  await expect(page.getByText('Scene unavailable. Seat controls remain available.', { exact: true })).toBeVisible();
  await expect(page.locator('canvas[data-scene]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Window table 01', exact: true }).click();
  await expect(page.getByText('Seated at Window table 01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave cafe', exact: true }).click();
});

test('leaving while the actual asset is loading cancels the old scene before remount', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let release: (() => void) | undefined; let requested = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/avatars/**/starter-v1.svg', async route => {
    requested = true; await gate; await route.continue();
  });
  try {
    await guest(context, 'Loading Visitor'); await page.goto('/worlds/sdk-sandbox');
    await expect.poll(() => requested).toBe(true);
    await page.getByRole('link', { name: 'Identity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
    release!();
    await expect(page.locator('canvas[data-scene]')).toHaveCount(0);
    await enter(page);
    await expect(page.locator('canvas[data-scene]')).toHaveCount(1);
    await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1');
    await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); expect(errors).toEqual([]);
  } finally { release!(); }
});

test('original avatar action and outfit previews render distinct pixels and respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/worlds/sdk-sandbox/avatar-lab');
  const crop = page.getByRole('img', { name: 'mint avatar, casual, idle', exact: true });
  await expect(crop).toBeVisible(); await expect.poll(() => crop.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 512)).toBe(true);
  await mkdir('artifacts/avatars', { recursive: true });
  const hashes = new Set<string>();
  for (const outfit of ['casual', 'cafe-apron']) {
    await page.getByLabel('Outfit preview', { exact: true }).selectOption(outfit);
    for (const action of ['Idle', 'Walk', 'Sit', 'Serve']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      if (action === 'Walk') await page.getByRole('button', { name: 'Next pose frame', exact: true }).click();
      const preview = page.getByRole('img', { name: `mint avatar, ${outfit}, ${action.toLowerCase()}`, exact: true });
      const png = await preview.screenshot({ path: `artifacts/avatars/${test.info().project.name}-${outfit}-${action.toLowerCase()}.png` });
      hashes.add(createHash('sha256').update(png).digest('hex'));
    }
  }
  expect(hashes.size).toBe(8);
  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  const preview = page.getByRole('img', { name: 'mint avatar, cafe-apron, serve', exact: true });
  await expect(preview).toHaveAttribute('data-frame', /[1-3]/);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(preview).toHaveAttribute('data-playing', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByLabel('Reduce motion', { exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeDisabled();
  await expect(preview).toHaveAttribute('data-frame', '0');
  await page.getByLabel('Color', { exact: true }).selectOption('rose');
  await expect(page.getByRole('img', { name: 'rose avatar, cafe-apron, serve', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/avatars/lab-${test.info().project.name}.png`, fullPage: true });
  await writeFile(`artifacts/avatars/pixels-${test.info().project.name}.json`, JSON.stringify({ distinctPoseOutfitPngHashes: [...hashes], reducedMotion: true }, null, 2));
});

test('keyboard and canvas destinations follow approved paths around tables and reject solid tiles', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await guest(context, 'Walking Visitor'); await enter(page);
  const canvas = page.locator('canvas[data-scene]'); await expect(canvas).toHaveAttribute('data-self-position', '10.00:11.00');
  await page.getByRole('button', { name: 'Walk to window aisle', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Your walk is confirmed.', { exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-moving-count', '1');
  await expect(canvas).toHaveAttribute('data-moving-count', '0', { timeout: 10000 });
  await expect(canvas).toHaveAttribute('data-self-position', '2.00:4.00');
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width * 3.5 / 20, y: bounds.height * 4.5 / 14 } });
  await expect(page.getByText('That destination or interaction is unavailable. Choose an open floor tile.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Connected');
  await expect(canvas).toHaveAttribute('data-self-position', '2.00:4.00');
  await canvas.click({ position: { x: bounds.width * 6.5 / 20, y: bounds.height * 4.5 / 14 } });
  await expect(canvas).toHaveAttribute('data-moving-count', '1');
  const samples = await canvas.evaluate(element => new Promise<string[]>((resolve, reject) => {
    const samples: string[] = []; const started = performance.now();
    const timer = setInterval(() => {
      samples.push((element as HTMLElement).dataset.selfPosition ?? '');
      if ((element as HTMLElement).dataset.movingCount === '0') { clearInterval(timer); resolve(samples); }
      else if (performance.now() - started > 8000) { clearInterval(timer); reject(new Error('Approved movement did not complete')); }
    }, 30);
  }));
  expect(new Set(samples).size).toBeGreaterThan(4);
  expect(samples.every(sample => { const [x, y] = sample.split(':').map(Number); return isWalkable(sandboxScene, { x: Math.round(x), y: Math.round(y) }); })).toBe(true);
  await expect(canvas).toHaveAttribute('data-self-position', '6.00:4.00');
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/cafe-movement-${test.info().project.name}.json`, JSON.stringify({ samples, final: await canvas.getAttribute('data-self-position'), crossedSolidTile: false }, null, 2));
  await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); expect(errors).toEqual([]);
});

test('room keyboard focus, reduced motion, readable text contrast and mobile targets remain usable', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await guest(context, 'Accessible Visitor');
  await page.goto('/worlds/sdk-sandbox');
  await expect(page.getByRole('button', { name: 'Enter cafe', exact: true })).toBeEnabled();
  const skip = page.getByRole('link', { name: 'Skip to room controls', exact: true }); await skip.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Your room', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Enter cafe', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { name: 'Walk around', exact: true })).toBeFocused();
  const canvas = page.locator('canvas[data-scene]'); await expect(canvas).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.getByLabel('Reduce room motion', { exact: true })).toBeChecked();
  await expect(page.locator('button[title="select to enable accessibility for this content"]')).toBeHidden();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Walk to entrance', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Walk to window aisle', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Your walk is confirmed.', { exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-active-animations', '0');
  const frames = await canvas.getAttribute('data-render-count'); await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-render-count', frames!);
  await page.getByLabel('Reduce room motion', { exact: true }).uncheck(); await expect(canvas).toHaveAttribute('data-reduced-motion', 'false');
  await page.getByLabel('Reduce room motion', { exact: true }).check();
  const contrast = await page.evaluate(() => {
    const luminance = (rgb: number[]) => rgb.map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    return [...document.querySelectorAll('.cafe-note,.cafe-scene-caption,.cafe-eyebrow,.cafe-occupancy,.cafe-seat-grid small,.cafe-present small')].filter(element => !element.closest('button:disabled')).map(element => {
      let parent: Element | null = element; let background = 'rgb(248, 250, 249)';
      while (parent) { const color = getComputedStyle(parent).backgroundColor; if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break; } parent = parent.parentElement; }
      const foreground = getComputedStyle(element).color; const a = luminance(rgb(foreground)), b = luminance(rgb(background));
      return { selector: element.className || element.tagName, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  expect(contrast.length).toBeGreaterThan(8); expect(contrast.every(row => row.ratio >= 4.5)).toBe(true);
  const targets = await page.getByRole('button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect(); const style = getComputedStyle(button);
    return { label: button.textContent, width: rect.width, height: rect.height, minHeight: style.minHeight, transform: style.transform };
  }));
  await mkdir('artifacts', { recursive: true }); await writeFile(`artifacts/cafe-targets-${test.info().project.name}.json`, JSON.stringify(targets, null, 2));
  for (const target of targets) { expect(target.height, target.label ?? '').toBeGreaterThanOrEqual(44); expect(target.width, target.label ?? '').toBeGreaterThanOrEqual(44); }
  await page.getByRole('link', { name: 'Back to visit controls', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Leave cafe', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('button', { name: 'Enter cafe', exact: true })).toBeFocused();
  await expect(page.getByLabel('Room occupancy unconfirmed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir('artifacts', { recursive: true }); await writeFile(`artifacts/cafe-a11y-${test.info().project.name}.json`, JSON.stringify({ contrast, keyboardEntryAndLeave: true, explicitAndSystemReducedMotion: true, minButtonTargetPx: 44 }, null, 2));
});

test('scene loading, immutable cache, idle work and repeated scene lifetime fit the local performance profile', async ({ page, context }) => {
  test.setTimeout(60000); // Dedicated CPU4x/network/remount profile, not an assertion retry.
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
  await mkdir('artifacts', { recursive: true }); await writeFile(`artifacts/cafe-performance-cold-${test.info().project.name}.json`, JSON.stringify({ ...cold, profile: performanceBudget.profile, jsDecoded, jsEncoded, cacheControl }, null, 2));
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
    await enter(second); await expect(second.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count', '1');
    const warmAsset = await second.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find(entry => new URL(entry.name).pathname.endsWith('/starter-v1.svg'))?.toJSON());
    expect(warmAsset).toBeDefined(); expect(warmAsset!.transferSize).toBe(0);
    await second.getByRole('button', { name: 'Leave cafe', exact: true }).click();
    await mkdir('artifacts', { recursive: true });
    await writeFile(`artifacts/cafe-performance-${test.info().project.name}.json`, JSON.stringify({ profile: performanceBudget.profile, readyMs: cold.readyMs, jsDecodedBytes: jsDecoded, jsEncodedBytes: jsEncoded, coldAvatar: avatar, cacheControl, warmAssetTransferBytes: warmAsset!.transferSize, idleWindowMs: performanceBudget.idleWindowMs, idleRenders, rafSamples: sortedGaps.length, rafP95GapMs, remountCycles: performanceBudget.remountCycles, warmHeapBytes, afterHeapBytes, heapGrowthBytes, atlasSourcePixelBytes: 512 * 768 * 4, resources: cold.resources, limits: 'Short local emulated Chromium profile; rAF cadence is not GPU throughput; forced-GC JS heap is not total browser/GPU memory or leak certification.' }, null, 2));
  } finally { await second.close(); }
});
