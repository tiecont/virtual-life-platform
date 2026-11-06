import {test, expect, type Page, type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {MeSchema, CURRENT_CLIENT_COMPATIBILITY} from '@virtual-city/contracts';
import legacy from '../fixtures/client-legacy-wire.json';

const origin = 'http://127.0.0.1:3300';
async function guest(context: BrowserContext) {
  const response = await context.request.post('/v1/session/guest', {headers: {origin}, data: {requestId: randomUUID(), displayName: 'Compat Visitor', avatarKey: 'mint'}}); expect(response.status()).toBe(201); MeSchema.parse(await response.json());
}
function wire(page: Page) {
  const handshakes: string[][] = [], commands: {name: string; keys: string[]; sequence?: number}[] = [];
  page.on('websocket', socket => socket.on('framesent', frame => {
    if (typeof frame.payload !== 'string') return;
    try {
      if (frame.payload.startsWith('40{')) handshakes.push(Object.keys(JSON.parse(frame.payload.slice(2))).sort());
      if (frame.payload.startsWith('42')) {
        const start = frame.payload.indexOf('['); if (start < 0) return;
        const [name, input] = JSON.parse(frame.payload.slice(start));
        if (['room.join', 'seat.claim', 'seat.release', 'room.leave'].includes(name)) commands.push({name, keys: Object.keys(input).sort(), ...(typeof input.clientSeq === 'number' ? {sequence: input.clientSeq} : {})});
      }
    } catch { /* Unrelated Engine.IO framing is not a command observation. */ }
  }));
  return {handshakes, commands};
}
async function visit(page: Page) {
  await page.goto('/worlds/sdk-sandbox'); await page.getByRole('button', {name: 'Enter cafe', exact: true}).click(); await expect(page.getByRole('status')).toHaveText('Connected');
  await page.getByRole('button', {name: 'Window table 01', exact: true}).click(); await expect(page.getByText('Your seat is confirmed.', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Stand up', exact: true}).click(); await expect(page.getByText('You stood up.', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Leave cafe', exact: true}).click(); await expect(page.getByRole('status')).toHaveText('Ready to enter');
}
test('current web client negotiates before entry, hashes the scene and sends ordered commands', async ({page, context}) => {
  await guest(context); const observed = wire(page); await visit(page);
  expect(observed.handshakes).toHaveLength(1); expect(observed.handshakes[0]).toEqual(['csrfToken', 'protocol', 'schemaVersion']);
  expect(observed.commands.find(command => command.name === 'room.join')?.keys).toContain('sceneIdentity');
  const ordered = observed.commands.filter(command => command.name !== 'room.join'); expect(ordered.map(command => command.name)).toEqual(['seat.claim', 'seat.release', 'room.leave']);
  expect(ordered.every(command => Number.isInteger(command.sequence))).toBe(true); expect(ordered[1].sequence!).toBeGreaterThan(ordered[0].sequence!); expect(ordered[2].sequence!).toBeGreaterThan(ordered[1].sequence!);
});
test('absent-discovery fixture makes the same current web client send the pinned legacy wire shape', async ({page, context}) => {
  await guest(context); await page.route('**/v1/client-compatibility', route => route.fulfill({status: 404, json: {}})); const observed = wire(page); await visit(page);
  expect(observed.handshakes).toEqual([legacy.handshakeKeys]); expect(observed.commands.find(command => command.name === 'room.join')?.keys).toEqual(legacy.joinKeys);
  expect(observed.commands.every(command => command.sequence === undefined && !command.keys.includes('sceneIdentity'))).toBe(true);
});
test('unsupported discovery shows an update action and never opens a gameplay socket', async ({page, context}) => {
  await guest(context); await page.route('**/v1/client-compatibility', route => route.fulfill({status: 200, json: {...CURRENT_CLIENT_COMPATIBILITY, protocolVersions: [2]}})); const observed = wire(page);
  await page.goto('/worlds/sdk-sandbox'); await expect(page.getByText('Update this app before entering the city.', {exact: true})).toBeVisible(); expect(observed.handshakes).toEqual([]); expect(observed.commands).toEqual([]);
});
test('unavailable discovery stays unavailable rather than silently downgrading to legacy', async ({page, context}) => {
  await guest(context); await page.route('**/v1/client-compatibility', route => route.fulfill({status: 503, json: {}})); const observed = wire(page);
  await page.goto('/worlds/sdk-sandbox'); await expect(page.getByText('The city is unavailable. Try again shortly.', {exact: true})).toBeVisible(); expect(observed.handshakes).toEqual([]); expect(observed.commands).toEqual([]);
});
test('keyboard entry keeps its place while compatibility discovery is pending and cannot connect early', async ({page, context}) => {
  await guest(context); let release!: () => void;
  const pending = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/v1/client-compatibility', async route => {await pending; await route.fulfill({status: 200, json: CURRENT_CLIENT_COMPATIBILITY});});
  const observed = wire(page);
  try {
    await page.goto('/worlds/sdk-sandbox');
    await expect(page.getByRole('status')).toHaveText('Checking your session...');
    await page.getByRole('link', {name: 'Skip to room controls', exact: true}).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', {name: 'Your room', exact: true})).toBeFocused(); await page.keyboard.press('Tab');
    const entry = page.getByRole('button', {name: 'Enter cafe', exact: true}); await expect(entry).toBeFocused(); await expect(entry).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter'); expect(observed.handshakes).toEqual([]); expect(observed.commands).toEqual([]);
    release(); await expect(entry).toBeEnabled(); await expect(entry).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Connected'); await expect(page.getByRole('heading', {name: 'Walk around', exact: true})).toBeFocused();
  } finally {release();}
});
