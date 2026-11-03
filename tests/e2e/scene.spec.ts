import { test, expect, type Page, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { MeSchema } from '@virtual-city/contracts';

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
  await expect(canvas).toHaveAttribute('data-avatar-core', 'starter-v1'); await expect(canvas).toHaveAttribute('data-avatar-outfit', 'cafe-apron');
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
    await expect(page.getByText('New Scene Identity', { exact: true })).toBeVisible();
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
  await page.route('**/assets/avatars/starter-v1.svg', route => route.abort());
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
  await page.route('**/assets/avatars/starter-v1.svg', async route => {
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
