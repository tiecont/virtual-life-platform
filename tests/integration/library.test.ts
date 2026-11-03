import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,type RoomSnapshot } from '@virtual-city/contracts';
import { libraryWorldVersion } from '@virtual-city/library-world';
import { readConfig } from '../../apps/platform-api/src/config';
import { createApp } from '../../apps/platform-api/src/app';
import { migrate } from '../../apps/platform-api/src/db/migrations';
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,url:string,runtimeConfig:ReturnType<typeof readConfig>;const clients:Socket[]=[],schema='library_test_'+randomUUID().replaceAll('-',''),origin='http://127.0.0.1:3300';let serial=0,offset=0;
async function open(){app=await createApp(runtimeConfig,pool,false,{now:()=>Date.now()+offset});await app.app.listen(0,'127.0.0.1');url=await app.app.getUrl();}
beforeAll(async()=>{
 const connection=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(connection.hostname)||!/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1)))throw Error('Refusing non-local/non-test database');
 admin=new Pool({connectionString:connection.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);connection.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:connection.toString()});await migrate(pool);
 runtimeConfig=readConfig({NODE_ENV:'test',DATABASE_URL:connection.toString(),SESSION_SECRET:'library-test-session-key-'.repeat(2),WEB_ORIGIN:origin,LOCAL_LIBRARY_WORLD:'1'});await open();
});
afterEach(async()=>{for(const client of clients.splice(0))client.close();await app.worlds.registry.setEnabled('library',false);await app.rooms.maintain();offset=0;});
afterAll(async()=>{await app?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function visitor(){const response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.43.0.'+(++serial),headers:{origin},payload:{requestId:randomUUID(),displayName:'Library Visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);const me=MeSchema.parse(response.json()),cookie=String(response.headers['set-cookie']).split(';')[0];const socket=io(url,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:'127.44.0.'+serial}},extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});clients.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);socket.connect();});return {me,cookie,socket};}
const join=()=>({schemaVersion:1,requestId:randomUUID(),worldSlug:'library',worldVersion:libraryWorldVersion,sceneVersion:'1.0.0',motionVersion:1});
it('installed library still requires its independent flag and exposes no read-allocated rooms',async()=>{
 const v=await visitor();const denied=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',join()));expect(denied.ok).toBe(false);if(!denied.ok)expect(denied.error.code).toBe('WORLD_UNAVAILABLE');
 await app.worlds.registry.setEnabled('library',true);const catalog=await app.http.inject({url:'/v1/worlds',headers:{cookie:v.cookie}});expect(catalog.json().worlds.find((item:{slug:string})=>item.slug==='library')).toMatchObject({kind:'world',capacity:8,availability:'available',capabilities:['presence','seating','focus','portals']});
 expect((await app.http.inject({url:'/v1/worlds/library/rooms',headers:{cookie:v.cookie}})).json().rooms).toEqual([]);expect((await app.http.inject({url:'/v1/worlds/library/rooms'})).statusCode).toBe(401);
});
type Visitor=Awaited<ReturnType<typeof visitor>>;
const source=(room:RoomSnapshot)=>({epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId});
const own=(room:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),...source(room)});
const headers=(v:Visitor,key=randomUUID())=>({origin,cookie:v.cookie,'x-csrf-token':v.me.csrfToken,'idempotency-key':key});
async function enter(v:Visitor,roomId?:string){const ack=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',{...join(),...roomId?{roomId}:{}}));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Missing library admission');return ack.result;}
it('eight actual Library visitors race one desk,then only its owner starts one private canonical focus session',async()=>{
 await app.worlds.registry.setEnabled('library',true);const users:Visitor[]=[],rooms:RoomSnapshot[]=[];for(let n=0;n<8;n++){const v=await visitor();users.push(v);rooms.push(await enter(v,rooms[0]?.roomId));}
 const race=await Promise.all(users.map((v,index)=>v.socket.timeout(5000).emitWithAck('seat.claim',{...own(rooms[index]),seatId:'seat-1'}).then(value=>RoomAckSchema.parse(value))));expect(race.filter(ack=>ack.ok)).toHaveLength(1);const winner=race.findIndex(ack=>ack.ok),owner=users[winner],room=rooms[winner],other=users[(winner+1)%8];
 const ninth=await visitor(),full=RoomAckSchema.parse(await ninth.socket.timeout(5000).emitWithAck('room.join',{...join(),roomId:room.roomId}));expect(full.ok).toBe(false);if(!full.ok)expect(full.error.code).toBe('ROOM_FULL');expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:ninth.cookie}})).json().snapshot).toBeNull();
 expect((await app.http.inject({method:'POST',url:'/v1/focus',headers:headers(other),payload:{schemaVersion:1,source:source(room),durationSeconds:900}})).statusCode).toBe(409);
 const key=randomUUID(),started=await Promise.all(Array.from({length:8},()=>app.http.inject({method:'POST',url:'/v1/focus',headers:headers(owner,key),payload:{schemaVersion:1,source:source(room),durationSeconds:900}})));expect(started.every(result=>result.statusCode===201)).toBe(true);const timer=started[0].json().session;expect(new Set(started.map(result=>result.json().session.id)).size).toBe(1);expect(timer).toMatchObject({phase:'active',canPause:true,origin:{worldSlug:'library',roomId:room.roomId,seatId:'seat-1'}});
 expect((await pool.query('SELECT count(*)::int AS n FROM engine_focus_sessions WHERE account_id=$1',[owner.me.profile.id])).rows[0].n).toBe(1);expect((await app.http.inject({url:'/v1/focus/'+timer.id,headers:{cookie:other.cookie}})).statusCode).toBe(404);
 expect((await app.http.inject({method:'PATCH',url:'/v1/me/privacy',headers:headers(owner),payload:{presence:'public',analyticsConsent:false,worldVisibility:{dating:'hidden'}}})).statusCode).toBe(200);const peer=RoomAckSchema.parse(await other.socket.timeout(5000).emitWithAck('room.snapshot',own(rooms[(winner+1)%8])));expect(peer.ok).toBe(true);expect(JSON.stringify(peer)).toContain(owner.me.profile.id);expect(JSON.stringify(peer)).not.toContain(timer.id);expect(JSON.stringify(peer)).not.toMatch(/durationSeconds|remainingMs|canPause/);
 const paused=await app.http.inject({method:'POST',url:`/v1/focus/${timer.id}/pause`,headers:headers(owner),payload:{schemaVersion:1}});expect(paused.statusCode).toBe(200);expect(paused.json().session.phase).toBe('paused');offset+=20000;
 const resumed=await app.http.inject({method:'POST',url:`/v1/focus/${timer.id}/resume`,headers:headers(owner),payload:{schemaVersion:1}});expect(resumed.statusCode).toBe(200);expect(resumed.json().session.remainingMs).toBeGreaterThan(paused.json().session.remainingMs-1000);offset=Date.parse(resumed.json().session.endsAt)+10-Date.now();
 const finished=await Promise.all(Array.from({length:4},()=>app.http.inject({method:'POST',url:`/v1/focus/${timer.id}/finish`,headers:headers(owner),payload:{schemaVersion:1}})));expect(finished.every(result=>result.statusCode===200&&result.json().session.phase==='completed')).toBe(true);
 const history=await app.http.inject({url:'/v1/focus/history?worldSlug=library',headers:{cookie:owner.cookie}});expect(history.statusCode).toBe(200);expect(history.json().items.filter((item:{id:string})=>item.id===timer.id)).toHaveLength(1);expect((await app.http.inject({url:'/v1/focus/history?worldSlug=library',headers:{cookie:other.cookie}})).json().items).toEqual([]);
});
it('Library focus survives room departure and real API restart with its immutable original scope',async()=>{
 await app.worlds.registry.setEnabled('library',true);const v=await visitor(),room=await enter(v);expect(RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('seat.claim',{...own(room),seatId:'seat-2'})).ok).toBe(true);
 const result=await app.http.inject({method:'POST',url:'/v1/focus',headers:headers(v),payload:{schemaVersion:1,source:source(room),durationSeconds:900}});expect(result.statusCode).toBe(201);const timer=result.json().session;
 expect(RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.leave',own(room))).ok).toBe(true);await app.app.close();offset+=10000;await open();const current=await app.http.inject({url:'/v1/focus',headers:{cookie:v.cookie}});expect(current.statusCode).toBe(200);expect(current.json().session).toMatchObject({id:timer.id,phase:'active',origin:{worldSlug:'library',roomId:room.roomId,seatId:'seat-2'}});expect(current.json().session.remainingMs).toBeLessThan(891000);expect(current.json().session.remainingMs).toBeGreaterThan(880000);
 expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:v.cookie}})).json().snapshot).toBeNull();offset=Date.parse(timer.endsAt)+10-Date.now();const finished=await app.http.inject({method:'POST',url:`/v1/focus/${timer.id}/finish`,headers:headers(v),payload:{schemaVersion:1}});expect(finished.statusCode).toBe(200);expect(finished.json().session).toMatchObject({id:timer.id,phase:'completed',origin:{worldSlug:'library',roomId:room.roomId,seatId:'seat-2'}});
});
it('actual library visit binds the declared desks and disabling its flag ends the membership',async()=>{
 await app.worlds.registry.setEnabled('library',true);const v=await visitor();const stale=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',{...join(),sceneVersion:'0.9.0'}));expect(stale.ok).toBe(false);if(!stale.ok)expect(stale.error.code).toBe('WORLD_VERSION_MISMATCH');
 const result=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',join()));expect(result.ok).toBe(true);if(!result.ok||result.result.type!=='snapshot')throw Error('Missing library snapshot');const room=result.result;
 expect(room.worldSlug).toBe('library');expect(room.seats).toHaveLength(8);expect(room.occupancy).toBe(1);expect(room.self.accountId).toBe(v.me.profile.id);
 const claim=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('seat.claim',{schemaVersion:1,requestId:randomUUID(),epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId,seatId:'seat-5'}));expect(claim.ok).toBe(true);
 await app.worlds.registry.setEnabled('library',false);await app.rooms.maintain();expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:v.cookie}})).json().snapshot).toBeNull();
 expect((await app.http.inject({url:'/v1/worlds/library/rooms',headers:{cookie:v.cookie}})).statusCode).toBe(503);
});
