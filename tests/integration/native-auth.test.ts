import {beforeAll,afterAll,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {NativeSessionResultSchema,NativeTicketResultSchema,NativeDevicesSchema} from '@virtual-city/contracts';
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>;
const schema='native_auth_'+randomUUID().replaceAll('-',''),origin='http://127.0.0.1:3300';
let offset=0,ip=1;const now=()=>Date.now()+offset,logs:string[]=[];
beforeAll(async()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);server=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'native-auth-test-only-browser-secret-00001',NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:'1'.repeat(64)}),pool,true,{now,logStream:{write:message=>{logs.push(message);}}});});
afterEach(()=>{offset=0;});
afterAll(async()=>{await server?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
const guestInput=()=>({schemaVersion:1,platform:'android',clientBuild:'android-debug-v1',protocol:{nonce:randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]},deviceLabel:'Synthetic Android',guest:{requestId:randomUUID(),displayName:'Native Visitor',avatarKey:'fern'}});
const client=()=>{const value=guestInput();return{schemaVersion:value.schemaVersion,platform:value.platform,clientBuild:value.clientBuild,protocol:value.protocol};};
async function guest(){const response=await server.http.inject({method:'POST',url:'/v1/native/session/guest',remoteAddress:'127.77.0.'+ip++,payload:guestInput()});expect(response.statusCode).toBe(201);return NativeSessionResultSchema.parse(response.json());}
const bearer=(user:Awaited<ReturnType<typeof guest>>)=>({authorization:'Bearer '+user.tokens.accessToken});
const refresh=(token:string)=>server.http.inject({method:'POST',url:'/v1/native/session/refresh',payload:{...client(),refreshToken:token}});
it('creates a separate native session without setting a browser cookie or accepting browser-origin bootstrap',async()=>{
 const body=guestInput();const denied=await server.http.inject({method:'POST',url:'/v1/native/session/guest',headers:{origin},payload:body});expect(denied.statusCode).toBe(403);
 const response=await server.http.inject({method:'POST',url:'/v1/native/session/guest',payload:body});expect(response.statusCode).toBe(201);expect(response.headers['set-cookie']).toBeUndefined();const result=NativeSessionResultSchema.parse(response.json());expect(result.tokens.accessToken.startsWith('na1.')).toBe(true);expect(result.tokens.refreshToken.startsWith('nr1.')).toBe(true);
 const me=await server.http.inject({url:'/v1/me',headers:{authorization:'Bearer '+result.tokens.accessToken}});expect(me.statusCode).toBe(200);expect(me.json().profile.id).toBe(result.me.profile.id);
});
it('rejects ambient browser credentials,cross-channel bearer values and native access on cookie-issuing endpoints',async()=>{
 const user=await guest();for(const headers of [{...bearer(user),origin},{...bearer(user),cookie:'city_session=ambient'}])expect((await server.http.inject({url:'/v1/me',headers})).statusCode).toBe(403);
 const signed=server.http.signCookie(user.tokens.accessToken);expect((await server.http.inject({url:'/v1/me',headers:{cookie:'city_session='+encodeURIComponent(signed)}})).statusCode).toBe(401);
 expect((await server.http.inject({url:'/v1/me',headers:{authorization:'Bearer '+user.tokens.refreshToken}})).statusCode).toBe(401);
 const blocked=await server.http.inject({method:'POST',url:'/v1/session/rotate',headers:bearer(user),payload:{}});expect(blocked.statusCode).toBe(403);expect(blocked.headers['set-cookie']).toBeUndefined();
});
it('preserves CSRF/idempotency on normal native API mutations and rechecks grant expiry after an actual account-lock wait',async()=>{
 const user=await guest(),payload={displayName:'Native Renamed'};
 expect((await server.http.inject({method:'PATCH',url:'/v1/me',headers:{...bearer(user),'idempotency-key':randomUUID()},payload})).statusCode).toBe(403);
 const headers={...bearer(user),'x-csrf-token':user.me.csrfToken,'idempotency-key':randomUUID()};expect((await server.http.inject({method:'PATCH',url:'/v1/me',headers,payload})).statusCode).toBe(200);
 const blocker=await pool.connect();let pending:ReturnType<typeof server.http.inject>|undefined;
 try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account:'+user.me.profile.id]);pending=server.http.inject({method:'PATCH',url:'/v1/me',headers:{...headers,'idempotency-key':randomUUID()},payload:{displayName:'Must Not Commit'}});void pending.then(()=>{});
  let waiting=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount){waiting=true;break;}await new Promise(ok=>setTimeout(ok,10));}expect(waiting).toBe(true);offset=300100;await blocker.query('COMMIT');expect((await pending).statusCode).toBe(401);expect((await pool.query('SELECT display_name FROM identity_profiles WHERE account_id=$1',[user.me.profile.id])).rows[0].display_name).toBe('Native Renamed');
 }finally{await blocker.query('ROLLBACK');blocker.release();await pending;}
});
it('rotates refresh once,keeps a random wrong secret from revoking the family,and revokes all grants on a known replay',async()=>{
 const user=await guest(),wrong='nr1.'+user.tokens.deviceId+'.'+'0'.repeat(64);expect((await refresh(wrong)).statusCode).toBe(401);expect((await server.http.inject({url:'/v1/me',headers:bearer(user)})).statusCode).toBe(200);
 const rotated=await refresh(user.tokens.refreshToken);expect(rotated.statusCode).toBe(200);const next=NativeSessionResultSchema.parse(rotated.json());expect(next.tokens.refreshToken===user.tokens.refreshToken).toBe(false);expect(next.me.profile.id).toBe(user.me.profile.id);
 expect((await refresh(user.tokens.refreshToken)).statusCode).toBe(401);expect((await server.http.inject({url:'/v1/me',headers:bearer(next)})).statusCode).toBe(401);expect((await refresh(next.tokens.refreshToken)).statusCode).toBe(401);
 const row=(await pool.query('SELECT revoked_at FROM native_device_sessions WHERE id=$1',[user.tokens.deviceId])).rows[0];expect(row.revoked_at).not.toBeNull();
});
it('a refresh race issues at most one successor and fails closed by revoking the replayed family',async()=>{
 const user=await guest(),responses=await Promise.all([refresh(user.tokens.refreshToken),refresh(user.tokens.refreshToken)]);expect(responses.every(response=>[200,401].includes(response.statusCode))).toBe(true);expect(responses.filter(response=>response.statusCode===200).length).toBeLessThanOrEqual(1);
 expect((await pool.query('SELECT revoked_at FROM native_device_sessions WHERE id=$1',[user.tokens.deviceId])).rows[0].revoked_at).not.toBeNull();expect((await pool.query('SELECT count(*)::int AS n FROM native_refresh_spent WHERE device_id=$1',[user.tokens.deviceId])).rows[0].n).toBe(1);
});
it('refreshes after access expiry while keeping the family and identity unchanged',async()=>{
 const user=await guest();offset=300100;expect((await server.http.inject({url:'/v1/me',headers:bearer(user)})).statusCode).toBe(401);const result=await refresh(user.tokens.refreshToken);expect(result.statusCode).toBe(200);const next=NativeSessionResultSchema.parse(result.json());expect(next.tokens.deviceId).toBe(user.tokens.deviceId);expect(next.me.profile.id).toBe(user.me.profile.id);expect((await server.http.inject({url:'/v1/me',headers:bearer(next)})).statusCode).toBe(200);
});
it('binds tickets to the current grant and exact protocol and rejects incompatible negotiation without cookies',async()=>{
 const user=await guest(),offer=client();const response=await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:bearer(user),payload:offer});expect(response.statusCode).toBe(200);const ticket=NativeTicketResultSchema.parse(response.json());expect(ticket.selection.nonce).toBe(offer.protocol.nonce);
 expect((await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:bearer(user),payload:{...offer,protocol:{...offer.protocol,versions:[99]}}})).statusCode).toBe(409);
 expect((await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:{...bearer(user),cookie:'city_session=ambient'},payload:offer})).statusCode).toBe(403);
});
it('revoke/logout remain account scoped and ciphertext/hash storage never appears in export or operational logs',async()=>{
 const user=await guest(),other=await guest(),devices=NativeDevicesSchema.parse((await server.http.inject({url:'/v1/native/devices',headers:bearer(user)})).json());expect(devices.devices.map(device=>device.deviceId)).toEqual([user.tokens.deviceId]);
 expect((await server.http.inject({method:'POST',url:'/v1/native/devices/revoke',headers:bearer(user),payload:{schemaVersion:1,deviceId:other.tokens.deviceId}})).statusCode).toBe(404);expect((await server.http.inject({url:'/v1/me',headers:bearer(other)})).statusCode).toBe(200);
 const exported=await server.http.inject({url:'/v1/me/export',headers:bearer(user)});expect(exported.statusCode).toBe(200);for(const secret of [user.tokens.accessToken,user.tokens.refreshToken,'credential_ciphertext','refresh_hash','token_hash'])expect(exported.body.includes(secret)).toBe(false);
 const logText=logs.join('\n');for(const token of [user.tokens.accessToken,user.tokens.refreshToken])expect(logText.includes(token)).toBe(false);
 const logout=()=>server.http.inject({method:'POST',url:'/v1/native/session/logout',payload:{schemaVersion:1,refreshToken:user.tokens.refreshToken}});expect((await logout()).statusCode).toBe(200);expect((await logout()).statusCode).toBe(200);expect((await server.http.inject({url:'/v1/me',headers:bearer(user)})).statusCode).toBe(401);
});
it('keeps native disabled without a key and refuses missing/shared-key or overlapping-origin activation',async()=>{
 const base={NODE_ENV:'test',DATABASE_URL:process.env.TEST_DATABASE_URL,SESSION_SECRET:'native-disabled-test-browser-secret-0001'};expect(readConfig(base).NATIVE_AUTH_ENABLED).toBe('0');expect(()=>readConfig({...base,NATIVE_AUTH_ENABLED:'1'})).toThrow('NATIVE_AUTH_KEY');expect(()=>readConfig({...base,SESSION_SECRET:'1'.repeat(64),NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:'1'.repeat(64)})).toThrow('NATIVE_AUTH_KEY');expect(()=>readConfig({...base,NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:'1'.repeat(64),WEB_ORIGIN:'https://localhost'})).toThrow('NATIVE_AUTH_ENABLED');
 const disabled=await createApp(readConfig(base),pool);try{expect((await disabled.http.inject({method:'POST',url:'/v1/native/session/guest',headers:{origin},payload:guestInput()})).statusCode).toBe(404);const user=await guest();expect((await disabled.http.inject({url:'/v1/me',headers:bearer(user)})).statusCode).toBe(401);}finally{await disabled.app.close();}
});
it('keeps native and browser bootstrap namespaces distinct and exact native retries in one family',async()=>{
 const body=guestInput(),post=()=>server.http.inject({method:'POST',url:'/v1/native/session/guest',remoteAddress:'127.79.0.'+ip++,payload:body}),a=await post(),b=await post();expect(a.statusCode).toBe(201);expect(b.statusCode).toBe(200);const first=NativeSessionResultSchema.parse(a.json()),second=NativeSessionResultSchema.parse(b.json());expect(first.tokens.deviceId).toBe(second.tokens.deviceId);expect(first.tokens.refreshToken===second.tokens.refreshToken).toBe(true);
 const browser=await server.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin},payload:body.guest});expect(browser.statusCode).toBe(201);expect(browser.json().profile.id===first.me.profile.id).toBe(false);expect((await pool.query('SELECT count(*)::int AS n FROM native_device_sessions WHERE account_id=$1',[first.me.profile.id])).rows[0].n).toBe(1);
});
it('upgrades and signs in the same registered identity while device revoke closes only the chosen native session',async()=>{
 const user=await guest(),credentials={loginName:'native_'+randomUUID().replaceAll('-','').slice(0,16),password:'synthetic-native-password-only'},upgraded=await server.http.inject({method:'POST',url:'/v1/native/session/upgrade',headers:bearer(user),payload:{...client(),requestId:randomUUID(),upgrade:credentials}});expect(upgraded.statusCode).toBe(200);const phone=NativeSessionResultSchema.parse(upgraded.json());expect(phone.me.profile.id).toBe(user.me.profile.id);expect(phone.me.kind).toBe('registered');expect((await refresh(user.tokens.refreshToken)).statusCode).toBe(401);
 const signed=await server.http.inject({method:'POST',url:'/v1/native/session/login',payload:{...client(),deviceLabel:'Synthetic tablet',login:{...credentials,requestId:randomUUID()}}});expect(signed.statusCode).toBe(200);expect(signed.headers['set-cookie']).toBeUndefined();const tablet=NativeSessionResultSchema.parse(signed.json());expect(tablet.me.profile.id).toBe(phone.me.profile.id);const devices=NativeDevicesSchema.parse((await server.http.inject({url:'/v1/native/devices',headers:bearer(phone)})).json());expect(devices.devices).toHaveLength(2);
 expect((await server.http.inject({method:'POST',url:'/v1/native/devices/revoke',headers:bearer(phone),payload:{schemaVersion:1,deviceId:tablet.tokens.deviceId}})).statusCode).toBe(200);expect((await server.http.inject({url:'/v1/me',headers:bearer(tablet)})).statusCode).toBe(401);expect((await refresh(tablet.tokens.refreshToken)).statusCode).toBe(401);expect((await server.http.inject({url:'/v1/me',headers:bearer(phone)})).statusCode).toBe(200);
});
it('account erasure cascades native credentials,grants,spent refresh and tickets',async()=>{
 const user=await guest(),rotated=await refresh(user.tokens.refreshToken);expect(rotated.statusCode).toBe(200);const current=NativeSessionResultSchema.parse(rotated.json());expect((await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:bearer(current),payload:client()})).statusCode).toBe(200);
 expect((await server.http.inject({method:'DELETE',url:'/v1/me',headers:{...bearer(current),'x-csrf-token':current.me.csrfToken,'idempotency-key':randomUUID()},payload:{}})).statusCode).toBe(200);
 for(const table of ['native_device_sessions','native_access_grants','native_refresh_spent','native_socket_tickets']){const column=table==='native_device_sessions'?'id':'device_id';expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`,[user.tokens.deviceId])).rows[0].n).toBe(0);}expect((await refresh(current.tokens.refreshToken)).statusCode).toBe(401);
});
it('rejects a stale expected native account before issuing any room ticket and retains the legacy ticket lane',async()=>{
 const user=await guest(),body=client(),count=async()=>Number((await pool.query('SELECT count(*)::int AS n FROM native_socket_tickets WHERE account_id=$1',[user.me.profile.id])).rows[0].n);
 expect(await count()).toBe(0);
 const wrong=await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:{...bearer(user),'x-native-account-id':randomUUID()},payload:body});expect(wrong.statusCode).toBe(409);expect(await count()).toBe(0);
 expect((await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:{...bearer(user),'x-native-account-id':user.me.profile.id},payload:body})).statusCode).toBe(200);expect(await count()).toBe(1);
 expect((await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:bearer(user),payload:client()})).statusCode).toBe(200);expect(await count()).toBe(2);
});
it('honors native stale-view assertions on catalog,discovery and travel without changing unasserted legacy reads',async()=>{
 const user=await guest(),wrong={...bearer(user),'x-native-account-id':randomUUID()},own={...bearer(user),'x-native-account-id':user.me.profile.id};
 for(const url of ['/v1/worlds','/v1/client-compatibility','/v1/me/room','/v1/travel-intents/'+randomUUID()])expect((await server.http.inject({url,headers:wrong})).statusCode).toBe(409);
 expect((await server.http.inject({method:'POST',url:'/v1/travel-intents',headers:{...wrong,'x-csrf-token':user.me.csrfToken,'idempotency-key':randomUUID()},payload:{}})).statusCode).toBe(409);
 for(const url of ['/v1/worlds','/v1/client-compatibility']){expect((await server.http.inject({url,headers:own})).statusCode).toBe(200);expect((await server.http.inject({url,headers:bearer(user)})).statusCode).toBe(200);}
 expect((await server.http.inject({url:'/v1/me/room',headers:own})).statusCode).toBe(200);
});
