import { test,expect,type BrowserContext,type Page } from '@playwright/test';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';
const endpoint='/v1/me/legacy/deadline';
async function existingSource(context:BrowserContext){
 const body=JSON.stringify({displayName:'Prior Deadline guest',avatarKey:'mint'});
 const result=await new Promise<{cookie:string;id:string}>((ok,no)=>{const req=request('http://127.0.0.1:4400/api/v1/guests/session',{method:'POST',headers:{origin:'http://127.0.0.1:3300','content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let text='';res.on('data',part=>text+=part);res.on('end',()=>{try{expect(res.statusCode).toBe(201);ok({cookie:res.headers['set-cookie']![0].split(';')[0],id:JSON.parse(text).id});}catch(error){no(error);}});});req.on('error',no);req.end(body);});
 await context.addCookies([{name:'deadline_session',value:result.cookie.slice(17),url:'http://127.0.0.1',httpOnly:true,sameSite:'Lax'}]);return result;
}
async function city(page:Page,context:BrowserContext){await page.goto('/identity');await page.getByLabel('Display name').fill('City identity');await page.getByLabel('Avatar color').selectOption('fern');await page.getByRole('button',{name:'Create guest identity'}).click();await expect(page.getByRole('status')).toContainText('Guest identity created');return (await context.request.get('/v1/me')).json();}
const panel=(page:Page)=>page.getByRole('region',{name:'Existing Deadline guest'});
test('existing HttpOnly guest associates explicitly; upgrade, renewal, withdrawal and city erasure preserve the independent source',async({page,context})=>{
 const source=await existingSource(context),initial=await city(page,context),area=panel(page);
 await expect(area).toContainText('No active association.');await area.getByRole('button',{name:'Associate existing Deadline guest'}).focus();await page.keyboard.press('Enter');await expect(area).toContainText('Association recorded.');
 const view=await (await context.request.get(endpoint)).json();expect(view).toMatchObject({linked:true,revision:1});expect(JSON.stringify(view)).not.toContain(source.id);expect((await (await context.request.get('/v1/me')).json()).profile).toEqual(initial.profile);
 await page.getByLabel('Choose a sign-in name').fill('legacy_'+randomUUID().replaceAll('-','').slice(0,14));await page.getByLabel('New password').fill('synthetic-offline-deadline-passphrase');await page.getByRole('button',{name:'Upgrade identity'}).click();await expect(page.getByRole('status')).toContainText('Identity upgraded');await expect(area).toContainText('Association recorded.');
 await page.getByRole('button',{name:'Renew session'}).click();await expect(page.getByRole('status')).toContainText('Session renewed');expect((await (await context.request.get('/v1/me')).json()).profile).toEqual(initial.profile);await expect(area).toContainText('Association recorded.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/deadline-identity-${test.info().project.name}.png`,fullPage:true});
 await context.clearCookies({name:'deadline_session'});await area.getByRole('button',{name:'Withdraw Deadline association'}).click();await expect(area).toContainText('Association withdrawn.');expect(await (await context.request.get(endpoint)).json()).toMatchObject({linked:false,revision:2});
 await page.getByLabel('I want to permanently delete').check();await page.getByRole('button',{name:'Delete my identity'}).click();await expect(page.getByRole('status')).toHaveText('City identity deleted.');expect((await context.request.get(endpoint)).status()).toBe(401);expect((await fetch('http://127.0.0.1:4400/api/v1/me',{headers:{cookie:source.cookie}})).status).toBe(200);
});
test('lost committed response retries the same command; independent withdrawal beats a held acknowledgment',async({page,context})=>{
 await existingSource(context);await city(page,context);const area=panel(page),keys:string[]=[];let lose=true,held=false,release:()=>void=()=>{};let committed:()=>void=()=>{};
 const committedReply=new Promise<void>(ok=>committed=ok),released=new Promise<void>(ok=>release=ok);
 await page.route('**'+endpoint,async route=>{if(route.request().method()!=='POST')return route.continue();keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch();expect(response.status()).toBe(200);if(lose){lose=false;return route.abort('failed');}if(held){committed();await released;}return route.fulfill({response});});
 await area.getByRole('button',{name:'Associate existing Deadline guest'}).click();await expect(area.getByRole('button',{name:'Associate existing Deadline guest'})).toBeEnabled();expect(await (await context.request.get(endpoint)).json()).toMatchObject({linked:true,revision:1});
 await area.getByRole('button',{name:'Associate existing Deadline guest'}).click();await expect(area).toContainText('Association recorded.');expect(keys).toHaveLength(2);expect(keys[0]===keys[1]).toBe(true);
 held=true;await area.getByRole('button',{name:'Confirm association again'}).click();await committedReply;
 await area.getByRole('button',{name:'Withdraw Deadline association'}).click();await expect(area).toContainText('Association withdrawn.');release();await expect(area.getByRole('button',{name:'Associate existing Deadline guest'})).toBeEnabled();await expect(area).toContainText('Association withdrawn.');expect(await (await context.request.get(endpoint)).json()).toMatchObject({linked:false,revision:2});
 await page.screenshot({path:`artifacts/deadline-withdrawal-${test.info().project.name}.png`,fullPage:true});
});
test('a held positive response cannot restore the panel after independent city logout',async({page,context})=>{
 await existingSource(context);await city(page,context);const area=panel(page);let release:()=>void=()=>{},committed:()=>void=()=>{};const released=new Promise<void>(ok=>release=ok),done=new Promise<void>(ok=>committed=ok);
 await page.route('**'+endpoint,async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();expect(response.status()).toBe(200);committed();await released;await route.fulfill({response});});
 await expect(area).toContainText('No active association.');await area.getByRole('button',{name:'Associate existing Deadline guest'}).click();await done;await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page.getByRole('status')).toContainText('Logged out');release();await expect(area).toHaveCount(0);await expect(page.getByRole('button',{name:'Create guest identity'})).toBeVisible();expect((await context.request.get(endpoint)).status()).toBe(401);
});
