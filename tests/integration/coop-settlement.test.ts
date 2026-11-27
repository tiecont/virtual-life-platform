import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {CoopEncounterCatalogSchema} from '@aetheria/contracts';
import {migrate} from '../../apps/platform-api/src/shared/database/migrations';
import {createApp} from '../../apps/platform-api/src/app';
import {readConfig} from '../../apps/platform-api/src/shared/config/environment';
import {installGameplayConfig} from '../../apps/platform-api/src/features/gameplay/modules/config/application/seed-gameplay-config';
import {GameplayConfigStore} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/version-store';
import type {GameplayBundleValidator} from '../../apps/platform-api/src/features/gameplay/modules/config/infrastructure/engine-validator';
import {STARTING_MATERIALS,STARTER_ARTIFACT_DEFINITION_ID} from '../../apps/platform-api/src/features/pets/modules/wave-a-artifacts/domain/catalog';
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
 server=await createApp(config,pool,false,{
  petArenaWave1:{enabled:true},
  // The settle route consumes persisted terminal proposals without spawning a runtime.
  petArena8Native:{
   enabled:true,binary:'/unused',databaseUrl:process.env.TEST_DATABASE_URL!,role:'fixture_arena8',
   caFile:'/unused',storageKey:'a'.repeat(64),storageKeyId:'fixture-key',httpsOrigin:'https://127.0.0.1:4443',
   certFile:'/unused',keyFile:'/unused',
  },
 });
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
type FixtureBinding={version:number;digest:string;contentHash:string};
async function fixture(
 accounts:Account[],outcome:'won'|'lost',binding:FixtureBinding={version:1,digest,contentHash},participatingSeats:readonly number[]=[],
 encounter={bossId:baseBundle.boss.id,requiredPoints:baseBundle.boss.requiredRoomPoints},
){
 const roomId=randomUUID(),matchId=randomUUID(),bootId=randomUUID(),worldId='native:coop-'+matchId;
 const settlementId=randomUUID();
 const actions=[accounts[0]!,...participatingSeats.map(seat=>accounts[seat]!)];
 const stateVersion=actions.length;
 await pool.query("INSERT INTO coop_rooms(id,ruleset,boss_id,host_account_id,config_version,config_digest,required_points,status,revision) VALUES($1,'arena8-coop-pve',$2,$3,$4,$5,$6,'OPEN',3)",[roomId,encounter.bossId,accounts[0]!.accountId,binding.version,binding.digest,encounter.requiredPoints]);
 for(const [index,account] of accounts.entries())
  await pool.query('INSERT INTO coop_room_seats(room_id,seat,account_id,pet_id,pet_level,ready) VALUES($1,$2,$3,$4,1,true)',[roomId,index,account.accountId,account.petId]);
 await pool.query("UPDATE coop_rooms SET status='LOCKED',revision=revision+1 WHERE id=$1",[roomId]);
 await pool.query("UPDATE coop_rooms SET status='STARTED',revision=revision+1 WHERE id=$1",[roomId]);
 const seats=accounts.map(account=>({account:account.accountId,petId:account.petId,petLevel:1,artifactPowerPm:1000}));
 await pool.query("INSERT INTO coop_allocations(match_id,room_id,ruleset,config_version,config_digest,content_hash,world_id,boot_id,generation,seats,status) VALUES($1,$2,'arena8-coop-pve',$3,$4,$5,$6,$7,1,$8::jsonb,'ACTIVE')",[matchId,roomId,binding.version,binding.digest,binding.contentHash,worldId,bootId,JSON.stringify(seats)]);
 await pool.query("INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,protocol_version,canonical_version,rng_version,owner_boot_id,epoch,state_version,server_tick,logical_time_ms,rng_cursor,status,seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot) VALUES($1,$2,'arena8-coop-pve',1,decode($3,'hex'),$4,1,1,1,$5,1,1,0,0,0,'SETTLING',$6,$7,'fixture-key',$8,$9,$10)",[matchId,worldId,binding.contentHash,randomBytes(32),bootId,randomBytes(32),randomBytes(32),randomBytes(12),randomBytes(16),Buffer.from('sealed')]);
 for(const [index,account] of actions.entries()){
  const version=index+1;
  if(version>1)await pool.query('UPDATE game_native_matches SET state_version=$2 WHERE id=$1',[matchId,version]);
  await pool.query("INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,committed_version,epoch,receipt_hash,key_id,nonce,tag,sealed_receipt) VALUES($1,$2,$3,$4,$5,1,$6,'fixture-key',$7,$8,$9)",[matchId,account.accountId,randomUUID(),randomBytes(32),version,randomBytes(32),randomBytes(12),randomBytes(16),Buffer.from('receipt')]);
 }
 const proposal={
  configDigest:binding.digest,contentHash:binding.contentHash,kind:'coop.completed.v1',outcome,
  participants:accounts.map(account=>({account:account.accountId,alive:true,damage:1_000_001,healing:2_000_000,petId:account.petId,shielding:3_000_000})),
  round:6,ruleset:'arena8-coop-pve',rulesetVersion:1,turn:14,
 };
 await pool.query('INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,$2,1,$3,$4,$5::jsonb)',[matchId,stateVersion,settlementId,canonicalProposalHash(proposal),JSON.stringify(proposal)]);
 await pool.query("INSERT INTO game_native_outbox(event_id,match_id,settlement_id,effect_type) VALUES($1,$2,$3,'game.settlement.v1')",[randomUUID(),matchId,settlementId]);
 return {roomId,matchId,settlementId};
}

