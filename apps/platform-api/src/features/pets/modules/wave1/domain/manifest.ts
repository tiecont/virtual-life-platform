import {z} from 'zod';

export const WAVE1_RULESET='aetheria-pet-arena-wave1-mvp';
export const WAVE1_RULES_VERSION=1;
export const WAVE1_RULES_HASH='769f4b614239d4fb083f4e80194b39275521eefc4ef83f451e87f2642b7ce1c5';
export const WAVE1_MAX_LEVEL=60;

export const CoreElementSchema=z.enum(['fire','water','electric','ghost','ground','light']);
export type CoreElement=z.infer<typeof CoreElementSchema>;
export const CORE_ELEMENTS=CoreElementSchema.options;

const multiplier=z.union([z.literal(0),z.literal(800),z.literal(1000),z.literal(1250)]);
type Multiplier=0|800|1000|1250;
const effectivenessValues:Record<CoreElement,readonly [Multiplier,Multiplier,Multiplier,Multiplier,Multiplier,Multiplier]>={
  fire:[800,800,1000,1000,1000,1000],
  water:[1250,800,1000,1000,1250,1000],
  electric:[1000,1250,800,1000,0,1000],
  ghost:[1000,1000,1000,1250,1000,800],
  ground:[1250,1000,1250,1000,1000,1000],
  light:[1000,1000,1000,1250,1000,800],
} as const;
export const EFFECTIVENESS=Object.freeze(Object.fromEntries(CORE_ELEMENTS.map(element=>[
  element,
  Object.freeze(Object.fromEntries(CORE_ELEMENTS.map((defender,index)=>[defender,effectivenessValues[element][index]]))) as Readonly<Record<CoreElement,Multiplier>>,
]))) as Readonly<Record<CoreElement,Readonly<Record<CoreElement,Multiplier>>>>;

export const StatsSchema=z.strictObject({
  hp:z.number().int().min(1),attack:z.number().int().min(1),
  defense:z.number().int().min(0),speed:z.number().int().min(1),
});
export type Stats=z.infer<typeof StatsSchema>;
const baseStats:Record<CoreElement,Stats>={
  fire:{hp:100,attack:24,defense:12,speed:14},
  water:{hp:115,attack:19,defense:16,speed:11},
  electric:{hp:95,attack:25,defense:11,speed:16},
  ghost:{hp:105,attack:22,defense:13,speed:15},
  ground:{hp:130,attack:17,defense:20,speed:8},
  light:{hp:110,attack:21,defense:15,speed:13},
};
export const EvolutionThresholdSchema=z.strictObject({
  stage:z.number().int().min(1).max(3),
  level:z.union([z.literal(20),z.literal(40),z.literal(60)]),
  multiplierPermille:z.union([z.literal(1100),z.literal(1250),z.literal(1500)]),
  unlock:z.enum(['second-skill-and-map-2','signature-slot-and-boss-assist','ultimate-skill-and-mastery-aura']),
});
export const EVOLUTION_THRESHOLDS=Object.freeze([
  {stage:1,level:20,multiplierPermille:1100,unlock:'second-skill-and-map-2'},
  {stage:2,level:40,multiplierPermille:1250,unlock:'signature-slot-and-boss-assist'},
  {stage:3,level:60,multiplierPermille:1500,unlock:'ultimate-skill-and-mastery-aura'},
] as const);
export const EvolutionPreviewInputSchema=z.strictObject({
  element:CoreElementSchema,
  level:z.number().int().min(1).max(WAVE1_MAX_LEVEL),
});
export const EvolutionViewSchema=z.strictObject({
  element:CoreElementSchema,level:z.number().int().min(1).max(WAVE1_MAX_LEVEL),
  stage:z.number().int().min(0).max(3),stats:StatsSchema,unlocks:z.array(EvolutionThresholdSchema.shape.unlock),
});

export function evolutionPreview(input:unknown){
  const {element,level}=EvolutionPreviewInputSchema.parse(input);
  const stage=EVOLUTION_THRESHOLDS.filter(value=>level>=value.level).length;
  const stagePermille=stage===0?1000:EVOLUTION_THRESHOLDS[stage-1].multiplierPermille;
  const growthPermille=1000+35*(level-1);
  const scale=(value:number)=>Math.trunc(Math.trunc(value*growthPermille/1000)*stagePermille/1000);
  return EvolutionViewSchema.parse({
    element,level,stage,
    stats:{
      hp:scale(baseStats[element].hp),attack:scale(baseStats[element].attack),
      defense:scale(baseStats[element].defense),speed:scale(baseStats[element].speed),
    },
    unlocks:EVOLUTION_THRESHOLDS.filter(value=>level>=value.level).map(value=>value.unlock),
  });
}

