import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pureSwap} from './coop-visible-kind-swap.mjs';

const first='recruit-fire-coalwhisk';
const next='recruit-fire-emberloom';
const disabled='recruit-fire-kilnback';
const mapId='cinder-terraces';
const allocateEndpoint='/v1/pets/wave-a/arena8/native/allocate';

export function enableCampaignProbeRoutes(bundle,coOp){
 assert.equal(bundle.schemaVersion,7);
 assert.equal(bundle.campaignRoutes.length,48);
 assert.ok(bundle.campaignRoutes.every(route=>!route.enabled));
 for(const id of [first,next]){
  const route=bundle.campaignRoutes.find(row=>row.id===id);
  assert.equal(route.mode,'solo');
  route.enabled=true;
  // The authored entries are solo-oriented. Only the separate disposable
  // co-op proof opens the same exact combat profiles to the other seat mode.
  if(coOp)route.mode='either';
 }
 bundle.contentRevision++;
}

function requireResponse(response,status){
 assert.equal(response.statusCode,status,response.body);
 return response.json();
}

function tacticalAction(view,legalSwap){
 const seat=view.participants[view.activeSeat];
 const pending=view.pending?.remaining===1?view.pending.damage:0;
 const moves=[...(seat.hp<seat.maxHp/2&&pending?['frost','shield','heart']:[]),'sword'];
 for(const kind of moves){
  const swap=pureSwap(view.board,kind,true);
  if(swap)return swap.action;
 }
 const attack=view.abilities.find(ability=>ability.ready&&
  ['ultimate','signature','skill'].includes(ability.kind)&&
  ['damage','chain-damage','damage-over-time'].includes(ability.effectKind));
 if(attack)return {kind:attack.kind};
 for(const kind of ['mana','special','rage']){
  const swap=pureSwap(view.board,kind,true);
  if(swap)return swap.action;
 }
 return legalSwap(view.board);
}

async function terminalJournal(pool,matchId){
 return (await pool.query(`
  SELECT n.state_version::int AS version,n.status,s.settlement_id,s.proposal,o.delivery_outcome,
   (SELECT jsonb_agg(r.actor_id ORDER BY r.committed_version) FROM game_native_receipts r
     WHERE r.match_id=n.id AND r.committed_version>1) AS combat_actors
   FROM game_native_matches n JOIN game_native_settlements s ON s.match_id=n.id
    JOIN game_native_outbox o ON o.match_id=n.id AND o.settlement_id=s.settlement_id
   WHERE n.id=$1`,[matchId])).rows[0];
}

async function rewardsSnapshot(pool,accounts){
 return (await pool.query(`
  SELECT p.account_id,p.coins,
   (SELECT jsonb_agg(jsonb_build_array(o.pet_id,o.level,o.exp,o.source) ORDER BY o.pet_id)
     FROM pet_wave_one_owned o WHERE o.account_id=p.account_id) AS owned,
   (SELECT COALESCE(sum(points),0)::int FROM coop_achievement_ledger l WHERE l.account_id=p.account_id) AS points,
   (SELECT materials FROM pet_artifact_players a WHERE a.account_id=p.account_id) AS materials
  FROM pet_wave_one_players p WHERE p.account_id=ANY($1::uuid[]) ORDER BY p.account_id`,[accounts])).rows;
}