// Fixture the terminal Rust journal. The native settlement route
// verifies it and writes the rewards, encounter and campaign state.
async function regularWin(account:Account,mapId='cinder-terraces'){
 const matchId=randomUUID(),worldId='native:arena8-'+matchId,bootId=randomUUID();
 await pool.query(
  `INSERT INTO platform_native_arena8_matches(match_id,account_id,request_id,fingerprint,world_id,boot_id,content_hash,pet_id,map_id,encounter_id,level,artifacts,status)
   VALUES($1,$2,$3,$4,$5,$6,$4,$7,$8,$9,1,'[]','CLOSED')`,
  [matchId,account.accountId,randomUUID(),contentHash,worldId,bootId,account.petId,mapId,mapId+'-regular'],
 );
 await pool.query(
  `INSERT INTO game_native_matches(id,world_id,ruleset_id,ruleset_version,content_hash,engine_hash,protocol_version,
   canonical_version,rng_version,owner_boot_id,epoch,state_version,server_tick,logical_time_ms,rng_cursor,status,
   seed_commitment,audit_hash,snapshot_key_id,snapshot_nonce,snapshot_tag,sealed_snapshot)
   VALUES($1,$2,'arena8-pve',1,decode($3,'hex'),decode($3,'hex'),1,1,1,$4,1,1,1,0,0,'SETTLING',
   decode($3,'hex'),decode($3,'hex'),'fixture-key',$5,$6,$7)`,
  [matchId,worldId,contentHash,bootId,randomBytes(12),randomBytes(16),Buffer.from('sealed')],
 );
 await pool.query(
  `INSERT INTO game_native_receipts(match_id,actor_id,command_id,payload_fingerprint,committed_version,epoch,
   receipt_hash,key_id,nonce,tag,sealed_receipt) VALUES($1,$2,$3,$4,1,1,$4,'fixture-key',$5,$6,$7)`,
  [matchId,account.accountId,randomUUID(),randomBytes(32),randomBytes(12),randomBytes(16),Buffer.from('receipt')],
 );
 const proposal={ruleset:'arena8-pve',outcome:'won'};
 await pool.query(
  'INSERT INTO game_native_settlements(match_id,state_version,epoch,settlement_id,proposal_hash,proposal) VALUES($1,1,1,$2,$3,$4)',
  [matchId,randomUUID(),canonicalProposalHash(proposal),JSON.stringify(proposal)],
 );
 return ()=>server.http.inject({
  method:'POST',url:'/v1/pets/wave-a/arena8/native/matches/'+matchId+'/settle',
  headers:{origin,cookie:account.cookie,'x-csrf-token':account.csrf},payload:{requestId:randomUUID()},
 });
}

function fixtureRewardPolicy(recruitmentPetIds:readonly string[]){
 return {
  recruitmentPetIds,minimumActions:{victory:1,defeat:0},
  firstClear:{achievementPoints:250,coins:120,exp:90,materials:5},
  repeatClear:{achievementPoints:250,coins:120,exp:90,materials:1},
  defeat:{achievementPoints:25,coins:0,exp:0,materials:0},
 };
}

function publishRecruitment(recruitmentPetIds:string[]){
 return publishSettlementFixture([{
  ...baseBundle.boss,mapId:'cinder-terraces',rewardPolicy:fixtureRewardPolicy(recruitmentPetIds),
 }]);
}

