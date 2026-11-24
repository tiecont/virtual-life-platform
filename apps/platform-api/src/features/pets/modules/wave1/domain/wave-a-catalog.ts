import {GACHA_FEATURED, GACHA_STANDARD_POOL} from './manifest';

// Wave A canonical content roster (roster version wave-a-v1). The versioned specification,
// reconciliation decisions and S off-rate candidate audit live in
// specs/pet-arena/wave-a-canonical-roster-v1.json. Production code never reads that file,
// so this literal is the runtime roster. The frozen 43-Pet Wave 1 catalog (./catalog.ts) and
// the frozen gacha pool (./manifest.ts) are not replaced, extended or rebalanced here.
// This module is content identity data: it grants no gameplay, acquisition, banner, rights,
// production or publication authority.
export const WAVE_A_ROSTER_VERSION='wave-a-v1';

export type WaveAElement='fire'|'water'|'electric'|'ghost'|'ground'|'light';
export type WaveAPowerClass='S'|'A'|'B';
export type WaveACatalogRank='S'|'A'|'B';
export type WaveARosterState='ACTIVE'|'CANDIDATE';
export type WaveAFamily='core'|'dragon'|'bird'|'s_offrate';
export type WaveASourceCategory='limited_event_gacha'|'standard_gacha'|'map_legendary'|'map_regular'|'dragon_family'|'bird_family'|'s_offrate_candidate';
export type WaveASummonRarity='Limited S'|'Standard S'|'map-legendary'|'map-regular'|'family-exploration'|'Standard S off-rate';
export type WaveAAcquisitionAuthority='FROZEN_WAVE1_RULES'|'NONE_OWNER_DECISION_REQUIRED'|'BLOCKED_OWNER_BANNER_DECISION';
export type WaveAGachaRole='featured'|'standard_off_rate'|'none';
export type WaveABodyPlan='amorphous'|'aquatic'|'avian'|'biped'|'centaur'|'floating'|'golem'|'hexapod'|'humanoid'|'insectoid'|'mechanical'|'plant'|'quadruped'|'radial'|'serpentine'|'spectral';
export type WaveAModelStatus='NOT_PRODUCED'|'ART_STUDY_EXISTS_NOT_ADMITTED';
export type WaveARigStatus='RIG_PROFILE_ASSIGNED'|'RIG_PROFILE_UNASSIGNED';
export type WaveAConceptStatus='CONCEPT_ON_CDN'|'REFERENCE_CARD_ON_CDN'|'RACE_BASE_CONCEPT_ONLY';
export type WaveAOwnerGate='ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW'|'FAMILY_CONCEPT_REVIEW_REQUIRED'|'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED';

export type WaveAConcept=Readonly<{
  batch:string;filename:string;cdnKey:string;cdnUrl:string;sha256:string;bytes:number;
  generatedInBatch:boolean;regenerations:number;ownerDecision:null;rights:'PENDING_REVIEW';note:string|null;
}>;
export type WaveARuntimeFlags=Readonly<{
  identityReady:true;gameplayReady:boolean;modelStatus:WaveAModelStatus;rigStatus:WaveARigStatus;
  animationStatus:'NOT_PRODUCED';vfxStatus:'NOT_PRODUCED';conceptStatus:WaveAConceptStatus;
}>;
export type WaveACandidateGate=Readonly<{
  status:'BLOCKED_PENDING_OWNER_BANNER_DECISION';requiredDecision:'OWNER_BANNER_DECISION';acquisition:'BLOCKED';
}>;
export type WaveAPet=Readonly<{
  id:string;name:string;aliases:readonly string[];
  rosterState:WaveARosterState;family:WaveAFamily;element:WaveAElement;
  sourceCategory:WaveASourceCategory;summonRarity:WaveASummonRarity;
  catalogRank:WaveACatalogRank|null;presentationPowerClass:WaveAPowerClass;presentationClassLabel:string;
  mapId:string|null;race:string|null;bodyPlan:WaveABodyPlan;archetype:string|null;
  rigProfile:string|null;baseMeshId:string|null;
  acquisitionAuthority:WaveAAcquisitionAuthority;gachaRole:WaveAGachaRole;ownerGate:WaveAOwnerGate;
  runtime:WaveARuntimeFlags;concept:WaveAConcept|null;candidateGate:WaveACandidateGate|null;
}>;
export type WaveARaceBase=Readonly<{
  id:string;name:string;rigProfile:string;memberPetIds:readonly string[];
  collectible:false;presentationPowerClass:'B';presentationClassLabel:string;
  modelStatus:'NOT_PRODUCED';rigStatus:'RIG_PROFILE_ASSIGNED';concept:WaveAConcept;
}>;

