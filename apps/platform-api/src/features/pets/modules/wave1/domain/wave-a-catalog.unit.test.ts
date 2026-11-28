import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {GACHA_FEATURED_PET_ID, GACHA_OFF_RATE_POOL, WAVE1_PETS} from './catalog';
import {CORE_ELEMENTS, GACHA_FEATURED, GACHA_STANDARD_POOL, MAPS} from './manifest';
import {
  WAVE_A_ACTIVE_PETS,
  WAVE_A_CANDIDATE_PETS,
  WAVE_A_COUNTS,
  WAVE_A_ELEMENTS,
  WAVE_A_FROZEN_GACHA,
  WAVE_A_PET_BY_ID,
  WAVE_A_RACE_BASE_BY_ID,
  WAVE_A_ROSTER,
  WAVE_A_ROSTER_VERSION,
  WAVE_A_SHARED_RACE_BASES,
  waveAAcquisitionAllowed,
  waveAIsRaceBase,
  waveAPet,
  waveAPetsByElement,
  waveAPetsByFamily,
  type WaveAPet,
  type WaveARaceBase,
} from './wave-a-catalog';

type RosterSpec={
  rosterVersion:string;
  counts:Record<string,unknown>;
  pets:readonly WaveAPet[];
  sharedRaceBases:readonly WaveARaceBase[];
  gachaFrozen:{featured:string;standardOffRatePool:readonly string[]};
  namingConflicts:readonly {
    id:string;canonicalId:string;canonicalName:string;aliases:readonly string[];status:string;notMinted:readonly string[];
  }[];
  candidateAudit:{
    conceptCount:number;
    cdnVerifiedCount:number;
    candidates:readonly {id:string;conceptCdnKey:string;conceptSha256:string}[];
    findings:readonly {id:string;severity:string}[];
  };
  missingAssets:{concept:{referencedCdnImages:number;petsWithoutIndividualConcept:number}};
  decisions:readonly {id:string;topic:string}[];
  unresolvedOwnerDecisions:readonly {id:string;topic:string}[];
};
type CdnFile={key:string;cdnUrl:string;sha256:string;bytes:number;contentType:string};
type CdnManifest={
  publicBase:string;prefix:string;
  counts:{total:number;images:number;reviewHtml:number;ledgers:number;contactSheets:number;docs:number};
  files:readonly CdnFile[];
};

const spec=JSON.parse(readFileSync('specs/pet-arena/wave-a-canonical-roster-v1.json','utf8')) as RosterSpec;
const cdn=JSON.parse(readFileSync('specs/pet-arena/mvp-wave1-cdn-assets.json','utf8')) as CdnManifest;
const CDN_BY_KEY=new Map(cdn.files.map(file=>[file.key,file]));
const CONCEPTS=[
  ...WAVE_A_ROSTER.flatMap(pet=>pet.concept===null?[]:[pet.concept]),
  ...WAVE_A_SHARED_RACE_BASES.map(base=>base.concept),
];

