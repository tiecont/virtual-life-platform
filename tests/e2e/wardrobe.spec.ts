import {evidenceOutput} from '../../scripts/evidence-output.mjs';
import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
const origin='http://127.0.0.1:3300';
test('private wardrobe previews locked styles, equips with a durable retry and reconciles revocation and logout',async({page,context})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const response=await context.request.post('/v1/session/guest',{headers:{origin},data:{requestId:randomUUID(),displayName:'Wardrobe Visitor',avatarKey:'fern'}});expect(response.status()).toBe(201);const me=await response.json();
 const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Refusing non-local/non-test DB');const db=new Pool({connectionString:url.toString()});
 try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/worlds/sdk-sandbox');const toggle=page.getByText('Your wardrobe',{exact:true});await toggle.focus();await page.keyboard.press('Enter');
  const wardrobe=page.getByRole('region',{name:'Private wardrobe'});await expect(wardrobe.getByText('Your private wardrobe is up to date.',{exact:true})).toBeVisible();
  const apron=wardrobe.getByRole('radio',{name:/Cafe apron/});await apron.focus();await page.keyboard.press('Space');await expect(wardrobe.getByRole('img',{name:'Cafe apron preview'})).toBeVisible();await expect(wardrobe.getByText('Locked · 10 lifetime XP',{exact:true})).toBeVisible();await expect(wardrobe.getByRole('button',{name:'Equip Cafe apron',exact:true})).toBeDisabled();
  await expect(wardrobe.getByText('New progression rewards are currently disabled. Owned styles remain subject to world rules.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Enter cafe',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Connected');await expect(wardrobe.getByRole('button',{name:'Equip Cafe apron',exact:true})).toBeDisabled();
  // Trusted test fixture exercises outfit gates; this does not mint or certify earned rewards.
  await db.query("INSERT INTO engine_progression_entitlements VALUES($1,'cafe-apron',now())",[me.profile.id]);await wardrobe.getByRole('button',{name:'Refresh wardrobe',exact:true}).click();await expect(wardrobe.getByRole('button',{name:'Equip Cafe apron',exact:true})).toBeEnabled();
  const keys:string[]=[];let lost=false;
  await page.route('**/v1/me/appearance',async route=>{keys.push(route.request().headers()['idempotency-key']);if(!lost){const committed=await route.fetch();expect(committed.status()).toBe(200);lost=true;await route.abort('failed');}else await route.continue();});
  await wardrobe.getByRole('button',{name:'Equip Cafe apron',exact:true}).focus();await page.keyboard.press('Enter');await expect(wardrobe.getByText('Outfit response interrupted. Retry to confirm the same request.',{exact:true})).toBeVisible();
  await wardrobe.getByRole('button',{name:'Retry outfit request',exact:true}).click();await expect(wardrobe.getByText('Outfit confirmed: Cafe apron.',{exact:true})).toBeVisible();expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect((await db.query('SELECT count(*)::int AS n FROM engine_progression_appearance_mutations WHERE account_id=$1',[me.profile.id])).rows[0].n).toBe(1);
  const canvas=page.locator('canvas[data-scene]');await expect(canvas).toHaveAttribute('data-avatar-outfit','cafe-apron');await expect(wardrobe.getByText('Wearing in this visit: Cafe apron.',{exact:true})).toBeVisible();
  const dir=evidenceOutput('docs/agent/evidence/m13-wardrobe-visual');await mkdir(dir,{recursive:true});await wardrobe.screenshot({path:`${dir}/${test.info().project.name}.png`});await page.screenshot({path:`${dir}/${test.info().project.name}-page.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);const targets=await wardrobe.locator('button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {width:r.width,height:r.height};}));expect(targets.every(r=>r.width>=44&&r.height>=44)).toBe(true);
  await db.query('DELETE FROM engine_progression_entitlements WHERE account_id=$1',[me.profile.id]);await expect(canvas).toHaveAttribute('data-avatar-outfit','casual',{timeout:20000});await wardrobe.getByRole('button',{name:'Refresh wardrobe',exact:true}).click();await expect(wardrobe.getByRole('button',{name:'Equip Cafe apron',exact:true})).toBeDisabled();
  await wardrobe.getByRole('radio',{name:/City casual/}).check();await wardrobe.getByRole('button',{name:'Equip City casual',exact:true}).click();await expect(wardrobe.getByText('Outfit confirmed: City casual.',{exact:true})).toBeVisible();
  expect((await context.request.post('/v1/session/logout',{headers:{origin,'x-csrf-token':me.csrfToken,'idempotency-key':randomUUID()},data:{}})).status()).toBe(200);await page.evaluate(()=>{const bus=new BroadcastChannel('virtual-city-identity');bus.postMessage({changed:true});bus.close();});await expect(wardrobe).toHaveCount(0);expect(errors).toEqual([]);
  await writeFile(`${dir}/${test.info().project.name}.json`,JSON.stringify({lostCommittedResponse:lost,sameRetryKey:keys[0]===keys[1],revokedEntitlementFallback:true,privateInventoryRemovedOnLogout:true,targets,pageErrors:errors},null,2));
 }finally{await db.end();}
});
test('late wardrobe reads cannot repopulate the previous identity after logout',async({page,context})=>{
 const response=await context.request.post('/v1/session/guest',{headers:{origin},data:{requestId:randomUUID(),displayName:'Old Wardrobe',avatarKey:'mint'}});expect(response.status()).toBe(201);const me=await response.json();
 let release!:()=>void,observed!:()=>void;const held=new Promise<void>(resolve=>release=resolve),seen=new Promise<void>(resolve=>observed=resolve);
 await page.route('**/v1/me/cosmetics',async route=>{const actual=await route.fetch();observed();await held;await route.fulfill({response:actual}).catch(()=>{});});
 await page.goto('/worlds/sdk-sandbox');await page.getByText('Your wardrobe',{exact:true}).click();await seen;
 expect((await context.request.post('/v1/session/logout',{headers:{origin,'x-csrf-token':me.csrfToken,'idempotency-key':randomUUID()},data:{}})).status()).toBe(200);await page.evaluate(()=>{const bus=new BroadcastChannel('virtual-city-identity');bus.postMessage({changed:true});bus.close();});await expect(page.getByRole('region',{name:'Private wardrobe'})).toHaveCount(0);
 release();await page.unrouteAll({behavior:'wait'});await expect(page.getByRole('region',{name:'Private wardrobe'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Open identity',exact:true})).toBeVisible();
});