async function publishSettlementFixture(bosses:readonly Record<string,unknown>[]):Promise<FixtureBinding>{
 const store=new GameplayConfigStore(),tx=await pool.connect(),actor='system:test-installation';
 const bundle={schemaVersion:2,rewards:baseBundle.rewards,bosses};
 // Match-terminal fixtures isolate Nest settlement; engine tests validate real bundles.
 const digest=canonicalProposalHash(bundle).toString('hex');
 const contentHash=canonicalProposalHash({digest}).toString('hex');
 try{
  await tx.query('BEGIN');
  const active=(await store.active(tx,ruleset,true))!,version=await store.nextVersion(tx,ruleset);
  const draft=await store.insertDraft(tx,{ruleset,version,parentVersion:active.version,bundle,actor});
  const validated=(await store.markValidated(tx,{ruleset,version,expectedRevision:draft.revision,digest,engineCapability:'arena8-coop-v1',actor}))!;
  await store.markPublished(tx,{ruleset,version,expectedRevision:validated.revision,actor});
  await store.setActive(tx,{ruleset,version,expectedRevision:active.revision,actor});
  await store.supersede(tx,{ruleset,version:active.version,actor});
  await tx.query('COMMIT');
  return {version,digest,contentHash};
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
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
 it('grants the first unowned pinned recruit only when a qualified winner completes the map',async()=>{
  const accounts=await Promise.all(['ground-clodkin','water-dewskip','electric-zipspool','light-gleamlet']
   .map((pet,index)=>guest('Recruit '+index,pet)));
  const [regular,legendary,noRegular,inactive]=accounts as [Account,Account,Account,Account];
  const preserved=(await pool.query(
   "INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,'fire-coalwhisk',8,7,'starter') RETURNING owned_pet_instance_id",
   [regular.accountId],
  )).rows[0];
  await pool.query(
   "INSERT INTO pet_wave_one_owned(account_id,pet_id,level,exp,source) VALUES($1,'fire-coalwhisk',1,0,'campaign'),($1,'fire-emberloom',1,0,'campaign')",
   [legendary.accountId],
  );
  for(const account of [regular,legendary,inactive])await pool.query(
   "INSERT INTO pet_wave_one_encounters(account_id,map_id,encounter_id) VALUES($1,'cinder-terraces','cinder-terraces-regular')",
   [account.accountId],
  );
  const pinned=await publishRecruitment(['fire-coalwhisk','fire-emberloom','fire-pyrecrown']);
  const {roomId,settlementId}=await fixture(accounts,'won',pinned,[0,1,2]);
  const current=await publishRecruitment(['fire-kilnback']);
  expect((await new GameplayConfigStore().active(pool,ruleset))?.version).toBe(current.version);
 expect((await new GameplayConfigStore().read(pool,ruleset,pinned.version))?.state).toBe('SUPERSEDED');

  const ownedRecruits=async(account:Account)=>(await pool.query(
   "SELECT pet_id,level,exp,source,owned_pet_instance_id FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id LIKE 'fire-%' ORDER BY pet_id",
   [account.accountId],
  )).rows;
  await pool.query(`CREATE FUNCTION reject_coop_recruit_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic settlement commit failure'; END; $$;
   CREATE CONSTRAINT TRIGGER reject_coop_recruit_commit AFTER INSERT ON coop_settlement_rewards
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_coop_recruit_commit()`);
  await expect(new CoopSettlement(pool).drain()).rejects.toThrow('synthetic settlement commit failure');
  expect(await ownedRecruits(regular)).toHaveLength(1);
  expect((await pool.query('SELECT 1 FROM pet_wave_one_map_clears WHERE account_id=$1',[regular.accountId])).rowCount).toBe(0);
  expect((await pool.query('SELECT 1 FROM coop_settlement_inbox WHERE settlement_id=$1',[settlementId])).rowCount).toBe(0);
  await pool.query('DROP TRIGGER reject_coop_recruit_commit ON coop_settlement_rewards');

  await Promise.all([new CoopSettlement(pool).drain(),new CoopSettlement(pool).drain()]);
  const regularOwned=await ownedRecruits(regular);
  expect(regularOwned).toMatchObject([
   {pet_id:'fire-coalwhisk',level:8,exp:7,source:'starter',...preserved},
   {pet_id:'fire-emberloom',level:1,exp:0,source:'campaign'},
  ]);
  expect((await ownedRecruits(legendary)).map(row=>row.pet_id)).toEqual(['fire-coalwhisk','fire-emberloom','fire-pyrecrown']);
  expect(await ownedRecruits(noRegular)).toEqual([]);
  expect(await ownedRecruits(inactive)).toEqual([]);
  const clears=(await pool.query("SELECT account_id FROM pet_wave_one_map_clears WHERE map_id='cinder-terraces'")).rows;
  expect(clears.map(row=>row.account_id).sort()).toEqual([regular.accountId,legendary.accountId].sort());
  const state=await server.http.inject({url:'/v1/pets/wave1/state',headers:{cookie:regular.cookie}});
  expect(state.statusCode,state.body).toBe(200);
  expect(state.json()).toMatchObject({
   pets:expect.arrayContaining([expect.objectContaining({
    petId:'fire-emberloom',level:1,exp:0,ownedPetInstanceId:regularOwned[1].owned_pet_instance_id,
   })]),
   campaign:{clearedMaps:['cinder-terraces'],nextMapId:'tideglass-lagoon'},
  });

  await pool.query("UPDATE coop_rooms SET status='CLOSED',revision=revision+1 WHERE id=$1",[roomId]);
  await fixture(accounts,'won',current,[0,1,2]);
  await new CoopSettlement(pool).drain();
  expect(await ownedRecruits(regular)).toEqual(regularOwned);
  expect(await ownedRecruits(noRegular)).toEqual([]);
 });
 it('preserves first-clear recruitment in either encounter order through native regular settlement',async()=>{
  const [host,regularFirst,bossFirst,peer]=await Promise.all([
   guest('Order host','light-gleamlet'),guest('Regular first','ground-clodkin'),
   guest('Boss first','water-dewskip'),guest('Order peer','electric-zipspool'),
  ]);
  const regularSettle=await regularWin(regularFirst);
  const beforeBoss=await regularSettle();
  expect(beforeBoss.statusCode,beforeBoss.body).toBe(200);
  expect(beforeBoss.json()).toMatchObject({firstClear:true,recruitedPetId:'fire-coalwhisk',clearedMaps:[]});

  const inventory=await pool.query('SELECT definition_id FROM pet_artifact_owned WHERE account_id=$1 AND acquired_from=$2',[regularFirst.accountId,'starter']);
  expect(inventory.rows).toEqual([{definition_id:STARTER_ARTIFACT_DEFINITION_ID}]);
  const wallet=await pool.query('SELECT materials FROM pet_artifact_players WHERE account_id=$1',[regularFirst.accountId]);
  expect(wallet.rows[0]?.materials).toBe(STARTING_MATERIALS+beforeBoss.json().materials);

  const pinned=await publishRecruitment(['fire-coalwhisk','fire-emberloom']);
  const accounts=[host,regularFirst,bossFirst,peer];
  const {matchId,roomId}=await fixture(accounts,'won',pinned,[0,1,2,3]);
  await new CoopSettlement(pool).drain();
  expect((await pool.query('SELECT 1 FROM pet_wave_one_map_clears WHERE account_id=$1',[bossFirst.accountId])).rowCount).toBe(0);
  const replacement=await publishRecruitment(['fire-kilnback']);
  await pool.query("UPDATE coop_rooms SET status='CLOSED',revision=revision+1 WHERE id=$1",[roomId]);
  const repeat=await fixture(accounts,'won',replacement,[0,1,2,3]);
  // Erasure settles the already committed repeat and removes the host's rooms.
  const deleted=await deleteAccount(host);
  expect(deleted.statusCode,deleted.body).toBe(200);
  expect((await pool.query('SELECT 1 FROM coop_allocations WHERE match_id=ANY($1::uuid[])',[[matchId,repeat.matchId]])).rowCount).toBe(0);
  expect((await pool.query('SELECT status FROM game_native_matches WHERE id=$1',[repeat.matchId])).rows).toEqual([{status:'FINISHED'}]);
  await expect(pool.query(
   "UPDATE pet_wave_one_encounters SET coop_recruitment_pet_ids=ARRAY['fire-kilnback'] WHERE account_id=$1 AND encounter_id='cinder-terraces-boss'",
   [bossFirst.accountId],
  )).rejects.toThrow('Gameplay configuration journal is immutable');

  const afterBoss=await regularWin(bossFirst);
  const responses=await Promise.all([afterBoss(),afterBoss()]);
  for(const response of responses){
   expect(response.statusCode,response.body).toBe(200);
   expect(response.json()).toMatchObject({firstClear:true,recruitedPetId:'fire-emberloom',clearedMaps:['cinder-terraces']});
  }
  expect(responses[0]!.json()).toEqual(responses[1]!.json());
  for(const account of [regularFirst,bossFirst]){
   const owned=await pool.query(
    "SELECT pet_id,source FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id LIKE 'fire-%' ORDER BY pet_id",
    [account.accountId],
   );
   expect(owned.rows).toEqual([
    {pet_id:'fire-coalwhisk',source:'campaign'},{pet_id:'fire-emberloom',source:'campaign'},
   ]);
  }
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
 it('persists six paired campaign clears, recruits and hosting unlocks through terminal settlement',async()=>{
  const readJson=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
  const prerequisites=readJson('../fixtures/coop-campaign-prerequisites.json') as Record<string,string|null>;
  const {maps}=readJson('../../specs/pet-arena/mvp-wave1-43-pets.json') as {
   maps:{id:string;name:string;regularPetIds:string[]}[];
  };
  expect(maps).toHaveLength(6);
  expect(Object.keys(prerequisites)).toEqual(maps.map(map=>map.id));
  const bosses=maps.map(map=>({
   ...baseBundle.boss,id:map.id+'-warden',name:map.name+' Warden',mapId:map.id,
   ...(prerequisites[map.id]?{requiredMapClear:prerequisites[map.id]}:{}),
   // A zero fixture threshold isolates prerequisite behavior from achievement progression.
   requiredRoomPoints:0,rewardPolicy:fixtureRewardPolicy(map.regularPetIds.slice(0,2)),
  }));
  const binding=await publishSettlementFixture(bosses);
  const accounts=await Promise.all(['pet-v3-fire-icarus','fire-coalwhisk','water-dewskip','ground-clodkin']
   .map((pet,index)=>guest('Campaign seat '+index,pet)));
  const host=accounts[0]!;
  const readCatalog=async()=>{
   const response=await server.http.inject({url:'/v1/coop/encounters',headers:{cookie:host.cookie}});
   expect(response.statusCode,response.body).toBe(200);
   return CoopEncounterCatalogSchema.parse(response.json());
  };
  const readState=async()=>{
   const response=await server.http.inject({url:'/v1/pets/wave1/state',headers:{cookie:host.cookie}});
   expect(response.statusCode,response.body).toBe(200);
   return response.json();
  };
  for(const [index,map] of maps.entries()){
   const boss=bosses[index]!;
   const before=await readCatalog();
   expect(before.configVersion).toBe(binding.version);
   expect(before.encounters.filter(encounter=>encounter.eligible).map(encounter=>encounter.mapId))
    .toEqual(maps.slice(0,index+1).map(entry=>entry.id));

   const regularSettle=await regularWin(host,map.id);
   const settleRegular=async()=>{
    const response=await regularSettle();
    expect(response.statusCode,response.body).toBe(200);
    const receipt=response.json();
    expect(receipt).toMatchObject({won:true,firstClear:true});
    return receipt;
   };
   const settleBoss=async()=>{
    const terminal=await fixture(accounts,'won',binding,[0,1,2,3],{
     bossId:boss.id,requiredPoints:boss.requiredRoomPoints,
    });
    await new CoopSettlement(pool).drain();
    const receipt=await server.http.inject({url:'/v1/coop/rooms/'+terminal.roomId+'/reward',headers:{cookie:host.cookie}});
    expect(receipt.statusCode,receipt.body).toBe(200);
    expect(receipt.json()).toMatchObject({matchId:terminal.matchId,outcome:'won',firstClear:true,materials:5});
    await pool.query("UPDATE coop_rooms SET status='CLOSED',revision=revision+1 WHERE id=$1",[terminal.roomId]);
   };

   // Alternate the order across maps. Completing only one encounter must not
   // advance either the campaign state or the cooperative hosting catalog.
   const regularFirst=index%2===0;
   if(regularFirst)await settleRegular();
   else await settleBoss();
   expect((await readState()).campaign.nextMapId).toBe(map.id);
   expect((await readCatalog()).encounters.map(encounter=>encounter.eligible))
    .toEqual(before.encounters.map(encounter=>encounter.eligible));

   if(regularFirst)await settleBoss();
   else await settleRegular();
   const state=await readState();
   expect(state.campaign).toEqual({
    clearedMaps:maps.slice(0,index+1).map(entry=>entry.id),nextMapId:maps[index+1]?.id??null,
   });
   for(const petId of boss.rewardPolicy.recruitmentPetIds){
    expect(state.pets.filter((pet:{petId:string})=>pet.petId===petId)).toEqual([
     expect.objectContaining({petId,ownedPetInstanceId:expect.stringMatching(/^[a-f0-9-]{36}$/i),level:1}),
    ]);
   }
   const updated=await readCatalog();
   expect(updated.encounters.filter(encounter=>encounter.eligible).map(encounter=>encounter.mapId))
    .toEqual(maps.slice(0,index+2).map(entry=>entry.id));
   const next=updated.encounters[index+1];
   if(next)expect(next.prerequisite).toMatchObject({mapId:map.id,cleared:true});
  }
 });
});