const EncounterSchema=z.strictObject({
  id:z.enum(['regular','boss']),element:CoreElementSchema,
  hp:z.number().int().min(1),attack:z.number().int().min(1),defense:z.number().int().min(0),boss:z.boolean(),
});
export const MapEncounterSchema=z.strictObject({
  id:z.enum(['cinder-terraces','tideglass-lagoon','stormcoil-fields','lantern-necropolis','ochre-labyrinth','dawn-prism-sanctum']),
  name:z.string().min(1).max(64),element:CoreElementSchema,regular:EncounterSchema,boss:EncounterSchema,
});
const encounter=(id:'regular'|'boss',element:CoreElement,hp:number,attack:number,defense:number)=>({id,element,hp,attack,defense,boss:id==='boss'});
export const MAPS=Object.freeze([
  {id:'cinder-terraces',name:'Cinder Terraces',element:'fire',regular:encounter('regular','fire',70,8,5),boss:encounter('boss','fire',150,12,8)},
  {id:'tideglass-lagoon',name:'Tideglass Lagoon',element:'water',regular:encounter('regular','water',90,10,7),boss:encounter('boss','water',190,14,10)},
  {id:'stormcoil-fields',name:'Stormcoil Fields',element:'electric',regular:encounter('regular','electric',110,12,9),boss:encounter('boss','electric',230,16,12)},
  {id:'lantern-necropolis',name:'Lantern Necropolis',element:'ghost',regular:encounter('regular','ghost',130,14,11),boss:encounter('boss','ghost',270,18,14)},
  {id:'ochre-labyrinth',name:'Ochre Labyrinth',element:'ground',regular:encounter('regular','ground',150,16,13),boss:encounter('boss','ground',310,20,16)},
  {id:'dawn-prism-sanctum',name:'Dawn Prism Sanctum',element:'light',regular:encounter('regular','light',180,18,15),boss:encounter('boss','light',360,22,18)},
] as const);
export const CampaignNextInputSchema=z.strictObject({
  heroElement:CoreElementSchema,level:z.number().int().min(1).max(WAVE1_MAX_LEVEL),
  clearedMaps:z.array(MapEncounterSchema.shape.id).max(6),
}).superRefine((value,ctx)=>{
  if(new Set(value.clearedMaps).size!==value.clearedMaps.length)ctx.addIssue({code:'custom',path:['clearedMaps'],message:'Duplicate cleared map'});
  if(value.clearedMaps.some((id,index)=>id!==MAPS[index].id))ctx.addIssue({code:'custom',path:['clearedMaps'],message:'Cleared maps must be an ordered prefix'});
});
export function campaignNext(input:unknown){
  const value=CampaignNextInputSchema.parse(input);
  const next=MAPS[value.clearedMaps.length]??null;
  return {heroElement:value.heroElement,level:value.level,clearedMaps:value.clearedMaps,nextMap:next};
}

export const GACHA_FEATURED='pet-v3-fire-icarus';
export const GACHA_STANDARD_POOL=Object.freeze([
  'pet-v31-fire-cindrelis','pet-v31-water-marivell','pet-v31-electric-quorion',
  'pet-v31-ghost-vesperyn','pet-v31-ground-gravorn','pet-v31-light-aurelune',
] as const);
function sProbability(pull:number){return pull<60?8000:pull===80?1_000_000:8000+(pull-59)*49_600;}
export const GACHA_ODDS=Object.freeze(Array.from({length:80},(_,index)=>({pull:index+1,sProbabilityPpm:sProbability(index+1)})));
export const GachaViewSchema=z.strictObject({
  state:z.literal('DRAFT_ONLY'),enabled:z.literal(false),purchasesEnabled:z.literal(false),version:z.literal('wave1-icarus-1'),
  featured:z.literal(GACHA_FEATURED),featuredProbabilityForS:z.literal(500_000),
  standardPool:z.array(z.strictObject({petId:z.enum(GACHA_STANDARD_POOL),weight:z.literal(1)})).length(6),
  softPityAt:z.literal(60),hardPityAt:z.literal(80),
  sProbabilityByPull:z.array(z.strictObject({pull:z.number().int().min(1).max(80),sProbabilityPpm:z.number().int().min(0).max(1_000_000)})).length(80),
});
export const WAVE1_MANIFEST=Object.freeze({
  schemaVersion:1,ruleset:WAVE1_RULESET,rulesetVersion:WAVE1_RULES_VERSION,release:'OFFLINE_ONLY' as const,
  enabled:false as const,maxLevel:WAVE1_MAX_LEVEL,rulesHash:WAVE1_RULES_HASH,
  elements:CORE_ELEMENTS.map(element=>({id:element,effectiveness:EFFECTIVENESS[element]})),
  evolution:EVOLUTION_THRESHOLDS.map(value=>({...value})),maps:MAPS.map(value=>({...value})),
  gacha:{
    state:'DRAFT_ONLY' as const,enabled:false as const,purchasesEnabled:false as const,version:'wave1-icarus-1' as const,
    featured:GACHA_FEATURED,featuredProbabilityForS:500_000 as const,
    standardPool:GACHA_STANDARD_POOL.map(petId=>({petId,weight:1 as const})),
    softPityAt:60 as const,hardPityAt:80 as const,sProbabilityByPull:GACHA_ODDS.map(value=>({...value})),
  },
});
export const Wave1ManifestSchema=z.strictObject({
  schemaVersion:z.literal(1),ruleset:z.literal(WAVE1_RULESET),rulesetVersion:z.literal(1),release:z.literal('OFFLINE_ONLY'),
  enabled:z.literal(false),maxLevel:z.literal(60),rulesHash:z.string().regex(/^[a-f0-9]{64}$/),
  elements:z.array(z.strictObject({id:CoreElementSchema,effectiveness:z.record(CoreElementSchema,multiplier)})).length(6),
  evolution:z.array(EvolutionThresholdSchema).length(3),maps:z.array(MapEncounterSchema).length(6),
  gacha:GachaViewSchema,
});
export const PARSED_WAVE1_MANIFEST=Wave1ManifestSchema.parse(WAVE1_MANIFEST);
