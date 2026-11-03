import { test, expect, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:3300';
test('recipient consent, live invitation retry and block privacy work on desktop/mobile without teleporting', async ({ page, context, browser }, info) => {
  const profile = info.project.name === 'mobile' ? devices['iPhone 13'] : devices['Desktop Chrome'];
  const peer = await browser.newContext({ ...profile, baseURL: origin });
  const offline = await browser.newContext({ ...profile, baseURL: origin });
  try {
    const users = [];
    for (const [client, displayName] of [[context, 'Invite Alice'], [peer, 'Invite Bob']] as const) {
      const response = await client.request.post('/v1/session/guest', { headers: { origin }, data: { requestId: randomUUID(), displayName, avatarKey: 'mint' } }); expect(response.status()).toBe(201); users.push(await response.json());
    }
    const a = users[0], b = users[1];
    const roomsBefore = (await (await context.request.get('/v1/worlds/sdk-sandbox/rooms')).json()).rooms;
    const code = (await (await peer.request.get('/v1/social/me')).json()).contactCode;
    const friendship = await context.request.post('/v1/friends/requests', { headers: { origin, 'x-csrf-token': a.csrfToken, 'idempotency-key': randomUUID() }, data: { contactCode: code } }); expect(friendship.status()).toBe(200);
    expect((await peer.request.post('/v1/friends/requests/' + (await friendship.json()).id + '/respond', { headers: { origin, 'x-csrf-token': b.csrfToken, 'idempotency-key': randomUUID() }, data: { action: 'accept' } })).status()).toBe(200);
    const other = await peer.newPage(); await page.goto('/invitations'); await other.goto('/invitations');
    await expect(page.getByText('Live updates connected.', { exact: true })).toBeVisible(); await expect(other.getByText('Live updates connected.', { exact: true })).toBeVisible();
    const consent = other.getByLabel('Allow invitations from friends'); await expect(consent).not.toBeChecked();
    await page.getByLabel('Friend', { exact: true }).selectOption(b.profile.id); await page.getByLabel('Destination', { exact: true }).selectOption('sdk-sandbox');
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('This invitation is unavailable.');
    await consent.check(); await expect(other.getByRole('status')).toHaveText('Invitation settings saved.'); await other.reload(); await expect(consent).toBeChecked();
    await expect(other.getByText('Live updates connected.', { exact: true })).toBeVisible();
    let dropped = false;
    await page.route('**/v1/invitations', async route => { if (!dropped && route.request().method() === 'POST') { dropped = true; const committed = await route.fetch(); expect(committed.status()).toBe(201); await route.abort('failed'); } else await route.continue(); });
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click(); await expect(page.getByRole('status')).toContainText('could not be confirmed');
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Invitation sent.');
    await expect(other.getByRole('heading', { name: 'From Invite Alice', exact: true })).toHaveCount(1);
    await other.screenshot({ path: `artifacts/invitations-pending-${info.project.name}.png`, fullPage: true });
    const accept = other.getByRole('button', { name: 'Accept invitation', exact: true }); await expect(accept).toBeEnabled(); await accept.focus(); await other.keyboard.press('Enter');
    await expect(other.getByRole('status')).toHaveText('Invitation accepted. Your room has not changed.');
    await expect(page.locator('.invitation-row').filter({ hasText: 'ACCEPTED' })).toHaveCount(1);
    await other.screenshot({ path: `artifacts/invitations-accepted-${info.project.name}.png`, fullPage: true });
    const data = await (await context.request.get('/v1/invitations')).json(); expect(data.items).toHaveLength(1); expect(data.items[0].state).toBe('ACCEPTED');
    expect((await context.request.get('/v1/worlds/sdk-sandbox/rooms')).status()).toBe(200);
    const rooms = await (await context.request.get('/v1/worlds/sdk-sandbox/rooms')).json(); expect(rooms.rooms).toEqual(roomsBefore);
    expect((await (await context.request.get('/v1/me/room')).json()).snapshot).toBeNull(); expect((await (await peer.request.get('/v1/me/room')).json()).snapshot).toBeNull();
    const offlineCreated = await offline.request.post('/v1/session/guest', { headers: { origin }, data: { requestId: randomUUID(), displayName: 'Invite Charlie', avatarKey: 'mint' } }); expect(offlineCreated.status()).toBe(201); const c = await offlineCreated.json();
    const offlineCode = (await (await offline.request.get('/v1/social/me')).json()).contactCode;
    const offlineFriendship = await context.request.post('/v1/friends/requests', { headers: { origin, 'x-csrf-token': a.csrfToken, 'idempotency-key': randomUUID() }, data: { contactCode: offlineCode } }); expect(offlineFriendship.status()).toBe(200);
    expect((await offline.request.post('/v1/friends/requests/' + (await offlineFriendship.json()).id + '/respond', { headers: { origin, 'x-csrf-token': c.csrfToken, 'idempotency-key': randomUUID() }, data: { action: 'accept' } })).status()).toBe(200);
    const groupPanel = page.getByRole('region', { name: 'Invite a group', exact: true }); await expect(groupPanel.getByRole('checkbox', { name: 'Invite Charlie', exact: true })).toBeVisible();
    await groupPanel.getByRole('checkbox', { name: 'Invite Bob', exact: true }).check(); await groupPanel.getByRole('checkbox', { name: 'Invite Charlie', exact: true }).check(); await groupPanel.getByLabel('Group destination', { exact: true }).selectOption('sdk-sandbox');
    await groupPanel.getByRole('button', { name: 'Send group invitations', exact: true }).click(); await expect(groupPanel.getByText('Group invitations processed. Each friend responds separately.', { exact: true })).toBeVisible(); await expect(groupPanel.getByText('0 accepted · 1 pending · 1 closed or unavailable', { exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/invitation-group-pending-${info.project.name}.png`, fullPage: true });
    await expect(other.getByRole('button', { name: 'Accept invitation', exact: true })).toBeEnabled(); await other.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await expect(groupPanel.getByText('1 accepted · 0 pending · 1 closed or unavailable', { exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/invitation-group-partial-${info.project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Invitation sent.');
    await expect(other.getByRole('button', { name: 'Decline invitation', exact: true })).toBeVisible(); await other.getByRole('button', { name: 'Decline invitation', exact: true }).click(); await expect(other.getByRole('status')).toHaveText('Invitation declined.');
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Invitation sent.');
    await page.getByRole('button', { name: 'Cancel invitation', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Invitation cancelled.');
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Invitation sent.');
    expect((await peer.request.post('/v1/blocks', { headers: { origin, 'x-csrf-token': b.csrfToken, 'idempotency-key': randomUUID() }, data: { targetId: a.profile.id, blocked: true } })).status()).toBe(200);
    await expect(page.locator('.invitation-row')).toHaveCount(0); await expect(other.locator('.invitation-row')).toHaveCount(0); await expect(other.getByRole('heading', { name: 'From Invite Alice' })).toHaveCount(0);
    for (const current of [page, other]) {
      expect(await current.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const targets = await current.locator('button, select, input[type=checkbox]').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { tag: node.tagName, width: rect.width, height: rect.height }; })); expect(targets.filter(target => target.tag !== 'INPUT').every(target => target.height >= 44)).toBe(true);
    }
    await other.screenshot({ path: `artifacts/invitations-${info.project.name}.png`, fullPage: true });
    expect(dropped).toBe(true);
  } finally { await peer.close(); await offline.close(); }
});
