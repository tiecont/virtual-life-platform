import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {OperatorService} from '../../apps/platform-api/src/features/identity/modules/operators/application/operator-service';
import {totp} from '../../apps/platform-api/src/features/identity/modules/operators/infrastructure/operator-crypto';
import {InvalidGameplayBundleError,type GameplayBundleValidator} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator';
import type {GameplaySimulator} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-simulator';
import {installGameplayConfig} from '../../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config';

const origin='http://127.0.0.1:3400',ruleset='arena8-coop-pve',password='synthetic-gameplay-operator-password',factor='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const bundle=(overrides:Record<string,unknown>={})=>({schemaVersion:1,engineCapability:'arena8-coop-v1',configId:'arena8-coop-v1',contentRevision:1,boss:{maxHp:12000,phase:{thresholdBp:2500,maxGrowthBp:7500,currentBp:8000}},...overrides});
// Deterministic stand-in for the Rust verdict. Structural authority (schema,
// digest, capability) belongs to the engine; the lifecycle is what is tested.
const engine:GameplayBundleValidator={async validate(_ruleset,input){
 if((input as {reject?:boolean}).reject)throw new InvalidGameplayBundleError();
 return {digest:createHash('sha256').update(JSON.stringify(input)).digest('hex'),engineCapability:'arena8-coop-v1',contentHash:createHash('sha256').update('content:'+JSON.stringify(input)).digest('hex')};
}};
const simulator:GameplaySimulator={async simulate(_bundle,policy,seeds){return {wins:seeds-1,losses:1,unresolved:0,phaseTwoReached:seeds,totalActions:100,averageRoundsMilli:5_000,averageActionsMilli:2_500};}};
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,schema:string,now:number,key:string,config:ReturnType<typeof readConfig>;
beforeAll(()=>{const url=new URL(process.env.TEST_DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable DB required');admin=new Pool({connectionString:url.toString()});});
beforeEach(async()=>{
 schema='gameplay_config_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema);
 pool=new Pool({connectionString:url.toString()});
 await migrate(pool);
 now=Date.now();key=randomBytes(32).toString('hex');
 await new OperatorService(pool,key,()=>now-60000).bootstrap({password,totpSecret:factor,code:totp(factor,now-60000)});
 config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'synthetic-gameplay-player-secret-'.repeat(2),ADMIN_ORIGIN:origin,OPERATOR_AUTH_KEY:key});
 server=await createApp(config,pool,false,{now:()=>now,gameplayConfig:{validator:engine,simulator}});
});
afterEach(async()=>{await server?.app.close();await pool?.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});afterAll(async()=>{await admin.end();});
async function login(){const response=await server.http.inject({method:'POST',url:'/v1/operator/login',headers:{origin},payload:{password,code:totp(factor,now)}});expect(response.statusCode).toBe(200);return {cookie:String(response.headers['set-cookie']).split(';')[0],csrf:response.json().csrfToken as string};}
const post=(op:{cookie:string;csrf:string},action:string,body:Record<string,unknown>)=>server.http.inject({method:'POST',url:'/v1/operator/'+action,headers:{origin,cookie:op.cookie,'x-csrf-token':op.csrf},payload:body});
const get=(op:{cookie:string},path:string)=>server.http.inject({url:'/v1/operator/'+path,headers:{cookie:op.cookie}});
async function draft(op:{cookie:string;csrf:string},value:Record<string,unknown>={}){
 const response=await post(op,'gameplay-config-draft',{requestId:randomUUID(),ruleset,parentVersion:null,bundle:bundle(value)});
 expect(response.statusCode).toBe(200);return response.json() as {version:number;revision:number};
}
async function validated(op:{cookie:string;csrf:string},value:Record<string,unknown>={}){
 const created=await draft(op,value);
 const response=await post(op,'gameplay-config-validate',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:created.revision});
 expect(response.statusCode).toBe(200);return {version:created.version,revision:response.json().revision as number,digest:response.json().contentDigest as string};
}
async function published(op:{cookie:string;csrf:string},value:Record<string,unknown>={}){
 const ready=await validated(op,value);
 const response=await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:ready.version,expectedRevision:ready.revision,expectedActiveRevision:null});
 expect(response.statusCode).toBe(200);return response.json() as {version:number;activeRevision:number;contentDigest:string};
}

