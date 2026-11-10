import {it,expect} from 'vitest';
import {adminConfig,createAdminHandler} from './proxy';
const origin='http://127.0.0.1:3400',api='http://127.0.0.1:4300',token='a'.repeat(64);
const config=()=>adminConfig({NODE_ENV:'test',ADMIN_ORIGIN:origin,ADMIN_API_ORIGIN:api,ADMIN_METRICS_READ_TOKEN:token});
const session={subject:'11111111-1111-4111-8111-111111111111',audience:'operator',expiresAt:'2027-01-01T00:00:00.000Z',idleExpiresAt:'2026-12-01T00:00:00.000Z',stepUpUntil:'2026-11-30T00:00:00.000Z',csrfToken:'b'.repeat(64)};
const operator='c'.repeat(64),cookie='city_operator='+operator;
it('rejects disabled configuration, arbitrary paths/query/Origin and unauthenticated metric reads before service credential use',async()=>{
 const calls:unknown[]=[];const handler=createAdminHandler(config(),async(input,init)=>{calls.push({input,init});return Response.json({});});
 for(const path of ['/api/admin/internal/metrics','/api/admin/metrics?query=up','/api/admin/metrics?view=summary&range=1h','/api/admin/metrics?view=summary&range=current&url=https://attacker.invalid'])expect((await handler(new Request(origin+path))).status).toBe(400);
 expect((await handler(new Request(origin+'/api/admin/metrics?view=summary&range=current'))).status).toBe(401);
 expect((await handler(new Request(origin+'/api/admin/login',{method:'POST',headers:{origin:'https://attacker.invalid'},body:'{}'}))).status).toBe(403);expect(calls).toHaveLength(0);
 expect((await createAdminHandler(adminConfig({}),async()=>{throw Error('Unexpected request');})(new Request(origin+'/api/admin/session'))).status).toBe(503);
});
it('configuration rejects non-exact/credentialed origins, production HTTP and invalid service tokens',()=>{
 for(const extra of [{ADMIN_ORIGIN:origin+'/path'},{ADMIN_API_ORIGIN:api+'?x=1'},{ADMIN_API_ORIGIN:'http://user:password@127.0.0.1:4300'},{NODE_ENV:'production'},{ADMIN_METRICS_READ_TOKEN:'not-a-read-token'}])expect(adminConfig({NODE_ENV:'test',ADMIN_ORIGIN:origin,ADMIN_API_ORIGIN:api,...extra})).toBeUndefined();
});
it('interactive calls forward only the operator cookie and exact Origin, never read credentials or caller headers',async()=>{
 const observed:{url:string;headers:Headers}[]=[];
 const handler=createAdminHandler(config(),async(url,init)=>{observed.push({url,headers:new Headers(init?.headers)});return Response.json(session,{headers:{'set-cookie':cookie+'; Path=/; HttpOnly; SameSite=Strict'}});});
 const result=await handler(new Request(origin+'/api/admin/login',{method:'POST',headers:{origin,authorization:'Bearer attacker','x-forwarded-for':'203.0.113.5',cookie:'city_session=player; '+cookie},body:JSON.stringify({password:'synthetic-long-password-only',code:'123456'})}));
 expect(result.status).toBe(200);expect(await result.json()).toEqual(session);expect(observed[0].url).toBe(api+'/v1/operator/login');expect(observed[0].headers.get('cookie')).toBe(cookie);expect(observed[0].headers.get('origin')).toBe(origin);expect(observed[0].headers.get('authorization')).toBeNull();expect(observed[0].headers.get('x-forwarded-for')).toBeNull();expect(result.headers.get('set-cookie')).toContain('HttpOnly');
 expect((await handler(new Request(origin+'/api/admin/step-up',{method:'POST',headers:{origin,cookie},body:'{}'}))).status).toBe(403);expect(observed).toHaveLength(1);
});
it('metrics coalesce/cache within a fixed query budget, preserve true zero, mark outage stale/UNKNOWN and reauthenticate cached reads',async()=>{
 let now=1804478400000,live=true,valid=true,reads=0,auths=0;
 const handler=createAdminHandler(config(),async(url,init)=>{
  const headers=new Headers(init?.headers);expect(init?.redirect).toBe('error');expect(init?.cache).toBe('no-store');
  if(url.endsWith('/session')){auths++;expect(headers.get('authorization')).toBeNull();expect(headers.get('cookie')).toBe(cookie);return Response.json(session,{status:valid?200:401});}
  reads++;expect(url).toBe(api+'/internal/telemetry');expect(headers.get('authorization')).toBe('Bearer '+token);expect(headers.get('cookie')).toBeNull();if(!live)throw Error('Synthetic outage');
  return Response.json({schemaVersion:1,serverTime:now,http:{requests:0,errors:0},gauges:{online:{connections:0,memberships:0}},rooms:{eventLoop:{p95Ms:null}},unexpectedSecret:token});
 },()=>now);
 const request=()=>handler(new Request(origin+'/api/admin/metrics?view=summary&range=current',{headers:{cookie:'city_session=player; '+cookie}}));
 const replies=await Promise.all([request(),request(),request()]);expect(reads).toBe(1);expect(auths).toBe(6);const fresh=await replies[0].json();expect(fresh.status).toBe('FRESH');expect(fresh.values.connections).toBe(0);expect(JSON.stringify(fresh).includes(token)).toBe(false);
 valid=false;expect((await request()).status).toBe(401);expect(reads).toBe(1);valid=true;live=false;now+=6000;expect((await (await request()).json()).status).toBe('STALE');now+=31000;const missing=await (await request()).json();expect(missing.status).toBe('UNKNOWN');expect(Object.values(missing.values).every(value=>value===null)).toBe(true);
});
it('unsafe cookies, forged session audience and oversized upstream bodies fail closed without credential disclosure',async()=>{
 for(const header of [cookie+'; Path=/; HttpOnly; SameSite=Lax',cookie+'; Path=/; Domain=example.invalid; HttpOnly; SameSite=Strict',cookie+'; Path=/; HttpOnly; SameSite=Strict; SameSite=None','city_session=player; Path=/; HttpOnly; SameSite=Strict']){
  const handler=createAdminHandler(config(),async()=>Response.json(session,{headers:{'set-cookie':header}}));expect((await handler(new Request(origin+'/api/admin/login',{method:'POST',headers:{origin},body:JSON.stringify({password:'synthetic-long-password-only',code:'123456'})}))).status).toBe(503);
 }
 const handler=createAdminHandler(config(),async()=>Response.json({...session,audience:'player',token}));const denied=await handler(new Request(origin+'/api/admin/session',{headers:{cookie}}));expect(denied.status).toBe(503);expect((await denied.text()).includes(token)).toBe(false);
 const huge=createAdminHandler(config(),async()=>new Response('x'.repeat(9000)));expect((await huge(new Request(origin+'/api/admin/session',{headers:{cookie}}))).status).toBe(503);
});
it('bounds request bodies and denies duplicate cookies, arbitrary auth fields and invalid methods before upstream calls',async()=>{
 let calls=0;const handler=createAdminHandler(config(),async()=>{calls++;return Response.json(session);});
 expect((await handler(new Request(origin+'/api/admin/login',{method:'POST',headers:{origin},body:'x'.repeat(8193)}))).status).toBe(400);
 expect((await handler(new Request(origin+'/api/admin/login',{method:'POST',headers:{origin},body:JSON.stringify({password:'synthetic-long-password-only',code:'123456',role:'operator'})}))).status).toBe(400);
 expect((await handler(new Request(origin+'/api/admin/session',{headers:{cookie:cookie+'; '+cookie}}))).status).toBe(401);
 expect((await handler(new Request(origin+'/api/admin/session',{method:'POST',headers:{origin},body:'{}'}))).status).toBe(405);expect(calls).toBe(0);
});
it('does not publish a slow service observation after the operator session is revoked during the query',async()=>{
 let valid=true,release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;}),hold=new Promise<void>(resolve=>{release=resolve;});
 const handler=createAdminHandler(config(),async url=>{
  if(url.endsWith('/session'))return Response.json(session,{status:valid?200:401});started();await hold;return Response.json({schemaVersion:1,serverTime:Date.now(),http:{requests:0,errors:0},gauges:{online:{connections:0,memberships:0}},rooms:{eventLoop:{p95Ms:null}}});
 });
 const request=handler(new Request(origin+'/api/admin/metrics?view=summary&range=current',{headers:{cookie}}));await waiting;valid=false;release();const response=await request;expect(response.status).toBe(401);expect((await response.text()).includes('connections')).toBe(false);
});
it('account results must be bounded strict projections; private upstream fields never pass through',async()=>{
 const id='11111111-1111-4111-8111-111111111111',view={accountId:id,kind:'registered',status:'active',version:0,activeSessions:1,privacy:{export:'OWNER_SELF_SERVICE',deletion:'OWNER_SELF_SERVICE',receiptTtlSeconds:86400}};
 for(const extra of [{privateEmail:'SYNTHETIC_PRIVATE_NOT_ALLOWED'},{sessions:[{token:'SYNTHETIC_PRIVATE_NOT_ALLOWED'}]},{version:-1}]){const handler=createAdminHandler(config(),async()=>Response.json({...view,...extra}));const response=await handler(new Request(origin+'/api/admin/account?accountId='+id,{headers:{cookie}}));expect(response.status).toBe(503);expect(await response.text()).not.toContain('SYNTHETIC_PRIVATE_NOT_ALLOWED');}
});
