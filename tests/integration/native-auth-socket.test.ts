import {beforeAll,afterAll,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {io,type Socket} from 'socket.io-client';
import {NativeSessionResultSchema,NativeTicketResultSchema,NATIVE_ANDROID_ORIGIN,SessionCheckAckSchema} from '@virtual-city/contracts';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {NativeCredentialsCrypto} from '../../apps/platform-api/src/identity/native-crypto';
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,target:string;
let offset=0,ip=1;const now=()=>Date.now()+offset,origin='http://127.0.0.1:3300',key='2'.repeat(64),schema='native_socket_'+randomUUID().replaceAll('-',''),sockets=new Set<Socket>();
const offer=()=>({nonce:randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]});
const client=()=>({schemaVersion:1,platform:'android',clientBuild:'android-debug-v1',protocol:offer()});
beforeAll(async()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);server=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'native-socket-only-browser-secret-0000001',NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:key}),pool,false,{now});await server.app.listen(0,'127.0.0.1');target=await server.app.getUrl();});
afterEach(()=>{offset=0;for(const socket of sockets)socket.close();sockets.clear();});
afterAll(async()=>{for(const socket of sockets)socket.close();await server?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function guest(){const response=await server.http.inject({method:'POST',url:'/v1/native/session/guest',remoteAddress:'127.78.0.'+ip++,payload:{...client(),deviceLabel:'Synthetic socket device',guest:{requestId:randomUUID(),displayName:'Native Socket Visitor',avatarKey:'fern'}}});expect(response.statusCode).toBe(201);return NativeSessionResultSchema.parse(response.json());}
async function ticket(user:Awaited<ReturnType<typeof guest>>){const input=client(),response=await server.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:{authorization:'Bearer '+user.tokens.accessToken},payload:input});expect(response.statusCode).toBe(200);return{...NativeTicketResultSchema.parse(response.json()),protocol:input.protocol};}
function connect(auth:Record<string,unknown>,options:{origin?:string;cookie?:string}={}){const socket=io(target,{autoConnect:false,forceNew:true,reconnection:false,timeout:2000,transports:['websocket'],extraHeaders:{origin:options.origin??NATIVE_ANDROID_ORIGIN,...options.cookie?{cookie:options.cookie}:{}},auth});sockets.add(socket);const selections:unknown[]=[];socket.on('session.compatibility',value=>selections.push(value));return new Promise<{socket:Socket;selections:unknown[]}>((resolve,reject)=>{socket.once('connect',()=>resolve({socket,selections}));socket.once('connect_error',error=>{socket.close();reject(error);});socket.connect();});}
const auth=(value:Awaited<ReturnType<typeof ticket>>)=>({schemaVersion:1,nativeTicket:value.ticket,protocol:value.protocol});
async function check(socket:Socket){return SessionCheckAckSchema.parse(await socket.timeout(2000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()}));}
function disconnected(socket:Socket,timeout=3000){return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Own native socket did not close')),timeout);socket.once('disconnect',()=>{clearTimeout(timer);resolve();});});}
it('accepts actual TCP native ticket auth,echoes the negotiated nonce and atomically rejects replay',async()=>{
 const user=await guest(),grant=await ticket(user),connected=await connect(auth(grant));expect((await check(connected.socket)).ok).toBe(true);expect(connected.selections).toContainEqual(grant.selection);await expect(connect(auth(grant))).rejects.toBeDefined();
});
it('allows exactly one concurrent ticket consumer',async()=>{const user=await guest(),grant=await ticket(user),results=await Promise.allSettled([connect(auth(grant)),connect(auth(grant))]);expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(1);expect((await pool.query('SELECT count(*)::int AS n FROM native_socket_tickets WHERE device_id=$1 AND consumed_at IS NOT NULL',[user.tokens.deviceId])).rows[0].n).toBe(1);});
it('rejects a consumed ticket that expires during the final identity reauthentication await',async()=>{
 const user=await guest(),grant=await ticket(user),original=server.identity.authenticate;
 server.identity.authenticate=async function(token:string){const context=await original.call(this,token);if(token.startsWith('ni1.'))offset=31000;return context;};
 try{const admitted=await connect(auth(grant)).then(()=>true,()=>false);expect(admitted).toBe(false);}finally{server.identity.authenticate=original;offset=0;}
});
it('rejects wrong protocol,expiry and browser-origin use of a native ticket',async()=>{
 const user=await guest(),grant=await ticket(user);await expect(connect({...auth(grant),protocol:{...grant.protocol,nonce:randomUUID()}})).rejects.toBeDefined();await expect(connect(auth(grant),{origin})).rejects.toBeDefined();expect((await check((await connect(auth(grant))).socket)).ok).toBe(true);
 const expired=await ticket(user);offset=31000;await expect(connect(auth(expired))).rejects.toBeDefined();
});
it('does not admit a ticket that expires during an actual canonical account-lock wait',async()=>{
 const user=await guest(),grant=await ticket(user),blocker=await pool.connect();let attempt:Promise<boolean>|undefined;
 try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['account:'+user.me.profile.id]);attempt=connect(auth(grant)).then(()=>true,()=>false);let waiting=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'")).rowCount){waiting=true;break;}await new Promise(ok=>setTimeout(ok,10));}expect(waiting).toBe(true);offset=31000;await blocker.query('COMMIT');expect(await attempt).toBe(false);expect((await pool.query('SELECT consumed_at FROM native_socket_tickets WHERE token_hash=$1',[server.identity.hash(grant.ticket)])).rows[0].consumed_at).toBeNull();}finally{await blocker.query('ROLLBACK');blocker.release();await attempt;}
});
it('preserves the browser cookie/CSRF handshake and rejects ambient cookies on the installed native origin',async()=>{
 const response=await server.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin},payload:{requestId:randomUUID(),displayName:'Browser Socket Visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);const cookie=String(response.headers['set-cookie']).split(';')[0],browser={schemaVersion:1,csrfToken:response.json().csrfToken};expect((await check((await connect(browser,{origin,cookie})).socket)).ok).toBe(true);await expect(connect(browser,{cookie})).rejects.toBeDefined();const user=await guest(),grant=await ticket(user);await expect(connect(auth(grant),{cookie})).rejects.toBeDefined();
});
it('does not accept an internal grant reference even inside a correctly signed browser cookie',async()=>{
 const user=await guest(),row=(await pool.query<{id:string}>('SELECT id FROM native_access_grants WHERE token_hash=$1',[server.identity.hash(user.tokens.accessToken)])).rows[0],reference=new NativeCredentialsCrypto(key).grantCredential(row.id),cookie='city_session='+encodeURIComponent(server.http.signCookie(reference));await expect(connect({schemaVersion:1,csrfToken:server.identity.csrf(reference)},{origin,cookie})).rejects.toBeDefined();
});
it('logout closes a live native socket and an external database revoke is rechecked on the next command',async()=>{
 const user=await guest(),socket=(await connect(auth(await ticket(user)))).socket;expect((await check(socket)).ok).toBe(true);const closed=disconnected(socket);expect((await server.http.inject({method:'POST',url:'/v1/native/session/logout',payload:{schemaVersion:1,refreshToken:user.tokens.refreshToken}})).statusCode).toBe(200);await closed;
 const other=await guest(),live=(await connect(auth(await ticket(other)))).socket;const revoked=disconnected(live);await pool.query("UPDATE identity_sessions SET revoked_at=$2,revoked_reason='operator' WHERE id=(SELECT identity_session_id FROM native_device_sessions WHERE id=$1)",[other.tokens.deviceId,new Date(now())]);expect((await check(live)).ok).toBe(false);await revoked;
});
it('the actual expiry timer closes a live lease at its shortened fixture grant deadline',async()=>{
 const user=await guest();await pool.query('UPDATE native_access_grants SET expires_at=$2 WHERE token_hash=$1',[server.identity.hash(user.tokens.accessToken),new Date(now()+2000)]);const socket=(await connect(auth(await ticket(user)))).socket;expect((await check(socket)).ok).toBe(true);await disconnected(socket,4000);
});
