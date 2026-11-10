import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,chmod,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
import {OperatorSessionSchema} from '@virtual-city/contracts';
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,operator:OperatorService,schema:string,now:number,authKey:string,logs:string[],recovery:{subject:string;recoveryCodes:string[]};
const origin='http://127.0.0.1:3400',playerOrigin='http://127.0.0.1:3300';
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',replacement='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',password='synthetic-operator-only-password-32';
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))||url.search||url.hash)throw Error('Disposable local DB required');admin=new Pool({connectionString:url.toString()});});
beforeEach(async()=>{
 schema='operator_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);now=1804478400000;authKey=randomBytes(32).toString('hex');logs=[];
 operator=new OperatorService(pool,authKey,()=>now);recovery=await operator.bootstrap({password,totpSecret:secret,code:totp(secret,now)});now+=30000;
 server=await createApp(readConfig({NODE_ENV:'test',SESSION_SECRET:'synthetic-player-cookie-secret-'.repeat(2),DATABASE_URL:url.toString(),ADMIN_ORIGIN:origin,OPERATOR_AUTH_KEY:authKey,OPERATOR_TELEMETRY_TOKEN:'f'.repeat(64)}),pool,true,{now:()=>now,logStream:{write:message=>{logs.push(message);}}});
});
afterEach(async()=>{await server?.app.close();await pool?.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});
afterAll(async()=>{await admin.end();});
const code=(key=secret)=>totp(key,now), cookie=(r:{headers:Record<string,unknown>})=>String(r.headers['set-cookie']).split(';')[0];
const send=(path:string,payload:Record<string,unknown>,headers:Record<string,string>={},address='127.0.0.2')=>server.http.inject({method:'POST',url:'/v1/operator/'+path,payload,headers:{origin,...headers},remoteAddress:address});
async function login(key=secret){const response=await send('login',{password,code:code(key)});expect(response.statusCode).toBe(200);return {cookie:cookie(response),session:OperatorSessionSchema.parse(response.json()),response};}
type User=Awaited<ReturnType<typeof login>>;
const headers=(user:User)=>({cookie:user.cookie,'x-csrf-token':user.session.csrfToken});
const session=(user:User)=>server.http.inject({url:'/v1/operator/session',headers:{cookie:user.cookie}});