function deepFreeze<T>(value:T):Readonly<T>{
  if(value!==null&&typeof value==='object'){
    for(const nested of Object.values(value as Record<string,unknown>))deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

export const WAVE_A_ROSTER:readonly WaveAPet[]=deepFreeze<WaveAPet[]>([
  // 43 frozen Wave 1 identities, unchanged IDs (specs/pet-arena/mvp-wave1-43-pets.json).
  {
    id:'pet-v3-fire-icarus',name:'Icarus',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'limited_event_gacha',summonRarity:'Limited S',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Limited',
    mapId:null,race:'celestial',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'featured',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'ART_STUDY_EXISTS_NOT_ADMITTED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'REFERENCE_CARD_ON_CDN'},
    concept:{batch:'icarus-reference-art',filename:'icarus-s-limited.png',cdnKey:'aetheria/mvp-wave1/v1/icarus/icarus-s-limited.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/icarus/icarus-s-limited.png',sha256:'dbeee9e7f68a63d2180fd1294a058444df18647cb9ffe3df89c02c13c5c6cde4',bytes:990958,generatedInBatch:false,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:'Existing owner-reviewed Icarus reference art composited to 4:3 for the review card; not a Tripo generation and not a production model.'},
    candidateGate:null,
  },
  {
    id:'pet-v31-fire-cindrelis',name:'Cindrelis',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'standard_gacha',summonRarity:'Standard S',
    catalogRank:'S',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Standard',
    mapId:null,race:'spirit',bodyPlan:'floating',archetype:null,
    rigProfile:'rig_float',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'standard_off_rate',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'standard-cindrelis.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/standard-cindrelis.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/standard-cindrelis.png',sha256:'83bae8a6d46367cb61e728dcb8beb300b868b179b8dda773395a1606a7eef564',bytes:2070698,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'pet-v31-water-marivell',name:'Marivell',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'standard_gacha',summonRarity:'Standard S',
    catalogRank:'S',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Standard',
    mapId:null,race:'aquatic',bodyPlan:'radial',archetype:null,
    rigProfile:'rig_aquatic',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'standard_off_rate',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'standard-marivell.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/standard-marivell.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/standard-marivell.png',sha256:'eb65756aed5a2a27b26655b30dea698fd93b8297cc28797049ec440bdd8f99e8',bytes:2396427,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'pet-v31-electric-quorion',name:'Quorion',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'standard_gacha',summonRarity:'Standard S',
    catalogRank:'S',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Standard',
    mapId:null,race:'avian',bodyPlan:'avian',archetype:null,
    rigProfile:'rig_avian',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'standard_off_rate',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'standard-quorion.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/standard-quorion.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/standard-quorion.png',sha256:'eb3ffbd364706224dbd0bd3e5a5725abe8a274529db975cdcfb05bc9e36f9822',bytes:2142897,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'pet-v31-ghost-vesperyn',name:'Vesperyn',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'standard_gacha',summonRarity:'Standard S',
    catalogRank:'S',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Standard',
    mapId:null,race:'undead',bodyPlan:'spectral',archetype:null,
    rigProfile:'rig_spectral',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'standard_off_rate',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'standard-vesperyn.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/standard-vesperyn.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/standard-vesperyn.png',sha256:'d9f231ee05de4de7777faac80dda0282cd757f68596a440cf7704657ff70ad9a',bytes:2056714,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'pet-v31-ground-gravorn',name:'Gravorn',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'standard_gacha',summonRarity:'Standard S',
    catalogRank:'S',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Standard',
    mapId:null,race:'construct',bodyPlan:'hexapod',archetype:null,
    rigProfile:'rig_insect',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'standard_off_rate',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'standard-gravorn.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/standard-gravorn.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/standard-gravorn.png',sha256:'b4ab36832a6e0846377fa8b88e65e50629625559469f223d58488b63e8d403e7',bytes:2217608,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'pet-v31-light-aurelune',name:'Aurelune',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'standard_gacha',summonRarity:'Standard S',
    catalogRank:'S',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Standard',
    mapId:null,race:'celestial',bodyPlan:'quadruped',archetype:null,
    rigProfile:'rig_q4',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'standard_off_rate',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'standard-aurelune.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/standard-aurelune.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/standard-aurelune.png',sha256:'76b5d54b6b6fddad4d998c5a2e1fbd0f4eb1139ebfa5fec8a042d1b247f37994',bytes:2047383,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'fire-pyrecrown',name:'Pyrecrown',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'map_legendary',summonRarity:'map-legendary',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Legendary',
    mapId:'cinder-terraces',race:'flora',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'boss-pyrecrown.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/boss-pyrecrown.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/boss-pyrecrown.png',sha256:'ee9071cdd3fdff3f7b8b329d3b9d194fb33f5451c768968702c4c2d5474240a3',bytes:2834426,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'water-lagoonarch',name:'Lagoonarch',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'map_legendary',summonRarity:'map-legendary',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Legendary',
    mapId:'tideglass-lagoon',race:'flora',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'boss-lagoonarch.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/boss-lagoonarch.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/boss-lagoonarch.png',sha256:'4475be816167a1cb817eb14aabd42e627b1a4214c47f596b0847fe7a5d371bc2',bytes:2762447,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'electric-stormdiadem',name:'Stormdiadem',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'map_legendary',summonRarity:'map-legendary',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Legendary',
    mapId:'stormcoil-fields',race:'amorphous',bodyPlan:'amorphous',archetype:null,
    rigProfile:'rig_soft',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'boss-stormdiadem.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/boss-stormdiadem.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/boss-stormdiadem.png',sha256:'f7da12c005d1f5eb72dd19a825665acc6097e74280c1ebdf6a52a8683422fda4',bytes:2917539,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'ground-faultwarden',name:'Faultwarden',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'map_legendary',summonRarity:'map-legendary',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Legendary',
    mapId:'ochre-labyrinth',race:'humanoid',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'boss-faultwarden.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/boss-faultwarden.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/boss-faultwarden.png',sha256:'688f8395bbc3c2c6ab1e3ba2548e4a92bdecc8db759ace4f37a5eeaf8e938458',bytes:3009852,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'ghost-lanternwake',name:'Lanternwake',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'map_legendary',summonRarity:'map-legendary',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Legendary',
    mapId:'lantern-necropolis',race:'undead',bodyPlan:'spectral',archetype:null,
    rigProfile:'rig_spectral',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'boss-lanternwake.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/boss-lanternwake.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/boss-lanternwake.png',sha256:'4551d93eb6f959a7cdd1c60ebc93aec2dda7b1399a2da507a7391b8258e8fde5',bytes:2622565,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'light-dawnarchon',name:'Dawnarchon',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'map_legendary',summonRarity:'map-legendary',
    catalogRank:'S',presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Legendary',
    mapId:'dawn-prism-sanctum',race:'insectoid',bodyPlan:'insectoid',archetype:null,
    rigProfile:'rig_insect',baseMeshId:null,
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v2',filename:'boss-dawnarchon.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/boss-dawnarchon.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/boss-dawnarchon.png',sha256:'c2f0f30c4f2cd99a4f462fa355c56542544b5a8ac8919cfa274ec5d21f52a2f0',bytes:2647434,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'fire-coalwhisk',name:'Coalwhisk',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'cinder-terraces',race:'mythborn',bodyPlan:'centaur',archetype:null,
    rigProfile:'rig_centaur',baseMeshId:'base-rig-centaur',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'fire-emberloom',name:'Emberloom',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'cinder-terraces',race:'crystalborn',bodyPlan:'golem',archetype:null,
    rigProfile:'rig_heavy',baseMeshId:'base-rig-golem',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'fire-kilnback',name:'Kilnback',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'cinder-terraces',race:'demon',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:'base-rig-humanoid',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'fire-flarequill',name:'Flarequill',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'cinder-terraces',race:'elemental',bodyPlan:'amorphous',archetype:null,
    rigProfile:'rig_soft',baseMeshId:'base-rig-soft',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'fire-scorchveil',name:'Scorchveil',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'fire',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'cinder-terraces',race:'living_artifact',bodyPlan:'floating',archetype:null,
    rigProfile:'rig_float',baseMeshId:'base-rig-floating',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'water-dewskip',name:'Dewskip',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'tideglass-lagoon',race:'elemental',bodyPlan:'amorphous',archetype:null,
    rigProfile:'rig_soft',baseMeshId:'base-rig-soft',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'water-ripplefin',name:'Ripplefin',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'tideglass-lagoon',race:'flora',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:'base-rig-flora',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'water-foamcurl',name:'Foamcurl',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'tideglass-lagoon',race:'aquatic',bodyPlan:'aquatic',archetype:null,
    rigProfile:'rig_aquatic',baseMeshId:'base-rig-aquatic',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'water-tideweft',name:'Tideweft',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'tideglass-lagoon',race:'elemental',bodyPlan:'amorphous',archetype:null,
    rigProfile:'rig_soft',baseMeshId:'base-rig-soft',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'water-abyssail',name:'Abyssail',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'water',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'tideglass-lagoon',race:'celestial',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:'base-rig-humanoid',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'electric-zipspool',name:'Zipspool',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'stormcoil-fields',race:'aquatic',bodyPlan:'aquatic',archetype:null,
    rigProfile:'rig_aquatic',baseMeshId:'base-rig-aquatic',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'electric-copperkip',name:'Copperkip',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'stormcoil-fields',race:'elemental',bodyPlan:'amorphous',archetype:null,
    rigProfile:'rig_soft',baseMeshId:'base-rig-soft',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'electric-arcshell',name:'Arcshell',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'stormcoil-fields',race:'fungal',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:'base-rig-flora',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'electric-pulsecrest',name:'Pulsecrest',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'stormcoil-fields',race:'flora',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:'base-rig-flora',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'electric-thundrel',name:'Thundrel',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'electric',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'stormcoil-fields',race:'mythborn',bodyPlan:'centaur',archetype:null,
    rigProfile:'rig_centaur',baseMeshId:'base-rig-centaur',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ground-clodkin',name:'Clodkin',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'ochre-labyrinth',race:'crystalborn',bodyPlan:'golem',archetype:null,
    rigProfile:'rig_heavy',baseMeshId:'base-rig-golem',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ground-burrowick',name:'Burrowick',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'ochre-labyrinth',race:'demon',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:'base-rig-humanoid',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ground-dunebraid',name:'Dunebraid',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'ochre-labyrinth',race:'humanoid',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:'base-rig-humanoid',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ground-siltmaw',name:'Siltmaw',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'ochre-labyrinth',race:'living_artifact',bodyPlan:'floating',archetype:null,
    rigProfile:'rig_float',baseMeshId:'base-rig-floating',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ground-terracrest',name:'Terracrest',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ground',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'ochre-labyrinth',race:'flora',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:'base-rig-flora',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ghost-wickrift',name:'Wickrift',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'lantern-necropolis',race:'living_artifact',bodyPlan:'floating',archetype:null,
    rigProfile:'rig_float',baseMeshId:'base-rig-floating',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ghost-shroudlet',name:'Shroudlet',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'lantern-necropolis',race:'spirit',bodyPlan:'floating',archetype:null,
    rigProfile:'rig_float',baseMeshId:'base-rig-floating',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ghost-bellshade',name:'Bellshade',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'lantern-necropolis',race:'undead',bodyPlan:'spectral',archetype:null,
    rigProfile:'rig_spectral',baseMeshId:'base-rig-spectral',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ghost-echowisp',name:'Echowisp',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'lantern-necropolis',race:'fungal',bodyPlan:'plant',archetype:null,
    rigProfile:'rig_flora',baseMeshId:'base-rig-flora',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'ghost-veilrelic',name:'Veilrelic',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'ghost',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'lantern-necropolis',race:'dragonkin',bodyPlan:'serpentine',archetype:null,
    rigProfile:'rig_serpent',baseMeshId:'base-rig-serpent',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'light-gleamlet',name:'Gleamlet',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'dawn-prism-sanctum',race:'elemental',bodyPlan:'amorphous',archetype:null,
    rigProfile:'rig_soft',baseMeshId:'base-rig-soft',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'light-dawnpurl',name:'Dawnpurl',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'dawn-prism-sanctum',race:'celestial',bodyPlan:'humanoid',archetype:null,
    rigProfile:'rig_humanoid',baseMeshId:'base-rig-humanoid',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'light-raymantle',name:'Raymantle',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'B',presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Map regular',
    mapId:'dawn-prism-sanctum',race:'machine',bodyPlan:'mechanical',archetype:null,
    rigProfile:'rig_machine',baseMeshId:'base-rig-mechanical',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'light-solweft',name:'Solweft',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'dawn-prism-sanctum',race:'living_artifact',bodyPlan:'floating',archetype:null,
    rigProfile:'rig_float',baseMeshId:'base-rig-floating',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  {
    id:'light-prismhalo',name:'Prismhalo',aliases:[],
    rosterState:'ACTIVE',family:'core',element:'light',sourceCategory:'map_regular',summonRarity:'map-regular',
    catalogRank:'A',presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Map regular',
    mapId:'dawn-prism-sanctum',race:'dragonkin',bodyPlan:'serpentine',archetype:null,
    rigProfile:'rig_serpent',baseMeshId:'base-rig-serpent',
    acquisitionAuthority:'FROZEN_WAVE1_RULES',gachaRole:'none',ownerGate:'ART_BLUEPRINT_LOCKED_FOR_OWNER_REVIEW',
    runtime:{identityReady:true,gameplayReady:true,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'RACE_BASE_CONCEPT_ONLY'},
    concept:null,
    candidateGate:null,
  },
  // Six dragon species-family identities: presentation Power Class S.
  {
    id:'dragon-fire-ignivar',name:'Ignivar',aliases:[],
    rosterState:'ACTIVE',family:'dragon',element:'fire',sourceCategory:'dragon_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Dragon',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'forge drake',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'dragon-fire-ignivar.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/dragon-fire-ignivar.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/dragon-fire-ignivar.png',sha256:'a8f7f1bcb16bfd7bfa8c441f3ec3fa3af18c0056f2e57a2fcd3080abf3b7af9a',bytes:2749412,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'dragon-water-tidecoil',name:'Tidecoil',aliases:[],
    rosterState:'ACTIVE',family:'dragon',element:'water',sourceCategory:'dragon_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Dragon',
    mapId:null,race:null,bodyPlan:'serpentine',archetype:'sea leviathan',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'dragon-water-tidecoil.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/dragon-water-tidecoil.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/dragon-water-tidecoil.png',sha256:'2563148522bcf5a0f85e27c59416429bd28ad3da241210a9baa53f80f14b8e2e',bytes:2599011,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'dragon-electric-voltrazik',name:'Voltrazik',aliases:[],
    rosterState:'ACTIVE',family:'dragon',element:'electric',sourceCategory:'dragon_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Dragon',
    mapId:null,race:null,bodyPlan:'biped',archetype:'arc raptor',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'dragon-electric-voltrazik.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/dragon-electric-voltrazik.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/dragon-electric-voltrazik.png',sha256:'1f4228bcb8e44fa54338efa29ca417ec6301d58b49034823b85c3a4725480cac',bytes:2507320,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'dragon-ghost-hollowmaw',name:'Hollowmaw',aliases:[],
    rosterState:'ACTIVE',family:'dragon',element:'ghost',sourceCategory:'dragon_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Dragon',
    mapId:null,race:null,bodyPlan:'floating',archetype:'void wyrm',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'dragon-ghost-hollowmaw.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/dragon-ghost-hollowmaw.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/dragon-ghost-hollowmaw.png',sha256:'b6886c5ccb9c40dee1b5cad94602fc90f04025ee3eea649be27ce746651c52b4',bytes:2325459,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'dragon-ground-terradrake',name:'Terradrake',aliases:[],
    rosterState:'ACTIVE',family:'dragon',element:'ground',sourceCategory:'dragon_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Dragon',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'tectonic behemoth',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'dragon-ground-terradrake.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/dragon-ground-terradrake.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/dragon-ground-terradrake.png',sha256:'1f23dee709f985b2246b0bd736ae073d6595185ef88cd07cce645a21d1d34c88',bytes:2702448,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'dragon-light-auroryx',name:'Auroryx',aliases:[],
    rosterState:'ACTIVE',family:'dragon',element:'light',sourceCategory:'dragon_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Dragon',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'prism sovereign',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'dragon-light-auroryx.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/dragon-light-auroryx.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/dragon-light-auroryx.png',sha256:'9998c68dd613df3a39e85e9cebdfc559684ead676fc4c55a8dab591d996a9167',bytes:2699262,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  // Six bird species-family identities: presentation Power Class A.
  {
    id:'bird-fire-cinderquill',name:'Cinderquill',aliases:[],
    rosterState:'ACTIVE',family:'bird',element:'fire',sourceCategory:'bird_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Bird family',
    mapId:null,race:null,bodyPlan:'avian',archetype:'ember hawk',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'bird-fire-cinderquill.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/bird-fire-cinderquill.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/bird-fire-cinderquill.png',sha256:'b2f4fd8489d0a520ee2d6d09543246cccfd6183ed7d9653ed24c4ca32a8af674',bytes:2383437,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'bird-water-tidewren',name:'Tidewren',aliases:[],
    rosterState:'ACTIVE',family:'bird',element:'water',sourceCategory:'bird_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Bird family',
    mapId:null,race:null,bodyPlan:'avian',archetype:'lagoon heron',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'bird-water-tidewren.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/bird-water-tidewren.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/bird-water-tidewren.png',sha256:'9da40ae0715b776f1675d4c712731feb9a63103808e038a7eef02fb19de2b275',bytes:2308466,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'bird-electric-arcswift',name:'Arcswift',aliases:[],
    rosterState:'ACTIVE',family:'bird',element:'electric',sourceCategory:'bird_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Bird family',
    mapId:null,race:null,bodyPlan:'avian',archetype:'storm swift',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'bird-electric-arcswift.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/bird-electric-arcswift.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/bird-electric-arcswift.png',sha256:'7c77e9e106350e2a542b45c4bf07cedf9514b85f1de57ba6e617ca01194de276',bytes:2294156,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'bird-ghost-pallidrone',name:'Pallidrone',aliases:[],
    rosterState:'ACTIVE',family:'bird',element:'ghost',sourceCategory:'bird_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Bird family',
    mapId:null,race:null,bodyPlan:'avian',archetype:'lantern wraith owl',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'bird-ghost-pallidrone.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/bird-ghost-pallidrone.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/bird-ghost-pallidrone.png',sha256:'50f41a9e0c4b807aa5b09772ca112c89eebe83b2f4556206187e793feb7d31a7',bytes:2225473,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'bird-ground-dustrunner',name:'Dustrunner',aliases:[],
    rosterState:'ACTIVE',family:'bird',element:'ground',sourceCategory:'bird_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Bird family',
    mapId:null,race:null,bodyPlan:'avian',archetype:'mesa roadrunner',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'bird-ground-dustrunner.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/bird-ground-dustrunner.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/bird-ground-dustrunner.png',sha256:'286123371dd682a5e7940a41a039fa5bec02501e2e5ced39277c6e04abf8f674',bytes:2319079,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  {
    id:'bird-light-prismkite',name:'Prismkite',aliases:[],
    rosterState:'ACTIVE',family:'bird',element:'light',sourceCategory:'bird_family',summonRarity:'family-exploration',
    catalogRank:null,presentationPowerClass:'A',presentationClassLabel:'A \u00b7 Bird family',
    mapId:null,race:null,bodyPlan:'avian',archetype:'dawn swallow',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'NONE_OWNER_DECISION_REQUIRED',gachaRole:'none',ownerGate:'FAMILY_CONCEPT_REVIEW_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v3',filename:'bird-light-prismkite.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v3/bird-light-prismkite.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v3/bird-light-prismkite.png',sha256:'3e691c5b8b5c6969b9d8ebd29cb2d5fb4645a54a951f91755f048e7a5a355cb1',bytes:2243556,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:null,
  },
  // Six additive S off-rate candidates: acquisition-gated until an owner banner decision.
  {
    id:'pet-s-fire-vulcaryn',name:'Vulcaryn',aliases:[],
    rosterState:'CANDIDATE',family:'s_offrate',element:'fire',sourceCategory:'s_offrate_candidate',summonRarity:'Standard S off-rate',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Off-rate',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'ember lion',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'BLOCKED_OWNER_BANNER_DECISION',gachaRole:'none',ownerGate:'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v4',filename:'s-offrate-fire-vulcaryn.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v4/s-offrate-fire-vulcaryn.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v4/s-offrate-fire-vulcaryn.png',sha256:'110cc2d65380e7502e1fa0c1fe27748f8540ab609da13413e5711b631684b341',bytes:2426855,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:{status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED'},
  },
  {
    id:'pet-s-water-nerivelle',name:'Nerivelle',aliases:[],
    rosterState:'CANDIDATE',family:'s_offrate',element:'water',sourceCategory:'s_offrate_candidate',summonRarity:'Standard S off-rate',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Off-rate',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'tide otter',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'BLOCKED_OWNER_BANNER_DECISION',gachaRole:'none',ownerGate:'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v4',filename:'s-offrate-water-nerivelle.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v4/s-offrate-water-nerivelle.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v4/s-offrate-water-nerivelle.png',sha256:'da4ff346aeaa04d586c149d787bcf7213405a17cfbeee5b34a75af715c558ad4',bytes:2904332,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:{status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED'},
  },
  {
    id:'pet-s-electric-fulgarys',name:'Fulgarys',aliases:[],
    rosterState:'CANDIDATE',family:'s_offrate',element:'electric',sourceCategory:'s_offrate_candidate',summonRarity:'Standard S off-rate',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Off-rate',
    mapId:null,race:null,bodyPlan:'insectoid',archetype:'thunder beetle',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'BLOCKED_OWNER_BANNER_DECISION',gachaRole:'none',ownerGate:'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v4',filename:'s-offrate-electric-fulgarys.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v4/s-offrate-electric-fulgarys.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v4/s-offrate-electric-fulgarys.png',sha256:'41ee456e86406225f978b58022d47d804e11a3feb84f8601f62c80e4a804c6e5',bytes:2626109,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:{status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED'},
  },
  {
    id:'pet-s-ghost-umbryss',name:'Umbryss',aliases:[],
    rosterState:'CANDIDATE',family:'s_offrate',element:'ghost',sourceCategory:'s_offrate_candidate',summonRarity:'Standard S off-rate',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Off-rate',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'grave kitten',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'BLOCKED_OWNER_BANNER_DECISION',gachaRole:'none',ownerGate:'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v4',filename:'s-offrate-ghost-umbryss.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v4/s-offrate-ghost-umbryss.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v4/s-offrate-ghost-umbryss.png',sha256:'fbb8f37addef6abfc707b9f59710b6d652ad57770793501a4906dcf099669040',bytes:2556395,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:{status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED'},
  },
  {
    id:'pet-s-ground-jaderyx',name:'Jaderyx',aliases:['Jadewarden'],
    rosterState:'CANDIDATE',family:'s_offrate',element:'ground',sourceCategory:'s_offrate_candidate',summonRarity:'Standard S off-rate',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Off-rate',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'jade qilin',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'BLOCKED_OWNER_BANNER_DECISION',gachaRole:'none',ownerGate:'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v4',filename:'s-offrate-ground-jaderyx.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v4/s-offrate-ground-jaderyx.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v4/s-offrate-ground-jaderyx.png',sha256:'284c93de29fd735dd414374bf168a759e0df55e7d5876a4ba7f05f985dda0fbe',bytes:2624893,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
    candidateGate:{status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED'},
  },
  {
    id:'pet-s-light-solenne',name:'Solenne',aliases:[],
    rosterState:'CANDIDATE',family:'s_offrate',element:'light',sourceCategory:'s_offrate_candidate',summonRarity:'Standard S off-rate',
    catalogRank:null,presentationPowerClass:'S',presentationClassLabel:'S \u00b7 Off-rate',
    mapId:null,race:null,bodyPlan:'quadruped',archetype:'prism fox',
    rigProfile:null,baseMeshId:null,
    acquisitionAuthority:'BLOCKED_OWNER_BANNER_DECISION',gachaRole:'none',ownerGate:'CANDIDATE_CONCEPT_AND_BANNER_DECISION_REQUIRED',
    runtime:{identityReady:true,gameplayReady:false,modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_UNASSIGNED',animationStatus:'NOT_PRODUCED',vfxStatus:'NOT_PRODUCED',conceptStatus:'CONCEPT_ON_CDN'},
    concept:{batch:'concepts-v4',filename:'s-offrate-light-solenne.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v4/s-offrate-light-solenne.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v4/s-offrate-light-solenne.png',sha256:'3d0f994cc491e3757cee46fdb06de5e8b1ba47a416c5557c3c30e9151a2bce92',bytes:2346191,generatedInBatch:false,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:'Owner-provided replacement art (nine-tailed crystal fox) supplied from the owner Downloads folder; not generated in this batch. Rights PENDING_REVIEW and concept approval not recorded.'},
    candidateGate:{status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED'},
  },
]);

/**
 * The 10 shared race bases are modular bodies, not collectible Pets. They are excluded from the
 * roster counts and referenced by map-regular Pets only through baseMeshId.
 */
export const WAVE_A_SHARED_RACE_BASES:readonly WaveARaceBase[]=deepFreeze<WaveARaceBase[]>([
  {
    id:'base-rig-centaur',name:'Centaur Race Base',rigProfile:'rig_centaur',memberPetIds:['fire-coalwhisk','electric-thundrel'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-centaur.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-centaur.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-centaur.png',sha256:'82bc92c6f38f95a6e7175ce28f870db641d4adf93a76ceb8b5ac49d6fe863562',bytes:2279502,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-golem',name:'Golem Race Base',rigProfile:'rig_heavy',memberPetIds:['fire-emberloom','ground-clodkin'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-golem.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-golem.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-golem.png',sha256:'d44df265ea8fabece63fad2571e1821670533fd709d95fdc1c1d3d274d568fa5',bytes:2495870,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-humanoid',name:'Humanoid Familiar Base',rigProfile:'rig_humanoid',memberPetIds:['fire-kilnback','water-abyssail','ground-burrowick','ground-dunebraid','light-dawnpurl'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-humanoid.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-humanoid.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-humanoid.png',sha256:'dd6b9d5ed3018d477ee77c027b94c96707a378ca5af1e2f7002be2507c7015d8',bytes:2086872,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-soft',name:'Soft Amorphous Race Base',rigProfile:'rig_soft',memberPetIds:['fire-flarequill','water-dewskip','water-tideweft','electric-copperkip','light-gleamlet'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-soft.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-soft.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-soft.png',sha256:'d9810967312e7de39aeb0eaa574b7483c5a38cc939a5284a61ca70542cc33cf4',bytes:1920919,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-floating',name:'Living Artifact Race Base',rigProfile:'rig_float',memberPetIds:['fire-scorchveil','ground-siltmaw','ghost-wickrift','ghost-shroudlet','light-solweft'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-floating.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-floating.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-floating.png',sha256:'2b1ef1649f4e6acdb2f1f185a313a6e203a0693d8750ae9f32ed7a0d6f49c4d9',bytes:1956901,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-flora',name:'Flora and Fungal Race Base',rigProfile:'rig_flora',memberPetIds:['water-ripplefin','electric-arcshell','electric-pulsecrest','ground-terracrest','ghost-echowisp'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-flora.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-flora.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-flora.png',sha256:'b473eb93007fc5107cd10b15fc503d64f870c55df97c5147bf4b72639c7f0361',bytes:2013193,generatedInBatch:true,regenerations:1,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-aquatic',name:'Aquatic Race Base',rigProfile:'rig_aquatic',memberPetIds:['water-foamcurl','electric-zipspool'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-aquatic.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-aquatic.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-aquatic.png',sha256:'73d9663e90c7dd71e3e09180b46776b637c5a10fa11eff76707d2aa626cd00b5',bytes:2069996,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-spectral',name:'Spectral Race Base',rigProfile:'rig_spectral',memberPetIds:['ghost-bellshade'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-spectral.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-spectral.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-spectral.png',sha256:'b34701fac3c6bb8c6623a76c4571160eddc2a32d1b2652854b0c22a87dc4390f',bytes:1992279,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-serpent',name:'Serpentine Race Base',rigProfile:'rig_serpent',memberPetIds:['ghost-veilrelic','light-prismhalo'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-serpentine.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-serpentine.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-serpentine.png',sha256:'856db3436b8706743eff820d4d958b21728963baf89f8b05ab0bc096d70eddbc',bytes:1885347,generatedInBatch:true,regenerations:2,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
  {
    id:'base-rig-mechanical',name:'Mechanical Race Base',rigProfile:'rig_machine',memberPetIds:['light-raymantle'],
    collectible:false,presentationPowerClass:'B',presentationClassLabel:'B \u00b7 Race base',
    modelStatus:'NOT_PRODUCED',rigStatus:'RIG_PROFILE_ASSIGNED',
    concept:{batch:'concepts-v2',filename:'base-mechanical.png',cdnKey:'aetheria/mvp-wave1/v1/concepts-v2/base-mechanical.png',cdnUrl:'https://pub-c8ea928ecd544b928a0fb17184408871.r2.dev/aetheria/mvp-wave1/v1/concepts-v2/base-mechanical.png',sha256:'66d0903d1475d4717f3e0233047c9631a9556ec3b80a4128dc36aa8d8977f504',bytes:1978332,generatedInBatch:true,regenerations:0,ownerDecision:null,rights:'PENDING_REVIEW',note:null},
  },
]);

function buildLookup(pets:readonly WaveAPet[]):ReadonlyMap<string,WaveAPet>{
  const lookup=new Map<string,WaveAPet>();
  for(const pet of pets){
    lookup.set(pet.id,pet);
    lookup.set(pet.name.toLowerCase(),pet);
    for(const alias of pet.aliases)lookup.set(alias.toLowerCase(),pet);
  }
  return lookup;
}
function countBy<TValue>(values:readonly TValue[],key:(value:TValue)=>string):Readonly<Record<string,number>>{
  const counts:Record<string,number>={};
  for(const value of values){const bucket=key(value);counts[bucket]=(counts[bucket]??0)+1;}
  return Object.freeze(counts);
}
function countPowerClasses(pets:readonly WaveAPet[]):Readonly<Record<WaveAPowerClass,number>>{
  const counts:Record<WaveAPowerClass,number>={S:0,A:0,B:0};
  for(const pet of pets)counts[pet.presentationPowerClass]+=1;
  return Object.freeze(counts);
}

export const WAVE_A_ACTIVE_PETS:readonly WaveAPet[]=Object.freeze(WAVE_A_ROSTER.filter(pet=>pet.rosterState==='ACTIVE'));
export const WAVE_A_CANDIDATE_PETS:readonly WaveAPet[]=Object.freeze(WAVE_A_ROSTER.filter(pet=>pet.rosterState==='CANDIDATE'));
export const WAVE_A_PET_BY_ID:ReadonlyMap<string,WaveAPet>=new Map(WAVE_A_ROSTER.map(pet=>[pet.id,pet]));
export const WAVE_A_RACE_BASE_BY_ID:ReadonlyMap<string,WaveARaceBase>=new Map(WAVE_A_SHARED_RACE_BASES.map(base=>[base.id,base]));
export const WAVE_A_ELEMENTS=Object.freeze(['fire','water','electric','ghost','ground','light'] as const);

/** Frozen pool identities re-exported for reconciliation; this roster adds or removes nothing. */
export const WAVE_A_FROZEN_GACHA=Object.freeze({featured:GACHA_FEATURED,standardOffRatePool:GACHA_STANDARD_POOL});

const PET_LOOKUP=buildLookup(WAVE_A_ROSTER);

/** Resolve by stable ID, canonical name or recorded alias, for example the legacy Jadewarden label. */
export function waveAPet(idNameOrAlias:string):WaveAPet|undefined{
  return PET_LOOKUP.get(idNameOrAlias)??PET_LOOKUP.get(idNameOrAlias.trim().toLowerCase());
}

export function waveAIsRaceBase(value:string):boolean{
  return WAVE_A_RACE_BASE_BY_ID.has(value);
}

/**
 * Acquisition eligibility only. True when the frozen Wave 1 rules govern the identity and the
 * Pet is not an acquisition-gated candidate. It enables nothing: Wave 1 stays DRAFT_ONLY and
 * OFFLINE_ONLY, and this catalog approves no banner or rate.
 */
export function waveAAcquisitionAllowed(petId:string):boolean{
  const pet=WAVE_A_PET_BY_ID.get(petId);
  return pet!==undefined&&pet.rosterState==='ACTIVE'&&pet.acquisitionAuthority==='FROZEN_WAVE1_RULES'&&pet.candidateGate===null;
}

export function waveAPetsByElement(element:WaveAElement):readonly WaveAPet[]{
  return Object.freeze(WAVE_A_ROSTER.filter(pet=>pet.element===element));
}
export function waveAPetsByFamily(family:WaveAFamily):readonly WaveAPet[]{
  return Object.freeze(WAVE_A_ROSTER.filter(pet=>pet.family===family));
}

export const WAVE_A_COUNTS=Object.freeze({
  total:WAVE_A_ROSTER.length,
  active:WAVE_A_ACTIVE_PETS.length,
  candidates:WAVE_A_CANDIDATE_PETS.length,
  sharedRaceBases:WAVE_A_SHARED_RACE_BASES.length,
  activeByFamily:countBy(WAVE_A_ACTIVE_PETS,pet=>pet.family),
  candidateByFamily:countBy(WAVE_A_CANDIDATE_PETS,pet=>pet.family),
  activeByElement:countBy(WAVE_A_ACTIVE_PETS,pet=>pet.element),
  candidateInclusiveByElement:countBy(WAVE_A_ROSTER,pet=>pet.element),
  activeBySourceCategory:countBy(WAVE_A_ACTIVE_PETS,pet=>pet.sourceCategory),
  activeByPowerClass:countPowerClasses(WAVE_A_ACTIVE_PETS),
  activeByRosterState:countBy(WAVE_A_ACTIVE_PETS,pet=>pet.rosterState),
  candidateInclusiveByPowerClass:countPowerClasses(WAVE_A_ROSTER),
  candidateInclusiveByRosterState:countBy(WAVE_A_ROSTER,pet=>pet.rosterState),
});
