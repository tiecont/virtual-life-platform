import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {migrate} from '../../apps/platform-api/src/db/migrations';
let admin:Pool,pool:Pool,schema:string,runtime:Awaited<ReturnType<typeof createApp>>;
const origin='http://127.0.0.1:3300';
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB required');admin=new Pool({connectionString:url.toString()});});
beforeEach(async()=>{schema='queueux_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);runtime=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-queue-ux-secret-'.repeat(3),LOCAL_ADMISSION_UX:'1'}),pool);});
afterEach(async()=>{await runtime?.app.close();await pool?.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});
afterAll(async()=>{await admin.end();});
async function actor(name='Queue visitor'){const response=await runtime.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});expect(response.statusCode).toBe(201);return{cookie:response.cookies[0].name+'='+response.cookies[0].value,me:response.json()};}
it('requires a live signed session and CSRF/Origin before any queue command; viewer-only reads reject selectors',async()=>{
 expect((await runtime.http.inject({url:'/v1/admission'})).statusCode).toBe(401);
 const a=await actor();const headers={cookie:a.cookie,origin,'x-csrf-token':a.me.csrfToken};const payload={schemaVersion:1,requestId:randomUUID(),action:'enqueue'};
 expect((await runtime.http.inject({method:'POST',url:'/v1/admission',headers:{...headers,origin:'https://outside.invalid'},payload})).statusCode).toBe(403);
 expect((await runtime.http.inject({method:'POST',url:'/v1/admission',headers:{cookie:a.cookie,origin},payload})).statusCode).toBe(403);
 expect((await runtime.http.inject({url:'/v1/admission?accountId='+randomUUID(),headers:{cookie:a.cookie}})).statusCode).toBe(422);
 const read=await runtime.http.inject({url:'/v1/admission',headers:{cookie:a.cookie}});expect(read.statusCode).toBe(200);expect(read.json()).toMatchObject({viewerAccountId:a.me.profile.id,availability:'PAUSED',own:null,etaSeconds:null});expect(read.headers['cache-control']).toBe('no-store');
 expect((await pool.query('SELECT 1 FROM platform_admission_entries')).rowCount).toBe(0);
});
async function command(a:Awaited<ReturnType<typeof actor>>,input:Record<string,unknown>){return runtime.http.inject({method:'POST',url:'/v1/admission',headers:{cookie:a.cookie,origin,'x-csrf-token':a.me.csrfToken},payload:{schemaVersion:1,requestId:randomUUID(),...input}});}
async function own(a:Awaited<ReturnType<typeof actor>>){const r=await runtime.http.inject({url:'/v1/admission',headers:{cookie:a.cookie}});expect(r.statusCode).toBe(200);return r.json();}
it('duplicate tabs share one own ticket; claim/retry/cancel never reveal another identity or keep a game socket',async()=>{
 await pool.query('UPDATE platform_admission_policy SET hard=1,target=1,paused=false');
 const a=await actor('First queue visitor'),b=await actor('Second queue visitor');
 const [x,y]=await Promise.all([command(a,{action:'enqueue'}),command(a,{action:'enqueue'})]);expect(x.statusCode).toBe(200);expect(x.json().own.id).toBe(y.json().own.id);
 await command(b,{action:'enqueue'});expect((await own(a)).own.position).toBe(1);const second=await own(b);expect(second.own.position).toBe(2);expect(JSON.stringify(second)).not.toContain(a.me.profile.id);expect(JSON.stringify(second)).not.toContain(a.me.profile.displayName);
 const offer=await runtime.admission!.offer(randomUUID());expect(offer?.accountId).toBe(a.me.profile.id);
 const requestId=randomUUID(),input={action:'claim',offerId:offer!.own.id,expectedVersion:offer!.own.version,requestId};
 expect((await command(b,input)).statusCode).toBe(409);
 expect((await command(a,input)).json().own.state).toBe('ACTIVE');expect((await command(a,input)).json().own.state).toBe('ACTIVE');
 expect(runtime.diagnostics().transportConnections).toBe(0);expect((await runtime.admission!.capacity()).occupancy).toBe(1);
 const active=(await own(a)).own;expect((await command(a,{action:'leave',id:active.id,expectedVersion:active.version})).json().own).toBeNull();expect((await runtime.admission!.capacity()).occupancy).toBe(0);
});
it('missed offers and hard-expired reconnects cannot be restored; expired own view requires explicit fresh join',async()=>{
 await pool.query('UPDATE platform_admission_policy SET hard=1,target=1,paused=false');const a=await actor();await command(a,{action:'enqueue'});const offer=await runtime.admission!.offer(randomUUID());
 await pool.query("UPDATE platform_admission_entries SET expires_at=clock_timestamp()-interval '1 second'");
 expect((await own(a)).own).toBeNull();expect((await command(a,{action:'claim',offerId:offer!.own.id,expectedVersion:offer!.own.version})).statusCode).toBe(409);
 await command(a,{action:'enqueue'});const next=await runtime.admission!.offer(randomUUID());await command(a,{action:'claim',offerId:next!.own.id,expectedVersion:next!.own.version});const active=(await own(a)).own;
 const grace=(await runtime.admission!.disconnect(runtime.http.unsignCookie(a.cookie.split('=')[1]).value!,active.id,active.version,randomUUID())).own!;
 expect((await own(a)).own.state).toBe('RECONNECT_GRACE');expect((await command(a,{action:'reconnect',id:grace.id,expectedVersion:grace.version})).json().own.state).toBe('ACTIVE');
 const current=(await own(a)).own;const expired=(await runtime.admission!.disconnect(runtime.http.unsignCookie(a.cookie.split('=')[1]).value!,current.id,current.version,randomUUID())).own!;
 await pool.query("UPDATE platform_admission_entries SET expires_at=clock_timestamp()-interval '1 second'");expect((await command(a,{action:'reconnect',id:expired.id,expectedVersion:expired.version})).statusCode).toBe(409);expect((await own(a)).own).toBeNull();
});
it('bounds authenticated polling, fails closed on owner loss, and has no public allocator or selector',async()=>{
 const a=await actor();for(let i=0;i<30;i++)expect((await runtime.http.inject({url:'/v1/admission',headers:{cookie:a.cookie}})).statusCode).toBe(200);
 const limited=await runtime.http.inject({url:'/v1/admission',headers:{cookie:a.cookie}});expect(limited.statusCode).toBe(429);expect(limited.headers['retry-after']).toBe('60');
 expect((await runtime.http.inject({method:'POST',url:'/v1/admission/offer',headers:{cookie:a.cookie,origin},payload:{}})).statusCode).toBe(404);
 const b=await actor('Queue owner check');runtime.admission!.close();expect((await runtime.http.inject({url:'/v1/admission',headers:{cookie:b.cookie}})).statusCode).toBe(503);
 expect(()=>readConfig({NODE_ENV:'production',DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1/virtual_city_test',WEB_ORIGIN:'https://city.invalid',SESSION_SECRET:'synthetic-queue-secret'.repeat(3),LOCAL_ADMISSION_UX:'1'})).toThrow('LOCAL_ADMISSION_UX');
});
it('leaves ordinary app routes and closed policy unchanged when the local queue preview is disabled',async()=>{
 await runtime.app.close();runtime=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:process.env.TEST_DATABASE_URL!,SESSION_SECRET:'synthetic-disabled-queue-secret'.repeat(2)}),pool);
 expect(runtime.admission).toBeUndefined();expect((await runtime.http.inject({url:'/v1/admission'})).statusCode).toBe(404);expect((await runtime.http.inject({url:'/health/live'})).statusCode).toBe(200);
 const row=(await pool.query('SELECT hard,target,paused FROM platform_admission_policy')).rows[0];expect(row).toEqual({hard:0,target:0,paused:true});
});
