import {describe,it,expect} from 'vitest';
import {acquisitionCatalog} from '../../packages/contracts/test/fixtures/pet-acquisition-v3';
import {BannerRulesSchema,resolvePulls,type BannerRules,type FamilyState,type PullEntropy} from '../../apps/platform-api/src/features/pets/modules/summoning/domain/rules';
const catalog=acquisitionCatalog();
const rules:BannerRules={
  state:'DRAFT_ONLY',enabled:false,purchasesEnabled:false,family:'pet-limited',kind:'limited',version:'candidate-1',catalogSha256:catalog.sourceSha256,
  startsAt:100,endsAt:200,baseSProbability:8000,softPityAt:60,hardPityAt:80,
  // Explicit synthetic test curve; never a production rate table.
  sProbabilityByPull:Array.from({length:80},(_,i)=>i===79?1_000_000:i<59?8000:8000+(i-58)*40_000),
  featuredProbability:500_000,
  standardPool:catalog.pets.filter(p=>p.acquisition.source==='standard_gacha').map(p=>({petId:p.id,weight:1})),
  featuredPool:[{petId:'pet-v3-fire-icarus',weight:1}],
};
const state:FamilyState={accountId:'account-1',family:'pet-limited',kind:'limited',misses:0,guaranteed:false,revision:0};
const hit:PullEntropy={s:0,featured:0,standardTicket:0,featuredTicket:0};
const miss:PullEntropy={...hit,s:999999};
function run(patch:Partial<Parameters<typeof resolvePulls>[0]>={}){return resolvePulls({rules,catalog,state,accountId:'account-1',family:'pet-limited',acceptedAt:150,entropy:[hit],...patch});}

describe('offline authoritative candidate banner rules',()=>{
  it('selects featured hit, Standard S miss, then guaranteed featured across rotation',()=>{
    expect(run().results).toEqual([{kind:'s',petId:'pet-v3-fire-icarus',featured:true}]);
    const first=run({entropy:[{...hit,featured:500_000,standardTicket:5}]});
    expect(first.results).toEqual([{kind:'s',petId:'pet-v31-light-aurelune',featured:false}]);
    expect(first.after).toMatchObject({misses:0,guaranteed:true,revision:1});
    const rotated={...rules,version:'candidate-2',featuredPool:[{petId:'pet-v3-ice-glaciemora',weight:1}]};
    const second=run({rules:rotated,state:first.after,entropy:[{...hit,featured:999999}]});
    expect(second.results).toEqual([{kind:'s',petId:'pet-v3-ice-glaciemora',featured:true}]);
    expect(second.after.guaranteed).toBe(false);
    expect(second.bannerVersion).toBe('candidate-2');
  });
  it('honors exact probability and hard-pity boundaries without discarding carried progress',()=>{
    expect(run({entropy:[{...miss,s:7999}]}).results[0].kind).toBe('s');
    expect(run({entropy:[{...miss,s:8000}]}).results).toEqual([{kind:'not_s'}]);
    expect(run({state:{...state,misses:79},entropy:[miss]}).after.misses).toBe(0);
    expect(run({state:{...state,misses:199},entropy:[miss]}).after.misses).toBe(0);
    const progress=run({state:{...state,misses:10,guaranteed:true},entropy:[miss]});
    expect(progress.after).toMatchObject({misses:11,guaranteed:true});
  });
  it('uses weighted half-open intervals for each of six Standard S candidates',()=>{
    const weighted={...rules,standardPool:rules.standardPool.map((p,i)=>({...p,weight:i+1}))};
    let cursor=0;
    for(const p of weighted.standardPool){
      for(const ticket of [cursor,cursor+p.weight-1])expect(run({rules:weighted,entropy:[{...hit,featured:500_000,standardTicket:ticket}]}).results).toEqual([{kind:'s',petId:p.petId,featured:false}]);
      cursor+=p.weight;
    }
  });
  it('single and ten pulls produce identical ordered state transitions',()=>{
    const entropy=Array.from({length:10},(_,i)=>i%3===0?{...hit,featured:999999,standardTicket:i%6}:miss);
    const batch=run({state:{...state,misses:78},entropy});
    let next={...state,misses:78};const results=[];
    for(const e of entropy){const single=run({state:next,entropy:[e]});next=single.after;results.push(...single.results);}
    expect(batch.after).toEqual(next);expect(batch.results).toEqual(results);
    expect(state).toEqual({accountId:'account-1',family:'pet-limited',kind:'limited',misses:0,guaranteed:false,revision:0});
  });
  it('isolates Standard and account/family state',()=>{
    const standard={...rules,kind:'standard',family:'pet-standard',featuredPool:[]};
    const limitedBefore={...state,guaranteed:true,misses:77};
    const before={...state,family:'pet-standard',kind:'standard'};
    const result=run({rules:standard,state:before,family:'pet-standard'});
    expect(result.after.guaranteed).toBe(false);expect(result.results).toEqual([{kind:'s',petId:rules.standardPool[0].petId,featured:false}]);
    expect(limitedBefore).toEqual({...state,guaranteed:true,misses:77});
    for(const patch of [{accountId:'other'},{family:'other'},{rules:standard},{state:{...before,guaranteed:true}}])expect(()=>run(patch)).toThrow();
  });
  it('fails closed on unapproved curves, ineligible pools, versions, dates and unknown fields',()=>{
    const mapS=catalog.pets.find(p=>p.acquisition.source==='map_legendary')!.id;
    const mutations:unknown[]=[
      {...rules,sProbabilityByPull:null},{...rules,sProbabilityByPull:[8000]},
      {...rules,sProbabilityByPull:rules.sProbabilityByPull.map((p,i)=>i===61?1:p)},
      {...rules,sProbabilityByPull:rules.sProbabilityByPull.map((p,i)=>i===79?999999:p)},
      {...rules,standardPool:rules.standardPool.map((p,i)=>i===0?{...p,weight:0}:p)},
      {...rules,standardPool:rules.standardPool.map((p,i)=>i===0?{...p,petId:mapS}:p)},
      {...rules,featuredPool:[{petId:mapS,weight:1}]},{...rules,featuredPool:[]},
      {...rules,enabled:true},{...rules,purchasesEnabled:true},{...rules,script:'execute'},
      {...rules,catalogSha256:'0'.repeat(64)},{...rules,endsAt:100},
    ];
    for(const invalid of mutations)expect(()=>run({rules:invalid})).toThrow();
    for(const acceptedAt of [99,200,NaN,Infinity,150.5])expect(()=>run({acceptedAt})).toThrow();
    expect(BannerRulesSchema.safeParse(rules).success).toBe(true);
  });
  it('validates the entire batch and entropy domains before returning any state change',()=>{
    const original=structuredClone(state);
    for(const invalid of [[],[hit,hit],Array(11).fill(hit),[{...hit,s:1_000_000}],[{...hit,standardTicket:6}],[{...hit,featuredTicket:1}],[{...hit,s:-1}],[{...hit,s:0.5}],[{...hit,script:'x'}],[...Array(9).fill(hit),{...hit,s:NaN}]])expect(()=>run({entropy:invalid})).toThrow();
    expect(state).toEqual(original);
  });
});
