import {beforeAll,beforeEach,afterEach,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
import {PrivateArtIntake} from '../../apps/platform-api/src/features/operations/modules/art-media/application/private-art';

let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,schema:string,now:number,key:string;
const origin='http://127.0.0.1:3400',factor='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='synthetic-private-art-operator-password';
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable DB required');admin=new Pool({connectionString:url.toString()});});
beforeEach(async()=>{
 schema='private_art_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);now=Date.now();key=randomBytes(32).toString('hex');
 await new OperatorService(pool,key,()=>now-60000).bootstrap({password,totpSecret:factor,code:totp(factor,now-60000)});
 server=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-art-player-secret-'.repeat(2),ADMIN_ORIGIN:origin,OPERATOR_AUTH_KEY:key}),pool,false,{now:()=>now});
});
afterEach(async()=>{await server?.app.close();await pool?.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});afterAll(async()=>{await admin.end();});
async function login(){const r=await server.http.inject({method:'POST',url:'/v1/operator/login',headers:{origin},payload:{password,code:totp(factor,now)}});expect(r.statusCode).toBe(200);return {cookie:String(r.headers['set-cookie']).split(';')[0],csrf:r.json().csrfToken as string};}
const input=()=>({requestId:randomUUID(),metadata:{characterId:'owned-fixture',designRevision:'fixture-v1',manifestSha256:'a'.repeat(64),provenanceSha256:'b'.repeat(64),file:{path:'fixture.wav',bytes:48,sha256:'c'.repeat(64),mime:'audio/wav'}}});
const send=(op:{cookie:string;csrf:string},payload:Record<string,unknown>)=>server.http.inject({method:'POST',url:'/v1/operator/art-intake',headers:{origin,cookie:op.cookie,'x-csrf-token':op.csrf},payload});
const read=(cookie:string,draftId:string)=>server.http.inject({url:'/v1/operator/art-draft?draftId='+draftId,headers:{cookie}});
it('fresh operator intake persists only an unreviewed unpublished declaration and private exact-ID read',async()=>{
 const op=await login(),body=input(),r=await send(op,body);expect(r.statusCode).toBe(200);expect(r.json()).toEqual({draftId:body.requestId,metadata:body.metadata,createdAt:new Date(now).toISOString(),publication:'UNPUBLISHED',artGate:'NOT_REVIEWED',contentVerification:'UNVERIFIED'});
 const got=await read(op.cookie,body.requestId);expect(got.json()).toEqual(r.json());expect(got.headers['cache-control']).toBe('private, no-store');expect(got.headers.vary).toBe('Cookie');
 const row=(await pool.query('SELECT * FROM operator_art_drafts')).rows[0];expect(row.operator_ref).toMatch(/^[a-f0-9]{64}$/);expect(row.operator_ref).not.toBe((await pool.query('SELECT subject FROM identity_operator')).rows[0].subject);
 expect((await server.http.inject({url:'/v1/operator/art-drafts',headers:{cookie:op.cookie}})).statusCode).toBe(404);expect((await read(op.cookie,randomUUID())).statusCode).toBe(404);
});
it('concurrent idempotent retries commit one declaration and a changed payload conflicts',async()=>{
 const op=await login(),body=input(),responses=await Promise.all([send(op,body),send(op,body)]);expect(responses.map(r=>r.statusCode)).toEqual([200,200]);expect(responses[0].json()).toEqual(responses[1].json());expect((await pool.query('SELECT 1 FROM operator_art_drafts')).rowCount).toBe(1);
 expect((await send(op,{...body,metadata:{...body.metadata,designRevision:'changed'}})).statusCode).toBe(409);expect((await pool.query('SELECT metadata FROM operator_art_drafts')).rows[0].metadata).toEqual(body.metadata);
});
it('player credentials, anonymous callers, duplicate cookies, Origin and CSRF cannot enter the operator boundary',async()=>{
 const op=await login(),guest=await server.identity.guest({requestId:randomUUID(),displayName:'Owned fixture',avatarKey:'mint'}),body=input();
 expect((await send({...op,cookie:''},body)).statusCode).toBe(401);expect((await send({...op,cookie:'city_operator='+guest.token},body)).statusCode).toBe(403);
 expect((await send({...op,cookie:op.cookie+'; '+op.cookie},body)).statusCode).toBe(401);expect((await send({...op,csrf:'0'.repeat(64)},body)).statusCode).toBe(403);
 expect((await server.http.inject({method:'POST',url:'/v1/operator/art-intake',headers:{origin:'https://attacker.invalid',cookie:op.cookie,'x-csrf-token':op.csrf},payload:body})).statusCode).toBe(403);
 expect((await read('city_operator='+guest.token,body.requestId)).statusCode).toBe(401);expect((await pool.query('SELECT 1 FROM operator_art_drafts')).rowCount).toBe(0);
});
it('strict metadata rejects traversal, MIME spoofing, oversized declarations, secrets, URLs and approval claims',async()=>{
 const op=await login(),base=input();
 for(const metadata of [
  {...base.metadata,endpoint:'https://t3.storage.dev'}, {...base.metadata,credentials:'SYNTHETIC_PRIVATE_SENTINEL'}, {...base.metadata,artGate:'PASS'}, {...base.metadata,publication:'PUBLISHED'},
  {...base.metadata,manifestSha256:'bad'}, {...base.metadata,provenanceSha256:null}, {...base.metadata,file:{...base.metadata.file,path:'../escape.wav'}},
  {...base.metadata,file:{...base.metadata.file,path:'nested//fixture.wav'}}, {...base.metadata,file:{...base.metadata.file,path:'hidden/.secret.wav'}},
  {...base.metadata,file:{...base.metadata.file,mime:'text/html'}}, {...base.metadata,file:{...base.metadata.file,path:'fixture.glb'}},
  {...base.metadata,file:{...base.metadata.file,bytes:256*1024*1024+1}},
 ])expect((await send(op,{...base,metadata})).statusCode).toBe(422);
 expect((await server.http.inject({method:'POST',url:'/v1/operator/art-intake?extra=1',headers:{origin,cookie:op.cookie,'x-csrf-token':op.csrf},payload:base})).statusCode).toBe(422);
 expect((await pool.query('SELECT 1 FROM operator_art_drafts')).rowCount).toBe(0);
});
it('fresh MFA expiry and session revocation prevent later reads and writes',async()=>{
 const op=await login(),body=input();expect((await send(op,body)).statusCode).toBe(200);now+=300001;expect((await read(op.cookie,body.requestId)).statusCode).toBe(403);expect((await send(op,input())).statusCode).toBe(403);
 now-=300001;await pool.query('UPDATE identity_operator_sessions SET revoked_at=clock_timestamp()');expect((await read(op.cookie,body.requestId)).statusCode).toBe(401);
});
it('deferred commit failure returns no accepted receipt and rolls back intake',async()=>{
 const op=await login();await pool.query("CREATE FUNCTION fail_art_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic intake failure'; END $$;CREATE CONSTRAINT TRIGGER fail_art_commit AFTER INSERT ON operator_art_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_art_commit()");
 expect((await send(op,input())).statusCode).toBe(503);expect((await pool.query('SELECT 1 FROM operator_art_drafts')).rowCount).toBe(0);
});
it('database prevents rewriting draft state or metadata and grants no PUBLIC table privileges',async()=>{
 const op=await login();expect((await send(op,input())).statusCode).toBe(200);
 for(const sql of ["UPDATE operator_art_drafts SET publication='PUBLISHED'","UPDATE operator_art_drafts SET metadata='{}'",'DELETE FROM operator_art_drafts','TRUNCATE operator_art_drafts'])await expect(pool.query(sql)).rejects.toThrow('immutable');
 expect((await pool.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.relname='operator_art_drafts' AND n.nspname=$1 AND a.grantee=0",[schema])).rowCount).toBe(0);
});
it('concurrent operator requests share the intake budget while a prior accepted retry remains stable',async()=>{
 const op=await login(),body=input(),first=await send(op,body);expect(first.statusCode).toBe(200);
 await pool.query("INSERT INTO operator_art_drafts(id,fingerprint,operator_ref,metadata,created_at) SELECT gen_random_uuid(),$1,$1,$2,clock_timestamp() FROM generate_series(1,28)",['d'.repeat(64),body.metadata]);
 const responses=await Promise.all([send(op,input()),send(op,input())]);expect(responses.map(r=>r.statusCode).sort()).toEqual([200,429]);expect((await pool.query('SELECT 1 FROM operator_art_drafts')).rowCount).toBe(30);
 expect((await send(op,body)).json()).toEqual(first.json());
});
it('operator intake and read are unavailable when operator authentication is not configured',async()=>{
 await server.app.close();server=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:pool.options.connectionString,SESSION_SECRET:'synthetic-art-disabled-secret-'.repeat(2)}),pool);
 expect((await server.http.inject({method:'POST',url:'/v1/operator/art-intake',payload:input()})).statusCode).toBe(404);expect((await read('',randomUUID())).statusCode).toBe(404);
});
it('MFA expiring after the actual INSERT rolls back the draft in the existing operator transaction',async()=>{
 const op=await login(),proxy=new Proxy(pool,{get(object,property){if(property==='connect')return async()=>{const client=await pool.connect();return new Proxy(client,{get(connection,name){if(name==='query')return async(sql:string,values?:unknown[])=>{const result=await client.query(sql,values);if(sql.startsWith('INSERT INTO operator_art_drafts'))now+=300001;return result;};const value=Reflect.get(connection,name);return typeof value==='function'?value.bind(connection):value;}});};const value=Reflect.get(object,property);return typeof value==='function'?value.bind(object):value;}});
 await expect(new PrivateArtIntake(new OperatorService(proxy,key,()=>now),()=>now).intake(op.cookie.split('=')[1],op.csrf,input())).rejects.toMatchObject({status:403});expect((await pool.query('SELECT 1 FROM operator_art_drafts')).rowCount).toBe(0);
});
