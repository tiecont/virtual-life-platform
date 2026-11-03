import { test, expect, type WebSocketRoute } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3300';
test('synthetic Deadline to Maid to Portal keeps identity through lost commit ACK, reconnect and concurrent source tab', async ({ page, context }) => {
  let dropped = false, dropNext = false, connections = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const transports: WebSocketRoute[] = [];
  await page.routeWebSocket('**/socket.io/**', async route => {
    connections++; if (dropped) await gate;
    transports.push(route); const server = route.connectToServer();
    server.onMessage(async message => {
      const text = String(message);
      // Drop a real server COMMITTED ACK, never fabricate a room or receipt.
      if (dropNext && !dropped && text.startsWith('43') && text.includes('"phase":"COMMITTED"')) { dropped = true; await route.close({ code: 1012, reason: 'Synthetic lost commit acknowledgement' }); await server.close(); return; }
      route.send(message);
    });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const created = await context.request.post('/v1/session/guest', { headers: { origin }, data: { requestId: randomUUID(), displayName: 'Travelling Visitor', avatarKey: 'mint' } }); expect(created.status()).toBe(201); const me = await created.json();
    await page.goto('/travel'); await expect(page.getByRole('status')).toHaveText('Lobby confirmed.');
    const identity = page.locator('.travel-identity'), location = page.locator('.travel-location'); await expect(identity).toHaveAttribute('data-account-id', me.profile.id);
    await page.getByLabel('Destination', { exact: true }).selectOption('travel-deadline-fixture'); await page.getByRole('button', { name: 'Confirm travel', exact: true }).click(); await expect(location).toHaveAttribute('data-world', 'travel-deadline-fixture'); await expect(page.getByRole('status')).toHaveText('Visit confirmed.');
    const first = await location.getAttribute('data-membership-id');
    const other = await context.newPage(); await other.goto('/travel'); await expect(other.getByRole('status')).toHaveText('Visit confirmed.'); await expect(other.locator('.travel-location')).toHaveAttribute('data-membership-id', first!);
    let lostCreateResponse = false, createdIntentId = '';
    await page.route('**/v1/travel-intents', async route => {
      if (!lostCreateResponse && route.request().method() === 'POST') { const committed = await route.fetch(); expect(committed.status()).toBe(201); createdIntentId = (await committed.json()).intentId; lostCreateResponse = true; await route.abort('failed'); } else await route.continue();
    });
    dropNext = true; await page.getByLabel('Destination', { exact: true }).selectOption('travel-maid-fixture'); await page.getByRole('button', { name: 'Confirm travel', exact: true }).click();
    await expect.poll(() => lostCreateResponse).toBe(true); await expect(page.getByRole('status')).toHaveText('Visit confirmed.'); await expect(location).toHaveAttribute('data-world', 'travel-deadline-fixture');
    const retry = page.getByRole('button', { name: 'Retry last travel', exact: true }); await expect(retry).toBeEnabled(); await retry.click();
    await expect.poll(() => dropped).toBe(true); await expect(page.getByRole('status')).toHaveText('Your place is unconfirmed.'); await expect(location).toHaveText('No confirmed place'); await expect(page.getByRole('button', { name: 'Confirm travel', exact: true })).toBeDisabled();
    await expect(other.getByRole('status')).toHaveText('Your place is unconfirmed.');
    const current = await (await context.request.get('/v1/me/room')).json(); expect(current.snapshot.worldSlug).toBe('travel-maid-fixture'); expect(current.snapshot.self.accountId).toBe(me.profile.id); expect(current.snapshot.occupancy).toBe(1); expect(current.snapshot.membershipId).not.toBe(first);
    await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: `artifacts/travel-unconfirmed-${test.info().project.name}.png`, fullPage: true });
    release(); await expect(page.getByRole('status')).toHaveText('Visit confirmed.', { timeout: 10000 }); await expect(location).toHaveAttribute('data-world', 'travel-maid-fixture'); await expect(page.getByText('Travel recovered. Your destination is confirmed.', { exact: true })).toBeVisible(); await expect(identity).toHaveAttribute('data-account-id', me.profile.id);
    expect((await (await context.request.get('/v1/travel-intents/' + createdIntentId)).json()).phase).toBe('COMMITTED');
    await other.getByRole('button', { name: 'Refresh your visit', exact: true }).click(); await expect(other.locator('.travel-location')).toHaveAttribute('data-membership-id', current.snapshot.membershipId);
    await page.getByLabel('Destination', { exact: true }).selectOption('travel-portal-fixture'); const confirm = page.getByRole('button', { name: 'Confirm travel', exact: true }); await expect(confirm).toBeEnabled(); await confirm.focus(); await page.keyboard.press('Enter');
    await expect(location).toHaveAttribute('data-world', 'travel-portal-fixture'); await expect(page.getByRole('status')).toHaveText('Visit confirmed.'); await expect(identity).toHaveAttribute('data-account-id', me.profile.id);
    const rooms = await Promise.all(['travel-deadline-fixture', 'travel-maid-fixture', 'travel-portal-fixture'].map(async slug => (await (await context.request.get('/v1/worlds/' + slug + '/rooms')).json()).rooms));
    expect(rooms.flat().reduce((sum, room) => sum + room.occupancy, 0)).toBe(1);
    expect(await page.getByLabel('Destination', { exact: true }).locator('option').allTextContents()).not.toContain('dating'); expect(page.url()).toBe(origin + '/travel'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/travel-portal-${test.info().project.name}.png`, fullPage: true });
    await writeFile(`artifacts/travel-recovery-${test.info().project.name}.json`, JSON.stringify({ syntheticTargetsOnly: true, actualConnections: connections, commitAckDropped: dropped, totalActiveOccupancy: 1, accountUnchanged: true, finalWorld: 'travel-portal-fixture' }, null, 2));
    await page.getByRole('button', { name: 'Return to lobby', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Lobby confirmed.'); await other.close();
    expect((await context.request.post('/v1/session/logout', { headers: { origin, 'x-csrf-token': me.csrfToken, 'idempotency-key': randomUUID() }, data: {} })).status()).toBe(200); await expect(page.getByRole('link', { name: 'Open identity', exact: true })).toBeVisible(); await expect(identity).toHaveCount(0);
    expect(errors).toEqual([]); expect(connections).toBeGreaterThanOrEqual(2);
  } finally { release(); for (const transport of transports) await transport.close().catch(() => {}); }
});