describe('Wave A canonical roster counts',()=>{
  it('exposes 55 active identities, six gated candidates and 61 unique identities in total',()=>{
    expect(WAVE_A_ROSTER_VERSION).toBe('wave-a-v1');
    expect(WAVE_A_ROSTER).toHaveLength(61);
    expect(WAVE_A_ACTIVE_PETS).toHaveLength(55);
    expect(WAVE_A_CANDIDATE_PETS).toHaveLength(6);
    expect(WAVE_A_COUNTS.total).toBe(61);
    expect(WAVE_A_COUNTS.active).toBe(55);
    expect(WAVE_A_COUNTS.candidates).toBe(6);
    expect(new Set(WAVE_A_ROSTER.map(pet=>pet.id)).size).toBe(61);
    expect(new Set(WAVE_A_ROSTER.map(pet=>pet.name.toLowerCase())).size).toBe(61);
    expect(new Set(WAVE_A_ROSTER.map(pet=>pet.id.toLowerCase())).size).toBe(61);
    for(const pet of WAVE_A_ROSTER)expect(pet.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
    expect(WAVE_A_PET_BY_ID.size).toBe(61);
    expect(WAVE_A_COUNTS).toEqual(spec.counts);
  });
  it('splits the roster 43 core + 6 dragon + 6 bird and keeps exactly six elements',()=>{
    expect(WAVE_A_COUNTS.activeByFamily).toEqual({core:43,dragon:6,bird:6});
    expect(WAVE_A_COUNTS.candidateByFamily).toEqual({s_offrate:6});
    expect(WAVE_A_ELEMENTS).toEqual(CORE_ELEMENTS);
    expect(new Set(WAVE_A_ROSTER.map(pet=>pet.element)).size).toBe(6);
    expect(CORE_ELEMENTS).not.toContain('ice');
    expect(CORE_ELEMENTS).not.toContain('dark');
    for(const family of ['dragon','bird','s_offrate'] as const){
      const members=waveAPetsByFamily(family);
      expect(members).toHaveLength(6);
      expect([...new Set(members.map(pet=>pet.element))].sort()).toEqual([...CORE_ELEMENTS].sort());
    }
    expect(WAVE_A_COUNTS.activeByElement).toEqual({fire:10,water:9,electric:9,ghost:9,ground:9,light:9});
    expect(WAVE_A_COUNTS.candidateInclusiveByElement).toEqual({fire:11,water:10,electric:10,ghost:10,ground:10,light:10});
    for(const element of CORE_ELEMENTS){
      expect(waveAPetsByElement(element)).toHaveLength(WAVE_A_COUNTS.candidateInclusiveByElement[element]);
    }
    expect(WAVE_A_COUNTS.activeBySourceCategory).toEqual({
      limited_event_gacha:1,standard_gacha:6,map_legendary:6,map_regular:30,dragon_family:6,bird_family:6,
    });
  });
  it('contains the frozen 43-Pet catalog unchanged as the core family',()=>{
    const core=waveAPetsByFamily('core');
    expect(core).toHaveLength(43);
    expect(core.map(pet=>pet.id)).toEqual(WAVE1_PETS.map(pet=>pet.id));
    expect(WAVE_A_ACTIVE_PETS.filter(pet=>pet.runtime.gameplayReady)).toHaveLength(43);
    expect(WAVE_A_ROSTER.filter(pet=>pet.runtime.gameplayReady).map(pet=>pet.id)).toEqual(WAVE1_PETS.map(pet=>pet.id));
    for(const pet of WAVE1_PETS){
      const entry=WAVE_A_PET_BY_ID.get(pet.id);
      expect(entry).toMatchObject({
        name:pet.name,element:pet.element,catalogRank:pet.rank,sourceCategory:pet.category,mapId:pet.mapId,
      });
    }
  });
});

describe('presentation power class stays separate from gameplay data',()=>{
  it('assigns dragons S, birds A, legendaries S and the six Standard-S summons A',()=>{
    for(const pet of waveAPetsByFamily('dragon'))expect(pet.presentationPowerClass).toBe('S');
    for(const pet of waveAPetsByFamily('bird'))expect(pet.presentationPowerClass).toBe('A');
    for(const pet of WAVE_A_ACTIVE_PETS.filter(value=>value.sourceCategory==='map_legendary'))expect(pet.presentationPowerClass).toBe('S');
    const standard=WAVE_A_ACTIVE_PETS.filter(pet=>pet.sourceCategory==='standard_gacha');
    expect(standard).toHaveLength(6);
    for(const pet of standard){
      expect(pet.presentationPowerClass).toBe('A');
      expect(pet.catalogRank).toBe('S');
      expect(pet.summonRarity).toBe('Standard S');
    }
    expect(WAVE_A_ACTIVE_PETS.find(pet=>pet.id==='pet-v3-fire-icarus')).toMatchObject({
      presentationPowerClass:'S',catalogRank:'S',summonRarity:'Limited S',gachaRole:'featured',
    });
    for(const pet of WAVE_A_ROSTER)expect(pet.presentationClassLabel.startsWith(pet.presentationPowerClass)).toBe(true);
  });
  it('counts S 13 / A 24 / B 18 active and S 19 / A 24 / B 18 including candidates',()=>{
    expect(WAVE_A_COUNTS.activeByPowerClass).toEqual({S:13,A:24,B:18});
    expect(WAVE_A_COUNTS.candidateInclusiveByPowerClass).toEqual({S:19,A:24,B:18});
    const manual={S:0,A:0,B:0};
    for(const pet of WAVE_A_ROSTER)manual[pet.presentationPowerClass]+=1;
    expect(manual).toEqual({S:19,A:24,B:18});
  });
  it('keeps rank, summon rarity, acquisition and class as independent fields with no stats',()=>{
    const statKeys=['stats','hp','attack','defense','speed','baseStats','power'];
    for(const pet of WAVE_A_ROSTER){
      for(const key of statKeys)expect(Object.keys(pet)).not.toContain(key);
      expect(['FROZEN_WAVE1_RULES','NONE_OWNER_DECISION_REQUIRED','BLOCKED_OWNER_BANNER_DECISION']).toContain(pet.acquisitionAuthority);
      expect(['featured','standard_off_rate','none']).toContain(pet.gachaRole);
    }
    for(const pet of WAVE_A_ROSTER.filter(value=>value.sourceCategory==='map_regular')){
      expect(pet.catalogRank).not.toBeNull();
      expect(pet.presentationPowerClass).toBe(pet.catalogRank);
    }
    expect(WAVE_A_ROSTER.filter(pet=>pet.presentationPowerClass!==pet.catalogRank&&pet.catalogRank!==null)).toHaveLength(6);
    for(const pet of WAVE_A_ROSTER.filter(value=>value.family!=='core')){
      expect(pet.catalogRank).toBeNull();
      expect(pet.mapId).toBeNull();
    }
    expect(WAVE_A_ROSTER.filter(pet=>pet.gachaRole!=='none')).toHaveLength(7);
    expect(WAVE_A_ROSTER.filter(pet=>pet.gachaRole==='featured')).toHaveLength(1);
  });
});

describe('shared race bases are not collectible pets',()=>{
  it('keeps all ten bases out of the roster, counts, pools and lookups',()=>{
    expect(WAVE_A_SHARED_RACE_BASES).toHaveLength(10);
    expect(WAVE_A_RACE_BASE_BY_ID.size).toBe(10);
    expect(WAVE_A_COUNTS.sharedRaceBases).toBe(10);
    expect(WAVE_A_ROSTER.some(pet=>pet.id.startsWith('base-rig-'))).toBe(false);
    for(const base of WAVE_A_SHARED_RACE_BASES){
      expect(base.collectible).toBe(false);
      expect(base.presentationPowerClass).toBe('B');
      expect(waveAIsRaceBase(base.id)).toBe(true);
      expect(WAVE_A_PET_BY_ID.has(base.id)).toBe(false);
      expect(waveAPet(base.id)).toBeUndefined();
      expect(GACHA_OFF_RATE_POOL).not.toContain(base.id);
      expect(GACHA_FEATURED).not.toBe(base.id);
      expect(WAVE1_PETS.some(pet=>pet.id===base.id)).toBe(false);
    }
    expect(waveAIsRaceBase('fire-coalwhisk')).toBe(false);
  });
  it('treats every base as a body used by map-regular Pets only through baseMeshId',()=>{
    const referenced=new Map<string,string[]>();
    for(const pet of WAVE_A_ACTIVE_PETS.filter(value=>value.sourceCategory==='map_regular')){
      expect(pet.baseMeshId).not.toBeNull();
      expect(WAVE_A_RACE_BASE_BY_ID.has(pet.baseMeshId as string)).toBe(true);
      referenced.set(pet.baseMeshId as string,[...(referenced.get(pet.baseMeshId as string)??[]),pet.id]);
    }
    expect(referenced.size).toBe(10);
    for(const base of WAVE_A_SHARED_RACE_BASES){
      expect(referenced.get(base.id)).toBeDefined();
      expect([...(referenced.get(base.id) as string[])].sort()).toEqual([...base.memberPetIds].sort());
      for(const petId of base.memberPetIds)expect(WAVE_A_PET_BY_ID.get(petId)?.sourceCategory).toBe('map_regular');
    }
    for(const pet of WAVE_A_ACTIVE_PETS.filter(value=>value.sourceCategory!=='map_regular'))expect(pet.baseMeshId).toBeNull();
  });
});

describe('the six S off-rate candidates stay acquisition-gated',()=>{
  it('records six candidates, one per element, all blocked from acquisition',()=>{
    expect(WAVE_A_CANDIDATE_PETS.map(pet=>pet.name)).toEqual(['Vulcaryn','Nerivelle','Fulgarys','Umbryss','Jaderyx','Solenne']);
    expect([...new Set(WAVE_A_CANDIDATE_PETS.map(pet=>pet.element))].sort()).toEqual([...CORE_ELEMENTS].sort());
    for(const candidate of WAVE_A_CANDIDATE_PETS){
      expect(candidate.rosterState).toBe('CANDIDATE');
      expect(candidate.family).toBe('s_offrate');
      expect(candidate.sourceCategory).toBe('s_offrate_candidate');
      expect(candidate.presentationPowerClass).toBe('S');
      expect(candidate.summonRarity).toBe('Standard S off-rate');
      expect(candidate.candidateGate).toEqual({
        status:'BLOCKED_PENDING_OWNER_BANNER_DECISION',requiredDecision:'OWNER_BANNER_DECISION',acquisition:'BLOCKED',
      });
      expect(candidate.acquisitionAuthority).toBe('BLOCKED_OWNER_BANNER_DECISION');
      expect(candidate.gachaRole).toBe('none');
      expect(candidate.runtime.gameplayReady).toBe(false);
      expect(candidate.runtime.identityReady).toBe(true);
      expect(candidate.concept).not.toBeNull();
      expect(waveAAcquisitionAllowed(candidate.id)).toBe(false);
      expect(waveAAcquisitionAllowed(candidate.name)).toBe(false);
      expect(WAVE1_PETS.some(pet=>pet.id===candidate.id)).toBe(false);
      expect(GACHA_OFF_RATE_POOL).not.toContain(candidate.id);
      expect(GACHA_FEATURED).not.toBe(candidate.id);
      expect(spec.gachaFrozen.standardOffRatePool).not.toContain(candidate.id);
      expect(candidate.mapId).toBeNull();
    }
    expect(WAVE_A_ROSTER.filter(pet=>pet.candidateGate!==null)).toHaveLength(6);
    expect(new Set(WAVE_A_ACTIVE_PETS.map(pet=>pet.id)).size+WAVE_A_CANDIDATE_PETS.length).toBe(61);
  });
  it('allows eligibility for the frozen 43 only, never for family members or candidates',()=>{
    expect(WAVE_A_ACTIVE_PETS.filter(pet=>waveAAcquisitionAllowed(pet.id))).toHaveLength(43);
    for(const pet of WAVE_A_ACTIVE_PETS.filter(value=>value.family!=='core'))expect(waveAAcquisitionAllowed(pet.id)).toBe(false);
    for(const pet of WAVE_A_CANDIDATE_PETS)expect(waveAAcquisitionAllowed(pet.id)).toBe(false);
    expect(waveAAcquisitionAllowed('pet-v3-fire-icarus')).toBe(true);
    expect(waveAAcquisitionAllowed('missing-pet')).toBe(false);
  });
  it('resolves the ground candidate to one stable ID with Jadewarden only as an alias',()=>{
    const ground=WAVE_A_CANDIDATE_PETS.filter(pet=>pet.element==='ground');
    expect(ground).toHaveLength(1);
    expect(ground[0]).toMatchObject({id:'pet-s-ground-jaderyx',name:'Jaderyx',aliases:['Jadewarden']});
    expect(waveAPet('Jadewarden')?.id).toBe('pet-s-ground-jaderyx');
    expect(waveAPet('jadewarden')?.id).toBe('pet-s-ground-jaderyx');
    expect(waveAPet('pet-s-ground-jaderyx')?.name).toBe('Jaderyx');
    expect(WAVE_A_ROSTER.some(pet=>pet.id==='pet-s-ground-jadewarden')).toBe(false);
    expect(WAVE_A_ROSTER.some(pet=>pet.name==='Jadewarden')).toBe(false);
    const conflict=spec.namingConflicts[0];
    expect(conflict).toMatchObject({
      id:'NC-1',status:'RESOLVED_IN_THIS_CATALOG',canonicalId:'pet-s-ground-jaderyx',canonicalName:'Jaderyx',aliases:['Jadewarden'],
    });
    expect(conflict.notMinted).toContain('pet-s-ground-jadewarden');
    expect(WAVE_A_ROSTER.filter(pet=>pet.aliases.length>0)).toHaveLength(1);
  });
});

describe('the candidate concept audit is recorded',()=>{
  it('audits all six candidates with CDN-verified concepts and owner decisions still open',()=>{
    expect(spec.candidateAudit.conceptCount).toBe(6);
    expect(spec.candidateAudit.cdnVerifiedCount).toBe(6);
    expect(spec.candidateAudit.candidates).toHaveLength(6);
    expect(spec.candidateAudit.findings.length).toBeGreaterThanOrEqual(6);
    expect(spec.candidateAudit.findings.some(finding=>finding.severity==='HIGH')).toBe(true);
    expect(new Set(spec.candidateAudit.findings.map(finding=>finding.id)).size).toBe(spec.candidateAudit.findings.length);
    for(const row of spec.candidateAudit.candidates){
      const pet=WAVE_A_CANDIDATE_PETS.find(value=>value.id===row.id);
      expect(pet).toBeDefined();
      expect(pet?.concept?.cdnKey).toBe(row.conceptCdnKey);
      expect(pet?.concept?.sha256).toBe(row.conceptSha256);
      expect(CDN_BY_KEY.has(row.conceptCdnKey)).toBe(true);
    }
    for(const pet of WAVE_A_CANDIDATE_PETS){
      expect(pet.concept?.ownerDecision).toBeNull();
      expect(pet.concept?.rights).toBe('PENDING_REVIEW');
    }
  });
});

describe('asset mapping uses only existing CDN objects',()=>{
  it('points every concept at a committed CDN key with matching sha256, bytes and URL',()=>{
    expect(CONCEPTS).toHaveLength(41);
    expect(spec.missingAssets.concept.referencedCdnImages).toBe(41);
    expect(cdn.counts.images).toBe(41);
    expect(cdn.counts.total).toBe(63);
    expect(new Set(CONCEPTS.map(concept=>concept.cdnKey)).size).toBe(41);
    for(const concept of CONCEPTS){
      const file=CDN_BY_KEY.get(concept.cdnKey);
      expect(file).toBeDefined();
      expect(concept.sha256).toBe(file?.sha256);
      expect(concept.bytes).toBe(file?.bytes);
      expect(concept.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(concept.bytes).toBeGreaterThan(0);
      expect(concept.cdnUrl).toBe(file?.cdnUrl);
      expect(concept.cdnUrl).toBe(`${cdn.publicBase}/${concept.cdnKey.slice(cdn.prefix.length+1)}`);
      expect(concept.cdnKey.endsWith('.png')).toBe(true);
    }
    const imageKeys=cdn.files.filter(file=>file.contentType==='image/png').map(file=>file.key);
    expect([...imageKeys].sort()).toEqual([...new Set(CONCEPTS.map(concept=>concept.cdnKey))].sort());
    for(const file of cdn.files){
      expect(file.key.endsWith('.glb')||file.key.endsWith('.fbx')||file.key.endsWith('.vrm')).toBe(false);
    }
  });
  it('maps the 30 map-regular Pets to their race-base concept instead of a missing file',()=>{
    const regulars=WAVE_A_ACTIVE_PETS.filter(pet=>pet.sourceCategory==='map_regular');
    expect(regulars).toHaveLength(30);
    expect(regulars.filter(pet=>pet.concept===null)).toHaveLength(30);
    expect(regulars.filter(pet=>pet.runtime.conceptStatus==='RACE_BASE_CONCEPT_ONLY')).toHaveLength(30);
    expect(spec.missingAssets.concept.petsWithoutIndividualConcept).toBe(30);
    expect(WAVE_A_SHARED_RACE_BASES.filter(base=>base.concept.cdnKey.length>0)).toHaveLength(10);
    expect(WAVE_A_ROSTER.filter(pet=>pet.concept!==null)).toHaveLength(31);
    expect(WAVE_A_ROSTER.filter(pet=>pet.concept!==null&&!pet.concept.generatedInBatch)).toHaveLength(2);
  });
});

describe('missing production assets are explicit',()=>{
  it('never claims an admitted model, animation, vfx or rig asset',()=>{
    for(const pet of WAVE_A_ROSTER){
      expect(['NOT_PRODUCED','ART_STUDY_EXISTS_NOT_ADMITTED']).toContain(pet.runtime.modelStatus);
      expect(pet.runtime.animationStatus).toBe('NOT_PRODUCED');
      expect(pet.runtime.vfxStatus).toBe('NOT_PRODUCED');
      expect(pet.runtime.identityReady).toBe(true);
      expect(['RIG_PROFILE_ASSIGNED','RIG_PROFILE_UNASSIGNED']).toContain(pet.runtime.rigStatus);
    }
    expect(WAVE_A_ROSTER.filter(pet=>pet.runtime.modelStatus==='ART_STUDY_EXISTS_NOT_ADMITTED').map(pet=>pet.id))
      .toEqual(['pet-v3-fire-icarus']);
    expect(WAVE_A_ACTIVE_PETS.filter(pet=>pet.runtime.rigStatus==='RIG_PROFILE_ASSIGNED')).toHaveLength(43);
    expect(WAVE_A_ACTIVE_PETS.filter(pet=>pet.runtime.rigStatus==='RIG_PROFILE_UNASSIGNED')).toHaveLength(12);
    expect(WAVE_A_CANDIDATE_PETS.filter(pet=>pet.runtime.rigStatus==='RIG_PROFILE_UNASSIGNED')).toHaveLength(6);
    for(const pet of WAVE_A_ROSTER.filter(value=>value.runtime.rigStatus==='RIG_PROFILE_UNASSIGNED')){
      expect(pet.rigProfile).toBeNull();
      expect(pet.acquisitionAuthority).not.toBe('FROZEN_WAVE1_RULES');
    }
    for(const base of WAVE_A_SHARED_RACE_BASES)expect(base.modelStatus).toBe('NOT_PRODUCED');
    expect(WAVE_A_ROSTER.filter(pet=>pet.runtime.conceptStatus==='REFERENCE_CARD_ON_CDN').map(pet=>pet.id))
      .toEqual(['pet-v3-fire-icarus']);
  });
});

describe('the versioned specification and the runtime module do not drift',()=>{
  it('matches the specification entries, race bases and counts exactly',()=>{
    expect(spec.rosterVersion).toBe(WAVE_A_ROSTER_VERSION);
    expect(spec.pets).toHaveLength(61);
    expect(spec.sharedRaceBases).toHaveLength(10);
    expect(WAVE_A_ROSTER).toEqual(spec.pets);
    expect(WAVE_A_SHARED_RACE_BASES).toEqual(spec.sharedRaceBases);
    expect(WAVE_A_COUNTS).toEqual(spec.counts);
    expect(WAVE_A_FROZEN_GACHA.featured).toBe(spec.gachaFrozen.featured);
    expect([...WAVE_A_FROZEN_GACHA.standardOffRatePool]).toEqual([...spec.gachaFrozen.standardOffRatePool]);
  });
  it('keeps the frozen Wave 1 catalog and gacha pool untouched',()=>{
    expect(WAVE1_PETS).toHaveLength(43);
    expect(GACHA_FEATURED_PET_ID).toBe('pet-v3-fire-icarus');
    expect([...GACHA_OFF_RATE_POOL]).toEqual([...GACHA_STANDARD_POOL]);
    expect(WAVE_A_FROZEN_GACHA.featured).toBe(GACHA_FEATURED);
    expect([...WAVE_A_FROZEN_GACHA.standardOffRatePool]).toEqual([...GACHA_STANDARD_POOL]);
    expect(WAVE1_PETS.filter(pet=>pet.category==='limited_event_gacha')).toHaveLength(1);
    expect(WAVE1_PETS.filter(pet=>pet.category==='standard_gacha')).toHaveLength(6);
    expect(WAVE1_PETS.filter(pet=>pet.category==='map_legendary')).toHaveLength(6);
    expect(WAVE1_PETS.filter(pet=>pet.category==='map_regular')).toHaveLength(30);
    expect(MAPS).toHaveLength(6);
    for(const pet of WAVE_A_ROSTER.filter(value=>value.mapId!==null))expect(MAPS.map(map=>map.id)).toContain(pet.mapId);
    expect(WAVE_A_ROSTER.filter(pet=>pet.mapId!==null)).toHaveLength(36);
  });
  it('records every reconciliation decision and the owner decisions that still block work',()=>{
    expect(spec.decisions.length).toBeGreaterThanOrEqual(10);
    expect(new Set(spec.decisions.map(decision=>decision.id)).size).toBe(spec.decisions.length);
    for(const decision of spec.decisions){
      expect(decision.id).toMatch(/^WA-D\d+$/);
      expect(decision.topic.length).toBeGreaterThan(0);
    }
    expect(spec.unresolvedOwnerDecisions.length).toBeGreaterThanOrEqual(8);
    expect(new Set(spec.unresolvedOwnerDecisions.map(decision=>decision.id)).size).toBe(spec.unresolvedOwnerDecisions.length);
    const topics=spec.unresolvedOwnerDecisions.map(decision=>decision.topic.toLowerCase()).join(' | ');
    expect(topics).toContain('banner');
    expect(topics).toContain('jaderyx');
    expect(topics).toContain('solenne');
    expect(topics).toContain('dragon');
  });
});
