import {beforeAll,afterAll,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join as joinPath} from 'node:path';
import {tmpdir} from 'node:os';
import {io,type Socket} from 'socket.io-client';
import {MeSchema,RoomAckSchema,ChatAckSchema,type RoomSnapshot,type Me} from '@virtual-city/contracts';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {migrate} from '../../apps/platform-api/src/db/migrations';
import {releasePolicyFixture} from '../support/release-policy-fixture';
const origin='https://synthetic.example.invalid',clients=new Set<Socket>();let admin:Pool,serial=0;
const opened:{app:Awaited<ReturnType<typeof createApp>>;pool:Pool;schema:string;directory:string}[]=[];
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))||url.search||url.hash)throw Error('Disposable local test DB only');admin=new Pool({connectionString:url.toString()});});
afterEach(async()=>{for(const socket of clients)socket.close();clients.clear();for(const r of opened.splice(0)){await r.app.app.close();await r.pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${r.schema}" CASCADE`);await rm(r.directory,{recursive:true,force:true});}});
afterAll(async()=>{await admin.end();});
async function open(closed=false){
 const schema='release_test_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);const pool=new Pool({connectionString:url.toString()});await migrate(pool);
 const directory=await mkdtemp(joinPath(tmpdir(),'city-release-policy-')),data=releasePolicyFixture(),releaseFile=joinPath(directory,'release.json'),runtimeFile=joinPath(directory,'runtime.json'),safetyFile=joinPath(directory,'safety.json');
 await writeFile(releaseFile,closed?await readFile('config/release-policy.json'):JSON.stringify(data.release));await writeFile(runtimeFile,closed?await readFile('config/runtime-world-policy.json'):JSON.stringify(data.runtime));await writeFile(safetyFile,closed?await readFile('config/safety-policy.json'):JSON.stringify(data.safety));
 const config=readConfig({NODE_ENV:'production',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-production-policy-key-'.repeat(2),WEB_ORIGIN:origin,RELEASE_ENVIRONMENT:'production',RELEASE_POLICY_FILE:releaseFile,RUNTIME_WORLD_POLICY_FILE:runtimeFile,SAFETY_POLICY_FILE:safetyFile,...closed?{}:{SAFETY_EVIDENCE_KEY:'bc'.repeat(32)}});
 // Deliberate trusted caller attempts cannot override the bounded versioned profile.
 const app=await createApp(config,pool,false,{safety:{enabled:true,quickOnlyWorlds:['maid','park'],quickAccess:()=>true}});opened.push({app,pool,schema,directory});await app.app.listen(0,'127.0.0.1');return {app,pool,data,runtimeFile,url:await app.app.getUrl()};
}
type Runtime=Awaited<ReturnType<typeof open>>;type User={me:Me;cookie:string};
const headers=(user:User,key=randomUUID())=>({origin,cookie:user.cookie,'x-csrf-token':user.me.csrfToken,'idempotency-key':key});
async function guest(r:Runtime):Promise<User>{const response=await r.app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.133.0.'+(++serial),headers:{origin},payload:{requestId:randomUUID(),displayName:'Policy test visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);expect(String(response.headers['set-cookie'])).toContain('__Host-city_session=');const user={me:MeSchema.parse(response.json()),cookie:String(response.headers['set-cookie']).split(';')[0]};expect((await r.app.http.inject({method:'PATCH',url:'/v1/me/privacy',headers:headers(user),payload:{presence:'public',analyticsConsent:false,worldVisibility:{dating:'hidden'}}})).statusCode).toBe(200);return user;}
async function join(r:Runtime,user:User){const socket=io(r.url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:'127.134.0.'+(++serial)}},extraHeaders:{origin,cookie:user.cookie},auth:{schemaVersion:1,csrfToken:user.me.csrfToken}});clients.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',no);socket.connect();});const ack=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'maid',worldVersion:r.data.release.worlds.maid.worldVersion,sceneVersion:'1.0.0'}));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Production-mode curated Maid admission failed');return {socket,room:ack.result};}
const own=(room:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId});
const quick=(client:Awaited<ReturnType<typeof join>>)=>client.socket.timeout(5000).emitWithAck('chat.send',{...own(client.room),content:{kind:'canned',id:'hello'}});
it('production-mode curated world uses real sessions/room authority, bounded quick interactions, encrypted reporting and cross-user block',async()=>{
 const r=await open(),a=await guest(r),b=await guest(r),first=await join(r,a),second=await join(r,b);expect(first.room.capacity).toBe(30);expect(r.app.reports.available()).toBe(true);
 const received=new Promise<{messageId:string}>(ok=>first.socket.once('chat.message',ok));expect(ChatAckSchema.parse(await quick(second)).ok).toBe(true);const message=await received;
 const text=ChatAckSchema.parse(await second.socket.timeout(5000).emitWithAck('chat.send',{...own(second.room),content:{kind:'text',text:'Synthetic text must remain denied'}}));expect(text.ok).toBe(false);
 const note='SYNTHETIC_CONFIDENTIAL_REPORT_MARKER',body={schemaVersion:1,category:'harassment',note,source:{kind:'messages',messageIds:[message.messageId]}};const report=await r.app.http.inject({method:'POST',url:'/v1/reports',headers:headers(a),payload:body});expect(report.statusCode).toBe(201);expect(JSON.stringify(report.json())).not.toContain(note);const evidence=(await r.pool.query<{ciphertext:Buffer}>('SELECT ciphertext FROM safety_report_evidence')).rows;expect(evidence).toHaveLength(1);expect(evidence[0].ciphertext.includes(Buffer.from(note))).toBe(false);expect((await r.pool.query('SELECT 1 FROM safety_sanctions')).rowCount).toBe(0);expect((await r.app.http.inject({url:'/v1/safety/cases',headers:{cookie:a.cookie}})).statusCode).toBe(404);expect((await r.app.http.inject({url:'/v1/safety/cases',headers:{cookie:b.cookie}})).statusCode).toBe(404);
 expect((await r.app.http.inject({method:'POST',url:'/v1/blocks',headers:headers(a),payload:{targetId:b.me.profile.id,blocked:true}})).statusCode).toBe(200);const view=(await r.app.http.inject({url:'/v1/me/room',headers:{cookie:a.cookie}})).json().snapshot;expect(view.participants.some((person:{profile:{id:string}})=>person.profile.id===b.me.profile.id)).toBe(false);
 r.data.runtime.version=2;r.data.runtime.maintenance=true;await writeFile(r.runtimeFile,JSON.stringify(r.data.runtime));await r.app.worlds.reloadFlags();expect(r.app.reports.available()).toBe(true);const receipt=await r.app.http.inject({url:'/v1/reports/'+report.json().receiptId,headers:{cookie:a.cookie}});expect(receipt.statusCode).toBe(200);expect(receipt.json().receiptId).toBe(report.json().receiptId);
});
it('quick interaction revocation during a controlled real-publication wait rejects the ACK without closing the world or emitting a message',async()=>{
 const r=await open(),user=await guest(r),client=await join(r,user);let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(ok=>{enter=ok;}),held=new Promise<void>(ok=>{release=ok;}),original=r.app.rooms.publishChat.bind(r.app.rooms);let emitted=0;client.socket.on('chat.message',()=>emitted++);
 r.app.rooms.publishChat=async(...args:Parameters<typeof original>)=>{enter();await held;return original(...args);};
 const pending=quick(client);try{await entered;r.data.runtime.version=2;r.data.runtime.quickInteractions=false;await writeFile(r.runtimeFile,JSON.stringify(r.data.runtime));await r.app.worlds.reloadFlags();expect(r.app.worlds.registry.projectionContext('maid').valid()).toBe(true);}finally{release();r.app.rooms.publishChat=original;}
 expect(ChatAckSchema.parse(await pending).ok).toBe(false);expect(emitted).toBe(0);expect(r.app.rooms.diagnostics().memberships).toBe(1);
});
it('invalid runtime policy closes existing membership and direct internal activation cannot reopen it',async()=>{
 const r=await open(),user=await guest(r),client=await join(r,user);await writeFile(r.runtimeFile,JSON.stringify({...r.data.runtime,version:2,worlds:{...r.data.runtime.worlds,park:true}}));await expect(r.app.worlds.reloadFlags()).rejects.toThrow('worlds disabled');await expect.poll(()=>r.app.rooms.diagnostics().memberships).toBe(0);await expect(r.app.worlds.registry.setEnabled('maid',true)).rejects.toMatchObject({code:'FORBIDDEN'});expect(RoomAckSchema.parse(await client.socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'maid',worldVersion:r.data.release.worlds.maid.worldVersion,sceneVersion:'1.0.0'})).ok).toBe(false);
});
it('committed closed production profile starts without a reporting key and exposes no playable world or fabricated operator',async()=>{
 const r=await open(true),user=await guest(r);expect(r.app.worlds.registry.slugs()).toEqual([]);expect(r.app.reports.available()).toBe(false);expect((await r.app.http.inject({url:'/v1/worlds',headers:{cookie:user.cookie}})).json().worlds).toEqual([]);expect((await r.app.http.inject({url:'/health/ready'})).statusCode).toBe(200);
});
