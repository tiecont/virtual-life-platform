import {createHash} from 'node:crypto';
import {z} from 'zod';
import {DomainError} from '../../../../../shared/common/errors';
import {MAPS} from '../../wave1/domain/manifest';

// Wave A Artifact rules. Pure domain: no I/O and no framework types. Artifacts
// are equipped per owned Wave 1 Pet in three slots. Gating is by the Pet's
// numeric level only; the Pet's presentation power class (B/A/S rank) is never
// an equipment authority and is deliberately absent from every rule here.
export const ARTIFACT_RULESET='aetheria-pet-artifacts-wave-a';
export const ARTIFACT_RULES_VERSION=1;

export const ARTIFACT_SLOTS=Object.freeze(['core','aegis','rune'] as const);
export type ArtifactSlot=(typeof ARTIFACT_SLOTS)[number];

export const ARTIFACT_RANKS=Object.freeze(['D','C','B','A','S'] as const);
export type ArtifactRank=(typeof ARTIFACT_RANKS)[number];

// Minimum Pet level per artifact rank. D Lv1 / C Lv10 / B Lv20 / A Lv40 / S Lv60.
export const RANK_LEVEL_REQUIREMENT:Readonly<Record<ArtifactRank,number>>=Object.freeze({D:1,C:10,B:20,A:40,S:60});
// Hard ceiling for one stat on one artifact at maximum upgrade level.
export const RANK_MODIFIER_CAP:Readonly<Record<ArtifactRank,number>>=Object.freeze({D:8,C:12,B:18,A:26,S:36});
const RANK_COST_FACTOR:Readonly<Record<ArtifactRank,number>>=Object.freeze({D:1,C:2,B:3,A:4,S:5});
export const MAX_ARTIFACT_LEVEL=5;
export const STARTING_MATERIALS=150;
export const STARTER_ARTIFACT_DEFINITION_ID='core-emberglass';

const IdSchema=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
export const StatModifiersSchema=z.strictObject({
  hp:z.number().int().min(0).max(40),
  attack:z.number().int().min(0).max(40),
  defense:z.number().int().min(0).max(40),
  speed:z.number().int().min(0).max(40),
});
export type StatModifiers=z.infer<typeof StatModifiersSchema>;
export const ZERO_MODIFIERS:StatModifiers=Object.freeze({hp:0,attack:0,defense:0,speed:0});

const ArtifactDefinitionSchema=z.strictObject({
  id:IdSchema,
  name:z.string().min(1).max(64),
  slot:z.enum(ARTIFACT_SLOTS),
  rank:z.enum(ARTIFACT_RANKS),
  modifiers:StatModifiersSchema,
  perLevel:StatModifiersSchema,
});
export type ArtifactDefinition=z.infer<typeof ArtifactDefinitionSchema>;

// Seven definitions cover every slot, every rank boundary used by the PvE
// reward table and the Lv60 S-artifact case. Modifiers are flat stat points.
export const ARTIFACT_DEFINITIONS:readonly ArtifactDefinition[]=Object.freeze([
  {id:'core-emberglass',name:'Emberglass Core',slot:'core',rank:'D',modifiers:{hp:4,attack:2,defense:0,speed:0},perLevel:{hp:1,attack:0,defense:0,speed:0}},
  {id:'core-amberlattice',name:'Amber Lattice',slot:'core',rank:'C',modifiers:{hp:6,attack:3,defense:1,speed:0},perLevel:{hp:1,attack:0,defense:0,speed:0}},
  {id:'rune-mistquill',name:'Mist Quill',slot:'rune',rank:'C',modifiers:{hp:0,attack:4,defense:0,speed:2},perLevel:{hp:0,attack:1,defense:0,speed:0}},
  {id:'aegis-bastionplate',name:'Bastion Plate',slot:'aegis',rank:'B',modifiers:{hp:8,attack:0,defense:5,speed:0},perLevel:{hp:2,attack:0,defense:1,speed:0}},
  {id:'rune-whisperknot',name:'Whisper Knot',slot:'rune',rank:'B',modifiers:{hp:0,attack:6,defense:0,speed:3},perLevel:{hp:0,attack:1,defense:0,speed:1}},
  {id:'core-prismheart',name:'Prism Heart',slot:'core',rank:'A',modifiers:{hp:12,attack:6,defense:3,speed:0},perLevel:{hp:2,attack:1,defense:0,speed:0}},
  {id:'rune-temporal-seal',name:'Temporal Seal',slot:'rune',rank:'S',modifiers:{hp:8,attack:10,defense:0,speed:6},perLevel:{hp:1,attack:2,defense:0,speed:1}},
].map(definition=>Object.freeze(ArtifactDefinitionSchema.parse(definition))));

