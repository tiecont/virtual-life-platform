import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,ChatAckSchema,TravelAckSchema,type RoomSnapshot } from '@virtual-city/contracts';
import { parkWorldVersion,parkScene } from '@virtual-city/park-world';
import { readConfig } from '../../apps/platform-api/src/shared/config/environment';
import { createApp } from '../../apps/platform-api/src/app';
import { migrate } from '../../apps/platform-api/src/shared/database/migrations';
const origin='http://127.0.0.1:3300',schema='park_test_'+randomUUID().replaceAll('-',''),clients=new Set<Socket>();
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,url:string,serial=0;
beforeAll(async()=>{const address=new URL(process.env.TEST_DATABASE_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(address.hostname)||!/^virtual_city_test(?:_|$)/.test(address.pathname.slice(1)))throw Error('Disposable local test DB only');admin=new Pool({connectionString:address.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);address.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:address.toString()});await migrate(pool);app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:'park-test-session-secret-'.repeat(2),LOCAL_PARK_WORLD:'1'}),pool,false,{safety:{enabled:true}});await app.app.listen(0,'127.0.0.1');url=await app.app.getUrl();});
afterEach(async()=>{for(const socket of clients)socket.close();clients.clear();await app.worlds.registry.setEnabled('park',false);await app.worlds.registry.setEnabled('sdk-sandbox',false);await app.rooms.maintain();});
afterAll(async()=>{await app?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function guest(){const n=++serial,address=`127.105.${Math.floor(n/250)}.${n%250+1}`,response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:address,headers:{origin},payload:{requestId:randomUUID(),displayName:'Park test visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);const me=MeSchema.parse(response.json()),cookie=String(response.headers['set-cookie']).split(';')[0],socket=io(url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:address}},extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});clients.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',no);socket.connect();});return {me,cookie,socket};}
type User=Awaited<ReturnType<typeof guest>>;
const headers=(u:User)=>({origin,cookie:u.cookie,'x-csrf-token':u.me.csrfToken,'idempotency-key':randomUUID()});
const join=(slug='park')=>({schemaVersion:1,requestId:randomUUID(),worldSlug:slug,worldVersion:slug==='park'?parkWorldVersion:'1.0.0',sceneVersion:'1.0.0',motionVersion:1});
const own=(s:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),epoch:s.epoch,roomId:s.roomId,membershipId:s.membershipId});
const command=async(u:User,name:string,body:unknown)=>RoomAckSchema.parse(await u.socket.timeout(5000).emitWithAck(name,body));
async function enter(u:User,roomId?:string){const ack=await command(u,'room.join',{...join(),...(roomId?{roomId}:{})});expect(ack.ok).toBe(true);if(!ack.ok||ack.result.type!=='snapshot')throw Error('Expected Park snapshot');return ack.result;}
it('local installation still requires a separate flag;catalog and directory reads cannot allocate a park room',async()=>{
 const u=await guest(),closed=await command(u,'room.join',join());expect(closed.ok).toBe(false);if(!closed.ok)expect(closed.error.code).toBe('WORLD_UNAVAILABLE');await app.worlds.registry.setEnabled('park',true);
 const catalog=await app.http.inject({url:'/v1/worlds',headers:{cookie:u.cookie}});expect(catalog.statusCode).toBe(200);expect(catalog.json().worlds.find((w:{slug:string})=>w.slug==='park')).toMatchObject({title:'Central Park',capacity:12,kind:'world',availability:'available',capabilities:['presence','seating','chat','portals']});
 expect((await app.http.inject({url:'/v1/worlds/park/rooms',headers:{cookie:u.cookie}})).json().rooms).toEqual([]);expect(app.rooms.diagnostics().memberships).toBe(0);expect((await app.http.inject({url:'/v1/worlds/park/rooms'})).statusCode).toBe(401);
});
it('actual park geometry binds shared seats and privacy;stale assets,forged authority and solid-board moves fail closed',async()=>{
 await app.worlds.registry.setEnabled('park',true);const a=await guest(),b=await guest();const stale=await command(a,'room.join',{...join(),sceneVersion:'9.0.0'});expect(stale.ok).toBe(false);if(!stale.ok)expect(stale.error.code).toBe('WORLD_VERSION_MISMATCH');
 const sa=await enter(a),sb=await enter(b,sa.roomId);expect(sa.capacity).toBe(12);expect(sa.seats.map(s=>s.seatId)).toEqual(parkScene.seats.map(s=>s.seatId));expect(sb.participants).toHaveLength(1);expect(sb.participants[0].profile.id===b.me.profile.id).toBe(true);
 const blocked=await command(a,'room.move',{...own(sa),destination:{x:3,y:12}});expect(blocked.ok).toBe(false);if(!blocked.ok)expect(blocked.error.code).toBe('INVALID_REQUEST');
 expect((await command(b,'seat.claim',{...own(sa),seatId:'seat-1'})).ok).toBe(false);expect((await command(a,'seat.claim',{...own(sa),seatId:'seat-1'})).ok).toBe(true);
 const taken=await command(b,'seat.claim',{...own(sb),seatId:'seat-1'});expect(taken.ok).toBe(false);if(!taken.ok)expect(taken.error.code).toBe('SEAT_TAKEN');
 const ended=new Promise(resolve=>a.socket.once('room.ended',resolve));await app.worlds.registry.setEnabled('park',false);await ended;await app.rooms.maintain();expect(app.rooms.diagnostics().memberships).toBe(0);expect(app.rooms.diagnostics().occupiedSeats).toBe(0);
});
it('Park cannot deliver free text even when a trusted fixture enables the shared moderated chat runtime',async()=>{
 await app.worlds.registry.setEnabled('park',true);const a=await guest(),b=await guest(),sa=await enter(a);await enter(b,sa.roomId);const delivered:unknown[]=[];b.socket.on('chat.message',event=>delivered.push(event));
 for(const content of [{kind:'text',text:'Unreviewed park text'},{kind:'text',text:'No arbitrary contact text'},{kind:'text',text:'No caller override'}]){const ack=ChatAckSchema.parse(await a.socket.timeout(5000).emitWithAck('chat.send',{...own(sa),content}));expect(ack.ok).toBe(false);if(!ack.ok)expect(ack.error.code).toBe('FORBIDDEN');}expect(delivered).toEqual([]);
});
it('shared explicit travel admits the actual park adapter before releasing the SDK source and preserves identity',async()=>{
 await app.worlds.registry.setEnabled('park',true);await app.worlds.registry.setEnabled('sdk-sandbox',true);const u=await guest(),joined=await command(u,'room.join',join('sdk-sandbox'));if(!joined.ok||joined.result.type!=='snapshot')throw Error('Source visit failed');const source=joined.result;
 const issued=await app.http.inject({method:'POST',url:'/v1/travel-intents',headers:headers(u),payload:{schemaVersion:1,source:{epoch:source.epoch,roomId:source.roomId,membershipId:source.membershipId},destination:{worldSlug:'park',worldVersion:parkWorldVersion,sceneVersion:parkScene.version}}});expect(issued.statusCode).toBe(201);const receipt=issued.json();
 const ack=TravelAckSchema.parse(await u.socket.timeout(5000).emitWithAck('travel.request',{schemaVersion:1,requestId:randomUUID(),intentId:receipt.intentId,capability:receipt.capability}));expect(ack.ok).toBe(true);if(ack.ok){expect(ack.result.receipt.phase).toBe('COMMITTED');expect(ack.result.snapshot?.worldSlug==='park'&&ack.result.snapshot.self.accountId===u.me.profile.id).toBe(true);}
 expect(app.rooms.diagnostics().memberships).toBe(1);expect((await app.http.inject({url:'/v1/worlds/sdk-sandbox/rooms',headers:{cookie:u.cookie}})).json().rooms.reduce((n:number,r:{occupancy:number})=>n+r.occupancy,0)).toBe(0);expect((await command(u,'room.snapshot',own(source))).ok).toBe(false);
});
