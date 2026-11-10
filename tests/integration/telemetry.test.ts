import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema,type Me } from '@virtual-city/contracts';
import { defineWorld } from '@virtual-city/world-sdk';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/shared/config/environment';
import {BoundedObservationRead,SystemObservations} from '../../apps/platform-api/src/features/operations/modules/observability/application/system-observation';
import { migrate,migrationManifest } from '../../apps/platform-api/src/shared/database/migrations';

const origin='http://127.0.0.1:3300',operatorToken='79'.repeat(32);
let admin:Pool;const opened:Awaited<ReturnType<typeof open>>[]=[],sockets=new Set<Socket>();
beforeAll(async()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');admin=new Pool({connectionString:url.toString()});});
afterEach(async()=>{for(const socket of sockets)socket.close();sockets.clear();for(const r of opened.splice(0)){await r.app.app.close();await r.pool.end();await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`);}});
afterAll(async()=>{await admin.end();});
async function open(enabled=true,logging=false,backlog=false){
 const schema='ops_test_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);const pool=new Pool({connectionString:url.toString()});await migrate(pool);let now=Date.now();
 const module=defineWorld({schemaVersion:1,apiVersion:1,slug:'telemetry-fixture',version:'1.0.0',title:'Synthetic operator gauge fixture',kind:'sandbox',sceneRef:{key:'telemetry-fixture',version:'1.0.0'},capacity:4,seatIds:['seat-1'],capabilities:['presence','seating','hospitality'],hospitalityPolicy:{version:'1.0.0',itemKeys:['coffee'],maxActivePerStaff:1,maxQueue:4},accessPolicy:{kind:'public'},visibility:'listed',map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'}},{bootstrap:async()=>{},shutdown:async()=>{},onJoin:async()=>{},onLeave:async()=>{},onCommand:async()=>{}});
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-operator-session-secret-'.repeat(3),...(enabled?{OPERATOR_TELEMETRY_TOKEN:operatorToken}:{})});
 const logs:string[]=[],app=await createApp(config,pool,logging,{now:()=>now,logStream:{write:message=>{logs.push(message);}},worlds:{modules:[module]},...backlog?{hospitality:{completionSinks:[{key:'synthetic-observation-consumer',apply:async()=>{}}]}}:{}});await app.worlds.registry.setEnabled('telemetry-fixture',true);await app.app.listen(0,'127.0.0.1');
 const r={schema,pool,app,logs,url:await app.app.getUrl(),now:()=>now,advance:(ms:number)=>{now+=ms;}};opened.push(r);return r;
}
type Runtime=Awaited<ReturnType<typeof open>>;
type User={me:Me;cookie:string};
async function guest(r:Runtime):Promise<User>{const response=await r.app.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin},payload:{requestId:randomUUID(),displayName:'Private operator fixture',avatarKey:'mint'}});expect(response.statusCode).toBe(201);return {me:MeSchema.parse(response.json()),cookie:String(response.headers['set-cookie']).split(';')[0]};}
const operator=(r:Runtime,path='/internal/telemetry')=>r.app.http.inject({url:path,headers:{authorization:'Bearer '+operatorToken}});
async function visit(r:Runtime,u:User){const socket=io(r.url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],extraHeaders:{origin,cookie:u.cookie},auth:{schemaVersion:1,csrfToken:u.me.csrfToken}});sockets.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',no);socket.connect();});const joined=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'telemetry-fixture',worldVersion:'1.0.0',sceneVersion:'1.0.0'}));if(!joined.ok||joined.result.type!=='snapshot')throw Error('Synthetic visit failed');const source={epoch:joined.result.epoch,roomId:joined.result.roomId,membershipId:joined.result.membershipId};const seat=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('seat.claim',{schemaVersion:1,requestId:randomUUID(),...source,seatId:'seat-1'}));expect(seat.ok).toBe(true);return {socket,source};}

it('operator export defaults closed and cookie/client role claims never replace the independent token',async()=>{
 const closed=await open(false);expect((await operator(closed)).statusCode).toBe(404);expect((await operator(closed,'/internal/observations')).statusCode).toBe(404);expect((await operator(closed,'/internal/system-state')).statusCode).toBe(404);
 const r=await open(),u=await guest(r);
 expect((await r.app.http.inject({url:'/internal/telemetry',headers:{cookie:u.cookie,'x-role':'safety-admin'}})).statusCode).toBe(404);
 expect((await r.app.http.inject({url:'/internal/telemetry',headers:{authorization:'Bearer '+'80'.repeat(32)}})).statusCode).toBe(404);
 const response=await operator(r);expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toContain('no-store');expect(response.json().schemaVersion).toBe(1);
});

it('actual HTTP and authenticated room commands export real spans,pseudonymous room,p95,online and durable order gauges without participant fields',async()=>{
 const r=await open(),u=await guest(r),v=await visit(r,u),key=randomUUID(),body={schemaVersion:1,source:v.source,policyVersion:'1.0.0',itemKey:'coffee'};
 const responses=await Promise.all(Array.from({length:8},()=>fetch(r.url+'/v1/orders',{method:'POST',headers:{origin,cookie:u.cookie,'x-csrf-token':u.me.csrfToken,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify(body)})));expect(responses.every(response=>response.status===201)).toBe(true);
 const forgedTrace='a'.repeat(32),me=await r.app.http.inject({url:'/v1/me',headers:{cookie:u.cookie,traceparent:'00-'+forgedTrace+'-'+('b'.repeat(16))+'-01'}});expect(me.statusCode).toBe(200);
 const response=await operator(r);expect(response.statusCode).toBe(200);const data=response.json();
 expect(data.gauges.online).toMatchObject({memberships:1,connections:1,occupiedSeats:1});expect(data.gauges.orders.phases.PENDING).toBe(1);
 const http=data.traces.find((span:{requestId?:string})=>span.requestId===me.headers['x-request-id']);expect(http).toBeTruthy();expect(http.traceId).toMatch(/^[a-f0-9]{32}$/);expect(http.traceId).not.toBe(forgedTrace);expect(http.spanId).toMatch(/^[a-f0-9]{16}$/);
 const room=data.traces.find((span:{operation:string})=>span.operation==='room.join');expect(room).toBeTruthy();expect(room.roomKey).toMatch(/^[a-f0-9]{32}$/);expect(room.roomKey).not.toBe(v.source.roomId.replaceAll('-',''));
 expect(data.rooms.commands['room.join'].p95UpperBoundMs).toBeGreaterThan(0);
 const serialized=JSON.stringify(data);for(const value of [operatorToken,u.me.profile.id,u.me.csrfToken,u.cookie,v.source.roomId,v.source.membershipId,'Private operator fixture'])expect(serialized.includes(value)).toBe(false);
 const text=await operator(r,'/internal/metrics');expect(text.statusCode).toBe(200);expect(text.headers['content-type']).toContain('text/plain');expect(text.body).toContain('virtual_life_online_memberships 1');expect(text.body).toContain('virtual_life_orders{phase="PENDING"} 1');
});

it('unknown-path flooding stays finite,dating calls stay excluded,and actual Pino records never include raw caller fields or error messages',async()=>{
 const r=await open(true,true),u=await guest(r),marker='private-path-'+randomUUID(),before=(await operator(r)).json();
 for(let i=0;i<120;i++)expect((await r.app.http.inject({url:'/unrecognized/'+marker+'-'+i+'?note=private-query-note',headers:{cookie:u.cookie,authorization:'Bearer private-bearer-marker'}})).statusCode).toBe(404);
 const after=(await operator(r)).json();expect(after.http.requests-before.http.requests).toBe(120);expect(after.http.series.length).toBeLessThanOrEqual(3);expect(after.traces.length).toBe(100);
 for(const path of ['/v1/dating/profile','/v1/dating/matching','/v1/dating/continuations'])expect((await r.app.http.inject({url:path,headers:{cookie:u.cookie}})).statusCode).toBe(404);
 const privateAfter=(await operator(r)).json();expect(privateAfter.http.requests).toBe(after.http.requests);expect(privateAfter.traces.length).toBe(after.traces.length);
 const all=r.logs.join('');for(const value of [marker,'private-query-note','private-bearer-marker',operatorToken,u.me.profile.id,u.me.csrfToken,u.cookie,'Private operator fixture'])expect(all.includes(value)).toBe(false);
 const records=r.logs.map(line=>JSON.parse(line));expect(records.some(record=>record.event==='operational.span'&&typeof record.traceId==='string')).toBe(true);expect(records.some(record=>typeof record.reqId==='string')).toBe(true);
});

it('order gauge SQL timeouts return unknown failure rather than fabricated zero and operator quota cannot disable player reads',async()=>{
 const r=await open(),u=await guest(r),blocker=await r.pool.connect();await blocker.query('BEGIN');await blocker.query('LOCK TABLE engine_hospitality_orders IN ACCESS EXCLUSIVE MODE');
 try{
  const [snapshot,me]=await Promise.all([operator(r),r.app.http.inject({url:'/v1/me',headers:{cookie:u.cookie}})]);
  expect(snapshot.statusCode).toBe(503);expect(snapshot.json().gauges).toBeUndefined();expect(me.statusCode).toBe(200);expect((await operator(r,'/internal/observations')).statusCode).toBe(503);
 }finally{await blocker.query('ROLLBACK');blocker.release();}
 expect((await operator(r)).statusCode).toBe(200);
 for(let i=3;i<30;i++)expect((await operator(r)).statusCode).toBe(200);
 expect((await operator(r)).statusCode).toBe(429);expect((await r.app.http.inject({url:'/v1/me',headers:{cookie:u.cookie}})).statusCode).toBe(200);
});

it('last socket loss leaves a separate grace hold rather than an online membership',async()=>{
 const r=await open(),u=await guest(r),v=await visit(r,u);v.socket.close();
 await expect.poll(async()=>(await operator(r)).json().gauges.online.connections).toBe(0);
 const snapshot=(await operator(r)).json();expect(snapshot.gauges.online).toMatchObject({memberships:0,retainedMemberships:1,graceMemberships:1});
});
it('versioned aggregate observations are authenticated, timestamped, finite and compatible with original telemetry',async()=>{
 const r=await open(),u=await guest(r);const query=await operator(r,'/internal/observations?query=private-marker');expect(query.statusCode).toBe(422);expect((await r.app.http.inject({url:'/internal/observations',headers:{cookie:u.cookie}})).statusCode).toBe(404);
 const response=await operator(r,'/internal/observations');expect(response.statusCode).toBe(200);const data=response.json();expect(data).toMatchObject({schemaVersion:2,source:'platform-api',sampledAt:r.now(),http:{requests:1,errors:0},online:{connections:0,memberships:0},coverage:{databaseHealth:'NOT_OBSERVED',workerBacklog:'NOT_OBSERVED'},durations:{window:'PROCESS_LIFETIME',method:'FIXED_BUCKET_UPPER_BOUND_APPROXIMATION'}});expect(data.orders.phases).toHaveLength(7);expect(JSON.stringify(data)).not.toMatch(/traceId|spanId|roomKey|requestId/);for(const value of [operatorToken,u.me.profile.id,u.me.csrfToken,u.cookie])expect(response.body).not.toContain(value);expect(response.headers['cache-control']).toContain('no-store');expect((await operator(r)).json()).toMatchObject({schemaVersion:1,durationSemantics:{window:'PROCESS_LIFETIME'}});
});
it('system observations report bounded independent database/pool/owner and explicitly unconfigured backlog without private fields',async()=>{
 const expectedMigrationCount=Object.keys(await migrationManifest()).length;
 const r=await open(),u=await guest(r);const response=await operator(r,'/internal/system-state');expect(response.statusCode).toBe(200);const data=response.json();expect(data).toMatchObject({schemaVersion:1,source:'platform-api',database:{status:'OBSERVED',value:{responding:true}},pool:{sampledAt:r.now()},backlog:{status:'NOT_CONFIGURED',value:null},workerLiveness:'UNKNOWN',versions:{expectedSchemaVersion:1,expectedMigrationCount,artifactRevision:null}});expect(data.pool.total).toBeGreaterThanOrEqual(0);expect(data.pool.waiting).toBeGreaterThanOrEqual(0);for(const value of [operatorToken,u.me.profile.id,u.me.csrfToken,u.cookie])expect(response.body).not.toContain(value);expect(response.body).not.toMatch(/consumer_key|event_id|account_id|DATABASE_URL/);expect((await r.app.http.inject({url:'/internal/system-state',headers:{cookie:u.cookie}})).statusCode).toBe(404);expect((await operator(r,'/internal/system-state?query=private-marker')).statusCode).toBe(422);
});

it('database responding remains observed when a configured completion-backlog source times out; zero is not worker liveness',async()=>{
 const r=await open(true,false,true),lock=await r.pool.connect();await lock.query('BEGIN');await lock.query('LOCK TABLE engine_hospitality_outbox IN ACCESS EXCLUSIVE MODE');try{const start=Date.now(),response=await operator(r,'/internal/system-state');expect(Date.now()-start).toBeLessThan(2500);expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({database:{status:'OBSERVED',value:{responding:true}},backlog:{status:'UNKNOWN',value:null},workerLiveness:'UNKNOWN'});expect((await r.app.http.inject({url:'/health/live'})).statusCode).toBe(200);}finally{await lock.query('ROLLBACK');lock.release();}
 const current=await operator(r,'/internal/system-state');expect(current.json()).toMatchObject({backlog:{status:'OBSERVED',value:{pendingDeliveries:0,oldestAgeMs:null,consumerCount:1}},workerLiveness:'UNKNOWN'});
});
it('bounded source checkout coalesces, limits real pool waiters and destroys a late client before recovery',async()=>{
 const r=await open(),pool=new Pool({connectionString:r.pool.options.connectionString,max:1}),held=await pool.connect(),read=new BoundedObservationRead(pool,async db=>{await db.query('SELECT 1');return {ok:true};});let released=false;
 try{const [a,b]=await Promise.all([read.read(),read.read()]);expect(a).toEqual({status:'UNKNOWN',sampledAt:null,value:null});expect(b).toEqual(a);expect(pool.waitingCount).toBe(1);await Promise.all([read.read(),read.read(),read.read()]);expect(pool.waitingCount).toBe(1);held.release();released=true;await expect.poll(()=>pool.waitingCount).toBe(0);expect(await read.read()).toMatchObject({status:'OBSERVED',value:{ok:true}});}finally{read.close();if(!released)held.release();await pool.end();}
});
it('read-only observation rejects a real write and a slow query without changing player state or exposing SQL errors',async()=>{
 const r=await open(),user=await guest(r),write=new BoundedObservationRead(r.pool,async db=>{await db.query("UPDATE identity_accounts SET status='suspended' WHERE id=$1",[user.me.profile.id]);return true;}),slow=new BoundedObservationRead(r.pool,async db=>{await db.query('SELECT pg_sleep(2)');return true;});
 try{expect(await write.read()).toEqual({status:'UNKNOWN',sampledAt:null,value:null});expect((await r.pool.query('SELECT status FROM identity_accounts WHERE id=$1',[user.me.profile.id])).rows[0].status).toBe('active');expect(await slow.read()).toEqual({status:'UNKNOWN',sampledAt:null,value:null});expect((await operator(r,'/internal/system-state')).json().database.status).toBe('OBSERVED');}finally{write.close();slow.close();}
});
it('closing a source aborts only its checked-out read and a closed source never schedules another query',async()=>{
 const r=await open();let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;}),read=new BoundedObservationRead(r.pool,async db=>{enter();await db.query('SELECT pg_sleep(30)');return true;});const pending=read.read();await entered;read.close();expect(await pending).toEqual({status:'UNKNOWN',sampledAt:null,value:null});expect(await read.read()).toEqual({status:'UNKNOWN',sampledAt:null,value:null});expect((await operator(r,'/internal/system-state')).statusCode).toBe(200);
});

it('a supported minimal database port reports absent pool counters as UNKNOWN while the real read probe remains observed',async()=>{
 const r=await open(),source=new SystemObservations({connect:r.pool.connect.bind(r.pool)},async()=>null,()=>({authority:{configuredOwners:1,state:'idle'},versions:{expectedSchemaVersion:1,expectedMigrationCount:44,releaseVersion:null,artifactRevision:null}}),r.now);try{expect(await source.read()).toMatchObject({database:{status:'OBSERVED',value:{responding:true}},pool:{status:'UNKNOWN',sampledAt:null,total:null,idle:null,waiting:null},backlog:{status:'NOT_CONFIGURED'}});}finally{source.close();}
});
