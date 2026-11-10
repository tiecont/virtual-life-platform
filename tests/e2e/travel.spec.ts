import {evidenceOutput} from '../../scripts/evidence-output.mjs';
import { test, expect, type WebSocketRoute } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {MeSchema} from '@virtual-city/contracts';
import {deadlineWorldVersion} from '@virtual-city/deadline-world';
import {maidWorldVersion} from '@virtual-city/maid-world';
import {libraryWorldVersion} from '@virtual-city/library-world';
import {restaurantWorldVersion} from '@virtual-city/restaurant-world';
const origin = 'http://127.0.0.1:3300';
test('actual City Portal to Deadline,Maid,Library,Restaurant and City retains one identity and voluntary native activity',async({page,context},info)=>{
 test.setTimeout(90000);const created=await context.request.post('/v1/session/guest',{headers:{origin},data:{requestId:randomUUID(),displayName:'Across the city',avatarKey:'amber'}});expect(created.status()).toBe(201);const me=MeSchema.parse(await created.json()),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
 const steps=[{slug:'deadline',version:deadlineWorldVersion,link:'Open Deadline room',entry:'Enter cafe',scene:'deadline',capacity:40,seats:30},{slug:'maid',version:maidWorldVersion,link:'Open Maid room',entry:'Enter cafe',scene:'maid',capacity:30,seats:24},{slug:'library',version:libraryWorldVersion,link:'Open Library room',entry:'Enter library',scene:'library',capacity:8,seats:8},{slug:'restaurant',version:restaurantWorldVersion,link:'Open Restaurant room',entry:'Enter restaurant',scene:'restaurant',capacity:10,seats:8}],observed:object[]=[];
 const own=async()=>{const response=await context.request.get('/v1/me/room');expect(response.status()).toBe(200);return response.json();},dir=evidenceOutput('docs/agent/evidence/m22-actual-city-journey');await mkdir(dir,{recursive:true});await page.goto('/');const card=page.locator('.city-world-list > [data-world-slug="deadline"]');await expect(card).toHaveAttribute('data-availability','available');await page.screenshot({path:`${dir}/${info.project.name}-portal.png`,fullPage:true});await card.getByRole('link',{name:'Open travel confirmation',exact:true}).click();let previous='';
 for(const step of steps){
  if(previous)await page.getByRole('link',{name:'Travel to another world',exact:true}).click();await expect(page.getByRole('status')).toHaveText(previous?'Visit confirmed.':'Lobby confirmed.');if(previous)await expect(page.locator('.travel-location')).toHaveAttribute('data-world',previous);await page.getByLabel('Destination',{exact:true}).selectOption(step.slug);await expect(page.getByLabel('Destination',{exact:true}).locator('option[value="dating"]')).toHaveCount(0);await page.getByRole('button',{name:'Confirm travel',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.travel-location')).toHaveAttribute('data-world',step.slug);await expect(page.locator('.travel-identity')).toHaveAttribute('data-account-id',me.profile.id);await expect(page.locator('.travel-identity')).toContainText('Avatar: amber');const admitted=await own();expect(admitted.worldVersion).toBe(step.version);expect(admitted.snapshot).toMatchObject({worldSlug:step.slug,capacity:step.capacity,occupancy:1,self:{accountId:me.profile.id,seatId:null}});expect(admitted.snapshot.seats).toHaveLength(step.seats);
  await page.getByRole('link',{name:step.link,exact:true}).click();await page.getByRole('button',{name:step.entry,exact:true}).click();await expect(page.getByRole('status')).toHaveText('Connected');await expect(page.locator(`canvas[data-scene="${step.scene}"]`)).toHaveAttribute('data-entity-count','1');const attached=await own();expect(attached.snapshot.membershipId).toBe(admitted.snapshot.membershipId);expect(attached.snapshot.participants.find((p:{profile:{id:string}})=>p.profile.id===me.profile.id).profile.avatarKey).toBe('amber');expect((await(await context.request.get('/v1/staff/state')).json()).shift).toBeNull();await page.locator('.cafe-seats .cafe-seat-grid button').first().focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:/, your seat$/})).toBeVisible();expect((await own()).snapshot.self.seatId).not.toBeNull();
  if(step.slug==='deadline'||step.slug==='library'){await page.getByRole('button',{name:'Start focus',exact:true}).click();await expect(page.getByText('Focus in progress',{exact:true})).toBeVisible();const timer=(await(await context.request.get('/v1/focus')).json()).session;expect(timer.origin.worldSlug).toBe(step.slug);await page.getByRole('button',{name:'Cancel timer',exact:true}).click();await expect(page.getByText('Timer cancelled',{exact:true})).toBeVisible();}
  if(step.slug==='maid'){await page.getByRole('button',{name:'Order Coffee',exact:true}).click();await expect(page.getByText('Order state: PENDING',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Withdraw unfinished service',exact:true}).click();await expect(page.getByText('Order state: CANCELLED',{exact:true})).toBeVisible();}
  if(step.slug==='restaurant')await expect(page.getByRole('region',{name:'Restaurant perspectives',exact:true})).toBeVisible();
  const rooms=await Promise.all(steps.map(async target=>{const response=await context.request.get('/v1/worlds/'+target.slug+'/rooms');expect(response.status()).toBe(200);return(await response.json()).rooms as {occupancy:number}[];}));expect(rooms.flat().reduce((sum,room)=>sum+room.occupancy,0)).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${dir}/${info.project.name}-${step.slug}.png`,fullPage:true});observed.push({world:step.slug,version:step.version,capacity:step.capacity,seats:step.seats,sameIdentityAvatar:true,oneActiveMembership:true,noAutomaticSeatOrShift:true,nativeSeatWorked:true});previous=step.slug;
 }
 await page.getByRole('link',{name:'Travel to another world',exact:true}).click();await expect(page.locator('.travel-location')).toHaveAttribute('data-world','restaurant');await page.getByRole('button',{name:'Return to lobby',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Lobby confirmed.');expect((await own()).snapshot).toBeNull();await page.goto('/');await expect(page.getByRole('heading',{name:/A city begins/})).toBeVisible();expect((await(await context.request.get('/v1/me')).json()).profile).toMatchObject({id:me.profile.id,avatarKey:'amber'});await page.screenshot({path:`${dir}/${info.project.name}-city.png`,fullPage:true});expect(errors).toEqual([]);await writeFile(`${dir}/${info.project.name}.json`,JSON.stringify({actualWorlds:observed,confirmedCityReturn:true,finalOwnVisitNull:true,datingNotOffered:true,noPageErrors:true,activities:'Deadline/Library start-cancel,Maid place-withdraw,Restaurant native entry/seating/perspectives;completed service/booking loops are separate module evidence',syntheticTargetsUsed:false},null,2));
});
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
