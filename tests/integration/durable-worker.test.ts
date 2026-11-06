import {beforeAll, afterAll, afterEach, expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join as joinPath} from 'node:path';
import {createServer} from 'node:net';
import {Pool} from 'pg';
import {io, type Socket} from 'socket.io-client';
import {MeSchema, RoomAckSchema, OrderResultSchema, type Me, type TravelSource} from '@virtual-city/contracts';
import {defineWorld} from '@virtual-city/world-sdk';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/config';
import {migrate,migrationManifest} from '../../apps/platform-api/src/db/migrations';
import {DEFAULT_PROGRESSION_POLICY} from '../../apps/platform-api/src/progression/policy';
import {ROOM_OWNER_LOCK_CLASS} from '../../apps/platform-api/src/rooms/authority';
const origin = 'http://127.0.0.1:3300'; let admin: Pool;
const opened: {app: Awaited<ReturnType<typeof createApp>>; pool: Pool; schema: string}[] = [];
const workerChildren = new Set<ChildProcess>(), workerDirectories = new Set<string>(), sockets = new Set<Socket>();
beforeAll(() => {const url = new URL(process.env.TEST_DATABASE_URL ?? ''); if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1))) throw Error('Disposable local database only'); admin = new Pool({connectionString:url.toString()});});
afterEach(async () => {
  for (const child of workerChildren) if (child.exitCode === null && child.signalCode === null) {const exited=once(child,'exit');child.kill('SIGKILL');await exited;} workerChildren.clear();
  for (const socket of sockets) socket.close(); sockets.clear();
  for (const r of opened.splice(0)) {await r.app.app.close();await r.pool.end();await admin.query(`DROP SCHEMA "${r.schema}" CASCADE`);}
  for (const folder of workerDirectories) await rm(folder,{recursive:true,force:true});workerDirectories.clear();
});
afterAll(async()=>{await admin.end();});
async function open() {
  const schema='durable_worker_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);const address=new URL(process.env.TEST_DATABASE_URL!);address.searchParams.set('options','-c search_path='+schema);
  const pool=new Pool({connectionString:address.toString()});await migrate(pool);let now=Date.now()-60000;
  const module=defineWorld({schemaVersion:1,apiVersion:1,slug:'maid',title:'Synthetic worker reward fixture, not live Maid',version:'1.0.0',sceneRef:{key:'worker-fixture',version:'1.0.0'},kind:'sandbox',capacity:8,seatIds:['seat-1'],capabilities:['presence','seating','hospitality'],accessPolicy:{kind:'public'},visibility:'listed',map:{region:'sandbox',position:{x:.5,y:.5},icon:'flask'},hospitalityPolicy:{version:'1.0.0',itemKeys:['coffee'],maxActivePerStaff:1,maxQueue:50,staffing:{kind:'voluntary',maxStaff:8},menu:{items:[{key:'coffee',label:'Synthetic coffee',workflowKey:'coffee-workflow'}],workflows:[{key:'coffee-workflow',version:'1.0.0',kind:'timed-courses',courses:[{key:'coffee',label:'Synthetic coffee',prepareSeconds:2}]}]}}},{bootstrap:async()=>{},shutdown:async()=>{},onJoin:async()=>{},onLeave:async()=>{},onCommand:async()=>{}});
  const config=readConfig({NODE_ENV:'test',DATABASE_URL:address.toString(),SESSION_SECRET:randomUUID().repeat(2),DURABLE_JOB_ROLE:'worker'}), app=await createApp(config,pool,false,{now:()=>now,worlds:{modules:[module]},progression:{policy:{...DEFAULT_PROGRESSION_POLICY,enabled:true}}});opened.push({app,pool,schema});
  await app.app.listen(0,'127.0.0.1');await app.worlds.registry.setEnabled('maid',true);
  return {app,pool,config,schema,url:await app.app.getUrl(),advance:(ms:number)=>{now+=ms;}};
}
type Runtime=Awaited<ReturnType<typeof open>>;type User={cookie:string;me:Me};
const headers=(user:User)=>({origin,cookie:user.cookie,'x-csrf-token':user.me.csrfToken,'idempotency-key':randomUUID()});
const post=(r:Runtime,user:User,path:string,payload:object)=>r.app.http.inject({method:'POST',url:'/v1/'+path,headers:headers(user),payload});
async function guest(r:Runtime):Promise<User>{const response=await r.app.http.inject({method:'POST',url:'/v1/session/guest',headers:{origin},payload:{requestId:randomUUID(),displayName:'Synthetic worker visitor',avatarKey:'mint'}});expect(response.statusCode).toBe(201);return {cookie:String(response.headers['set-cookie']).split(';')[0],me:MeSchema.parse(response.json())};}
async function join(r:Runtime,user:User,seatId?:string){const socket=io(r.url,{forceNew:true,autoConnect:false,reconnection:false,transports:['websocket'],extraHeaders:{origin,cookie:user.cookie},auth:{schemaVersion:1,csrfToken:user.me.csrfToken}});sockets.add(socket);await new Promise<void>((ok,no)=>{socket.once('connect',ok);socket.once('connect_error',no);socket.connect();});const ack=RoomAckSchema.parse(await socket.timeout(3000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:'maid',worldVersion:'1.0.0',sceneVersion:'1.0.0'}));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Worker fixture join failed');const source={epoch:ack.result.epoch,roomId:ack.result.roomId,membershipId:ack.result.membershipId};if(seatId)expect(RoomAckSchema.parse(await socket.timeout(3000).emitWithAck('seat.claim',{schemaVersion:1,requestId:randomUUID(),...source,seatId})).ok).toBe(true);return {source};}
async function shift(r:Runtime,user:User,source:TravelSource){const response=await post(r,user,'staff/shifts',{schemaVersion:1,source,policyVersion:'1.0.0'});expect(response.statusCode).toBe(201);}
async function place(r:Runtime,user:User,source:TravelSource){const response=await post(r,user,'orders',{schemaVersion:1,source,policyVersion:'1.0.0',itemKey:'coffee'});expect(response.statusCode).toBe(201);return OrderResultSchema.parse(response.json()).order;}
async function act(r:Runtime,user:User,id:string,action:string,source:TravelSource,expectedVersion:number){const response=await post(r,user,`orders/${id}/${action}`,{schemaVersion:1,source,expectedVersion});expect(response.statusCode).toBe(200);return response;}
const acknowledge=(r:Runtime,user:User,id:string)=>post(r,user,`orders/${id}/complete`,{schemaVersion:1,expectedVersion:4});