it('enforces singleton bootstrap under concurrency, immutable subject and no HTTP signup',async()=>{
 for(const action of ['bootstrap','signup','register'])expect((await send(action,{password,totpSecret:secret,code:code()},{origin:playerOrigin})).statusCode).toBe(404);
 const result=await Promise.allSettled([operator.bootstrap({password,totpSecret:secret,code:code()}),new OperatorService(pool,authKey,()=>now).bootstrap({password,totpSecret:replacement,code:code(replacement)})]);expect(result.every(r=>r.status==='rejected')).toBe(true);
 expect((await pool.query('SELECT count(*)::int AS n FROM identity_operator')).rows[0].n).toBe(1);
 await expect(pool.query('UPDATE identity_operator SET subject=$1',[randomUUID()])).rejects.toThrow('immutable');await expect(pool.query('DELETE FROM identity_operator')).rejects.toThrow('immutable');await expect(pool.query('TRUNCATE identity_operator CASCADE')).rejects.toThrow('immutable');
});
it('player sessions, moderator claims, telemetry credentials and admin cookies have separate audiences',async()=>{
 const guest=await server.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin:playerOrigin},payload:{requestId:randomUUID(),displayName:'Operator deny visitor',avatarKey:'mint'}});expect(guest.statusCode).toBe(201);
 await pool.query("INSERT INTO safety_staff_grants(account_id,world_slug,role,expires_at) VALUES($1,'sdk-sandbox','safety-admin',$2)",[guest.json().profile.id,new Date(now+60000)]);
 expect((await server.http.inject({url:'/internal/telemetry',headers:{authorization:'Bearer '+'f'.repeat(64)}})).statusCode).toBe(200);
 for(const h of [{cookie:cookie(guest)},{cookie:'city_operator='+cookie(guest).split('=')[1]},{authorization:'Bearer '+'f'.repeat(64)},{cookie:cookie(guest),'x-role':'safety-admin','x-operator-subject':recovery.subject}])expect((await server.http.inject({url:'/v1/operator/session',headers:h})).statusCode).toBe(401);
 const user=await login();expect((await server.http.inject({url:'/v1/me',headers:{cookie:user.cookie}})).statusCode).toBe(401);expect((await server.http.inject({url:'/v1/me',headers:{cookie:cookie(guest)}})).statusCode).toBe(200);
 expect((await server.http.inject({url:'/internal/telemetry',headers:{cookie:user.cookie}})).statusCode).toBe(404);
});
it('requires both factors, denies consumed TOTP in simultaneous logins and persists replay rejection across service restart',async()=>{
 expect((await send('login',{password:'wrong-password-000000',code:code()})).statusCode).toBe(401);
 const responses=await Promise.all([send('login',{password,code:code()}, {},'127.0.0.3'),send('login',{password,code:code()}, {},'127.0.0.4')]);expect(responses.map(r=>r.statusCode).sort()).toEqual([200,401]);
 await expect(new OperatorService(pool,authKey,()=>now).login({password,code:code()})).rejects.toMatchObject({status:401});
 expect((await send('login',{password,code:code(),role:'admin'})).statusCode).toBe(422);expect((await send('login',{password})).statusCode).toBe(422);
});
it('requires exact admin Origin and session-bound CSRF on logout and step-up',async()=>{
 const a=await login();now+=30000;const b=await login();
 for(const originValue of ['',playerOrigin,'https://attacker.invalid'])expect((await send('logout',{}, {...headers(b),origin:originValue})).statusCode).toBe(403);
 for(const csrf of ['',a.session.csrfToken,'x'.repeat(64)])expect((await send('logout',{}, {cookie:b.cookie,'x-csrf-token':csrf})).statusCode).toBe(403);
 expect((await send('step-up',{password,code:code()}, {cookie:b.cookie})).statusCode).toBe(403);expect((await session(b)).statusCode).toBe(200);
 expect((await send('logout',{},headers(b))).statusCode).toBe(200);expect((await session(b)).statusCode).toBe(401);expect((await send('logout',{},headers(b))).statusCode).toBe(401);
});
it('expires step-up independently, rotates on fresh MFA without extending absolute expiry, then revokes every session',async()=>{
 const user=await login();now+=5*60000;
 expect((await session(user)).statusCode).toBe(200);expect((await server.http.inject({url:'/v1/operator/audit',headers:{cookie:user.cookie}})).statusCode).toBe(403);expect((await send('revoke-all',{},headers(user))).statusCode).toBe(403);
 const step=await send('step-up',{password,code:code()},headers(user));expect(step.statusCode).toBe(200);const current={cookie:cookie(step),session:OperatorSessionSchema.parse(step.json()),response:step};expect(current.cookie!==user.cookie).toBe(true);expect(current.session.expiresAt).toBe(user.session.expiresAt);expect((await session(user)).statusCode).toBe(401);
 expect((await send('revoke-all',{},headers(current))).statusCode).toBe(200);expect((await session(current)).statusCode).toBe(401);expect((await pool.query('SELECT count(*)::int AS n FROM identity_operator_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
});
it('enforces server-side idle expiry and fixed absolute expiry even with repeated activity',async()=>{
 const idle=await login();now+=15*60000;expect((await session(idle)).statusCode).toBe(401);now+=30000;const active=await login();
 for(let n=0;n<47;n++){now+=10*60000;expect((await session(active)).statusCode).toBe(200);}now=Date.parse(active.session.expiresAt);expect((await session(active)).statusCode).toBe(401);
});
it('recovery consumes one code atomically, replaces MFA on the same subject and revokes old sessions and remaining old codes',async()=>{
 const user=await login(),input={password,recoveryCode:recovery.recoveryCodes[0],newTotpSecret:replacement,code:code(replacement)};
 const result=await Promise.all([send('recover',input,{},'127.0.0.5'),send('recover',input,{},'127.0.0.6')]);expect(result.map(r=>r.statusCode).sort()).toEqual([200,401]);const recovered=result.find(r=>r.statusCode===200)!.json();expect(recovered.subject===recovery.subject).toBe(true);expect(recovered.recoveryCodes.length).toBe(10);expect((await session(user)).statusCode).toBe(401);
 now+=30000;expect((await send('recover',{...input,recoveryCode:recovery.recoveryCodes[1],code:code(replacement)})).statusCode).toBe(401);expect((await send('login',{password,code:code()})).statusCode).toBe(401);expect((await login(replacement)).session.subject).toBe(recovery.subject);
 expect((await pool.query('SELECT count(*)::int AS n FROM identity_operator')).rows[0].n).toBe(1);
});
it('durable account lockout survives changing IPs/service instances; IP limits do not trust forwarded headers',async()=>{
 for(let n=0;n<5;n++)expect((await send('login',{password:'incorrect-password-0000',code:code()}, {},'127.0.1.'+(n+1))).statusCode).toBe(401);
 await expect(new OperatorService(pool,authKey,()=>now).login({password,code:code()})).rejects.toMatchObject({status:429});
 now+=5*60000;expect((await login()).session.subject).toBe(recovery.subject);
 for(let n=0;n<5;n++)expect((await send('login',{password,code:code(),unexpected:true},{'x-forwarded-for':'198.51.100.'+n},'127.0.2.1')).statusCode).toBe(422);
 expect((await send('login',{password,code:code()},{'x-forwarded-for':'203.0.113.1'},'127.0.2.1')).statusCode).toBe(429);
});
it('audit is redacted, append-only and chained; stored sessions/recovery are hashed and TOTP is encrypted',async()=>{
 const user=await login();const response=await server.http.inject({url:'/v1/operator/audit',headers:{cookie:user.cookie}});expect(response.statusCode).toBe(200);
 for(const value of [password,secret,authKey,recovery.recoveryCodes[0],user.session.csrfToken])expect(response.body.includes(value)).toBe(false);
 const records=(await pool.query('SELECT * FROM identity_operator_audit ORDER BY sequence')).rows;let previous='0'.repeat(64);
 for(const row of records){expect(row.previous_hash===previous).toBe(true);const event=[row.subject,row.action,row.outcome,row.occurred_at.toISOString(),row.before_version,row.after_version,row.previous_hash];expect(row.event_hash===createHmac('sha256',Buffer.from(authKey,'hex')).update('operator:audit:v1:'+JSON.stringify(event)).digest('hex')).toBe(true);previous=row.event_hash;}
 await expect(pool.query("UPDATE identity_operator_audit SET outcome='denied'")).rejects.toThrow('immutable');await expect(pool.query('DELETE FROM identity_operator_audit')).rejects.toThrow('immutable');await expect(pool.query('TRUNCATE identity_operator_audit')).rejects.toThrow('immutable');
 const stored=JSON.stringify((await pool.query('SELECT * FROM identity_operator')).rows)+JSON.stringify((await pool.query('SELECT * FROM identity_operator_recovery')).rows)+JSON.stringify((await pool.query('SELECT * FROM identity_operator_sessions')).rows);
 for(const value of [password,secret,recovery.recoveryCodes[0],decodeURIComponent(user.cookie.split('=')[1])])expect(stored.includes(value)).toBe(false);
 await server.http.inject({url:'/health/live'});for(const value of [password,secret,authKey,recovery.recoveryCodes[0],user.session.csrfToken])expect(logs.join('').includes(value)).toBe(false);
});
it('actual TCP login/cookie/revoke works and public mutations cannot use player Origin',async()=>{
 await server.app.listen(0,'127.0.0.1');const url=await server.app.getUrl();
 const bad=await fetch(url+'/v1/operator/login',{method:'POST',headers:{origin:playerOrigin,'content-type':'application/json'},body:JSON.stringify({password,code:code()})});expect(bad.status).toBe(403);
 const response=await fetch(url+'/v1/operator/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({password,code:code()})});expect(response.status).toBe(200);const c=response.headers.get('set-cookie')!,s=OperatorSessionSchema.parse(await response.json());expect(c.includes('HttpOnly')&&c.includes('SameSite=Strict')&&!c.includes('Domain=')).toBe(true);
 const h={cookie:c.split(';')[0]};expect((await fetch(url+'/v1/operator/session',{headers:h})).status).toBe(200);expect((await fetch(url+'/v1/operator/logout',{method:'POST',headers:{...h,origin,'content-type':'application/json','x-csrf-token':s.csrfToken},body:'{}'})).status).toBe(200);expect((await fetch(url+'/v1/operator/session',{headers:h})).status).toBe(401);
});
it('deferred audit commit failure rolls back session issuance and TOTP consumption before any successful HTTP acknowledgement',async()=>{
 await pool.query("CREATE FUNCTION reject_operator_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='login' THEN RAISE EXCEPTION 'synthetic audit commit failure'; END IF; RETURN NEW; END $$");
 await pool.query('CREATE CONSTRAINT TRIGGER reject_operator_commit AFTER INSERT ON identity_operator_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_operator_commit()');
 const before=(await pool.query('SELECT totp_counter FROM identity_operator')).rows[0].totp_counter,result=await send('login',{password,code:code()});expect(result.statusCode).toBe(503);expect(result.headers['set-cookie']).toBeUndefined();
 expect((await pool.query('SELECT count(*)::int AS n FROM identity_operator_sessions')).rows[0].n).toBe(0);expect((await pool.query('SELECT totp_counter FROM identity_operator')).rows[0].totp_counter===before).toBe(true);expect((await pool.query("SELECT count(*)::int AS n FROM identity_operator_audit WHERE action='login'")).rows[0].n).toBe(0);
 await pool.query('DROP TRIGGER reject_operator_commit ON identity_operator_audit');expect((await login()).session.subject).toBe(recovery.subject);
});
it('real out-of-band CLI refuses unsafe input and second bootstrap; recovery output stays private and no session is issued',async()=>{
 const extra='operator_bootstrap_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${extra}"`);const address=new URL(process.env.TEST_DATABASE_URL!);address.searchParams.set('options','-c search_path='+extra);const db=new Pool({connectionString:address.toString()}),folder=await mkdtemp(join(tmpdir(),'city-operator-bootstrap-'));
 try{await migrate(db);const input=join(folder,'input.json'),output=join(folder,'recovery.json'),env={...process.env,NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:'synthetic-cli-player-secret-'.repeat(2),ADMIN_ORIGIN:origin,OPERATOR_AUTH_KEY:authKey};await writeFile(input,JSON.stringify({password,totpSecret:secret,code:totp(secret,Date.now())}),{mode:0o644});
  const run=(destination:string)=>promisify(execFile)(process.execPath,['--import','tsx','apps/platform-api/src/operator-bootstrap.ts',input,destination],{env,timeout:10000});
  await expect(run(output)).rejects.toMatchObject({code:1});expect((await db.query('SELECT count(*)::int AS n FROM identity_operator')).rows[0].n).toBe(0);await chmod(input,0o600);
  const concurrent=await Promise.allSettled([run(output),run(join(folder,'concurrent.json'))]);expect(concurrent.filter(r=>r.status==='fulfilled').length).toBe(1);expect(concurrent.filter(r=>r.status==='rejected').length).toBe(1);const result=concurrent.find(r=>r.status==='fulfilled')!;if(result.status!=='fulfilled')throw Error('CLI fixture did not bootstrap');expect(!result.value.stdout.includes(password)&&!result.value.stdout.includes(secret)).toBe(true);
  const winner=concurrent[0].status==='fulfilled'?output:join(folder,'concurrent.json'),stored=JSON.parse(await readFile(winner,'utf8'));expect((await stat(winner)).mode&0o777).toBe(0o600);expect(stored.recoveryCodes.length).toBe(10);expect((await db.query('SELECT count(*)::int AS n FROM identity_operator_sessions')).rows[0].n).toBe(0);
  await expect(run(join(folder,'second.json'))).rejects.toMatchObject({code:1});expect((await db.query('SELECT subject FROM identity_operator')).rows[0].subject===stored.subject).toBe(true);
 }finally{await db.end();await admin.query(`DROP SCHEMA "${extra}" CASCADE`);await rm(folder,{recursive:true,force:true});}
});
it('default-disabled routes and production secure cookie preserve the boundary without provisioning another identity',async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);await server.app.close();
 server=await createApp(readConfig({NODE_ENV:'test',SESSION_SECRET:'synthetic-disabled-player-secret-'.repeat(2),DATABASE_URL:url.toString()}),pool);
 expect((await server.http.inject('/v1/operator/session')).statusCode).toBe(404);await server.app.close();
 server=await createApp(readConfig({NODE_ENV:'production',SESSION_SECRET:'synthetic-production-player-secret-'.repeat(2),DATABASE_URL:url.toString(),ADMIN_ORIGIN:'https://admin.example.invalid',WEB_ORIGIN:'https://player.example.invalid',OPERATOR_AUTH_KEY:authKey}),pool,false,{now:()=>now});
 const result=await send('login',{password,code:code()},{origin:'https://admin.example.invalid'});expect(result.statusCode).toBe(200);const set=String(result.headers['set-cookie']);expect(set.startsWith('__Host-city_operator=')&&set.includes('Secure')&&set.includes('HttpOnly')&&set.includes('SameSite=Strict')&&!set.includes('Domain=')).toBe(true);
});