describe('gameplay configuration authority',()=>{
 it('creates, engine-validates and atomically publishes a draft',async()=>{
  const op=await login();
  const created=await draft(op);
  const before=await get(op,'gameplay-config-version?ruleset='+ruleset+'&version='+created.version);
  expect(before.json()).toMatchObject({state:'DRAFT',contentDigest:null,revision:1});
  const validation=await post(op,'gameplay-config-validate',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:created.revision});
  expect(validation.statusCode).toBe(200);
  expect(validation.json().contentDigest).toMatch(/^[a-f0-9]{64}$/);
  const active=await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:validation.json().revision,expectedActiveRevision:null});
  expect(active.statusCode).toBe(200);
  expect(active.json()).toMatchObject({version:created.version,activeRevision:1});
  const overview=await get(op,'gameplay-config?ruleset='+ruleset);
  expect(overview.json().active).toMatchObject({version:created.version,revision:1,state:'PUBLISHED'});
  const audit=await get(op,'gameplay-config-audit?ruleset='+ruleset);
  expect(audit.json().events.map((event:{action:string})=>event.action)).toEqual(['publish','validate','create']);
  for(const event of audit.json().events)expect(event.eventHash).toMatch(/^[a-f0-9]{64}$/);
 });
 it('refuses to publish an unvalidated draft or a stale active revision',async()=>{
  const op=await login(),created=await draft(op);
  expect((await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:created.revision,expectedActiveRevision:null})).statusCode).toBe(409);
  const validation=await post(op,'gameplay-config-validate',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:created.revision});
  expect((await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:validation.json().revision,expectedActiveRevision:7})).statusCode).toBe(409);
  expect((await get(op,'gameplay-config')).json().active).toBeNull();
 });
 it('keeps published versions immutable and retains every version',async()=>{
  const op=await login(),released=await published(op);
  const current=(await get(op,'gameplay-config-version?ruleset='+ruleset+'&version='+released.version)).json();
  expect((await post(op,'gameplay-config-update',{requestId:randomUUID(),ruleset,version:released.version,expectedRevision:current.revision,bundle:bundle({boss:{maxHp:1}})})).statusCode).toBe(409);
  await expect(pool.query('UPDATE gameplay_config_versions SET bundle=$2::jsonb WHERE version=1',[JSON.stringify({tampered:true})])).rejects.toThrow();
  await expect(pool.query('DELETE FROM gameplay_config_versions WHERE version=1')).rejects.toThrow();
 });
 it('replays an identical request idempotently and rejects stale draft revisions',async()=>{
  const op=await login(),created=await draft(op),requestId=randomUUID();
  const first=await post(op,'gameplay-config-update',{requestId,ruleset,version:created.version,expectedRevision:created.revision,bundle:bundle({boss:{maxHp:13000}})});
  expect(first.statusCode).toBe(200);
  const replay=await post(op,'gameplay-config-update',{requestId,ruleset,version:created.version,expectedRevision:created.revision,bundle:bundle({boss:{maxHp:13000}})});
  expect(replay.statusCode).toBe(200);expect(replay.json()).toEqual(first.json());
  expect((await post(op,'gameplay-config-update',{requestId:randomUUID(),ruleset,version:created.version,expectedRevision:created.revision,bundle:bundle({boss:{maxHp:14000}})})).statusCode).toBe(409);
  const audit=(await get(op,'gameplay-config-audit?ruleset='+ruleset)).json();
  expect(audit.events.filter((event:{action:string})=>event.action==='update')).toHaveLength(1);
 });
 it('rolls publication back atomically and keeps the audit chain',async()=>{
  const op=await login(),first=await published(op),second=await validated(op,{boss:{maxHp:15000}});
  const publishSecond=await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:second.version,expectedRevision:second.revision,expectedActiveRevision:first.activeRevision});
  expect(publishSecond.statusCode).toBe(200);
  const rolled=await post(op,'gameplay-config-rollback',{requestId:randomUUID(),ruleset,version:first.version,expectedActiveRevision:publishSecond.json().activeRevision});
  expect(rolled.statusCode).toBe(200);expect(rolled.json()).toMatchObject({version:first.version,activeRevision:3});
  const overview=(await get(op,'gameplay-config')).json();
  expect(overview.active.version).toBe(first.version);
  expect(overview.versions.find((row:{version:number})=>row.version===first.version).state).toBe('SUPERSEDED');
  expect(overview.versions.find((row:{version:number})=>row.version===second.version).state).toBe('PUBLISHED');
  const audit=(await get(op,'gameplay-config-audit?ruleset='+ruleset)).json();
  expect(audit.events[0].action).toBe('rollback');
  for(let index=1;index<audit.events.length;index++)expect(audit.events[index-1].previousHash).toBe(audit.events[index].eventHash);
 });
 it('rolls publication back when the deferred audit commit fails',async()=>{
  const op=await login(),ready=await validated(op);
  await pool.query("CREATE FUNCTION fail_gameplay_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic gameplay commit failure'; END; $$;CREATE CONSTRAINT TRIGGER fail_gameplay_commit AFTER INSERT ON gameplay_config_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_gameplay_commit()");
  const failed=await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:ready.version,expectedRevision:ready.revision,expectedActiveRevision:null});
  expect(failed.statusCode).toBe(503);
  expect((await get(op,'gameplay-config')).json().active).toBeNull();
  expect((await get(op,'gameplay-config-version?ruleset='+ruleset+'&version='+ready.version)).json().state).toBe('VALIDATED');
  await pool.query('DROP TRIGGER fail_gameplay_commit ON gameplay_config_events');
  const recovered=await post(op,'gameplay-config-publish',{requestId:randomUUID(),ruleset,version:ready.version,expectedRevision:ready.revision,expectedActiveRevision:null});
  expect(recovered.statusCode).toBe(200);
 });
 it('fails closed when the engine rejects a draft or validation is unavailable',async()=>{
  const op=await login(),rejected=await draft(op,{reject:true});
  const response=await post(op,'gameplay-config-validate',{requestId:randomUUID(),ruleset,version:rejected.version,expectedRevision:rejected.revision});
  expect(response.statusCode).toBe(422);
  expect((await get(op,'gameplay-config-version?ruleset='+ruleset+'&version='+rejected.version)).json().state).toBe('DRAFT');
  const unavailableApp=await createApp(config,pool,false,{now:()=>now,gameplayConfig:{}});
  try{
   const cookie=op.cookie,csrf=op.csrf;
   const created=await unavailableApp.http.inject({method:'POST',url:'/v1/operator/gameplay-config-draft',headers:{origin,cookie,'x-csrf-token':csrf},payload:{requestId:randomUUID(),ruleset,parentVersion:null,bundle:bundle()}});
   expect(created.statusCode).toBe(200);
   const blocked=await unavailableApp.http.inject({method:'POST',url:'/v1/operator/gameplay-config-validate',headers:{origin,cookie,'x-csrf-token':csrf},payload:{requestId:randomUUID(),ruleset,version:created.json().version,expectedRevision:created.json().revision}});
   expect(blocked.statusCode).toBe(503);
  }finally{await unavailableApp.app.close();}
 });
 it('enforces operator authorization, CSRF, origin and strict request schemas',async()=>{
  const op=await login();
  expect((await server.http.inject({url:'/v1/operator/gameplay-config'})).statusCode).toBe(401);
  expect((await post({...op,csrf:'a'.repeat(64)},'gameplay-config-draft',{requestId:randomUUID(),ruleset,parentVersion:null,bundle:bundle()})).statusCode).toBe(403);
  expect((await server.http.inject({method:'POST',url:'/v1/operator/gameplay-config-draft',headers:{origin:'http://127.0.0.1:3300',cookie:op.cookie,'x-csrf-token':op.csrf},payload:{requestId:randomUUID(),ruleset,parentVersion:null,bundle:bundle()}})).statusCode).toBe(403);
  expect((await post(op,'gameplay-config-draft',{requestId:randomUUID(),ruleset,parentVersion:null,bundle:bundle(),sql:'SELECT 1'})).statusCode).toBe(422);
  const guest=await server.identity.guest({requestId:randomUUID(),displayName:'Gameplay visitor',avatarKey:'mint'});
  expect((await server.http.inject({url:'/v1/operator/gameplay-config',headers:{cookie:'city_operator='+guest.token}})).statusCode).toBe(401);
 });
 it('runs a bounded engine simulation on a draft and published version',async()=>{
  const op=await login(),created=await draft(op);
  const simulated=await post(op,'gameplay-config-simulate',{requestId:randomUUID(),ruleset,version:created.version,policy:'tactical',seeds:10});
  expect(simulated.statusCode).toBe(200);
  expect(simulated.json()).toMatchObject({ruleset,version:created.version,policy:'tactical',seeds:10,wins:9,losses:1,totalActions:100});
  expect((await post(op,'gameplay-config-simulate',{requestId:randomUUID(),ruleset,version:created.version,policy:'tactical',seeds:201})).statusCode).toBe(422);
  expect((await post(op,'gameplay-config-simulate',{requestId:randomUUID(),ruleset,version:created.version,policy:'shell',seeds:4})).statusCode).toBe(422);
  const released=await published(op);
  const again=await post(op,'gameplay-config-simulate',{requestId:randomUUID(),ruleset,version:released.version,policy:'coordinated',seeds:3});
  expect(again.statusCode).toBe(200);
  expect(again.json()).toMatchObject({policy:'coordinated',seeds:3,wins:2,losses:1});
 });
 it('installs the reviewed seed bundle idempotently',async()=>{
  const first=await installGameplayConfig(pool,ruleset,bundle(),engine,'system:test-installation');
  expect(first.created).toBe(true);expect(first.version).toBe(1);
  const second=await installGameplayConfig(pool,ruleset,bundle(),engine,'system:test-installation');
  expect(second.created).toBe(false);expect(second.version).toBe(1);
  const rows=(await pool.query('SELECT state FROM gameplay_config_versions')).rows;
  expect(rows).toHaveLength(1);expect(rows[0].state).toBe('PUBLISHED');
  const active=(await pool.query('SELECT version,revision FROM gameplay_config_active')).rows;
  expect(active).toEqual([{version:'1',revision:'1'}]);
 });
});