function invalid(message:string){return new DomainError('INVALID_REQUEST',400,message);}

export function equipmentLevelRequirement(rank:ArtifactRank):number{
  const level=RANK_LEVEL_REQUIREMENT[rank];
  if(level===undefined)throw invalid('Unknown artifact rank');
  return level;
}

// Only the Pet's level participates. A B-power-class Pet at Lv60 may equip S.
export function canEquipArtifact(rank:ArtifactRank,petLevel:number):boolean{
  if(!Number.isInteger(petLevel)||petLevel<1||petLevel>60)throw invalid('Pet level is outside 1-60');
  return petLevel>=equipmentLevelRequirement(rank);
}

export function effectiveModifiers(definition:ArtifactDefinition,upgradeLevel:number):StatModifiers{
  if(!Number.isInteger(upgradeLevel)||upgradeLevel<1||upgradeLevel>MAX_ARTIFACT_LEVEL)throw invalid('Artifact upgrade level is outside 1-5');
  const steps=upgradeLevel-1;
  const modifiers={
    hp:definition.modifiers.hp+definition.perLevel.hp*steps,
    attack:definition.modifiers.attack+definition.perLevel.attack*steps,
    defense:definition.modifiers.defense+definition.perLevel.defense*steps,
    speed:definition.modifiers.speed+definition.perLevel.speed*steps,
  };
  assertBounded(definition,modifiers);
  return modifiers;
}

function assertBounded(definition:ArtifactDefinition,modifiers:StatModifiers):void{
  const cap=RANK_MODIFIER_CAP[definition.rank];
  for(const stat of ['hp','attack','defense','speed'] as const){
    if(modifiers[stat]>cap||modifiers[stat]<0)throw new Error('Artifact '+definition.id+' '+stat+' exceeds the '+definition.rank+' rank bound');
  }
}

// Exported so catalog tests can prove an over-cap definition is refused.
export function validateArtifactDefinition(input:unknown):ArtifactDefinition{
  const definition=ArtifactDefinitionSchema.parse(input);
  for(let level=1;level<=MAX_ARTIFACT_LEVEL;level+=1)effectiveModifiers(definition,level);
  return Object.freeze(definition);
}

// Deterministic material cost to move an owned artifact from fromLevel to
// fromLevel+1. Same rank and level always cost the same; no entropy, no clock.
export function upgradeCost(rank:ArtifactRank,fromLevel:number):number{
  if(!Number.isInteger(fromLevel)||fromLevel<1||fromLevel>=MAX_ARTIFACT_LEVEL)throw invalid('Only upgrade levels 1-4 have a cost');
  const factor=RANK_COST_FACTOR[rank];
  if(factor===undefined)throw invalid('Unknown artifact rank');
  return factor*(40+20*fromLevel);
}

export function nextUpgradeCost(definition:ArtifactDefinition,upgradeLevel:number):number|null{
  if(!Number.isInteger(upgradeLevel)||upgradeLevel<1||upgradeLevel>MAX_ARTIFACT_LEVEL)throw invalid('Artifact upgrade level is outside 1-5');
  return upgradeLevel>=MAX_ARTIFACT_LEVEL?null:upgradeCost(definition.rank,upgradeLevel);
}

// PvE acquisition hook: one deterministic artifact-plus-materials grant per
// cleared Wave 1 map. Order follows the canonical campaign order.
const PVE_REWARD_BY_MAP:Readonly<Record<string,Readonly<{definitionId:string;materials:number}>>>=Object.freeze({
  'cinder-terraces':{definitionId:'core-amberlattice',materials:60},
  'tideglass-lagoon':{definitionId:'aegis-bastionplate',materials:90},
  'stormcoil-fields':{definitionId:'rune-mistquill',materials:90},
  'lantern-necropolis':{definitionId:'rune-whisperknot',materials:120},
  'ochre-labyrinth':{definitionId:'core-prismheart',materials:150},
  'dawn-prism-sanctum':{definitionId:'rune-temporal-seal',materials:240},
});
export type PveArtifactReward=Readonly<{mapId:string;definitionId:string;materials:number}>;
export const PVE_ARTIFACT_REWARDS:readonly PveArtifactReward[]=Object.freeze(MAPS.map(map=>{
  const reward=PVE_REWARD_BY_MAP[map.id];
  if(!reward)throw new Error('Missing artifact reward for map '+map.id);
  return Object.freeze({mapId:map.id,definitionId:reward.definitionId,materials:reward.materials});
}));

export const ARTIFACT_DEFINITION_BY_ID:ReadonlyMap<string,ArtifactDefinition>=new Map(ARTIFACT_DEFINITIONS.map(definition=>[definition.id,definition]));

