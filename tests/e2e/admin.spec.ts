import {test,expect,type Page,type Locator} from '@playwright/test';
import {Pool} from 'pg';
import {OperatorObservationViewSchema,OperatorSystemViewSchema} from '@aetheria/contracts';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='synthetic-admin-browser-password-only',serviceToken='e'.repeat(64);
let pool:Pool;
test.beforeAll(()=>{const address=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(address.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(address.pathname.slice(1))||address.search)throw Error('Disposable local test DB required');pool=new Pool({connectionString:address.toString()});});
// Synthetic seed reset is test-owner SQL, never an application endpoint.
test.beforeEach(async()=>{await pool.query('UPDATE identity_operator SET totp_counter=-1,failures=0,locked_until=NULL');await pool.query('UPDATE identity_operator_sessions SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL');});
test.afterAll(async()=>{await pool.end();});
async function signIn(page:Page){await page.goto('/admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Authenticator code').fill(totp(secret,Date.now()));await page.getByLabel('Authenticator code').press('Enter');await expect(page.getByRole('heading',{name:'City at a glance'})).toBeVisible();}
async function canvasFrame(canvas:Locator){
 // WebGL uses a non-preserved drawing buffer; measure the composited image.
 const png=await canvas.screenshot({path:test.info().outputPath('canvas-pixels.png'),style:'canvas, section[aria-label="3D Pet preview"] { background: rgb(1, 2, 3) !important; }'});
 return canvas.page().evaluate(async encoded=>{
  const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'})),{width,height}=bitmap,frame=new OffscreenCanvas(width,height),ctx=frame.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const bytes=ctx.getImageData(0,0,width,height).data;
  let hash=0,occupied=0,left=width,right=0,bottom=height,top=0;for(let i=0;i<bytes.length;i+=4){hash=Math.imul(hash^bytes[i]^bytes[i+1]<<8^bytes[i+2]<<16,16777619);if(bytes[i]!==1||bytes[i+1]!==2||bytes[i+2]!==3){occupied++;const x=i/4%width,y=Math.floor(i/4/width);left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}}
  return {hash,occupied,pixels:width*height,inset:left>0&&right<width-1&&bottom>0&&top<height-1,bounds:{left,right,bottom,top,width,height}};
 },png.toString('base64'));
}
test('unauthenticated UI and routes deny operator/service bypass, wrong Origin, arbitrary queries and private source paths',async({page,request})=>{
 await page.goto('/admin');await expect(page.getByRole('heading',{name:/quiet place/})).toBeVisible();expect(await page.locator('form').getAttribute('method')).toBe('post');
 for(const path of ['/api/admin/session','/api/admin/metrics?view=summary&range=current','/api/admin/observations?view=system&range=current','/api/admin/system-state?view=system&range=current'])expect((await request.get(path,{headers:{authorization:'Bearer '+serviceToken}})).status()).toBe(401);
 expect((await request.post('/api/admin/login',{headers:{origin:'https://attacker.invalid'},data:{password,code:totp(secret,Date.now())}})).status()).toBe(403);
 expect((await request.get('/api/admin/metrics?view=summary&range=24h')).status()).toBe(400);
 for(const path of ['/.env','/server/proxy.ts','/internal/metrics','/v1/operator/session'])expect((await request.get(path)).status()).toBe(404);
 await page.screenshot({path:test.info().outputPath('operator-login.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('actual browser MFA reads private metrics, audit and system traffic with labeled source fixtures then logs out',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const observed:string[]=[];page.on('response',response=>{if(response.url().includes('/api/admin/'))void response.text().then(text=>observed.push(text)).catch(()=>{});});
 await signIn(page);const session=await (await page.request.get('/api/admin/session')).json();for(const headers of [{origin:'https://attacker.invalid','x-csrf-token':session.csrfToken},{origin:'http://127.0.0.1:3400','x-csrf-token':'0'.repeat(64)},{origin:'http://127.0.0.1:3400'}] as Record<string,string>[]){const denied=await page.request.post('/api/admin/logout',{headers,data:{}});expect(denied.status()).toBe(403);expect(denied.headers()['cache-control']).toContain('no-store');}expect((await page.request.get('/api/admin/session')).status()).toBe(200);expect(await page.evaluate(()=>document.cookie.includes('city_operator'))).toBe(false);await page.getByRole('button',{name:'Refresh snapshot'}).click();await expect(page.getByText('Fresh observation',{exact:true})).toBeVisible();await expect(page.getByText('Requests since API start')).toBeVisible();
 await page.screenshot({path:test.info().outputPath('operator-overview.png'),fullPage:true});await page.getByRole('button',{name:'Audit trail',exact:true}).click();await page.getByRole('button',{name:'Load audit'}).click();await expect(page.getByRole('cell',{name:'login',exact:true})).toBeVisible();

 // Reuse this authenticated fixture session: a sixth login would exceed the unchanged5/minute guard.
await page.getByRole('button',{name:'System & traffic',exact:true}).click();const response=page.waitForResponse(r=>r.url().includes('/api/admin/observations?'));await page.getByRole('button',{name:'Refresh system snapshot',exact:true}).click();const actual=OperatorObservationViewSchema.parse(await (await response).json());expect(actual.status).toBe('FRESH');expect(actual.observation?.schemaVersion).toBe(2);expect(JSON.stringify(actual)).not.toContain(serviceToken);await expect(page.getByText('Fresh observation',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Configured system map'})).toBeVisible();await expect(page.getByRole('heading',{name:'Database and delivery sources'})).toBeVisible();await expect(page.getByText('Responding',{exact:true})).toBeVisible();const system=OperatorSystemViewSchema.parse(await (await page.request.get('/api/admin/system-state?view=system&range=current')).json());expect(system).toMatchObject({status:'FRESH',system:{database:{status:'OBSERVED'},pool:{status:'OBSERVED'},workerLiveness:'UNKNOWN'}});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('system-traffic-actual.png'),fullPage:true});
 let mode='zero';await page.route('**/api/admin/observations?*',async route=>{
  if(mode==='error'){await route.fulfill({status:503,contentType:'application/json',body:'{}'});return;}
  const body=structuredClone(actual),at=Date.now()-(mode==='stale'?15000:0);body.sampledAt=at;body.status=mode==='stale'?'STALE':mode==='unknown'?'UNKNOWN':'FRESH';if(mode==='unknown'){body.sampledAt=null;body.observation=null;}else if(body.observation){body.observation.sampledAt=at;body.observation.online.connections=0;body.observation.http={requests:0,errors:0,series:[]};}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.getByRole('button',{name:'Refresh system snapshot',exact:true}).click();await expect(page.getByText('Connections now',{exact:true}).locator('..').locator('dd')).toHaveText('0');mode='stale';await page.getByRole('button',{name:'Refresh system snapshot',exact:true}).click();await expect(page.getByText('Stale observation',{exact:true})).toBeVisible();mode='unknown';await page.getByRole('button',{name:'Refresh system snapshot',exact:true}).click();await expect(page.getByText('Sources unknown',{exact:true})).toBeVisible();await expect(page.getByText('Connections now',{exact:true}).locator('..').locator('dd')).toHaveText('UNKNOWN');mode='error';await page.getByRole('button',{name:'Refresh system snapshot',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Traffic observation unavailable.'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('system-traffic-unknown.png'),fullPage:true});

 expect(observed.every(body=>!body.includes(serviceToken)&&!body.includes(secret)&&!body.includes('ADMIN_METRICS_READ_TOKEN')&&!body.includes('OPERATOR_AUTH_KEY'))).toBe(true);expect(errors).toEqual([]);await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();expect((await page.request.get('/api/admin/session')).status()).toBe(401);
});
test('actual browser prelaunch deep link preserves campaign through fresh verification and revoke-all',async({page,request})=>{
 const campaignId='11111111-1111-4111-8111-111111111111';
 await page.goto('/admin/prelaunch');
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByLabel('Authenticator code').fill(totp(secret,Date.now()));
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Prelaunch registration',exact:true})).toBeVisible();
 await page.getByLabel('Campaign ID').fill(campaignId);

 let receiveRequest!:()=>void;
 const pendingRequest=new Promise<void>(resolve=>{receiveRequest=resolve;});
 let releaseResponse!:()=>void;
 const pendingResponse=new Promise<void>(resolve=>{releaseResponse=resolve;});
 const summaryPath='**/api/admin/prelaunch-summary?*';
 await page.route(summaryPath,async route=>{
  receiveRequest();
  await pendingResponse;
  await route.fulfill({status:403,json:{error:{code:'FORBIDDEN'}}}).catch(()=>{ /* Request may already be cancelled. */ });
 },{times:1});
 await page.getByRole('button',{name:'Load campaign',exact:true}).click();
 await pendingRequest;
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByRole('heading',{name:'City at a glance'})).toBeVisible();
 releaseResponse();

 await page.route(summaryPath,route=>route.fulfill({status:403,json:{error:{code:'FORBIDDEN'}}}),{times:1});
 await page.getByRole('button',{name:'Prelaunch registration',exact:true}).click();
 await expect(page.getByLabel('Campaign ID')).toHaveValue(campaignId);
 await page.getByRole('button',{name:'Load campaign',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Session & security',exact:true})).toBeVisible();
 const old=(await page.context().cookies()).find(value=>value.name==='city_operator')!;
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByLabel('Authenticator code').fill(totp(secret,Date.now()+30000));
 await page.getByRole('button',{name:'Verify again',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Prelaunch registration',exact:true})).toBeVisible();
 await expect(page.getByLabel('Campaign ID')).toHaveValue(campaignId);
 await expect(page.locator('.notice')).toContainText('Verification refreshed.');
 const current=(await page.context().cookies()).find(value=>value.name==='city_operator')!;
 expect(current.value!==old.value).toBe(true);
 expect((await request.get('/api/admin/session',{headers:{cookie:'city_operator='+old.value}})).status()).toBe(401);
 await page.getByRole('button',{name:'Session & security',exact:true}).click();
 await page.getByRole('button',{name:'Revoke all sessions',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await page.screenshot({path:test.info().outputPath('operator-revoked.png'),fullPage:true});
});
test('synthetic observation fixtures show loading, true zero, stale, missing and error states with responsive keyboard controls',async({page})=>{
 await page.clock.install({time:new Date()});await page.emulateMedia({reducedMotion:'reduce'});await signIn(page);let mode='loading',release:undefined|(()=>void);const values={requests:0,errors:0,connections:0,memberships:0,eventLoopP95Ms:null};
 await page.route('**/api/admin/metrics?*',async route=>{
  if(mode==='loading')await new Promise<void>(resolve=>{release=resolve;});
  if(mode==='error'){await route.fulfill({status:503,contentType:'application/json',body:'{}'});return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:mode==='stale'?'STALE':mode==='unknown'?'UNKNOWN':'FRESH',sampledAt:mode==='unknown'?null:Date.now()-(mode==='stale'?15000:0),values:mode==='unknown'?Object.fromEntries(Object.keys(values).map(key=>[key,null])):values})});
 });
 await page.getByRole('button',{name:'Refresh snapshot'}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Refreshing…'})).toBeDisabled();mode='fresh';release?.();await expect(page.getByText('Fresh observation',{exact:true})).toBeVisible();await expect(page.locator('dd').first()).toHaveText('0');
 mode='stale';await page.getByRole('button',{name:'Refresh snapshot'}).click();await expect(page.getByText('Stale observation',{exact:true})).toBeVisible();mode='unknown';await page.getByRole('button',{name:'Refresh snapshot'}).click();await expect(page.getByText('Metrics unknown',{exact:true})).toBeVisible();await expect(page.locator('dd').first()).toHaveText('—');
 mode='error';await page.getByRole('button',{name:'Refresh snapshot'}).click();await expect(page.getByRole('status')).toContainText('service is unavailable');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('operator-unknown.png'),fullPage:true});await page.clock.fastForward(16*60000);await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
});
test('actual account controls minimize data, revoke player sessions and require refresh after optimistic conflict',async({page,request})=>{
 const created=await request.post('http://127.0.0.1:4300/v1/session/guest',{headers:{origin:'http://127.0.0.1:3300'},data:{requestId:crypto.randomUUID(),displayName:'Admin control visitor',avatarKey:'mint'}});expect(created.status()).toBe(201);const id=(await created.json()).profile.id as string;
 await signIn(page);await page.getByRole('button',{name:'Accounts',exact:true}).click();await page.getByLabel('Account ID',{exact:true}).fill(id);await page.getByRole('button',{name:'Load account',exact:true}).click();await expect(page.getByRole('heading',{name:'Account status',exact:true})).toBeVisible();await expect(page.locator('dd').first()).toHaveText('active');await expect(page.getByText('Admin control visitor',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Suspend account',exact:true}).click();await expect(page.locator('dd').first()).toHaveText('suspended');expect((await request.get('http://127.0.0.1:4300/v1/me')).status()).toBe(401);await page.getByRole('button',{name:'Load account audit',exact:true}).click();await expect(page.getByRole('cell',{name:'suspend',exact:true})).toBeVisible();
 const concurrent=await page.evaluate(async accountId=>{const session=await (await fetch('/api/admin/session')).json();return (await fetch('/api/admin/account-command',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify({requestId:crypto.randomUUID(),accountId,expectedVersion:1,action:'resume',reason:'CORRECTION'})})).status;},id);expect(concurrent).toBe(200);
 await page.getByRole('button',{name:'Resume account',exact:true}).click();await expect(page.getByText('Account changed. Refresh before another command.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Load account',exact:true}).click();await expect(page.locator('dd').first()).toHaveText('active');await expect(page.locator('dd').nth(1)).toHaveText('2');await page.getByLabel('Reason',{exact:true}).selectOption('OWNER_REQUEST');await page.getByRole('button',{name:'Revoke player sessions',exact:true}).click();await expect(page.locator('dd').nth(1)).toHaveText('3');await page.getByRole('button',{name:'Load account audit',exact:true}).click();await expect(page.getByRole('cell',{name:'resume',exact:true})).toBeVisible();await page.screenshot({path:test.info().outputPath('operator-account-controls.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('public VI/EN preview separates fantasy content from private operations on mobile and desktop',async({page,request})=>{
 const errors:string[]=[],operatorRequests:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/api/admin/'))operatorRequests.push(request.url());});
 await page.emulateMedia({reducedMotion:'reduce'});
 const response=await page.goto('/');expect(response?.status()).toBe(200);
 expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
 await expect(page.locator('html')).toHaveAttribute('lang','vi');
 await expect(page.getByRole('heading',{level:1})).toContainText('đang chờ bạn');
 await expect(page.getByText('Minh họa ý tưởng · Không phải hình ảnh trong trò chơi')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Đến nội dung chính'})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
 await page.screenshot({path:test.info().outputPath('aetheria-vi.png'),fullPage:true});
 await page.getByRole('link',{name:'EN',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('heading',{level:1})).toContainText('is waiting for you');
 await expect(page.locator('audio,video,canvas')).toHaveCount(0);
 expect(await page.locator('figure img').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBe(836);
 await page.getByText('Is this a game account or a beta place?',{exact:true}).click();await expect(page.getByText('No. Preregistration does not create a game account or guarantee early access or a Windows beta place.',{exact:true})).toBeVisible();
 await expect(page.getByText(/City at a glance|Requests since API start|Database and delivery/)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('aetheria-en.png'),fullPage:true});
 await page.getByRole('link',{name:'Preregister',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Preregistration is not open yet'})).toBeVisible();
 await expect(page.locator('input,form')).toHaveCount(0);
 await expect(page.getByText(/does not create a game account/)).toBeVisible();
 expect(operatorRequests).toEqual([]);expect(errors).toEqual([]);
 for(const path of ['/api/admin/session','/api/admin/audit']){const denied=await request.get(path);expect(denied.status()).toBe(401);expect(denied.headers()['cache-control']).toContain('no-store');}
 const admin=await page.goto('/admin');expect(admin?.headers()['cache-control']).toContain('no-store');expect(admin?.headers()['x-robots-tag']).toBe('noindex, nofollow');
 await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.getByRole('heading',{name:/quiet place/})).toBeVisible();await expect(page.getByRole('heading',{name:'City at a glance'})).toHaveCount(0);
});

test('complete product pages render both languages and Pet filters link to accurate profiles',async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:320,height:800});
 for(const locale of ['vi','en'])for(const path of ['world','pets','skills','pet-arena','gacha','places/maid-cafe','places/card-lounge','news','faq','privacy','unsubscribe','preregister/verify']){
  const response=await page.goto('/'+path+'?lang='+locale);expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);expect(await page.locator('h1').textContent()).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
 }
 await page.goto('/pets?lang=en');await page.getByLabel('Element',{exact:true}).selectOption('fire');await page.getByLabel('Acquisition',{exact:true}).selectOption('standard_gacha');
 await expect(page.getByRole('status')).toContainText('1 / 240');await page.getByRole('heading',{name:'Cindrelis',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Cindrelis');await expect(page.getByText('Ember Halo',{exact:true})).toBeVisible();
 expect((await page.goto('/pets/not-a-pet?lang=en'))?.status()).toBe(404);
});

test('Pet controls stay disabled until delayed browser JavaScript hydrates them',async({page})=>{
 for(const path of ['/pets?lang=en','/pets/pet-v31-fire-cindrelis?lang=en']){
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/_next/static/chunks/**',async route=>{await gate;await route.continue();});
  try{
   await page.goto(path,{waitUntil:'commit'});
   const controls=path.startsWith('/pets?')?page.locator('main input, main select'):page.getByRole('button',{name:'Open 3D preview',exact:true});
   await expect(controls.first()).toBeVisible();
   expect(await controls.count()).toBe(path.startsWith('/pets?')?3:1);
   for(const control of await controls.all())await expect(control).toBeDisabled();
   release();
   for(const control of await controls.all())await expect(control).toBeEnabled();
   if(path.startsWith('/pets?')){
    await page.getByLabel('Element',{exact:true}).selectOption('fire');await page.getByLabel('Acquisition',{exact:true}).selectOption('standard_gacha');await expect(page.getByRole('status')).toContainText('1 / 240');
   }else{
    await controls.click();await expect(page.getByRole('status')).toContainText('3D ready',{timeout:20000});
   }
  }finally{release();await page.unrouteAll({behavior:'wait'});}
 }
});

test('six Pet concepts load real 3D only by choice with motion, keyboard, reduced-motion and context-loss fallback',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const names=[['fire','cindrelis'],['water','marivell'],['electric','quorion'],['ghost','vesperyn'],['ground','gravorn'],['light','aurelune']];
 for(const [element,name] of names){
  await page.goto('/pets/pet-v31-'+element+'-'+name+'?lang=en');await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button',{name:'Open 3D preview',exact:true}).click();await expect(page.getByRole('status')).toContainText('3D ready',{timeout:20000});
  const canvas=page.locator('canvas');expect(await canvas.evaluate(c=>(c as HTMLCanvasElement).width)).toBeGreaterThan(100);
  await canvas.scrollIntoViewIfNeeded();const initial=await canvasFrame(canvas);expect(initial.occupied/initial.pixels).toBeGreaterThan(.02);expect(initial.occupied/initial.pixels).toBeLessThan(.8);expect(initial.inset,name+' '+JSON.stringify(initial.bounds)).toBe(true);
  const b=initial.bounds;expect(Math.min(b.left/b.width,(b.width-1-b.right)/b.width,b.bottom/b.height,(b.height-1-b.top)/b.height),name+' camera margin').toBeGreaterThan(.02);
  await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
  await expect.poll(async()=>(await canvasFrame(canvas)).hash).not.toBe(initial.hash);
  await page.getByRole('button',{name:'Normal',exact:true}).click();await expect(page.getByRole('button',{name:'Normal',exact:true})).toHaveAttribute('aria-pressed','true');
  const animated=await canvasFrame(canvas);await expect.poll(async()=>(await canvasFrame(canvas)).hash).not.toBe(animated.hash);
  await page.getByRole('button',{name:'Rage',exact:true}).click();await page.getByRole('button',{name:'Skill',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Reset camera',exact:true}).click();
  await page.screenshot({path:test.info().outputPath('pet-'+name+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Close 3D',exact:true}).click();await expect(page.locator('canvas')).toHaveCount(0);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Open 3D preview',exact:true}).click();await expect(page.getByRole('status')).toContainText('3D ready');
 await expect(page.getByRole('button',{name:'Rage',exact:true})).toBeDisabled();
 await page.locator('canvas').scrollIntoViewIfNeeded();const still=await canvasFrame(page.locator('canvas'));expect((await canvasFrame(page.locator('canvas'))).hash).toBe(still.hash);
 await page.locator('canvas').focus();
 await page.locator('canvas').evaluate(c=>{const gl=(c as HTMLCanvasElement).getContext('webgl2');if(!gl)throw Error('Expected actual WebGL2 context');gl.getExtension('WEBGL_lose_context')?.loseContext();});
 await expect(page.getByRole('status')).toContainText('3D is unavailable');await expect(page.getByRole('button',{name:'Close 3D',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Open 3D preview',exact:true})).toBeFocused();await expect(page.getByRole('heading',{level:1})).toHaveText('Aurelune');expect(errors).toEqual([]);
});

test('unavailable WebGL keeps Pet details and a keyboard exit without loading motion controls',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:Parameters<typeof original>){if(String(args[0]).startsWith('webgl'))return null;return original.apply(this,args);} as typeof original;});
 await page.goto('/pets/pet-v31-fire-cindrelis?lang=en');await page.getByRole('button',{name:'Open 3D preview',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('status')).toContainText('3D is unavailable');await expect(page.getByRole('heading',{level:1})).toHaveText('Cindrelis');await expect(page.locator('canvas')).toBeHidden();await expect(page.getByRole('button',{name:'Rage',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Close 3D',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Open 3D preview',exact:true})).toBeFocused();
});
