import {beforeAll,beforeEach,afterAll,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {OperatorService} from '../../apps/platform-api/src/identity/operator-service';
import {totp} from '../../apps/platform-api/src/identity/operator-crypto';
import {adminConfig,createAdminHandler} from '../../apps/admin-web/server/proxy';
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,schema:string,now:number,key:string,readToken:string,recoveryCode:string,api:string,handler:ReturnType<typeof createAdminHandler>;
const origin='http://127.0.0.1:3400',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='synthetic-admin-proxy-password-only';
beforeAll(()=>{const address=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(address.hostname)||!/^virtual_city_test(?:_|$)/.test(address.pathname.slice(1)))throw Error('Disposable local test DB required');admin=new Pool({connectionString:address.toString()});});
beforeEach(async()=>{
 schema='admin_proxy_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const address=new URL(process.env.TEST_DATABASE_URL!);address.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:address.toString()});await migrate(pool);now=Date.now()-60000;key=randomBytes(32).toString('hex');readToken=randomBytes(32).toString('hex');const bootstrap=await new OperatorService(pool,key,()=>now).bootstrap({password,totpSecret:secret,code:totp(secret,now)});recoveryCode=bootstrap.recoveryCodes[0];now+=60000;
 app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:'synthetic-proxy-player-secret-'.repeat(2),ADMIN_ORIGIN:origin,OPERATOR_AUTH_KEY:key,OPERATOR_TELEMETRY_TOKEN:readToken}),pool,false,{now:()=>now});await app.app.listen(0,'127.0.0.1');api=await app.app.getUrl();handler=createAdminHandler(adminConfig({NODE_ENV:'test',ADMIN_ORIGIN:origin,ADMIN_API_ORIGIN:api,ADMIN_METRICS_READ_TOKEN:readToken}),fetch,()=>now);
});
afterEach(async()=>{await app?.app.close();await pool?.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});afterAll(async()=>{await admin.end();});
function request(path:string,body?:unknown,cookie?:string,csrf?:string,requestOrigin=origin){return new Request(origin+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{origin:requestOrigin,...cookie?{cookie}:{},...csrf?{'x-csrf-token':csrf}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}});}
async function login(){const response=await handler(request('login',{password,code:totp(secret,now)}));expect(response.status).toBe(200);return {cookie:response.headers.get('set-cookie')!.split(';')[0],session:await response.json()};}
it('real API telemetry credentials and player/moderator sessions never authorize the interactive proxy; operator positive flow is separate',async()=>{
 expect((await fetch(api+'/internal/telemetry',{headers:{authorization:'Bearer '+readToken}})).status).toBe(200);expect((await fetch(api+'/v1/operator/session',{headers:{authorization:'Bearer '+readToken}})).status).toBe(401);expect((await handler(request('metrics?view=summary&range=current'))).status).toBe(401);
 const guest=await fetch(api+'/v1/session/guest',{method:'POST',headers:{origin:'http://127.0.0.1:3300','content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),displayName:'Proxy deny visitor',avatarKey:'mint'})});expect(guest.status).toBe(201);const player=await guest.json();await pool.query("INSERT INTO safety_staff_grants(account_id,world_slug,role,expires_at) VALUES($1,'sdk-sandbox','safety-admin',$2)",[player.profile.id,new Date(now+60000)]);
 expect((await handler(request('session',undefined,guest.headers.get('set-cookie')!.split(';')[0]))).status).toBe(401);const user=await login();expect((await handler(request('session',undefined,user.cookie))).status).toBe(200);
 const metrics=await handler(request('metrics?view=summary&range=current',undefined,user.cookie));expect(metrics.status).toBe(200);const text=await metrics.text();expect(JSON.parse(text).status).toBe('FRESH');for(const value of [readToken,key,password,secret,api])expect(text.includes(value)).toBe(false);
});
it('actual HTTP Origin/CSRF, rotated cookie and revoke-all remain enforced through the proxy',async()=>{
 const user=await login();expect((await handler(request('logout',{},user.cookie,user.session.csrfToken,'https://attacker.invalid'))).status).toBe(403);expect((await handler(request('logout',{},user.cookie,'d'.repeat(64)))).status).toBe(403);expect((await handler(request('session',undefined,user.cookie))).status).toBe(200);
 now+=30000;const response=await handler(request('step-up',{password,code:totp(secret,now)},user.cookie,user.session.csrfToken));expect(response.status).toBe(200);const cookie=response.headers.get('set-cookie')!.split(';')[0],current=await response.json();expect(cookie!==user.cookie).toBe(true);expect((await handler(request('session',undefined,user.cookie))).status).toBe(401);
 const audit=await handler(request('audit',undefined,cookie));expect(audit.status).toBe(200);expect((await audit.json()).events.some((event:{action:string})=>event.action==='step-up')).toBe(true);expect((await handler(request('revoke-all',{},cookie,current.csrfToken))).status).toBe(200);expect((await handler(request('session',undefined,cookie))).status).toBe(401);
});
it('real failed read credential yields UNKNOWN/null, while revocation denies a previously cached observation',async()=>{
 const user=await login(),wrong=createAdminHandler(adminConfig({NODE_ENV:'test',ADMIN_ORIGIN:origin,ADMIN_API_ORIGIN:api,ADMIN_METRICS_READ_TOKEN:'d'.repeat(64)}),fetch,()=>now);
 const missing=await wrong(request('metrics?view=summary&range=current',undefined,user.cookie));expect(missing.status).toBe(200);const unknown=await missing.json();expect(unknown.status).toBe('UNKNOWN');expect(Object.values(unknown.values).every(value=>value===null)).toBe(true);
 expect((await (await handler(request('metrics?view=summary&range=current',undefined,user.cookie))).json()).status).toBe('FRESH');expect((await handler(request('logout',{},user.cookie,user.session.csrfToken))).status).toBe(200);expect((await handler(request('metrics?view=summary&range=current',undefined,user.cookie))).status).toBe(401);
});
it('step-up expiry and query/body/route allowlists fail closed through actual backend authority',async()=>{
 const user=await login();now+=5*60000;expect((await handler(request('audit',undefined,user.cookie))).status).toBe(403);expect((await handler(request('session',undefined,user.cookie))).status).toBe(200);
 for(const path of ['metrics?view=arbitrary&range=current','metrics?view=summary&range=24h','session?url=https://attacker.invalid','internal/metrics'])expect((await handler(request(path,undefined,user.cookie))).status).toBe(400);
 expect((await handler(request('login',{password,code:totp(secret,now),role:'operator'}))).status).toBe(400);expect((await pool.query('SELECT count(*)::int AS n FROM identity_operator')).rows[0].n).toBe(1);
});
it('proxy recovery consumes a real one-use code, keeps the same operator and never forwards service credentials or a new session',async()=>{
 const user=await login(),replacement='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',body={password,recoveryCode,newTotpSecret:replacement,code:totp(replacement,now)};
 const response=await handler(request('recover',body));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toBeNull();const restored=await response.json();expect(restored.subject===user.session.subject&&restored.recoveryCodes.length===10).toBe(true);for(const value of [readToken,key,password,secret])expect(JSON.stringify(restored).includes(value)).toBe(false);
 expect((await handler(request('session',undefined,user.cookie))).status).toBe(401);expect((await handler(request('recover',body))).status).toBe(401);now+=30000;const restoredLogin=await handler(request('login',{password,code:totp(replacement,now)}));expect(restoredLogin.status).toBe(200);expect((await restoredLogin.json()).subject===user.session.subject).toBe(true);
});
