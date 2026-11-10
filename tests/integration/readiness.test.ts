import { beforeAll,afterAll,afterEach,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { io,type Socket } from 'socket.io-client';
import { MeSchema,RoomAckSchema } from '@virtual-city/contracts';
import { createApp } from '../../apps/platform-api/src/app';
import { readConfig } from '../../apps/platform-api/src/shared/config/environment';
import { migrate } from '../../apps/platform-api/src/shared/database/migrations';
const origin='http://127.0.0.1:3300';
let admin:Pool;const opened:Awaited<ReturnType<typeof open>>[]=[],sockets=new Set<Socket>();
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test DB only');admin=new Pool({connectionString:url.toString()});});
afterEach(async()=>{for(const socket of sockets)socket.close();sockets.clear();const runtimes=opened.splice(0);for(const r of runtimes){await r.app.app.close();await r.pool.end();}for(const schema of new Set(runtimes.map(r=>r.schema)))await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});
afterAll(async()=>{await admin.end();});
async function open(max=10,schema?:string){
 const ownSchema=schema??'ready_test_'+randomUUID().replaceAll('-','');if(!schema)await admin.query(`CREATE SCHEMA "${ownSchema}"`);const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+ownSchema);const pool=new Pool({connectionString:url.toString(),max});if(!schema)await migrate(pool);
 const app=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-readiness-session-secret-'.repeat(3)}),pool);await app.app.listen(0,'127.0.0.1');const r={schema:ownSchema,pool,app,url:await app.app.getUrl()};opened.push(r);return r;
}

it('readiness rejects journal checksum drift and unknown later migrations without disabling independent liveness',async()=>{
 const r=await open();expect((await fetch(r.url+'/health/ready')).status).toBe(200);
 const row=(await r.pool.query<{name:string;checksum:string}>('SELECT name,checksum FROM city_schema_migrations ORDER BY name LIMIT 1')).rows[0];await r.pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[row.name,'0'.repeat(64)]);
 expect((await fetch(r.url+'/health/ready')).status).toBe(503);expect((await fetch(r.url+'/health/live')).status).toBe(200);await r.pool.query('UPDATE city_schema_migrations SET checksum=$2 WHERE name=$1',[row.name,row.checksum]);
 await r.pool.query("INSERT INTO city_schema_migrations(name,checksum) VALUES('9999_unknown.sql',$1)",['1'.repeat(64)]);expect((await fetch(r.url+'/health/ready')).status).toBe(503);await r.pool.query("DELETE FROM city_schema_migrations WHERE name='9999_unknown.sql'");expect((await fetch(r.url+'/health/ready')).status).toBe(200);
});

it('a blocked metadata read is coalesced and bounded while liveness stays responsive,then recovers after release',async()=>{
 const r=await open(),lock=await r.pool.connect();await lock.query('BEGIN');await lock.query('LOCK TABLE platform_metadata IN ACCESS EXCLUSIVE MODE');let responses:Response[]=[];const at=performance.now();
 try{
  const reads=Promise.all(Array.from({length:20},()=>fetch(r.url+'/health/ready')));expect((await fetch(r.url+'/health/live')).status).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,120));const active=await admin.query<{n:number}>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%platform_metadata%'");expect(active.rows[0].n).toBeLessThanOrEqual(1);
  responses=await reads;
  // A response timeout alone must not leave a PostgreSQL waiter behind while
  // the lock remains held. Observe the actual server,not just the HTTP timer.
  await expect.poll(async()=>(await admin.query<{n:number}>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%platform_metadata%'")).rows[0].n,{timeout:1500}).toBe(0);
 }finally{await lock.query('ROLLBACK');lock.release();}
 expect(responses.every(response=>response.status===503)).toBe(true);expect(performance.now()-at).toBeLessThan(2500);expect((await fetch(r.url+'/health/ready')).status).toBe(200);
});

it('exhausted pool probes time out without accumulating checkout requests,and late checkout is discarded before recovery',async()=>{
 const r=await open(1),held=await r.pool.connect();try{
  const at=performance.now(),responses=await Promise.all(Array.from({length:12},()=>fetch(r.url+'/health/ready')));expect(responses.every(response=>response.status===503)).toBe(true);expect(performance.now()-at).toBeLessThan(2500);
  expect(r.pool.waitingCount).toBeLessThanOrEqual(1);expect((await fetch(r.url+'/health/ready')).status).toBe(503);expect(r.pool.waitingCount).toBeLessThanOrEqual(1);expect((await fetch(r.url+'/health/live')).status).toBe(200);
 }finally{held.release();}
 // max1 can serve schema health but cannot simultaneously hold room authority
 // plus another client. This probe acquires authority only after releasing its read.
 await expect.poll(async()=>(await fetch(r.url+'/health/ready')).status).toBe(200);
});

it('a second idle replica cannot become ready while another ready process owns the same schema',async()=>{
 const a=await open();expect((await fetch(a.url+'/health/ready')).status).toBe(200);const b=await open(10,a.schema);
 expect((await fetch(b.url+'/health/ready')).status).toBe(503);expect((await fetch(b.url+'/health/live')).status).toBe(200);await a.app.app.close();expect((await fetch(b.url+'/health/ready')).status).toBe(200);
});

it('irreversible trusted drain closes new HTTP/socket work and existing room commands before graceful interruption',async()=>{
 const r=await open();await r.app.worlds.registry.setEnabled('sdk-sandbox',true);const response=await fetch(r.url+'/v1/session/guest',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),displayName:'Readiness fixture',avatarKey:'mint'})});expect(response.status).toBe(201);const cookie=response.headers.getSetCookie()[0].split(';')[0],me=MeSchema.parse(await response.json());
 const connect=()=>{const socket=io(r.url,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],extraHeaders:{origin,cookie},auth:{schemaVersion:1,csrfToken:me.csrfToken}});sockets.add(socket);return socket;};
 const socket=connect();await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',no);socket.connect();});const joined=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'sdk-sandbox',worldVersion:'1.0.0',sceneVersion:'1.0.0'}));if(!joined.ok||joined.result.type!=='snapshot')throw Error('Visit failed');
 // Trusted owner method is not reachable through a player endpoint.
 const runtime=r.app as typeof r.app&{beginDrain?:()=>void};expect(typeof runtime.beginDrain).toBe('function');runtime.beginDrain?.();runtime.beginDrain?.();
 const check=await socket.timeout(5000).emitWithAck('session.check',{schemaVersion:1,requestId:randomUUID()});expect(check).toMatchObject({ok:false,error:{code:'INTERNAL_ERROR',retryable:true}});expect(socket.connected).toBe(true);
 expect((await fetch(r.url+'/health/ready')).status).toBe(503);expect((await fetch(r.url+'/health/live')).status).toBe(200);expect((await fetch(r.url+'/v1/me',{headers:{cookie}})).status).toBe(503);
 const denied=connect(),error=await new Promise<boolean>(ok=>{denied.once('connect',()=>ok(false));denied.once('connect_error',()=>ok(true));denied.connect();});expect(error).toBe(true);
 const command=RoomAckSchema.parse(await socket.timeout(5000).emitWithAck('seat.claim',{schemaVersion:1,requestId:randomUUID(),epoch:joined.result.epoch,roomId:joined.result.roomId,membershipId:joined.result.membershipId,seatId:'seat-1'}));expect(command.ok).toBe(false);if(!command.ok)expect(command.error.code).toBe('WORLD_UNAVAILABLE');
 const ended=new Promise<unknown>(ok=>socket.once('room.ended',ok));await r.app.app.close();expect(await ended).toMatchObject({reason:'server-stopping'});
});
