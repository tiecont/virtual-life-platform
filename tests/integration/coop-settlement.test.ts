import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {installGameplayConfig} from '../../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config';
import type {GameplayBundleValidator} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator';
import {CoopSettlement,canonicalProposalHash} from '../../apps/platform-api/src/features/coop/modules/settlement/application/service';

const origin='http://127.0.0.1:3300',ruleset='arena8-coop-pve';
const baseBundle={schemaVersion:1,engineCapability:'arena8-coop-v1',configId:'arena8-coop-v1',boss:{id:'cinder-terraces-warden',maxHp:12_000,requiredRoomPoints:5_000},rewards:{clearAchievementPoints:250,clearCoins:120,clearExp:90,lossAchievementPoints:25,lossCoins:0,lossExp:0}};
const digest=createHash('sha256').update(JSON.stringify(baseBundle)).digest('hex');
const contentHash=createHash('sha256').update('content:'+JSON.stringify(baseBundle)).digest('hex');
const engine:GameplayBundleValidator={async validate(){return {digest,engineCapability:'arena8-coop-v1',contentHash};}};
const pets=['icarus','coralline','volt','terran'];
let admin:Pool,pool:Pool,server:Awaited<ReturnType<typeof createApp>>,schema:string,address=1;
type Account={accountId:string;petId:string;cookie:string;csrf:string};

beforeAll(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^aetheria_soulbound_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local test database required');
 admin=new Pool({connectionString:url.toString()});
 schema='coop_settlement_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA "${schema}"`);
 url.searchParams.set('options','-c search_path='+schema);
 pool=new Pool({connectionString:url.toString()});
 await migrate(pool);
 await installGameplayConfig(pool,ruleset,baseBundle,engine,'system:test-installation');
 const config=readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:'coop-settlement-test-secret'.repeat(2),LOCAL_COOP_ROOMS:'1'});
 server=await createApp(config,pool,false,{});
});
afterAll(async()=>{await server?.app.close();await pool?.end();if(admin){await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}});
async function guest(name:string,petId:string):Promise<Account>{
 const response=await server.http.inject({method:'POST',url:'/v1/session/guest',remoteAddress:'127.213.1.'+address++,headers:{origin},payload:{requestId:randomUUID(),displayName:name,avatarKey:'mint'}});
 expect(response.statusCode).toBe(201);
 const {profile:{id:accountId},csrfToken:csrf}=response.json() as {profile:{id:string};csrfToken:string};
 const cookie=String(response.headers['set-cookie']).split(';')[0]!;
 await pool.query('INSERT INTO pet_wave_one_players(account_id,coins) VALUES($1,0) ON CONFLICT DO NOTHING',[accountId]);
 await pool.query('INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,$2,1,0,$3)',[accountId,petId,'starter']);
 return {accountId,petId,cookie,csrf};
}
async function deleteAccount(owner:Account,requestId=randomUUID()){
 return server.http.inject({
  method:'DELETE',url:'/v1/me',
  headers:{origin,cookie:owner.cookie,'x-csrf-token':owner.csrf,'idempotency-key':requestId},
 });
}
async function fixture(accounts:Account[],outcome:'won'|'lost'){
 const roomId=randomUUID(),matchId=randomUUID(),bootId=randomUUID(),worldId='native:coop-'+matchId;
 const settlementId=randomUUID();
 await pool.query("INSERT INTO coop_rooms(id,ruleset,boss_id,host_account_id,config_version,config_digest,required_points,status,revision) VALUES($1,'arena8-coop-pve','cinder-terraces-warden',$2,1,$3,5000,'OPEN',3)",[roomId,accounts[0]!.accountId,digest]);
 for(const [index,account] of accounts.entries())
  await pool.query('INSERT INTO coop_room_seats(room_id,seat,account_id,pet_id,pet_level,ready) VALUES($1,$2,$3,$4,1,true)',[roomId,index,account.accountId,account.petId]);
 await pool.query("UPDATE coop_rooms SET status='LOCKED',revision=revision+1 WHERE id=$1",[roomId]);
 await pool.query("UPDATE coop_rooms SET status='STARTED',revision=revision+1 WHERE id=$1",[roomId]);
 const seats=accounts.map(account=>({account:account.accountId,petId:account.petId,petLevel:1,artifactPowerPm:1000}));
 await pool.query("INSERT INTO coop_allocations(match_id,room_id,ruleset,config_version,config_digest,content_hash,world_id,boot_id,generation,seats,status) VALUES($1,$2,'arena8-coop-pve',1,$3,$4,$5,$6,1,$7::jsonb,'ACTIVE')",[matchId,roomId,digest,contentHash,worldId,bootId,JSON.stringify(seats)]);
 await pool.query("INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,protocol_version,canonical_version,rng_version,owner_boot_id,epoch,state_version,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot) VALUES($1,$2,'arena8-coop-pve',1,decode($3,'hex'),$4,1,1,1,$5,1,1,0,0,0,'SETTLING',$6,$7,'fixture-key',$8,$9,$10)",[matchId,worldId,contentHash,randomBytes(32),bootId,randomBytes(32),randomBytes(32),randomBytes(12),randomBytes(16),Buffer.from('sealed')]);
 await pool.query("INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,committed_version,epoch,receipt_hash,key_id,nonce,tag,sealed_receipt) VALUES($1,$2,$3,$4,1,1,$5,'fixture-key',$6,$7,$8)",[matchId,accounts[0]!.accountId,randomUUID(),randomBytes(32),randomBytes(32),randomBytes(12),randomBytes(16),Buffer.from('receipt')]);
 const proposal={
  configDigest:digest,contentHash,kind:'coop.completed.v1',outcome,
  participants:accounts.map(account=>({account:account.accountId,alive:true,damage:1_000_001,healing:2_000_000,petId:account.petId,shielding:3_000_000})),
  round:6,ruleset:'arena8-coop-pve',rulesetVersion:1,turn:14,
 };
 await pool.query('INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,1,1,$2,$3,$4::jsonb)',[matchId,settlementId,canonicalProposalHash(proposal),JSON.stringify(proposal)]);
 await pool.query("INSERT INTO game_native_outbox(event_id,match_id,settlement_id,effect_type) VALUES($1,$2,$3,'game.settlement.v1')",[randomUUID(),matchId,settlementId]);
 return {roomId,matchId,settlementId};
}

