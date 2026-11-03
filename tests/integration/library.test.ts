import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema } from '@virtual-city/contracts';
import { readConfig } from '../../apps/platform-api/src/config';
import { createApp } from '../../apps/platform-api/src/app';
import { migrate } from '../../apps/platform-api/src/db/migrations';
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,url:string;const clients:Socket[]=[],schema='library_test_'+randomUUID().replaceAll('-',''),origin='http://127.0.0.1:3300';let serial=0;
beforeAll(async()=>{
 const connection=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(connection.hostname)||!/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1)))throw Error('Refusing non-local/non-test database');
 admin=new Pool({connectionString:connection.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);connection.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:connection.toString()});await migrate(pool);
 app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:connection.toString(),SESSION_SECRET:'library-test-session-key-'.repeat(2),WEB_ORIGIN:origin,LOCAL_LIBRARY_WORLD:'1'}),pool,false);await app.app.listen(0,'127.0.0.1');url=await app.app.getUrl();
});
afterEach(async()=>{for(const client of clients.splice(0))client.close();await app.worlds.registry.setEnabled('library',false);await app.rooms.maintain();});
afterAll(async()=>{await app?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function visitor(){const response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.43.0.'+(++serial),headers:{origin},payload:{requestId:randomUUID(),displayName:'Library Visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);const me=MeSchema.parse(response.json()),cookie=String(response.headers['set-cookie']).split(';')[0];const socket=io(url,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});clients.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);socket.connect();});return {me,cookie,socket};}
const join=()=>({schemaVersion:1,requestId:randomUUID(),worldSlug:'library',worldVersion:'1.0.0',sceneVersion:'1.0.0',motionVersion:1});
it('installed library still requires its independent flag and exposes no read-allocated rooms',async()=>{
 const v=await visitor();const denied=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',join()));expect(denied.ok).toBe(false);if(!denied.ok)expect(denied.error.code).toBe('WORLD_UNAVAILABLE');
 await app.worlds.registry.setEnabled('library',true);const catalog=await app.http.inject({url:'/v1/worlds',headers:{cookie:v.cookie}});expect(catalog.json().worlds.find((item:{slug:string})=>item.slug==='library')).toMatchObject({kind:'world',capacity:8,availability:'available',capabilities:['presence','seating','portals']});
 expect((await app.http.inject({url:'/v1/worlds/library/rooms',headers:{cookie:v.cookie}})).json().rooms).toEqual([]);expect((await app.http.inject({url:'/v1/worlds/library/rooms'})).statusCode).toBe(401);
});
it('actual library visit binds the declared desks and disabling its flag ends the membership',async()=>{
 await app.worlds.registry.setEnabled('library',true);const v=await visitor();const stale=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',{...join(),sceneVersion:'0.9.0'}));expect(stale.ok).toBe(false);if(!stale.ok)expect(stale.error.code).toBe('WORLD_VERSION_MISMATCH');
 const result=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',join()));expect(result.ok).toBe(true);if(!result.ok||result.result.type!=='snapshot')throw Error('Missing library snapshot');const room=result.result;
 expect(room.worldSlug).toBe('library');expect(room.seats).toHaveLength(8);expect(room.occupancy).toBe(1);expect(room.self.accountId).toBe(v.me.profile.id);
 const claim=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('seat.claim',{schemaVersion:1,requestId:randomUUID(),epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId,seatId:'seat-5'}));expect(claim.ok).toBe(true);
 await app.worlds.registry.setEnabled('library',false);await app.rooms.maintain();expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:v.cookie}})).json().snapshot).toBeNull();
 expect((await app.http.inject({url:'/v1/worlds/library/rooms',headers:{cookie:v.cookie}})).statusCode).toBe(503);
});
