import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {io,type Socket} from 'socket.io-client';
import {MeSchema,RoomAckSchema,GameLobbyViewSchema,TravelAckSchema,type RoomSnapshot,type GameMode} from '@virtual-city/contracts';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {createApp} from '../../apps/platform-api/src/app';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
let admin:Pool,pool:Pool,app:Awaited<ReturnType<typeof createApp>>,url:string,database:string,serial=0;const clients:Socket[]=[],origin='http://127.0.0.1:3300',schema='lodge_'+randomUUID().replaceAll('-','');
const config=(enabled=true)=>readConfig({NODE_ENV:'test',DATABASE_URL:database,SESSION_SECRET:'local-lodge-integration-secret-'.repeat(2),...(enabled?{LOCAL_LANTERN_LODGE_WORLD:'1',LOCAL_GAME_LOBBY:'1'}:{})});
async function open(enabled=true){app=await createApp(config(enabled),pool,false,{safety:{enabled:true}});await app.app.listen(0,'127.0.0.1');url=await app.app.getUrl();}
beforeAll(async()=>{const target=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!/^virtual_city_test(?:_|$)/.test(target.pathname.slice(1)))throw Error('Disposable local test database required');admin=new Pool({connectionString:target.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);target.searchParams.set('options','-c search_path='+schema);database=target.toString();pool=new Pool({connectionString:database});await migrate(pool);});
beforeEach(async()=>open());
afterEach(async()=>{for(const client of clients.splice(0))client.close();await app?.app.close();await pool.query("DELETE FROM safety_incident_controls WHERE world_slug='lantern-lodge'");});
afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
async function guest(){const n=++serial,response=await app.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.55.'+Math.floor(n/240)+'.'+(n%240+1),headers:{origin},payload:{requestId:randomUUID(),displayName:'Lodge Visitor '+n,avatarKey:'mint'}});expect(response.statusCode).toBe(201);const me=MeSchema.parse(response.json()),cookie=String(response.headers['set-cookie']).split(';')[0];const socket=io(url,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],transportOptions:{websocket:{localAddress:'127.56.'+Math.floor(n/240)+'.'+(n%240+1)}},extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});clients.push(socket);await new Promise<void>((ok,no)=>{socket.once('connect',()=>ok());socket.once('connect_error',no);socket.connect();});return {me,cookie,socket};}
type Visitor=Awaited<ReturnType<typeof guest>>;
const headers=(v:Visitor)=>({origin,cookie:v.cookie,'x-csrf-token':v.me.csrfToken,'idempotency-key':randomUUID()});
const source=(room:RoomSnapshot)=>({epoch:room.epoch,roomId:room.roomId,membershipId:room.membershipId});
const own=(room:RoomSnapshot)=>({schemaVersion:1,requestId:randomUUID(),...source(room)});
async function enter(v:Visitor,roomId?:string){const result=RoomAckSchema.parse(await v.socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'lantern-lodge',worldVersion:'1.0.0',sceneVersion:'1.0.0',...roomId?{roomId}:{}}));if(!result.ok||result.result.type!=='snapshot')throw Error('Missing Lodge visit: '+JSON.stringify(result));return result.result;}
const post=(v:Visitor,room:RoomSnapshot,extra:Record<string,unknown>={op:'view'})=>app.http.inject({method:'POST',url:'/v1/games/lobby',headers:headers(v),payload:{schemaVersion:1,source:source(room),...extra}});
async function start(v:Visitor,room:RoomSnapshot,mode:GameMode='lantern-colors'){const response=await post(v,room,{op:'open',mode,consent:true});expect(response.statusCode,response.body).toBe(200);return GameLobbyViewSchema.parse(response.json()).table!;}
const binding=(table:{tableId:string;generation:string})=>({tableId:table.tableId,generation:table.generation});
async function group(count:number,mode:GameMode='lantern-colors'){await app.worlds.registry.setEnabled('lantern-lodge',true);const users:Visitor[]=[],rooms:RoomSnapshot[]=[];for(let i=0;i<count;i++){const v=await guest();users.push(v);rooms.push(await enter(v,rooms[0]?.roomId));}return {users,rooms,table:await start(users[0],rooms[0],mode)};}
it('defaults preserve catalog/export/routes; installation and runtime enablement remain independent',async()=>{
 const v=await guest();expect((await post(v,{epoch:randomUUID(),roomId:randomUUID(),membershipId:randomUUID()} as RoomSnapshot)).statusCode).toBe(409);
 await app.app.close();await open(false);const user=await guest();expect(app.worlds.registry.slugs()).not.toContain('lantern-lodge');expect((await app.http.inject({method:'POST',url:'/v1/games/lobby',headers:headers(user),payload:{}})).statusCode).toBe(404);expect((await app.http.inject({url:'/v1/me/export',headers:{cookie:user.cookie}})).json().domains).not.toHaveProperty('gameLobby');
 expect(()=>readConfig({NODE_ENV:'production',DATABASE_URL:database,SESSION_SECRET:'test-local-lodge-secret-'.repeat(2),WEB_ORIGIN:'https://example.invalid',LOCAL_LANTERN_LODGE_WORLD:'1',LOCAL_GAME_LOBBY:'1'})).toThrow();
});
for(const mode of ['lantern-colors','mask-and-tell','mistbound-routes'] as const)it(mode+' enforces real room/table caps under simultaneous joins without allocating another membership',async()=>{
 const g=await group(8,mode),capacity=mode==='mistbound-routes'?8:6;
 const race=await Promise.all(g.users.slice(1).map((v,i)=>post(v,g.rooms[i+1],{op:'join',...binding(g.table),consent:true})));expect(race.filter(r=>r.statusCode===200)).toHaveLength(capacity-1);expect(race.filter(r=>r.statusCode===409)).toHaveLength(8-capacity);
 const current=GameLobbyViewSchema.parse((await post(g.users[0],g.rooms[0])).json());expect(current.table!.slots).toHaveLength(capacity);expect(new Set(current.table!.slots.map(s=>s.seat)).size).toBe(capacity);expect(current).toMatchObject({canStart:false,spectator:false,ephemeral:true});expect(JSON.stringify(current)).not.toMatch(/account|membership|displayName|hand|deck|target/);
 const ninth=await guest(),full=RoomAckSchema.parse(await ninth.socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'lantern-lodge',worldVersion:'1.0.0',sceneVersion:'1.0.0',roomId:g.rooms[0].roomId}));expect(full.ok).toBe(false);if(!full.ok)expect(full.error.code).toBe('ROOM_FULL');expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:ninth.cookie}})).json().snapshot).toBeNull();
 for(const v of g.users)expect((await app.http.inject({url:'/v1/me/room',headers:{cookie:v.cookie}})).json().snapshot.roomId).toBe(g.rooms[0].roomId);
});
it('requires explicit consent and exact own membership; wrong room/table/generation/actor/spectator inputs fail closed',async()=>{
 const g=await group(8),a=g.users[0],b=g.users[1],room=g.rooms[1];
 for(const extra of [{op:'join',...binding(g.table),consent:false},{op:'join',...binding(g.table),consent:true,actorId:a.me.profile.id},{op:'spectate',...binding(g.table)}])expect((await post(b,room,extra)).statusCode).toBe(422);
 expect((await post(b,g.rooms[0],{op:'join',...binding(g.table),consent:true})).statusCode).toBe(409);
 expect((await post(b,room,{op:'join',tableId:g.table.tableId,generation:randomUUID(),consent:true})).statusCode).toBe(409);
 const foreign=await guest(),foreignRoom=await enter(foreign);expect(foreignRoom.roomId).not.toBe(room.roomId);expect((await post(foreign,foreignRoom,{op:'join',...binding(g.table),consent:true})).statusCode).toBe(409);expect((await post(foreign,room)).statusCode).toBe(409);
 const noCsrf=await app.http.inject({method:'POST',url:'/v1/games/lobby',headers:{origin,cookie:a.cookie},payload:{schemaVersion:1,source:source(g.rooms[0]),op:'view'}});expect(noCsrf.statusCode).toBe(403);
});
it('ready quorum is never a deal; group changes clear readiness and stale versions cannot consent',async()=>{
 const g=await group(3),[a,b,c]=g.users;let table=g.table;
 table=GameLobbyViewSchema.parse((await post(b,g.rooms[1],{op:'join',...binding(table),consent:true})).json()).table!;
 table=GameLobbyViewSchema.parse((await post(a,g.rooms[0],{op:'ready',...binding(table),expectedVersion:table.version,ready:true})).json()).table!;
 const stale=table.version;table=GameLobbyViewSchema.parse((await post(b,g.rooms[1],{op:'ready',...binding(table),expectedVersion:table.version,ready:true})).json()).table!;expect(table.phase).toBe('READY_CHECK');
 expect((await post(a,g.rooms[0],{op:'ready',...binding(table),expectedVersion:stale,ready:true})).statusCode).toBe(409);
 table=GameLobbyViewSchema.parse((await post(c,g.rooms[2],{op:'join',...binding(table),consent:true})).json()).table!;expect(table.phase).toBe('WAITING');expect(table.slots.every(s=>!s.ready)).toBe(true);
 expect((await app.http.inject({method:'POST',url:'/v1/games/lobby/leave',headers:headers(a),payload:{schemaVersion:1,...binding(table)}})).statusCode).toBe(200);const data=(await app.http.inject({url:'/v1/me/export',headers:{cookie:a.cookie}})).json();expect(data.domains.gameLobby).toEqual({schemaVersion:1,ephemeral:true,consented:false});
});
it('concurrent opens and retries from one account produce one table and one consented seat',async()=>{
 await app.worlds.registry.setEnabled('lantern-lodge',true);const a=await guest(),room=await enter(a);const responses=await Promise.all(Array.from({length:8},()=>post(a,room,{op:'open',mode:'lantern-colors',consent:true})));expect(responses.every(r=>r.statusCode===200)).toBe(true);const tables=responses.map(r=>GameLobbyViewSchema.parse(r.json()).table!);expect(new Set(tables.map(t=>t.tableId)).size).toBe(1);expect(tables.every(t=>t.slots.length===1)).toBe(true);expect((await post(a,room,{op:'open',mode:'mistbound-routes',consent:true})).statusCode).toBe(409);
});
it('blocked tables are private and block withdrawal prevents pending join revival',async()=>{
 const g=await group(2),[a,b]=g.users;const original=app.social.isBlocked.bind(app.social);let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(r=>release=r),observed=new Promise<void>(r=>seen=r);
 let held=false;app.social.isBlocked=async(...args)=>{const value=await original(...args);if(!held){held=true;seen();await gate;}return value;};const pending=post(b,g.rooms[1],{op:'join',...binding(g.table),consent:true}).then(value=>value);await observed;
 try{await app.social.block((()=>{const parsed=app.http.unsignCookie(app.http.parseCookie(a.cookie).city_session);return parsed.value!;})(),randomUUID(),b.me.profile.id,true,false);}finally{release();app.social.isBlocked=original;}
 expect([404,409]).toContain((await pending).statusCode);const view=GameLobbyViewSchema.parse((await post(a,g.rooms[0])).json());expect(view.table).toBeNull();const replacement=await start(a,g.rooms[0]);const blocked=await post(b,g.rooms[1]);expect(blocked.statusCode).toBe(404);expect(blocked.body).not.toContain(replacement.tableId);
});
it('a delayed relationship read does not hold RoomService; real leave defeats stale join',async()=>{
 const g=await group(2),b=g.users[1],original=app.social.isBlocked.bind(app.social);let release!:()=>void,seen!:()=>void,held=false;const gate=new Promise<void>(r=>release=r),observed=new Promise<void>(r=>seen=r);app.social.isBlocked=async(...args)=>{const value=await original(...args);if(!held){held=true;seen();await gate;}return value;};
 const pending=post(b,g.rooms[1],{op:'join',...binding(g.table),consent:true}).then(value=>value);await observed;try{const left=RoomAckSchema.parse(await b.socket.timeout(3000).emitWithAck('room.leave',own(g.rooms[1])));expect(left.ok).toBe(true);}finally{release();app.social.isBlocked=original;}expect((await pending).statusCode).toBe(409);expect(GameLobbyViewSchema.parse((await post(g.users[0],g.rooms[0])).json()).table!.slots).toHaveLength(1);
});
it('travel withdraws old visit consent; independent leave and restart cannot revive stale generations',async()=>{
 const g=await group(1),a=g.users[0];await app.worlds.registry.setEnabled('sdk-sandbox',true);
 const created=await app.http.inject({method:'POST',url:'/v1/travel-intents',headers:headers(a),payload:{schemaVersion:1,source:source(g.rooms[0]),destination:{worldSlug:'sdk-sandbox',worldVersion:'1.0.0',sceneVersion:'1.0.0'}}});expect(created.statusCode,created.body).toBe(201);const receipt=created.json();const traveled=TravelAckSchema.parse(await a.socket.timeout(5000).emitWithAck('travel.request',{schemaVersion:1,requestId:randomUUID(),intentId:receipt.intentId,capability:receipt.capability}));expect(traveled.ok).toBe(true);
 expect((await post(a,g.rooms[0])).statusCode).toBe(409);expect((await app.http.inject({method:'POST',url:'/v1/games/lobby/leave',headers:headers(a),payload:{schemaVersion:1,...binding(g.table)}})).statusCode).toBe(200);
 await app.app.close();await open();await app.worlds.registry.setEnabled('lantern-lodge',true);const b=await guest(),room=await enter(b);expect(GameLobbyViewSchema.parse((await post(b,room)).json()).table).toBeNull();expect((await post(b,room,{op:'join',...binding(g.table),consent:true})).statusCode).toBe(409);
});
it('disable and current safety closure deny existing table reads and readiness',async()=>{
 const g=await group(1),a=g.users[0];await pool.query("INSERT INTO safety_incident_controls VALUES('lantern-lodge','world',true,NULL,$1)",[new Date()]);const denied=await post(a,g.rooms[0]);expect([403,404]).toContain(denied.statusCode);expect(denied.body).not.toContain(g.table.tableId);await pool.query("DELETE FROM safety_incident_controls WHERE world_slug='lantern-lodge'");await app.worlds.registry.setEnabled('lantern-lodge',false);expect([404,409]).toContain((await post(a,g.rooms[0])).statusCode);
});