export function artifactDefinition(definitionId:string):ArtifactDefinition{
  const definition=ARTIFACT_DEFINITION_BY_ID.get(definitionId);
  if(!definition)throw new Error('Artifact definition is absent from the Wave A catalog: '+definitionId);
  return definition;
}

export const UPGRADE_COST_TABLE:ReadonlyArray<Readonly<{rank:ArtifactRank;costs:readonly number[]}>>=Object.freeze(ARTIFACT_RANKS.map(rank=>Object.freeze({
  rank,
  costs:Object.freeze(Array.from({length:MAX_ARTIFACT_LEVEL-1},(_,index)=>upgradeCost(rank,index+1))),
})));

export type LoadoutEntry=Readonly<{slot:ArtifactSlot;artifactId:string;definitionId:string;upgradeLevel:number;modifiers:StatModifiers}>;
export type LoadoutSnapshotPayload=Readonly<{
  petId:string;petLevel:number;entries:readonly LoadoutEntry[];totals:StatModifiers;
}>;

export function totalModifiers(entries:readonly LoadoutEntry[]):StatModifiers{
  const totals={hp:0,attack:0,defense:0,speed:0};
  for(const entry of entries){
    totals.hp+=entry.modifiers.hp;
    totals.attack+=entry.modifiers.attack;
    totals.defense+=entry.modifiers.defense;
    totals.speed+=entry.modifiers.speed;
  }
  return totals;
}

// Canonical, content-addressed battle loadout. Entries are ordered by slot and
// the digest is a stable sha256 over the canonical JSON, so an unchanged
// loadout always maps to the same immutable snapshot identity.
export function loadoutSnapshotPayload(petId:string,petLevel:number,entries:readonly LoadoutEntry[]):LoadoutSnapshotPayload{
  if(!IdSchema.safeParse(petId).success)throw invalid('Pet id is invalid');
  if(!Number.isInteger(petLevel)||petLevel<1||petLevel>60)throw invalid('Pet level is outside 1-60');
  if(new Set(entries.map(entry=>entry.slot)).size!==entries.length)throw new Error('A battle loadout has one artifact per slot');
  const ordered=[...entries].sort((left,right)=>ARTIFACT_SLOTS.indexOf(left.slot)-ARTIFACT_SLOTS.indexOf(right.slot)).map(entry=>Object.freeze({
    slot:entry.slot,artifactId:entry.artifactId,definitionId:entry.definitionId,upgradeLevel:entry.upgradeLevel,
    modifiers:Object.freeze({hp:entry.modifiers.hp,attack:entry.modifiers.attack,defense:entry.modifiers.defense,speed:entry.modifiers.speed}),
  }));
  return Object.freeze({petId,petLevel,entries:Object.freeze(ordered),totals:Object.freeze(totalModifiers(ordered))});
}

