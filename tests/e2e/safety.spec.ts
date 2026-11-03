import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io } from 'socket.io-client';
import { MeSchema, RoomAckSchema, SanctionResultSchema, type RoomSnapshot } from '@virtual-city/contracts';

const origin = 'http://127.0.0.1:3300';
test('private decisions and appeal retry survive an interrupted success response on desktop/mobile', async ({ page, context }) => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test database');
  const pool = new Pool({ connectionString: url.toString() });
  const subject = await context.request.post('/v1/session/guest', { headers: { origin }, data: { requestId: randomUUID(), displayName: 'Appeal Visitor', avatarKey: 'mint' } }); expect(subject.status()).toBe(201);
  const me = MeSchema.parse(await subject.json());
  const make = async () => {
    const response = await fetch('http://127.0.0.1:4300/v1/session/guest', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: randomUUID(), displayName: 'Safety Review Fixture', avatarKey: 'mint' }) }); expect(response.status).toBe(201);
    return { me: MeSchema.parse(await response.json()), cookie: response.headers.get('set-cookie')!.split(';')[0] };
  };
  const reporter = await make(), reviewer = await make();
  const write = (user: typeof reporter, path: string, data: unknown) => fetch('http://127.0.0.1:4300/v1/' + path, { method: 'POST', headers: { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID(), 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const upgrade = await write(reviewer, 'session/upgrade', { loginName: 'reviewer' + randomUUID().replaceAll('-', '').slice(0, 12), password: 'synthetic-e2e-only-passphrase' }); expect(upgrade.status).toBe(200);
  reviewer.me = MeSchema.parse(await upgrade.json()); reviewer.cookie = upgrade.headers.get('set-cookie')!.split(';')[0];
  const cookies = await context.cookies(origin); const targetCookie = cookies.map(value => value.name + '=' + value.value).join('; ');
  const sockets = [reporter, { me, cookie: targetCookie }].map((user, index) => io('http://127.0.0.1:4300', { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], transportOptions: { websocket: { localAddress: '127.33.0.' + (index + 1) } }, extraHeaders: { origin, cookie: user.cookie }, auth: { schemaVersion: 1, csrfToken: user.me.csrfToken } }));
  const states: RoomSnapshot[] = [];
  try {
    for (const user of [reporter, { me, cookie: targetCookie }]) {
      const response = await fetch('http://127.0.0.1:4300/v1/me/privacy', { method: 'PATCH', headers: { origin, cookie: user.cookie, 'x-csrf-token': user.me.csrfToken, 'idempotency-key': randomUUID(), 'content-type': 'application/json' }, body: JSON.stringify({ presence: 'public', analyticsConsent: false, worldVisibility: { dating: 'hidden' } }) }); expect(response.status).toBe(200);
    }
    for (const socket of sockets) {
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
      const ack = RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join', { schemaVersion: 1, requestId: randomUUID(), worldSlug: 'sdk-sandbox', worldVersion: '1.0.0', sceneVersion: '1.0.0' })); if (!ack.ok || ack.result.type !== 'snapshot') throw new Error('Fixture admission failed'); states.push(ack.result);
    }
    const report = await write(reporter, 'reports', { schemaVersion: 1, category: 'harassment', note: 'Confidential browser reporter note', source: { kind: 'room', epoch: states[0].epoch, roomId: states[0].roomId, membershipId: states[0].membershipId, targetId: me.profile.id } }); expect(report.status).toBe(201);
    const receipt = await report.json() as { receiptId: string }; const caseId = (await pool.query('SELECT id FROM safety_cases WHERE receipt_id=$1', [receipt.receiptId])).rows[0].id;
    // Trusted test-only provisioning; actual sanction is issued through authenticated HTTP.
    await pool.query('INSERT INTO safety_staff_grants VALUES($1,$2,$3,$4)', [reviewer.me.profile.id, 'sdk-sandbox', 'safety-admin', new Date(Date.now() + 3600000)]);
    expect((await write(reviewer, `moderation/cases/${caseId}/assignment`, { assigneeId: reviewer.me.profile.id, reason: 'triage' })).status).toBe(200);
    const issued = await write(reviewer, `moderation/cases/${caseId}/sanctions`, { kind: 'mute', durationMinutes: 10, privateReason: 'Private reason after a human fixture review.' }); expect(issued.status).toBe(200); const sanction = SanctionResultSchema.parse(await issued.json()).sanction;
    await page.goto('/safety'); await expect(page.getByRole('heading', { name: 'Chat restriction', exact: true })).toBeVisible();
    await page.getByLabel('Your appeal', { exact: true }).fill('Please review this restriction independently.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/safety-draft-${test.info().project.name}.png`, fullPage: true });
    let firstReceipt: unknown, interrupted = false;
    await page.route('**/v1/me/sanctions/*/appeal', async route => {
      if (interrupted) { await route.continue(); return; } interrupted = true;
      const accepted = await route.fetch(); expect(accepted.status()).toBe(201); firstReceipt = await accepted.json(); await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Send private appeal' }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Your appeal was not confirmed. Retry the unchanged appeal.'); await expect(page.getByLabel('Your appeal')).toHaveValue('Please review this restriction independently.');
    await page.getByRole('button', { name: 'Send private appeal' }).click(); await expect(page.getByRole('status')).toContainText('Appeal received. Receipt:');
    expect((await pool.query('SELECT count(*)::int AS count FROM safety_appeals WHERE sanction_id=$1', [sanction.id])).rows[0].count).toBe(1);
    const own = await (await context.request.get('/v1/me/sanctions')).json(); expect(own.appeals[0].receiptId).toBe((firstReceipt as { receiptId: string }).receiptId);
    await page.reload(); await expect(page.getByText(/Appeal received. Receipt:/)).toBeVisible(); await expect(page.getByLabel('Your appeal')).toHaveCount(0);
    for (const privateText of [reporter.me.profile.id, reviewer.me.profile.id, 'Confidential browser reporter note', 'Private reason after a human fixture review.']) expect(await page.locator('body').innerText()).not.toContain(privateText);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/safety-${test.info().project.name}.png`, fullPage: true }); await page.screenshot({ path: `artifacts/safety-viewport-${test.info().project.name}.png` });
  } finally {
    // Explicit leave avoids contaminating subsequent scene occupancy through reconnect grace.
    for (const [index, socket] of sockets.entries()) {
      const state = states[index];
      if (socket.connected && state) await socket.timeout(5000).emitWithAck('room.leave', { schemaVersion: 1, requestId: randomUUID(), epoch: state.epoch, roomId: state.roomId, membershipId: state.membershipId });
      socket.close();
    }
    await pool.end();
  }
});
