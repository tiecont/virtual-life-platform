import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:3300';
test('two browser contexts consent to friendship, receive live updates and enforce private blocks', async ({ page, context, browser }) => {
  const peer = await browser.newContext({ baseURL: origin });
  try {
    for (const [client, displayName] of [[context,'Circle Alice'],[peer,'Circle Bob']] as const) {
      const created = await client.request.post('/v1/session/guest', { headers: { origin }, data: { requestId: randomUUID(), displayName, avatarKey: 'mint' } }); expect(created.status()).toBe(201);
    }
    const other = await peer.newPage(); await page.goto('/social'); await other.goto('/social');
    await expect(page.getByText('Live updates connected.', { exact: true })).toBeVisible(); await expect(other.getByText('Live updates connected.', { exact: true })).toBeVisible();
    const codeA = await page.getByLabel('Your contact code', { exact: true }).inputValue(); const codeB = await other.getByLabel('Your contact code', { exact: true }).inputValue();
    await page.getByLabel('Contact code from a friend').fill(codeB); await page.getByRole('button', { name: 'Send friend request' }).click(); await expect(page.getByRole('status')).toHaveText('Friend request sent.');
    await expect(page.getByRole('region',{name:'Friends',exact:true}).getByRole('heading',{name:'Circle Bob'})).toHaveCount(0);
    const incoming = other.getByRole('region',{name:'Pending requests'}); await expect(incoming.getByRole('heading',{name:'Circle Alice'})).toBeVisible(); await incoming.getByRole('button',{name:'Accept',exact:true}).click();
    await expect(other.getByRole('status')).toHaveText('Friend request processed.'); const myFriends = page.getByRole('region',{name:'Friends',exact:true}); const theirFriends = other.getByRole('region',{name:'Friends',exact:true});
    await expect(myFriends.getByRole('heading',{name:'Circle Bob'})).toBeVisible(); await expect(theirFriends.getByRole('heading',{name:'Circle Alice'})).toBeVisible();
    const upgradeTab = await context.newPage(); await upgradeTab.goto('/identity');
    await upgradeTab.getByLabel('Choose a sign-in name').fill('circle_'+randomUUID().replaceAll('-','').slice(0,16)); await upgradeTab.getByLabel('New password').fill('circle-upgrade-e2e-only-password');
    await upgradeTab.getByRole('button',{name:'Upgrade identity'}).click(); await expect(upgradeTab.getByRole('status')).toContainText('Identity upgraded');
    await expect(page.getByText('Live updates connected.',{exact:true})).toBeVisible(); await expect(myFriends.getByRole('heading',{name:'Circle Bob'})).toBeVisible();
    expect(await page.getByLabel('Your contact code',{exact:true}).inputValue()).toBe(codeA); await upgradeTab.close();
    await myFriends.getByRole('button',{name:'Block contact'}).click(); await expect(page.getByRole('status')).toContainText('Contact blocked.');
    await expect(theirFriends.getByRole('heading',{name:'Circle Alice'})).toHaveCount(0); const theirsBlocked = other.getByRole('region',{name:'Your block list'}); await expect(theirsBlocked.getByText('No blocked contacts.')).toBeVisible();
    await other.getByLabel('Contact code from a friend').fill(codeA); await other.getByRole('button',{name:'Send friend request'}).click(); await expect(other.getByRole('status')).toContainText('This request is unavailable');
    const mineBlocked = page.getByRole('region',{name:'Your block list'}); await expect(mineBlocked.getByRole('heading',{name:'Circle Bob'})).toBeVisible(); await mineBlocked.getByRole('button',{name:'Unblock contact'}).click(); await expect(page.getByRole('status')).toContainText('Contact unblocked.');
    await expect(myFriends.getByRole('heading',{name:'Circle Bob'})).toHaveCount(0); await expect(theirFriends.getByRole('heading',{name:'Circle Alice'})).toHaveCount(0);
    await other.getByRole('button',{name:'Send friend request'}).click(); await expect(other.getByRole('status')).toHaveText('Friend request sent.');
    const myRequests = page.getByRole('region',{name:'Pending requests'}); await expect(myRequests.getByRole('heading',{name:'Circle Bob'})).toBeVisible(); await myRequests.getByRole('button',{name:'Decline',exact:true}).click(); await expect(page.getByRole('status')).toHaveText('Request closed.');
    await page.getByLabel('Allow new friend requests using my code').uncheck(); await expect(page.getByRole('status')).toHaveText('Request settings saved.'); await other.getByLabel('Contact code from a friend').fill(codeA); await other.getByRole('button',{name:'Send friend request'}).click(); await expect(other.getByRole('status')).toContainText('This request is unavailable');
    await page.reload(); await expect(page.getByLabel('Allow new friend requests using my code')).not.toBeChecked(); expect(await page.getByLabel('Your contact code', {exact:true}).inputValue()).toBe(codeA);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true); await page.screenshot({path:`artifacts/social-${test.info().project.name}.png`,fullPage:true});
  } finally { await peer.close(); }
});
