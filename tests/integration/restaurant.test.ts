import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,type RoomSnapshot } from '@virtual-city/contracts';
import { restaurantWorldVersion,restaurantTables } from '@virtual-city/restaurant-world';
import { readConfig } from '../../apps/platform-api/src/config';
import { createApp } from '../../apps/platform-api/src/app';
import { migrate } from '../../apps/platform-api/src/db/migrations';
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,url:string;
const clients:Socket[]=[],schema='restaurant_test_'+randomUUID().replaceAll('-',''),origin='http://127.0.0.1:3300';let serial=0;
beforeAll(async()=>{
 const connection=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(connection.hostname)||!/^virtual_city_test(?:_|$)/.test(connection.pathname.slice(1)))throw Error('Refusing non-local/non-test database');
 admin=new Pool({connectionString:connection.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);connection.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:connection.toString()});await migrate(pool);
 app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:connection.toString(),SESSION_SECRET:'restaurant-test-session-key-'.repeat(2),WEB_ORIGIN:origin,LOCAL_RESTAURANT_WORLD:'1'}),pool,false);await app.app.listen(0,'127.0.0.1');url=await app.app.getUrl();
});
afterEach(async()=>{for(const client of clients.splice(0))client.close();await app.worlds.registry.setEnabled('restaurant',false);await app.rooms.maintain();});
afterAll(async()=>{await app?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function visitor(){const response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.61.0.'+(++serial),headers:{origin},payload:{requestId:randomUUID(),displayName:'Dining Visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);const me=MeSchema.parse(response.json()),cookie=String(response.headers['set-cookie']).split(';')[0],socket=io(url,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:'127.62.0.'+serial}},extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});clients.push(socket);await new Promise<void>((resolve,reject)=>{socket.once('connect',()=>resolve());socket.once('connect_error',reject);socket.connect();});return {me,cookie,socket};}
const join=(roomId?:string)=>({schemaVersion:1,requestId:randomUUID(),worldSlug:'restaurant',worldVersion:restaurantWorldVersion,sceneVersion:'1.0.0',motionVersion:1,...roomId?{roomId}:{}});
const own=(room:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId});
it('Restaurant requires an independent flag; catalog and room reads allocate nothing',async()=>{
 const v=await visitor(),denied=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',join()));expect(denied.ok).toBe(false);if(!denied.ok)expect(denied.error.code).toBe('WORLD_UNAVAILABLE');
 await app.worlds.registry.setEnabled('restaurant',true);const catalog=await app.http.inject({url:'/v1/worlds',headers:{cookie:v.cookie}});expect(catalog.json().worlds.find((item:{slug:string})=>item.slug==='restaurant')).toMatchObject({kind:'world',capacity:10,availability:'available',capabilities:['presence','seating','events','portals']});
 expect((await app.http.inject({url:'/v1/worlds/restaurant/rooms',headers:{cookie:v.cookie}})).json().rooms).toEqual([]);expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:v.cookie}})).json().snapshot).toBeNull();expect((await app.http.inject({url:'/v1/worlds/restaurant/rooms'})).statusCode).toBe(401);
});
it('actual ten-place admission and eight exclusive dining chairs preserve identity without service authority',async()=>{
 await app.worlds.registry.setEnabled('restaurant',true);const users:Awaited<ReturnType<typeof visitor>>[]=[],rooms:RoomSnapshot[]=[];
 for(let n=0;n<10;n++){const v=await visitor();users.push(v);const ack=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',join(rooms[0]?.roomId)));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Missing Restaurant admission');rooms.push(ack.result);expect(ack.result.capacity).toBe(10);expect(ack.result.self.accountId).toBe(v.me.profile.id);}
 const race=await Promise.all(users.map((v,index)=>v.socket.timeout(5000).emitWithAck('seat.claim',{...own(rooms[index]),seatId:'seat-1'}).then(value=>RoomAckSchema.parse(value))));expect(race.filter(ack=>ack.ok)).toHaveLength(1);
 const winner=race.findIndex(ack=>ack.ok);let next=0;for(const seatId of restaurantTables.flatMap(table=>table.seatIds).slice(1)){while(next===winner)next++;expect(RoomAckSchema.parse(await users[next].socket.timeout(5000).emitWithAck('seat.claim',{...own(rooms[next]),seatId})).ok).toBe(true);next++;}
 const snapshot=(await app.http.inject({url:'/v1/me/room',headers:{cookie:users[winner].cookie}})).json().snapshot;expect(snapshot.occupancy).toBe(10);expect(snapshot.seats).toHaveLength(8);expect(snapshot.seats.filter((seat:{state:string})=>seat.state==='occupied')).toHaveLength(8);
 const extra=await visitor(),full=RoomAckSchema.parse(await extra.socket.timeout(5000).emitWithAck('room.join',join(rooms[0].roomId)));expect(full.ok).toBe(false);if(!full.ok)expect(full.error.code).toBe('ROOM_FULL');
 const actor=users[winner],headers={origin,cookie:actor.cookie,'x-csrf-token':actor.me.csrfToken,'idempotency-key':randomUUID()};expect((await app.http.inject({url:'/v1/staff/shift',headers:{cookie:actor.cookie}})).json().shift).toBeNull();
 expect((await app.http.inject({method:'POST',url:'/v1/staff/shifts',headers,payload:{schemaVersion:1,source:{epoch:rooms[winner].epoch,roomId:rooms[winner].roomId,membershipId:rooms[winner].membershipId},policyVersion:'1.0.0'}})).statusCode).toBe(404);
 await app.worlds.registry.setEnabled('restaurant',false);await app.rooms.maintain();expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:actor.cookie}})).json().snapshot).toBeNull();
});
