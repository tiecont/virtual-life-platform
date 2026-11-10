import {beforeAll,afterAll,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {io,type Socket} from 'socket.io-client';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {NativeSessionResultSchema} from '@virtual-city/contracts';
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,target:string,offset=0,ip=1;
const now=()=>Date.now()+offset,schema='native_delete_'+randomUUID().replaceAll('-','');
const failErasure=new Set<string>();
const client=()=>({schemaVersion:1,platform:'android',clientBuild:'android-debug-1',protocol:{nonce:randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]}});
beforeAll(async()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);server=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'native-delete-only-browser-secret-000001',NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:'3'.repeat(64)}),pool,true,{now});await server.app.listen(0,'127.0.0.1');target=await server.app.getUrl();});
afterEach(()=>{offset=0;failErasure.clear();});afterAll(async()=>{await server?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function guest(){const response=await server.http.inject({method:'POST',url:'/v1/native/session/guest',remoteAddress:'127.79.0.'+ip++,payload:{...client(),deviceLabel:'Synthetic deletion AVD',guest:{requestId:randomUUID(),displayName:'Deletion Visitor',avatarKey:'fern'}}});expect(response.statusCode).toBe(201);return NativeSessionResultSchema.parse(response.json());}
const body=(user:Awaited<ReturnType<typeof guest>>)=>({schemaVersion:1,requestId:randomUUID(),expectedAccountId:user.me.profile.id,confirmDelete:true});
const headers=(user:Awaited<ReturnType<typeof guest>>)=>({authorization:'Bearer '+user.tokens.accessToken,'x-csrf-token':user.me.csrfToken});
const deletion=(user:Awaited<ReturnType<typeof guest>>,payload:unknown=body(user),extra={})=>server.http.inject({method:'DELETE',url:'/v1/native/account',headers:{...headers(user),...extra},payload});
it('requires explicit confirmation,matching account and CSRF; ambient browser credentials never erase an account',async()=>{
 const user=await guest();
 for(const payload of [{...body(user),confirmDelete:false},{...body(user),confirmDelete:'true'},{...body(user),accountId:randomUUID()}])expect((await deletion(user,payload)).statusCode).toBe(422);
 expect((await deletion(user,{...body(user),expectedAccountId:randomUUID()})).statusCode).toBe(409);
 expect((await deletion(user,body(user),{'x-csrf-token':'0'.repeat(64)})).statusCode).toBe(403);
 for(const extra of [{origin:'http://127.0.0.1:3300'},{cookie:'city_session=ambient'}])expect((await deletion(user,body(user),extra)).statusCode).toBe(403);
 expect((await pool.query('SELECT 1 FROM identity_accounts WHERE id=$1',[user.me.profile.id])).rowCount).toBe(1);
});
it('confirms committed own deletion without cookies and erases native custody,credentials and profile while another account survives',async()=>{
 const user=await guest(),other=await guest(),response=await deletion(user);expect(response.statusCode).toBe(200);expect(response.json()).toEqual({schemaVersion:1,deleted:true});expect(response.headers['set-cookie']).toBeUndefined();
 for(const table of ['identity_accounts','identity_profiles','identity_sessions','native_device_sessions']){const key=table==='identity_accounts'?'id':'account_id';expect((await pool.query('SELECT 1 FROM '+table+' WHERE '+key+'=$1',[user.me.profile.id])).rowCount).toBe(0);}
 expect((await server.http.inject({url:'/v1/me',headers:headers(other)})).statusCode).toBe(200);expect((await server.http.inject({url:'/v1/me',headers:headers(user)})).statusCode).toBe(401);
 expect((await server.http.inject({method:'POST',url:'/v1/native/session/refresh',payload:{...client(),refreshToken:user.tokens.refreshToken}})).statusCode).toBe(401);
});
it('withdraws a real live native socket after commit and keeps old grants unusable',async()=>{
 const user=await guest(),offer=client(),issued=await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:headers(user),payload:offer});expect(issued.statusCode).toBe(200);
 const socket:Socket=io(target,{autoConnect:false,forceNew:true,reconnection:false,timeout:2000,transports:['websocket'],extraHeaders:{origin:'https://localhost'},auth:{schemaVersion:1,nativeTicket:issued.json().ticket,protocol:offer.protocol}});
 try{await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',()=>no(Error('Native socket unavailable')));socket.connect();});const closed=new Promise<void>(ok=>socket.once('disconnect',()=>ok()));expect((await deletion(user)).statusCode).toBe(200);await closed;expect(socket.connected).toBe(false);}finally{socket.close();}
});
it('expiry during an actual account-lock wait cannot erase data',async()=>{
 const user=await guest(),blocker=await pool.connect();let pending:ReturnType<typeof server.http.inject>|undefined;
 try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account:'+user.me.profile.id]);pending=deletion(user);void pending.then(()=>{});let waiting=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount){waiting=true;break;}await new Promise(ok=>setTimeout(ok,10));}expect(waiting).toBe(true);offset=300100;await blocker.query('COMMIT');expect((await pending).statusCode).toBe(401);expect((await pool.query('SELECT 1 FROM identity_accounts WHERE id=$1',[user.me.profile.id])).rowCount).toBe(1);}finally{await blocker.query('ROLLBACK');blocker.release();await pending;}
});
it('concurrent confirmations never duplicate deletion effects and post-delete retry does not fabricate a receipt',async()=>{
 const user=await guest(),payload=body(user),before=(await pool.query('SELECT count(*)::int AS n FROM identity_deletion_receipts')).rows[0].n,results=await Promise.all([deletion(user,payload),deletion(user,payload)]);expect(results.every(response=>[200,401].includes(response.statusCode))).toBe(true);expect(results.some(response=>response.statusCode===200)).toBe(true);expect((await pool.query('SELECT count(*)::int AS n FROM identity_deletion_receipts')).rows[0].n-before).toBe(1);expect((await deletion(user,payload)).statusCode).toBe(401);
});
it('domain erasure failure rolls back deletion and its receipt; unchanged confirmation can retry safely',async()=>{
 server.identity.registerDeletionOwner('mobile-policy-failure',async id=>{if(failErasure.has(id))throw Error('Synthetic domain erasure failure');});
 const user=await guest(),payload=body(user),before=(await pool.query('SELECT count(*)::int AS n FROM identity_deletion_receipts')).rows[0].n;failErasure.add(user.me.profile.id);expect((await deletion(user,payload)).statusCode).toBe(503);expect((await server.http.inject({url:'/v1/me',headers:headers(user)})).statusCode).toBe(200);expect((await pool.query('SELECT count(*)::int AS n FROM identity_deletion_receipts')).rows[0].n).toBe(before);failErasure.clear();expect((await deletion(user,payload)).statusCode).toBe(200);
});
