import {test,expect,type BrowserContext,type Page,type WebSocketRoute} from '@playwright/test';
import {request} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {MeSchema} from '@virtual-city/contracts';
const origin='http://127.0.0.1:3300',enhanced=process.env.UX_SHELL_MODE==='scene-first',runId=process.env.UX_EVIDENCE_RUN??randomUUID().slice(0,8);if(!/^[a-f0-9]{8}$/.test(runId))throw Error('Invalid evidence run');let serial=0;
async function guest(context:BrowserContext,name:string){
 const body=JSON.stringify({requestId:randomUUID(),displayName:name,avatarKey:'mint'});
 const result=await new Promise<{cookie:string;body:unknown}>((ok,no)=>{const req=request('http://127.0.0.1:4300/v1/session/guest',{method:'POST',localAddress:'127.126.0.'+(++serial),headers:{origin,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{try{expect(res.statusCode).toBe(201);ok({cookie:res.headers['set-cookie']![0].split(';')[0],body:JSON.parse(text)});}catch(e){no(e);}});});req.on('error',no);req.end(body);});
 const n=result.cookie.indexOf('=');await context.addCookies([{name:result.cookie.slice(0,n),value:result.cookie.slice(n+1),url:origin,httpOnly:true,sameSite:'Lax'}]);return MeSchema.parse(result.body);
}
async function layout(page:Page){
 await expect(page.locator('.cafe-shell')).toHaveAttribute('data-shell',enhanced?'scene-first':'classic');await expect(page.getByRole('status')).toHaveCount(1);
 if(enhanced){await expect(page.getByRole('navigation',{name:'Activity shortcuts'})).toBeVisible();const order=await page.evaluate(()=>{const a=document.querySelector('.cafe-scene')!.getBoundingClientRect(),b=document.querySelector('.cafe-sidebar')!.getBoundingClientRect();return a.top<=b.top;});expect(order).toBe(true);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}
async function enter(page:Page,slug='sdk-sandbox'){await page.goto('/worlds/'+slug);await layout(page);await page.getByRole('button',{name:'Enter cafe',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Connected');}
async function evidence(page:Page,name:string){const dir='artifacts/vnext/n06-03/ux-'+runId+'/'+test.info().project.name;await mkdir(dir,{recursive:true});await page.screenshot({path:dir+'/'+name+'.png',fullPage:true});await writeFile(dir+'/'+name+'.yml',await page.locator('body').ariaSnapshot());}

test('pending identity and anonymous error never show a confirmed visit or open a gameplay socket',async({page})=>{
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(ok=>release=ok),observed=new Promise<void>(ok=>seen=ok);let sockets=0;
 page.on('websocket',()=>sockets++);await page.route('**/v1/me',async route=>{seen();await gate;await route.continue();});
 try{await page.goto('/worlds/sdk-sandbox',{waitUntil:'domcontentloaded'});await observed;await layout(page);await expect(page.getByRole('status')).toHaveText('Checking your session...');await expect(page.getByRole('button',{name:'Enter cafe',exact:true})).toHaveAttribute('aria-disabled','true');expect(sockets).toBe(0);release();await expect(page.getByRole('link',{name:'Open identity',exact:true})).toBeVisible();await expect(page.getByText('No confirmed visible visitors.',{exact:true})).toBeVisible();expect(sockets).toBe(0);await evidence(page,'anonymous');}finally{release();}
});

test('real seat and focus survive confirmed return; enhanced return keeps the same document',async({page,context})=>{
 const me=await guest(context,'UX Focus Visitor');await enter(page,'deadline');const seat=page.getByRole('button',{name:'Deadline desk 01',exact:true});await seat.focus();await page.keyboard.press('Enter');await expect(page.getByText('Your seat is confirmed.',{exact:true})).toBeVisible();const focus=page.getByRole('region',{name:'Private focus timer'});await focus.getByRole('button',{name:'Start focus',exact:true}).click();await expect(focus.getByText('Focus in progress',{exact:true})).toBeVisible();const before=(await (await context.request.get('/v1/focus')).json()).session;await evidence(page,'confirmed-focus');
 await page.evaluate(()=>{document.documentElement.dataset.uxDocument='retained';});await page.getByRole('button',{name:'Leave and return to city',exact:true}).click();await page.waitForURL('/');expect(await page.evaluate(()=>document.documentElement.dataset.uxDocument)).toBe(enhanced?'retained':undefined);
 expect((await (await context.request.get('/v1/me/room')).json()).snapshot).toBeNull();expect((await (await context.request.get('/v1/me')).json()).profile).toEqual(me.profile);expect((await (await context.request.get('/v1/focus')).json()).session).toMatchObject({id:before.id,phase:'active',endsAt:before.endsAt});
});

test('graphics failure leaves actual seat and independent leave controls usable',async({page,context})=>{
 await guest(context,'UX Asset Visitor');await page.route('**/assets/avatars/**',route=>route.abort());await enter(page);await expect(page.getByText('Scene unavailable. Seat controls remain available.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Window table 01',exact:true}).click();await expect(page.getByText('Your seat is confirmed.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Leave cafe',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Ready to enter');await evidence(page,'asset-failure');
});

test('a late successful identity response cannot restore a logged-out identity',async({page,context})=>{
 const me=await guest(context,'UX Previous Identity');let release!:()=>void,seen!:()=>void,held=false;const gate=new Promise<void>(ok=>release=ok),observed=new Promise<void>(ok=>seen=ok);
 await page.route('**/v1/me',async route=>{if(held){await route.continue();return;}held=true;const actual=await route.fetch();expect(actual.status()).toBe(200);seen();await gate;await route.fulfill({response:actual}).catch(()=>{});});
 try{await page.goto('/worlds/sdk-sandbox',{waitUntil:'domcontentloaded'});await observed;expect((await context.request.post('/v1/session/logout',{headers:{origin,'x-csrf-token':me.csrfToken,'idempotency-key':randomUUID()},data:{}})).status()).toBe(200);await page.evaluate(()=>{const bus=new BroadcastChannel('virtual-city-identity');bus.postMessage({changed:true});bus.close();});await expect(page.getByRole('link',{name:'Open identity',exact:true})).toBeVisible();release();await page.unrouteAll({behavior:'wait'});await expect(page.getByText('UX Previous Identity',{exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Private focus timer'})).toHaveCount(0);await layout(page);await evidence(page,'identity-late');}finally{release();}
});

test('actual transport interruption hides stale seat state and resyncs one membership',async({page,context})=>{
 let client:WebSocketRoute|undefined,server:WebSocketRoute|undefined,connections=0,resume!:()=>void;const gate=new Promise<void>(ok=>resume=ok);
 await page.routeWebSocket('**/socket.io/**',async route=>{if(++connections>1)await gate;client=route;server=route.connectToServer();});
 try{await guest(context,'UX Recovery Visitor');await enter(page);await page.getByRole('button',{name:'Window table 01',exact:true}).click();await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-sitting-count','1');await client!.close({code:1012,reason:'Synthetic transport interruption'});await server!.close();await expect(page.getByRole('status')).toHaveText('Connection lost. Your place is unconfirmed.');await expect(page.getByText('Your seat is confirmed.',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Window table 01',exact:true})).toBeDisabled();await evidence(page,'recovering');resume();await expect(page.getByRole('status')).toHaveText('Connected',{timeout:10000});await expect(page.locator('canvas[data-scene]')).toHaveCount(1);await expect(page.locator('canvas[data-scene]')).toHaveAttribute('data-entity-count','1');await page.getByRole('button',{name:'Leave cafe',exact:true}).click();}finally{resume();}
});

test('confirmed departure disables stale seat controls and clears current membership',async({page,context})=>{
 await guest(context,'UX Seat Contention');await enter(page);await page.getByRole('button',{name:'Window table 01',exact:true}).click();await expect(page.getByText('Your seat is confirmed.',{exact:true})).toBeVisible();
 // Inspect the actual current membership before and after independent departure.
 const current=(await (await context.request.get('/v1/me/room')).json()).snapshot;expect(current.self.seatId).toBe('seat-1');await page.getByRole('button',{name:'Stand up',exact:true}).click();await expect(page.getByText('You stood up.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Leave cafe',exact:true}).click();await expect(page.getByRole('button',{name:'Window table 01',exact:true})).toBeDisabled();expect((await (await context.request.get('/v1/me/room')).json()).snapshot).toBeNull();await evidence(page,'left');
});
