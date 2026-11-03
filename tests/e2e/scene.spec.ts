import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
  await guest(context, 'Scene Visitor'); await enter(page);
  const canvas = page.locator('canvas[data-scene="sdk-sandbox"]'); await expect(canvas).toHaveAttribute('data-entity-count', '1');
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