export function loadoutDigest(payload:LoadoutSnapshotPayload):string{
  const canonical={
    petId:payload.petId,petLevel:payload.petLevel,
    entries:payload.entries.map(entry=>({
      slot:entry.slot,artifactId:entry.artifactId,definitionId:entry.definitionId,upgradeLevel:entry.upgradeLevel,
      modifiers:{hp:entry.modifiers.hp,attack:entry.modifiers.attack,defense:entry.modifiers.defense,speed:entry.modifiers.speed},
    })),
    totals:{hp:payload.totals.hp,attack:payload.totals.attack,defense:payload.totals.defense,speed:payload.totals.speed},
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export const LoadoutEntrySchema=z.strictObject({
  slot:z.enum(ARTIFACT_SLOTS),artifactId:z.uuid(),definitionId:IdSchema,
  upgradeLevel:z.number().int().min(1).max(MAX_ARTIFACT_LEVEL),modifiers:StatModifiersSchema,
});
export const LoadoutSnapshotPayloadSchema=z.strictObject({
  petId:IdSchema,petLevel:z.number().int().min(1).max(60),
  entries:z.array(LoadoutEntrySchema).max(ARTIFACT_SLOTS.length),totals:StatModifiersSchema,
});
export function parseStoredLoadout(value:unknown):LoadoutSnapshotPayload{
  const parsed=LoadoutSnapshotPayloadSchema.parse(value);
  return Object.freeze({
    petId:parsed.petId,petLevel:parsed.petLevel,
    entries:Object.freeze(parsed.entries.map(entry=>Object.freeze({...entry,modifiers:Object.freeze({...entry.modifiers})}))),
    totals:Object.freeze({...parsed.totals}),
  }) as LoadoutSnapshotPayload;
}

export const ARTIFACT_RULES=Object.freeze({
  schemaVersion:1 as const,
  ruleset:ARTIFACT_RULESET,
  rulesetVersion:ARTIFACT_RULES_VERSION,
  release:'LOCAL_ONLY' as const,
  enabled:false as const,
  slots:ARTIFACT_SLOTS,
  ranks:ARTIFACT_RANKS,
  rankLevelRequirements:Object.freeze(ARTIFACT_RANKS.map(rank=>Object.freeze({rank,level:equipmentLevelRequirement(rank)}))),
  modifierCaps:Object.freeze(ARTIFACT_RANKS.map(rank=>Object.freeze({rank,cap:RANK_MODIFIER_CAP[rank]}))),
  maxUpgradeLevel:MAX_ARTIFACT_LEVEL,
  startingMaterials:STARTING_MATERIALS,
  starter:Object.freeze({definitionId:STARTER_ARTIFACT_DEFINITION_ID,upgradeLevel:1}),
  upgradeCosts:UPGRADE_COST_TABLE,
  definitions:ARTIFACT_DEFINITIONS,
  pveRewards:PVE_ARTIFACT_REWARDS,
  gating:'pet-level-only' as const,
  combat:'snapshot-only' as const,
  // Modifiers are persisted in the loadout snapshot. They are not silently
  // treated as live combat stats until the authoritative Arena8 binding reads
  // them; speed has no Wave 1 effect at all and is explicitly inactive.
  statSemantics:Object.freeze({
    hp:'SNAPSHOT_ONLY_PENDING_ARENA8_BINDING' as const,
    attack:'SNAPSHOT_ONLY_PENDING_ARENA8_BINDING' as const,
    defense:'SNAPSHOT_ONLY_PENDING_ARENA8_BINDING' as const,
    speed:'INACTIVE' as const,
  }),
});
export const ArtifactRulesSchema=z.strictObject({
  schemaVersion:z.literal(1),ruleset:z.literal(ARTIFACT_RULESET),rulesetVersion:z.literal(1),
  release:z.literal('LOCAL_ONLY'),enabled:z.literal(false),
  slots:z.array(z.enum(ARTIFACT_SLOTS)).length(3),ranks:z.array(z.enum(ARTIFACT_RANKS)).length(5),
  rankLevelRequirements:z.array(z.strictObject({rank:z.enum(ARTIFACT_RANKS),level:z.number().int().min(1).max(60)})).length(5),
  modifierCaps:z.array(z.strictObject({rank:z.enum(ARTIFACT_RANKS),cap:z.number().int().min(1).max(40)})).length(5),
  maxUpgradeLevel:z.literal(5),startingMaterials:z.number().int().min(0),
  starter:z.strictObject({definitionId:IdSchema,upgradeLevel:z.number().int().min(1).max(5)}),
  upgradeCosts:z.array(z.strictObject({rank:z.enum(ARTIFACT_RANKS),costs:z.array(z.number().int().min(1)).length(4)})).length(5),
  definitions:z.array(ArtifactDefinitionSchema).min(1),
  pveRewards:z.array(z.strictObject({mapId:IdSchema,definitionId:IdSchema,materials:z.number().int().min(1)})).length(6),
  gating:z.literal('pet-level-only'),combat:z.literal('snapshot-only'),
  statSemantics:z.strictObject({
    hp:z.literal('SNAPSHOT_ONLY_PENDING_ARENA8_BINDING'),attack:z.literal('SNAPSHOT_ONLY_PENDING_ARENA8_BINDING'),
    defense:z.literal('SNAPSHOT_ONLY_PENDING_ARENA8_BINDING'),speed:z.literal('INACTIVE'),
  }),
});
export const PARSED_ARTIFACT_RULES=ArtifactRulesSchema.parse(ARTIFACT_RULES);

// Fail the module load rather than serve an unbounded or incoherent catalog.
if(!ARTIFACT_DEFINITION_BY_ID.has(STARTER_ARTIFACT_DEFINITION_ID))throw new Error('Starter artifact is absent from the Wave A catalog');
for(const definition of ARTIFACT_DEFINITIONS){
  validateArtifactDefinition(definition);
  if(!PVE_ARTIFACT_REWARDS.some(reward=>reward.definitionId===definition.id)&&definition.id!==STARTER_ARTIFACT_DEFINITION_ID){
    throw new Error('Artifact definition is not obtainable: '+definition.id);
  }
}
if(new Set(ARTIFACT_DEFINITIONS.map(definition=>definition.id)).size!==ARTIFACT_DEFINITIONS.length)throw new Error('Duplicate artifact definition id');
if(new Set(PVE_ARTIFACT_REWARDS.map(reward=>reward.mapId)).size!==PVE_ARTIFACT_REWARDS.length)throw new Error('Duplicate PvE artifact reward map');