describe('cooperative settlement',()=>{
 it('pays every seat exactly once from the pinned published rewards',async()=>{
  const accounts=[await guest('Settle one',pets[0]!),await guest('Settle two',pets[1]!),await guest('Settle three',pets[2]!),await guest('Settle four',pets[3]!)];
  const {matchId,settlementId}=await fixture(accounts,'won');
  const settlement=new CoopSettlement(pool);
  await settlement.drain();
  const inbox=(await pool.query('SELECT outcome,achievement_points FROM coop_settlement_inbox WHERE settlement_id=$1',[settlementId])).rows;
  expect(inbox).toEqual([{outcome:'won',achievement_points:250}]);
  const rewards=(await pool.query('SELECT account_id,seat,outcome,achievement_points,coins,exp FROM coop_settlement_rewards WHERE settlement_id=$1 ORDER BY seat',[settlementId])).rows;
  expect(rewards).toHaveLength(4);
  expect(rewards.map(row=>row.account_id)).toEqual(accounts.map(account=>account.accountId));
  for(const row of rewards)expect(row).toMatchObject({outcome:'won',achievement_points:250,coins:120,exp:90});
  const ledger=(await pool.query("SELECT account_id,points FROM coop_achievement_ledger WHERE source='settlement' AND source_ref=$1 ORDER BY account_id",[settlementId])).rows;
  expect(ledger).toHaveLength(4);
  for(const row of ledger)expect(row.points).toBe(250);
  for(const account of accounts){
   const player=(await pool.query('SELECT coins FROM pet_wave_one_players WHERE account_id=$1',[account.accountId])).rows[0];
   expect(player.coins).toBe(120);
   const pet=(await pool.query('SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',[account.accountId,account.petId])).rows[0];
   expect(pet).toEqual({level:3,exp:25});
  }
  const allocation=(await pool.query('SELECT status FROM coop_allocations WHERE match_id=$1',[matchId])).rows[0];
  expect(allocation.status).toBe('SETTLED');
  const match=(await pool.query('SELECT status FROM game_native_matches WHERE id=$1',[matchId])).rows[0];
  expect(match.status).toBe('FINISHED');
  const outbox=(await pool.query('SELECT delivered_at,delivery_outcome FROM game_native_outbox WHERE match_id=$1',[matchId])).rows[0];
  expect(outbox.delivered_at).not.toBeNull();expect(outbox.delivery_outcome).toBe('granted');

  // A retried drain changes nothing and pays nothing twice.
  await settlement.drain();
  expect((await pool.query('SELECT count(*)::int AS n FROM coop_settlement_rewards')).rows[0].n).toBe(4);
  expect((await pool.query('SELECT count(*)::int AS n FROM coop_achievement_ledger')).rows[0].n).toBe(4);
  expect((await pool.query('SELECT coins FROM pet_wave_one_players WHERE account_id=$1',[accounts[0]!.accountId])).rows[0].coins).toBe(120);
 });
 it.each([0,1])('preserves terminal peers’ rewards when seat %i deletes before the worker drains',async deletedSeat=>{
  const accounts=await Promise.all(pets.map((pet,index)=>guest('Deletion '+index,pet)));
  const {roomId,matchId,settlementId}=await fixture(accounts,'won');
  const owner=accounts[deletedSeat]!;
  const response=await deleteAccount(owner);
  expect(response.statusCode,response.body).toBe(200);
  expect(response.json()).toEqual({deleted:true});
  expect((await pool.query('SELECT 1 FROM identity_accounts WHERE id=$1',[owner.accountId])).rowCount).toBe(0);
  expect((await pool.query('SELECT 1 FROM coop_room_seats WHERE room_id=$1 AND account_id=$2',[roomId,owner.accountId])).rowCount).toBe(0);
  expect((await pool.query('SELECT status FROM coop_rooms WHERE id=$1',[roomId])).rows)
   .toEqual(deletedSeat===0?[]:[{status:'CLOSED'}]);
  await Promise.all([new CoopSettlement(pool).drain(),new CoopSettlement(pool).drain()]);
  const rewards=(await pool.query(
   'SELECT account_id,seat,achievement_points,coins,exp FROM coop_settlement_rewards WHERE settlement_id=$1 ORDER BY seat',[settlementId],
  )).rows;
  expect(rewards).toEqual(accounts.flatMap((account,seat)=>seat===deletedSeat?[]:[{
   account_id:account.accountId,seat,achievement_points:250,coins:120,exp:90,
  }]));
  for(const peer of accounts.filter(account=>account!==owner)){
   const receipt=await server.http.inject({url:'/v1/coop/rooms/'+roomId+'/reward',headers:{cookie:peer.cookie}});
   expect(receipt.statusCode,receipt.body).toBe(200);
   expect(receipt.json()).toMatchObject({matchId,achievementPoints:250,coins:120,exp:90});
   expect((await pool.query('SELECT coins FROM pet_wave_one_players WHERE account_id=$1',[peer.accountId])).rows).toEqual([{coins:120}]);
  }
  expect((await pool.query('SELECT status FROM game_native_matches WHERE id=$1',[matchId])).rows).toEqual([{status:'FINISHED'}]);
  expect((await pool.query('SELECT delivery_outcome FROM game_native_outbox WHERE match_id=$1',[matchId])).rows).toEqual([{delivery_outcome:'granted'}]);
 });
 it('retries erasure after a worker-held claim without losing or duplicating peer rewards',async()=>{
  const accounts=await Promise.all(pets.map((pet,index)=>guest('Claim race '+index,pet)));
  const {matchId,settlementId}=await fixture(accounts,'won');
  const owner=accounts[1]!,requestId=randomUUID();
  const worker=await pool.connect();
  try{
   await worker.query('BEGIN');
   await worker.query('SELECT event_id FROM game_native_outbox WHERE match_id=$1 FOR UPDATE',[matchId]);
   const busy=await deleteAccount(owner,requestId);
   expect(busy.statusCode,busy.body).toBe(409);
   expect(busy.json().error.code).toBe('REQUEST_CONFLICT');
   expect((await pool.query('SELECT 1 FROM identity_accounts WHERE id=$1',[owner.accountId])).rowCount).toBe(1);
   expect((await pool.query('SELECT 1 FROM coop_settlement_inbox WHERE settlement_id=$1',[settlementId])).rowCount).toBe(0);
  }finally{
   await worker.query('ROLLBACK');
   worker.release();
  }
  await new CoopSettlement(pool).drain();
  const deleted=await deleteAccount(owner,requestId);
  expect(deleted.statusCode,deleted.body).toBe(200);
  await new CoopSettlement(pool).drain();
  const rewards=(await pool.query('SELECT seat,coins FROM coop_settlement_rewards WHERE settlement_id=$1 ORDER BY seat',[settlementId])).rows;
  expect(rewards).toEqual([{seat:0,coins:120},{seat:2,coins:120},{seat:3,coins:120}]);
 });
 it('pays the authored loss rewards without Pet EXP or coins',async()=>{
  const accounts=[await guest('Loss one',pets[0]!),await guest('Loss two',pets[1]!),await guest('Loss three',pets[2]!),await guest('Loss four',pets[3]!)];
  const {settlementId}=await fixture(accounts,'lost');
  await new CoopSettlement(pool).drain();
  const rewards=(await pool.query('SELECT achievement_points,coins,exp FROM coop_settlement_rewards WHERE settlement_id=$1',[settlementId])).rows;
  expect(rewards).toHaveLength(4);
  for(const row of rewards)expect(row).toMatchObject({achievement_points:25,coins:0,exp:0});
  const pet=(await pool.query('SELECT level,exp FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',[accounts[0]!.accountId,accounts[0]!.petId])).rows[0];
  expect(pet).toEqual({level:1,exp:0});
 });
});
