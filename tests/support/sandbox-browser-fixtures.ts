import {expect,type Page,type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import {MeSchema} from '@virtual-city/contracts';
const origin='http://127.0.0.1:3300';
let bootstrapSerial = 1;
export async function guest(context: BrowserContext, displayName: string) {
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
export async function enter(page: Page) {
  await page.goto('/worlds/sdk-sandbox'); await page.getByRole('button', { name: 'Enter cafe', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
}
