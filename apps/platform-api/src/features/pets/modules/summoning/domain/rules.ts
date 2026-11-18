import {z} from 'zod';
import {PetAcquisitionCatalogV3Schema,PetStandardIdentityV3,type PetAcquisitionCatalogV3} from '@virtual-city/contracts/pet-acquisition-v3';

const id=z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const probability=z.number().int().min(0).max(1_000_000);
const weightedPet=z.strictObject({petId:id,weight:z.number().int().min(1).max(1_000_000)});
export const BannerRulesSchema=z.strictObject({
  state:z.literal('DRAFT_ONLY'),enabled:z.literal(false),purchasesEnabled:z.literal(false),
  family:id,kind:z.enum(['standard','limited']),version:id,catalogSha256:digest,
  startsAt:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),endsAt:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  baseSProbability:probability,softPityAt:z.number().int().min(1).max(200),hardPityAt:z.number().int().min(1).max(200),
  sProbabilityByPull:z.array(probability).min(1).max(200),
  featuredProbability:z.literal(500_000),
  standardPool:z.array(weightedPet).length(6),featuredPool:z.array(weightedPet).max(6),
}).superRefine((rules,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  if(rules.endsAt<=rules.startsAt)fail('Invalid effective dates');
  if(rules.softPityAt>rules.hardPityAt||rules.sProbabilityByPull.length!==rules.hardPityAt)fail('Complete pity curve required');
  for(const [index,chance] of rules.sProbabilityByPull.entries()){
    if(chance<(rules.sProbabilityByPull[index-1]??rules.baseSProbability))fail('Pity must be monotonic');
    if(index+1<rules.softPityAt&&chance!==rules.baseSProbability)fail('Base probability differs before soft pity');
    if((chance===1_000_000)!==(index+1===rules.hardPityAt))fail('Hard pity must be exact');
  }
  for(const pool of [rules.standardPool,rules.featuredPool])if(new Set(pool.map(p=>p.petId)).size!==pool.length)fail('Duplicate pool member');
  if((rules.kind==='limited')!==(rules.featuredPool.length>0))fail('Featured pool differs from banner kind');
  if(PetStandardIdentityV3.some(p=>!rules.standardPool.some(w=>w.petId===p.id)))fail('Standard pool must contain exactly the six canonical Standard S');
});
export type BannerRules=z.infer<typeof BannerRulesSchema>;
export const FamilyStateSchema=z.strictObject({
  accountId:z.string().min(1).max(128),family:id,kind:z.enum(['standard','limited']),
  // Stored across rotations. Hard-pity changes cannot discard existing progress.
  misses:z.number().int().min(0).max(199),guaranteed:z.boolean(),revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-10),
}).refine(s=>s.kind==='limited'||!s.guaranteed,'Standard family cannot carry a Limited guarantee');
export type FamilyState=z.infer<typeof FamilyStateSchema>;
const entropySchema=z.strictObject({s:probability.max(999_999),featured:probability.max(999_999),standardTicket:z.number().int().min(0).max(5_999_999),featuredTicket:z.number().int().min(0).max(5_999_999)});
export type PullEntropy=z.infer<typeof entropySchema>;
export type PullResult={kind:'not_s'}|{kind:'s';petId:string;featured:boolean};
export type PullResolution={before:FamilyState;after:FamilyState;results:PullResult[];bannerVersion:string;catalogSha256:string};

function total(pool:BannerRules['standardPool']):number {return pool.reduce((n,p)=>n+p.weight,0);}
function select(pool:BannerRules['standardPool'],ticket:number):string {
  for(const pet of pool){if(ticket<pet.weight)return pet.petId;ticket-=pet.weight;}
  throw new Error('Entropy ticket outside pool');
}
function validateEligibility(rules:BannerRules,catalog:PetAcquisitionCatalogV3):void {
  if(catalog.sourceSha256!==rules.catalogSha256)throw new Error('Catalog version mismatch');
  for(const [pool,source] of [[rules.standardPool,'standard_gacha'],[rules.featuredPool,'limited_event_gacha']] as const){
    for(const member of pool){
      const pet=catalog.pets.find(p=>p.id===member.petId);
      if(!pet||pet.acquisition.rank!=='S'||pet.acquisition.source!==source)throw new Error('Ineligible S pool member');
    }
  }
}

/** Pure offline candidate resolver. Entropy comes only from the server reservation adapter.
 * A not_s result deliberately grants no lower-rank Pet: that pool remains unapproved.
 * There is no publication/live-money path in this module.
 */
export function resolvePulls(input:{rules:unknown;catalog:unknown;state:unknown;accountId:string;family:string;acceptedAt:number;entropy:unknown}):PullResolution {
  const rules=BannerRulesSchema.parse(input.rules),catalog=PetAcquisitionCatalogV3Schema.parse(input.catalog);
  const before=FamilyStateSchema.parse(input.state);
  const entropy=z.array(entropySchema).min(1).max(10).refine(rows=>rows.length===1||rows.length===10,'Only single or ten pulls').parse(input.entropy);
  validateEligibility(rules,catalog);
  if(before.accountId!==input.accountId||before.family!==input.family||before.family!==rules.family||before.kind!==rules.kind)throw new Error('Account or family mismatch');
  if(!Number.isSafeInteger(input.acceptedAt)||input.acceptedAt<rules.startsAt||input.acceptedAt>=rules.endsAt)throw new Error('Banner unavailable at reservation');
  const standardTotal=total(rules.standardPool),featuredTotal=total(rules.featuredPool);
  for(const draw of entropy){
    if(draw.standardTicket>=standardTotal||draw.featuredTicket>=(featuredTotal||1))throw new Error('Entropy ticket outside pool');
  }
  let after={...before};
  const results:PullResult[]=[];
  for(const draw of entropy){
    const chance=rules.sProbabilityByPull[Math.min(after.misses,rules.hardPityAt-1)];
    if(draw.s>=chance){results.push({kind:'not_s'});after={...after,misses:after.misses+1,revision:after.revision+1};continue;}
    const featured=rules.kind==='limited'&&(after.guaranteed||draw.featured<rules.featuredProbability);
    results.push({kind:'s',petId:select(featured?rules.featuredPool:rules.standardPool,featured?draw.featuredTicket:draw.standardTicket),featured});
    after={...after,misses:0,guaranteed:rules.kind==='limited'&&!featured,revision:after.revision+1};
  }
  return {before,after,results,bannerVersion:rules.version,catalogSha256:catalog.sourceSha256};
}