async function workerFixture() {
  const r = await open(), customer = await guest(r), staff = await guest(r), c = await join(r, customer, 'seat-1'), s = await join(r, staff);
  await shift(r, staff, s.source); const order = await place(r, customer, c.source);
  await act(r, staff, order.id, 'claim', s.source, 0); await act(r, staff, order.id, 'prepare', s.source, 1); r.advance(2000); await act(r, staff, order.id, 'ready', s.source, 2); await act(r, staff, order.id, 'serve', s.source, 3); expect((await acknowledge(r, customer, order.id)).statusCode).toBe(200);
  const directory = await mkdtemp(joinPath(tmpdir(), 'durable-worker-')); workerDirectories.add(directory);
  const policyFile = joinPath(directory, 'policy.json'); await writeFile(policyFile, JSON.stringify(r.app.progression.policy), {mode: 0o600});
  const start = (args = ['--once']) => {
    const child = spawn(process.execPath, ['apps/platform-api/dist/worker.js', ...args], {stdio: ['ignore', 'pipe', 'pipe'], env: {PATH: process.env.PATH, TZ: 'UTC', NODE_ENV: 'test', DATABASE_URL: r.config.DATABASE_URL, DURABLE_JOB_ROLE: 'worker', PROGRESSION_POLICY_FILE: policyFile, WORKER_INTERVAL_MS: '100', WORKER_RETRY_LIMIT: '2'}}); workerChildren.add(child);
    let stdout = '', stderr = ''; child.stdout!.on('data', chunk => {if (stdout.length < 65536) stdout += String(chunk);}); child.stderr!.on('data', chunk => {if (stderr.length < 65536) stderr += String(chunk);});
    const exited = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
    const result = async () => {const [code, signal] = await exited; expect(stdout + stderr).not.toContain(r.config.DATABASE_URL); return {code, signal, stdout, stderr};};
    return {child, result};
  };
  return {r, start, policyFile};
}
it('two actual compiled workers deliver a real reward once while the API keeps its independent room owner', async () => {
  const {r, start} = await workerFixture();
  const owners = async () => (await r.pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=$1::oid AND objid=(hashtext(current_schema())::bigint & 4294967295)::oid AND objsubid=2 AND granted", [ROOM_OWNER_LOCK_CLASS])).rows[0].n;
  expect(await owners()).toBe(1);
  const a = start(), b = start(), results = await Promise.all([a.result(), b.result()]);
  expect(results.every(row => row.code === 0 && row.signal === null && row.stdout.includes('durable-worker.batch-complete'))).toBe(true);
  expect((await r.pool.query('SELECT xp FROM engine_progression_ledger')).rows).toEqual([{xp: 2}, {xp: 2}]);
  expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(1); expect(await owners()).toBe(1);
  await r.app.app.close(); expect(await owners()).toBe(0);
});
it('actual worker SIGKILL after reward effects at a blocked COMMIT resolves through receipts and restart never duplicates', async () => {
  const {r, start} = await workerFixture(), key = randomUUID(), lock = await r.pool.connect();
  await lock.query('SELECT pg_advisory_lock(1447840564,hashtext($1))', [key]);
  await r.pool.query(`CREATE FUNCTION pause_worker_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(1447840564,hashtext('${key}')); RETURN NEW; END $$`);
  await r.pool.query('CREATE CONSTRAINT TRIGGER pause_worker_commit AFTER INSERT ON engine_hospitality_deliveries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pause_worker_commit()');
  const first = start();
  try {
    await expect.poll(async () => (await r.pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=1447840564::oid AND objid=(hashtext($1)::bigint & 4294967295)::oid AND NOT granted", [key])).rows[0].n, {timeout: 5000}).toBe(1);
    expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(0);
    first.child.kill('SIGKILL'); expect((await first.result()).signal).toBe('SIGKILL');
  } finally {await lock.query('SELECT pg_advisory_unlock(1447840564,hashtext($1))', [key]); lock.release();}
  await expect.poll(async () => (await r.pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=1447840564::oid AND objid=(hashtext($1)::bigint & 4294967295)::oid AND NOT granted", [key])).rows[0].n).toBe(0);
  const beforeRewards = (await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount, beforeReceipts = (await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount;
  expect([[0, 0], [2, 1]]).toContainEqual([beforeRewards, beforeReceipts]);
  const restarted = await start().result(); expect(restarted.code).toBe(0);
  expect((await r.pool.query('SELECT xp FROM engine_progression_ledger')).rows).toEqual([{xp: 2}, {xp: 2}]); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(1);
  console.log('Worker crash facts:', JSON.stringify({signal: 'SIGKILL', beforeRewards, beforeReceipts, finalRewards: 2, finalReceipts: 1}));
});
it('actual worker poison quarantine and CLI retry are bounded, scoped and preserve completed delivery', async () => {
  const {r, start} = await workerFixture();
  await r.pool.query("CREATE FUNCTION fail_worker_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic worker poison'; END $$");
  await r.pool.query('CREATE TRIGGER fail_worker_reward BEFORE INSERT ON engine_progression_ledger FOR EACH ROW EXECUTE FUNCTION fail_worker_reward()');
  expect((await start().result()).code).toBe(1);
  // Advance only the persisted fixture due time; real backoff behavior is tested separately.
  await r.pool.query("UPDATE engine_hospitality_delivery_retries SET next_at=clock_timestamp()-interval '1 second'");
  expect((await start().result()).code).toBe(1); expect((await start().result()).code).toBe(0);
  const row = (await r.pool.query('SELECT * FROM engine_hospitality_delivery_retries')).rows[0]; expect(row.attempts).toBe(2);
  const listed = await start(['--dead-letters']).result(); expect(listed.code).toBe(0); expect(listed.stdout).toContain(row.event_id);
  expect((await start(['--retry', row.event_id, 'foreign-consumer', '2', row.next_at.toISOString()]).result()).code).toBe(1);
  expect((await start(['--retry', row.event_id, 'progression-completion-v1', '3', row.next_at.toISOString()]).result()).code).toBe(1);
  await r.pool.query('DROP TRIGGER fail_worker_reward ON engine_progression_ledger');
  expect((await start(['--retry', row.event_id, 'progression-completion-v1', '2', row.next_at.toISOString()]).result()).code).toBe(0);
  expect((await start().result()).code).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(2);
  expect((await start(['--retry', row.event_id, 'progression-completion-v1', '2', row.next_at.toISOString()]).result()).code).toBe(1); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(1);
});
it('compiled worker refuses schema drift without migrating or consuming the pending event', async () => {
  const {r, start} = await workerFixture();
  await r.pool.query("INSERT INTO city_schema_migrations(name,checksum) VALUES('9999_worker_unknown.sql',$1)", ['f'.repeat(64)]);
  expect((await start().result()).code).toBe(1);
  expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(0);
  expect((await r.pool.query('SELECT 1 FROM city_schema_migrations')).rowCount).toBe(Object.keys(await migrationManifest()).length+1);
  await r.pool.query("DELETE FROM city_schema_migrations WHERE name='9999_worker_unknown.sql'");
  expect((await start().result()).code).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(2);
});
it('actual API main in worker role leaves dispatch external and a long-running worker never acquires room ownership', async () => {
  const {r, start, policyFile} = await workerFixture(); await r.app.app.close();
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening'); const address = reservation.address(); if (!address || typeof address === 'string') throw Error('Port reservation failed');
  const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const main = spawn(process.execPath, ['apps/platform-api/dist/main.js'], {stdio: 'ignore', env: {PATH: process.env.PATH, TZ: 'UTC', NODE_ENV: 'test', DATABASE_URL: r.config.DATABASE_URL, SESSION_SECRET: r.config.SESSION_SECRET, HOST: '127.0.0.1', PORT: String(port), WEB_ORIGIN: origin, DURABLE_JOB_ROLE: 'worker', PROGRESSION_POLICY_FILE: policyFile}}); workerChildren.add(main);
  const mainExit = once(main, 'exit');
  const owners = async () => (await r.pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND classid=$1::oid AND objid=(hashtext(current_schema())::bigint & 4294967295)::oid AND objsubid=2 AND granted", [ROOM_OWNER_LOCK_CLASS])).rows[0].n;
  await expect.poll(async () => {try {return (await fetch(`http://127.0.0.1:${port}/health/ready`)).status;} catch {return 0;}}, {timeout: 5000}).toBe(200);
  await new Promise(resolve => setTimeout(resolve, 3500)); // Observe the real3000ms API service interval.
  expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(0);
  const worker = start([]);
  await expect.poll(async () => (await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(2); expect(await owners()).toBe(1);
  main.kill('SIGTERM'); expect((await mainExit)[0]).toBe(0); await expect.poll(owners).toBe(0); expect(worker.child.exitCode).toBeNull();
  worker.child.kill('SIGTERM'); const result = await worker.result(); expect(result.code).toBe(0); expect(result.signal).toBeNull(); expect(await owners()).toBe(0);
});
it('worker applies current durable world restrictions instead of granting a revoked reward from queued history', async () => {
  const {r, start} = await workerFixture();
  await r.pool.query("INSERT INTO safety_incident_controls(world_slug,surface,closed,changed_by,changed_at) VALUES('maid','world',true,NULL,clock_timestamp())");
  expect((await start().result()).code).toBe(0); expect((await r.pool.query('SELECT 1 FROM engine_progression_ledger')).rowCount).toBe(0);
  expect((await r.pool.query('SELECT 1 FROM engine_hospitality_deliveries')).rowCount).toBe(1);
});
