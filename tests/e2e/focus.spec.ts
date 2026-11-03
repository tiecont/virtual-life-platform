import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
const origin = 'http://127.0.0.1:3300';
test('private focus recovers a lost start response and sleep,requires explicit sanitized sharing and clears on logout', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const created = await context.request.post('/v1/session/guest', { headers: { origin }, data: { requestId: randomUUID(), displayName: 'Focus Visitor', avatarKey: 'mint' } }); expect(created.status()).toBe(201); const me = await created.json();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/worlds/sdk-sandbox');
  const focus = page.getByRole('region', { name: 'Private focus timer' }); await expect(focus.getByText('No active timer', { exact: true })).toBeVisible(); await expect(focus.getByRole('button', { name: 'Start focus', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Enter cafe', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Connected'); await page.getByRole('button', { name: 'Window table 01', exact: true }).click();
  await expect(focus.getByRole('button', { name: 'Start focus', exact: true })).toBeEnabled(); expect(await focus.getByRole('button', { name: 'Pause timer', exact: true }).count()).toBe(0);
  let aborted = false, originalKey = '', timerId = ''; const keys: string[] = [];
  await page.route('**/v1/focus', async route => {
    if (route.request().method() === 'POST') { keys.push(route.request().headers()['idempotency-key']); if (!aborted) { const response = await route.fetch(); expect(response.status()).toBe(201); timerId = (await response.json()).session.id; originalKey = keys[0]; aborted = true; await route.abort('failed'); return; } }
    await route.continue();
  });
  const start = focus.getByRole('button', { name: 'Start focus', exact: true }); await start.focus(); await page.keyboard.press('Enter');
  await expect(focus.getByText('Timer response was interrupted. Retry to confirm the same request.', { exact: true })).toBeVisible(); await expect(focus.getByRole('timer')).toHaveText('--:--');
  expect((await (await context.request.get('/v1/focus/history')).json()).items).toHaveLength(1);
  await focus.getByRole('button', { name: 'Retry timer request', exact: true }).click(); await expect(focus.getByText('Focus in progress', { exact: true })).toBeVisible(); await expect(focus).toHaveAttribute('data-focus-id', timerId); expect(keys).toEqual([originalKey, originalKey]);
  await expect(focus.getByRole('timer')).toHaveAttribute('aria-live', 'off'); await expect(focus.getByRole('checkbox', { name: 'Create a completion summary', exact: true })).toHaveCount(0);
  await page.evaluate(() => { Date.now = () => 9999999999999; }); await page.waitForTimeout(1100); await expect(focus.getByText('Focus in progress', { exact: true })).toBeVisible(); await expect(focus.getByRole('timer')).not.toHaveText('00:00');
  await page.getByRole('button', { name: 'Leave cafe', exact: true }).click(); await page.reload(); await expect(focus.getByText('Focus in progress', { exact: true })).toBeVisible(); await expect(focus).toHaveAttribute('data-focus-id', timerId);
  // Move the trusted persisted test fixture deadline; browser time never authorizes completion.
  const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw new Error('Refusing non-local/non-test DB');
  const db = new Pool({ connectionString: url.toString() }); try { await db.query("UPDATE engine_focus_sessions SET started_at=now()-interval '901 seconds',changed_at=now()-interval '901 seconds',ends_at=now()-interval '1 second' WHERE id=$1 AND account_id=$2 AND phase='active'", [timerId, me.profile.id]); } finally { await db.end(); }
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await expect(focus.getByText('Timer completed', { exact: true })).toBeVisible(); await expect(focus.getByRole('timer')).toHaveText('00:00'); await expect(focus.getByLabel('Completion summary', { exact: true })).toHaveCount(0);
  const sharing = focus.getByRole('checkbox', { name: 'Create a completion summary', exact: true }); await expect(sharing).not.toBeChecked(); await sharing.focus(); await page.keyboard.press('Space');
  await expect(focus.getByLabel('Completion summary', { exact: true })).toHaveText('I completed a 15-minute focus timer.'); const summary = await focus.getByLabel('Completion summary', { exact: true }).textContent(); expect(summary).not.toMatch(/Visitor|sandbox|seat|2026|task|room|http/); expect(summary).not.toContain(me.profile.id); expect(summary).not.toContain(timerId);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await focus.getByRole('button', { name: 'Copy summary', exact: true }).click(); await expect(focus.getByText('Summary copied.', { exact: true })).toBeVisible(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(summary);
  await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: `artifacts/focus-completed-${test.info().project.name}.png`, fullPage: true }); await focus.screenshot({ path: `artifacts/focus-panel-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const targets = await focus.locator('button').evaluateAll(buttons => buttons.map(button => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height }; })); expect(targets.every(rect => rect.width >= 44 && rect.height >= 44)).toBe(true);
  await sharing.uncheck(); await expect(focus.getByLabel('Completion summary', { exact: true })).toHaveCount(0);
  await page.reload(); await expect(focus.getByText('Timer completed', { exact: true })).toBeVisible(); await expect(focus.getByRole('checkbox', { name: 'Create a completion summary', exact: true })).not.toBeChecked();
  expect((await context.request.post('/v1/session/logout', { headers: { origin, 'x-csrf-token': me.csrfToken, 'idempotency-key': randomUUID() }, data: {} })).status()).toBe(200);
  await page.evaluate(() => { const bus = new BroadcastChannel('virtual-city-identity'); bus.postMessage({ changed: true }); bus.close(); }); await expect(focus).toHaveCount(0); expect(errors).toEqual([]);
  await writeFile(`artifacts/focus-recovery-${test.info().project.name}.json`, JSON.stringify({ lostCommittedResponse: aborted, sameRetryKey: keys.length === 2 && keys[0] === keys[1], historyRowsAfterRetry: 1, sleepVisibilityResync: true, privateSharingOptIn: true, noPerSecondAnnouncements: true, targets, pageErrors: errors }, null, 2));
});