export async function verifyCampaignRoute({
 coOp,pool,published,original,originalVersion,host,members,outsider,mark,get,post,soloAdmission,native,
 connections,closeMatch,prepareRoom,allocate,legalSwap,drain,
}){
 const baseline=original.bundle;
 assert.equal(baseline.schemaVersion,7);
 assert.equal(baseline.campaignRoutes.length,48);
 assert.ok(baseline.campaignRoutes.every(route=>!route.enabled));
 const expected=structuredClone(baseline);
 enableCampaignProbeRoutes(expected,coOp);
 assert.deepEqual(published.bundle,expected);
 assert.notEqual(original.content_digest,published.digest);
 const routeById=id=>published.bundle.campaignRoutes.find(route=>route.id===id);
 for(const id of [first,next])
  assert.deepEqual(routeById(id).profile,baseline.campaignRoutes.find(route=>route.id===id).profile);
 const routeCatalog=async member=>{
  const view=requireResponse(await get(member,'/v1/coop/campaign-routes'),200);
  assert.equal(view.configVersion,published.version);
  assert.deepEqual(view.routes.map(row=>row.id),[first,next]);
  return new Map(view.routes.map(row=>[row.id,row]));
 };
 const accounts=members.map(member=>member.accountId);
 for(const member of members){
  const inventory=requireResponse(await get(member,'/v1/pets/artifacts/state'),200);
  assert.ok(inventory.inventory.every(item=>item.equipped===null));
 }
 const request=id=>({requestId:randomUUID(),boardRuleset:'functional',petId:host.petId,mapId,encounterId:id});
 const roomRequest=id=>({requestId:randomUUID(),bossId:id,mapId,petId:host.petId,ownedPetInstanceId:host.instanceId});
 const eligible=coOp?'canHostCoop':'canEnterSolo';
 const admissionPath=coOp?'/v1/coop/rooms':allocateEndpoint;
 const inputFor=coOp?roomRequest:request;
 const initial=await routeCatalog(host);
 assert.equal(initial.get(first)[eligible],true);
 assert.equal(initial.get(next)[eligible],false);
 const locked=await post(host,admissionPath,inputFor(next));
 assert.equal(locked.statusCode,403,locked.body);
 assert.equal(locked.json().error.message,'Clear the required campaign encounter first');
 const hidden=await post(host,admissionPath,inputFor(disabled));
 assert.equal(hidden.statusCode,404,hidden.body);
 mark('schema 7 used an unmodified authored combat comparison and gated disposable publication',{
  originalVersion,originalDigest:original.content_digest,enabledVersion:published.version,enabledDigest:published.digest,
  sourceRouteCount:baseline.campaignRoutes.length,enabledRoutes:[first,next],nextBeforeClearStatus:locked.statusCode,
  disabledRouteStatus:hidden.statusCode,modeOverride:coOp?'the two entry routes temporarily permit co-op only in this fixture':null,
  combatAdjustments:[],accountSetup:'ordinary Wave 1 starter state; no injected Pet, level, currency, item or clear',
 });

 async function play(id,firstClear){
  const route=routeById(id);
  const before=await rewardsSnapshot(pool,accounts);
  let match;
  if(coOp){
   const body=requireResponse(await post(host,admissionPath,roomRequest(id)),200);
   assert.equal(body.bossId,id);
   match=await allocate(published,await prepareRoom(published,body));
  }else{
   const input=request(id);
   const admission=await soloAdmission(input);
   assert.equal(admission.clientBuild,'unity-native-v4');
   assert.equal(admission.allocation.encounterId,id);
   assert.equal(admission.allocation.level,before[0].owned.find(([pet])=>pet===host.petId)[1]);
   match={input,admission,row:{match_id:admission.matchId,content_hash:admission.contentHash},version:published};
  }
  connections.push(match);
  let cursor=await native(match,0,0,{kind:'start'});
  assert.equal(cursor.committed,true,JSON.stringify(cursor));
  assert.equal(cursor.version,1);
  assert.equal(cursor.state.participants.length,members.length);
  assert.equal(cursor.state.bossId,id);
  assert.equal(cursor.state.ruleset.version,coOp?5:4);
  assert.equal(cursor.state.ruleset.configDigest,published.digest);
  assert.equal(cursor.state.ruleset.contentHash,match.row.content_hash);
  assert.equal(cursor.state.boss.maxHp,route.profile.maxHp);
  assert.equal(cursor.state.turnTimeoutMs,15_000);
  const kinds=new Set();
  const phases=new Set();
  const actions=[];
  while(cursor.state.phase==='playing'&&actions.length<30){
   phases.add(cursor.state.boss.phase);
   assert.equal(cursor.state.board.length,64);
   for(const tile of cursor.state.board)kinds.add(tile.kind);
   const seat=cursor.state.activeSeat;
   // One ordinary Guard rotation gives every co-op seat its own committed
   // combat action before anyone can finish a two-phase entry encounter.
   const actingView=coOp&&cursor.state.you!==seat?await native(match,seat,0):cursor;
   assert.equal(actingView.version,cursor.version);
   assert.equal(actingView.state.you,seat);
   const action=coOp&&actions.length<4?{kind:'guard'}:tacticalAction(actingView.state,legalSwap);
   const result=await native(match,seat,cursor.version,action);
   assert.equal(result.committed,true,JSON.stringify({action,result}));
   assert.equal(result.version,cursor.version+1);
   actions.push({kind:action.kind,seat,version:result.version,bossHp:result.state.boss.hp,bossPhase:result.state.boss.phase});
   cursor=result;
  }
  assert.equal(cursor.state.phase,'won',JSON.stringify(actions));
  phases.add(cursor.state.boss.phase);
  assert.deepEqual([...phases],[1,2]);
  assert.ok(actions.some(action=>action.kind==='swap'));
  const matchId=match.row.match_id;
  const committed=await terminalJournal(pool,matchId);
  assert.equal(committed.version,cursor.version);
  assert.equal(committed.proposal.outcome,'won');
  assert.equal(committed.proposal.encounterId,id);
  assert.equal(committed.proposal.configDigest,published.digest);
  assert.equal(committed.proposal.contentHash,match.row.content_hash);
  assert.deepEqual(committed.proposal.participants.map(seat=>seat.account),accounts);
  assert.equal(committed.combat_actors.length,actions.length);
  assert.deepEqual([...new Set(committed.combat_actors)].sort(),[...accounts].sort());

  const payout=route.profile.rewardPolicy[firstClear?'firstClear':'repeatClear'];
  let receipts;
  if(coOp){
   const rewardPath='/v1/coop/rooms/'+match.room.roomId+'/reward';
   await drain();
   receipts=await Promise.all(members.map(async member=>requireResponse(await get(member,rewardPath),200)));
   await drain();
   assert.deepEqual(await Promise.all(members.map(async member=>requireResponse(await get(member,rewardPath),200))),receipts);
  }else{
   const settlePath='/v1/pets/wave-a/arena8/native/matches/'+matchId+'/settle';
   assert.equal((await post(outsider,settlePath,{requestId:randomUUID()})).statusCode,403);
   const receipt=requireResponse(await post(host,settlePath,{requestId:randomUUID()}),200);
   assert.deepEqual(requireResponse(await post(host,settlePath,{requestId:randomUUID()}),200),receipt);
   const oldOwned=before[0].owned.some(([pet])=>pet===route.opponentPetId);
   assert.equal(receipt.recruitedPetId,firstClear&&!oldOwned?route.opponentPetId:null);
   assert.deepEqual(receipt.clearedMaps,[]);
   receipts=[receipt];
  }
  closeMatch(match);
  for(const receipt of receipts){
   assert.equal(receipt.firstClear,firstClear);
   assert.equal(receipt.coins,payout.coins);
   assert.equal(receipt.exp,payout.exp);
   assert.equal(receipt.materials,payout.materials);
  }
  const completed=await terminalJournal(pool,matchId);
  assert.equal(completed.status,'FINISHED');
  assert.equal(completed.delivery_outcome,'granted');
  assert.deepEqual(completed.proposal,committed.proposal);
  assert.deepEqual(completed.combat_actors,committed.combat_actors);
  const {rows:clears}=await pool.query(`
   SELECT account_id,config_version::int AS version,config_digest,match_id,settlement_id
   FROM pet_arena_campaign_route_clears WHERE route_id=$1 ORDER BY account_id`,[id]);
  assert.deepEqual(clears.map(row=>row.account_id),[...accounts].sort());
  assert.ok(clears.every(row=>row.version===published.version&&row.config_digest===published.digest&&
   (firstClear?(row.match_id===matchId&&row.settlement_id===completed.settlement_id):row.match_id!==matchId)));
  const after=await rewardsSnapshot(pool,accounts);
  for(const [index,current] of after.entries()){
   const old=before[index];
   assert.equal(current.coins-old.coins,payout.coins);
   assert.equal(current.points-old.points,payout.achievementPoints);
   assert.equal((current.materials??0)-(old.materials??0),payout.materials);
   const expectedNew=firstClear&&!old.owned.some(([pet])=>pet===route.opponentPetId)
    ?[[route.opponentPetId,1,0,'campaign']]:[];
   assert.deepEqual(current.owned.filter(([pet])=>!old.owned.some(([prior])=>prior===pet)),expectedNew);
  }
  mark('authenticated route victory produced a single pinned reward and durable clear',{
   routeId:id,matchId,partySize:members.length,firstClear,phases:[...phases],
   actions,observedKinds:[...kinds].sort(),participantReceipts:receipts.length,
   exactRepeat:true,proposalId:completed.settlement_id,payout,
  });
 }

 await play(first,true);
 for(const member of members){
  const unlocked=await routeCatalog(member);
  assert.equal(unlocked.get(first).cleared,true);
  assert.equal(unlocked.get(next)[eligible],true);
 }
 await play(next,true);
 await play(next,false);
 assert.equal((await routeCatalog(outsider)).get(next)[eligible],false);
}
