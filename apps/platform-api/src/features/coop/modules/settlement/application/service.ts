import {createHash,timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {lockAccounts} from '../../../../identity/modules/accounts/application/account-locks';
import {levelIncrement} from '../../../../pets/modules/wave1/domain/progression';
import {CoopSettlementStore} from '../infrastructure/store';

const hash=z.string().regex(/^[a-f0-9]{64}$/),pet=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),count=z.number().int().min(0).max(1000000);
const ParticipantSchema=z.strictObject({account:z.uuid(),petId:pet,alive:z.boolean(),damage:count,healing:count,shielding:count});
export const CoopSettlementProposalSchema=z.strictObject({
 configDigest:hash,contentHash:hash,kind:z.literal('coop.completed.v1'),outcome:z.enum(['won','lost']),
 participants:z.array(ParticipantSchema).length(4),round:z.number().int().min(0).max(65535),
 ruleset:z.literal('arena8-coop-pve'),rulesetVersion:z.literal(1),turn:z.number().int().min(0).max(65535),
});
const RewardsSchema=z.strictObject({
 clearAchievementPoints:count,clearCoins:count,clearExp:count,
 lossAchievementPoints:count,lossCoins:count,lossExp:count,
});

const PayoutSchema=z.strictObject({achievementPoints:count,coins:count,exp:count,materials:count});
const EncounterSchema=z.object({
 id:pet,mapId:pet,rewardPolicy:z.strictObject({firstClear:PayoutSchema,repeatClear:PayoutSchema,defeat:PayoutSchema}).optional(),
});

function encounterFor(bundle:Record<string,unknown>,bossId:string){
 if(bundle.schemaVersion===1)return undefined;
 const encounters=z.array(EncounterSchema).parse(bundle.bosses);
 const encounter=encounters.find(candidate=>candidate.id===bossId);
 if(!encounter)throw new Error('Cooperative settlement Boss unavailable');
 return encounter;
}

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
 return value;
}
/** Canonical proposal digest. Rust serializes the same sorted JSON object. */
export function canonicalProposalHash(value:unknown):Buffer{
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest();
}

// One authoritative team completion -> durable per-participant rewards. The
// outbox row, the inbox marker, every participant's reward and the completion
// flags commit in one transaction; a retried drain returns the recorded outcome.
export class CoopSettlement{
 constructor(private readonly pool:Pick<Pool,'connect'>,private readonly store=new CoopSettlementStore()){}

 async drain():Promise<void>{
  for(let processed=0;processed<32;processed++){
   if(!await this.one())return;
  }
 }

 private async one():Promise<boolean>{
  const db=await this.pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='2000ms'");
   const event=await this.store.next(db);
   if(!event){await db.query('COMMIT');return false;}
   const allocation=await this.store.allocation(db,event.matchId);
   if(!allocation)throw new Error('Cooperative settlement allocation unavailable');
   const parsed=CoopSettlementProposalSchema.safeParse(event.proposal);
   if(!parsed.success)throw new Error('Cooperative settlement proposal invalid');
   const proposal=parsed.data;
   if(proposal.contentHash!==allocation.contentHash||proposal.configDigest!==allocation.configDigest)
    throw new Error('Cooperative settlement configuration mismatch');
   if(event.proposalHash.length!==32||!timingSafeEqual(canonicalProposalHash(event.proposal),event.proposalHash))
    throw new Error('Cooperative settlement proposal hash mismatch');
   for(const [index,participant] of proposal.participants.entries()){
    const seat=allocation.seats[index]!;
    if(participant.account!==seat.account||participant.petId!==seat.petId)
     throw new Error('Cooperative settlement seat mismatch');
   }
   const prior=await this.store.inbox(db,event.settlementId);
   if(prior){
    await this.store.finish(db,{eventId:event.eventId,settlementId:event.settlementId,matchId:event.matchId,roomId:allocation.roomId,outcome:prior.outcome as 'won'|'lost',points:0});
    await db.query('COMMIT');
    return true;
   }
   const bundle=await this.store.bundle(db,allocation.configVersion,allocation.configDigest);
   if(!bundle)throw new Error('Cooperative settlement rewards unavailable');
   const rewards=RewardsSchema.parse(bundle.rewards);
   const encounter=encounterFor(bundle,allocation.bossId);
   const policy=encounter?.rewardPolicy;
   const outcome=proposal.outcome;
   const defaultPayout=outcome==='won'?policy?.repeatClear:policy?.defeat;
   const points=defaultPayout?.achievementPoints??(outcome==='won'?rewards.clearAchievementPoints:rewards.lossAchievementPoints);
   const coins=outcome==='won'?rewards.clearCoins:rewards.lossCoins;
   const exp=outcome==='won'?rewards.clearExp:rewards.lossExp;
   await this.store.begin(db,{settlementId:event.settlementId,matchId:event.matchId,roomId:allocation.roomId,outcome,points});
   await lockAccounts(db,allocation.seats.map(seat=>seat.account));
   for(const [seatIndex,seat] of allocation.seats.entries()){
    const active=await this.store.accountActive(db,seat.account);
    const firstClear=active&&policy&&encounter&&outcome==='won'&&await this.store.clearBoss(db,seat.account,encounter.mapId);
    const payout=firstClear?policy.firstClear:defaultPayout;
    const awardPoints=active?(payout?.achievementPoints??points):0;
    const awardCoins=active?(payout?.coins??coins):0,awardExp=active?(payout?.exp??exp):0;
    if(active&&payout)await this.store.materials(db,seat.account,payout.materials);
    let level=seat.petLevel,petExp=0;
    if(awardExp>0){
     const current=await this.store.pet(db,seat.account,seat.petId,seat.ownedPetInstanceId);
     if(!current)throw new Error('Cooperative settlement Pet unavailable');
     const next=levelIncrement(current.level,current.exp+awardExp);
     level=next.level;petExp=next.exp;
    }
    await this.store.award(db,{
     settlementId:event.settlementId,accountId:seat.account,seat:seatIndex,outcome,
     firstClear:Boolean(firstClear),materials:active?(payout?.materials??0):0,
     points:awardPoints,coins:awardCoins,exp:awardExp,petId:seat.petId,ownedPetInstanceId:seat.ownedPetInstanceId,
     petLevel:level,petExp,currentLevel:level,currentExp:petExp,
    });
   }
   await this.store.finish(db,{eventId:event.eventId,settlementId:event.settlementId,matchId:event.matchId,roomId:allocation.roomId,outcome,points});
   await db.query('COMMIT');
   return true;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
}
