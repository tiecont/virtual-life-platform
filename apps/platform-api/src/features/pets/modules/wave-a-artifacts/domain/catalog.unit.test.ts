import {describe,expect,it} from 'vitest';
import {
  ARTIFACT_DEFINITIONS,
  ARTIFACT_DEFINITION_BY_ID,
  ARTIFACT_RANKS,
  ARTIFACT_RULES,
  ARTIFACT_SLOTS,
  artifactDefinition,
  canEquipArtifact,
  effectiveModifiers,
  equipmentLevelRequirement,
  loadoutDigest,
  loadoutSnapshotPayload,
  MAX_ARTIFACT_LEVEL,
  nextUpgradeCost,
  PARSED_ARTIFACT_RULES,
  PVE_ARTIFACT_REWARDS,
  RANK_LEVEL_REQUIREMENT,
  RANK_MODIFIER_CAP,
  STARTER_ARTIFACT_DEFINITION_ID,
  STARTING_MATERIALS,
  totalModifiers,
  UPGRADE_COST_TABLE,
  upgradeCost,
  validateArtifactDefinition,
  type LoadoutEntry,
} from './catalog';
import {MAPS} from '../../wave1/domain/manifest';
import {WAVE1_PET_BY_ID} from '../../wave1/domain/catalog';

const fixedArtifactId='11111111-1111-4111-8111-111111111111';
const secondArtifactId='22222222-2222-4222-8222-222222222222';

describe('Wave A artifact catalog',()=>{
  it('exposes coherent slot, rank and threshold tables',()=>{
    expect(ARTIFACT_SLOTS).toEqual(['core','aegis','rune']);
    expect(ARTIFACT_RANKS).toEqual(['D','C','B','A','S']);
    expect(RANK_LEVEL_REQUIREMENT).toEqual({D:1,C:10,B:20,A:40,S:60});
    expect(ARTIFACT_RANKS.map(equipmentLevelRequirement)).toEqual([1,10,20,40,60]);
    expect(ARTIFACT_RULES.gating).toBe('pet-level-only');
    expect(ARTIFACT_RULES.combat).toBe('snapshot-only');
    expect(ARTIFACT_RULES.enabled).toBe(false);
    expect(PARSED_ARTIFACT_RULES.definitions).toHaveLength(ARTIFACT_DEFINITIONS.length);
  });

  it('keeps every definition unique, bounded and obtainable',()=>{
    expect(ARTIFACT_DEFINITIONS).toHaveLength(7);
    expect(new Set(ARTIFACT_DEFINITIONS.map(definition=>definition.id)).size).toBe(ARTIFACT_DEFINITIONS.length);
    for(const definition of ARTIFACT_DEFINITIONS){
      expect(definition.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
      expect(ARTIFACT_SLOTS).toContain(definition.slot);
      expect(ARTIFACT_RANKS).toContain(definition.rank);
      expect(ARTIFACT_DEFINITION_BY_ID.get(definition.id)).toBe(definition);
      for(let level=1;level<=MAX_ARTIFACT_LEVEL;level+=1){
        const modifiers=effectiveModifiers(definition,level);
        for(const value of Object.values(modifiers))expect(value).toBeGreaterThanOrEqual(0);
        for(const value of Object.values(modifiers))expect(value).toBeLessThanOrEqual(RANK_MODIFIER_CAP[definition.rank]);
      }
      const pve=PVE_ARTIFACT_REWARDS.some(reward=>reward.definitionId===definition.id);
      expect(pve||definition.id===STARTER_ARTIFACT_DEFINITION_ID).toBe(true);
    }
    expect(artifactDefinition(STARTER_ARTIFACT_DEFINITION_ID)).toMatchObject({slot:'core',rank:'D'});
    expect(()=>artifactDefinition('missing-artifact')).toThrow(/absent from the Wave A catalog/);
  });

  it('refuses an over-cap definition and out-of-range upgrade levels',()=>{
    const base=artifactDefinition(STARTER_ARTIFACT_DEFINITION_ID);
    expect(()=>validateArtifactDefinition({...base,modifiers:{...base.modifiers,hp:RANK_MODIFIER_CAP.D+1}})).toThrow(/exceeds the D rank bound/);
    expect(()=>validateArtifactDefinition({...base,perLevel:{...base.perLevel,hp:9}})).toThrow(/exceeds the D rank bound/);
    expect(()=>validateArtifactDefinition({...base,slot:'boots'})).toThrow();
    expect(()=>effectiveModifiers(base,0)).toThrow(/outside 1-5/);
    expect(()=>effectiveModifiers(base,MAX_ARTIFACT_LEVEL+1)).toThrow(/outside 1-5/);
  });

  it('scales modifiers deterministically with the upgrade level',()=>{
    const seal=artifactDefinition('rune-temporal-seal');
    expect(effectiveModifiers(seal,1)).toEqual({hp:8,attack:10,defense:0,speed:6});
    expect(effectiveModifiers(seal,MAX_ARTIFACT_LEVEL)).toEqual({hp:12,attack:18,defense:0,speed:10});
    const plate=artifactDefinition('aegis-bastionplate');
    expect(effectiveModifiers(plate,3)).toEqual({hp:12,attack:0,defense:7,speed:0});
  });

  it('prices upgrades deterministically by rank and level',()=>{
    expect(UPGRADE_COST_TABLE.map(row=>row.rank)).toEqual(['D','C','B','A','S']);
    expect(UPGRADE_COST_TABLE.map(row=>row.costs)).toEqual([
      [60,80,100,120],[120,160,200,240],[180,240,300,360],[240,320,400,480],[300,400,500,600],
    ]);
    expect(ARTIFACT_RANKS.flatMap(rank=>[1,2,3,4].map(level=>upgradeCost(rank,level)))).toEqual(
      ARTIFACT_RANKS.flatMap(rank=>UPGRADE_COST_TABLE.find(row=>row.rank===rank)!.costs),
    );
    expect(nextUpgradeCost(artifactDefinition('core-emberglass'),1)).toBe(60);
    expect(nextUpgradeCost(artifactDefinition('core-emberglass'),MAX_ARTIFACT_LEVEL)).toBeNull();
    expect(()=>upgradeCost('D',0)).toThrow(/levels 1-4/);
    expect(()=>upgradeCost('D',MAX_ARTIFACT_LEVEL)).toThrow(/levels 1-4/);
  });
});

describe('Wave A artifact equipment gating',()=>{
  it('gates by Pet level only and never by presentation power class',()=>{
    for(const rank of ARTIFACT_RANKS){
      const required=equipmentLevelRequirement(rank);
      expect(canEquipArtifact(rank,required)).toBe(true);
      if(required>1)expect(canEquipArtifact(rank,required-1)).toBe(false);
    }
    const coalwhisk=WAVE1_PET_BY_ID.get('fire-coalwhisk');
    expect(coalwhisk).toMatchObject({rank:'B',category:'map_regular'});
    // Rank B is the presentation power class of a Lv60 Pet that equips the S rune.
    expect(canEquipArtifact('S',60)).toBe(true);
    expect(()=>canEquipArtifact('S',61)).toThrow(/outside 1-60/);
    expect(()=>canEquipArtifact('S',0)).toThrow(/outside 1-60/);
  });

  it('orders the PvE reward hook with the canonical campaign maps',()=>{
    expect(PVE_ARTIFACT_REWARDS.map(reward=>reward.mapId)).toEqual(MAPS.map(map=>map.id));
    expect(PVE_ARTIFACT_REWARDS.map(reward=>reward.definitionId)).toEqual([
      'core-amberlattice','aegis-bastionplate','rune-mistquill','rune-whisperknot','core-prismheart','rune-temporal-seal',
    ]);
    for(const reward of PVE_ARTIFACT_REWARDS){
      expect(reward.materials).toBeGreaterThan(0);
      expect(artifactDefinition(reward.definitionId).rank).not.toBe('D');
    }
    expect(STARTING_MATERIALS).toBe(150);
  });
});

describe('Wave A immutable loadout snapshot payload',()=>{
  const entries:LoadoutEntry[]=[
    {slot:'rune',artifactId:secondArtifactId,definitionId:'rune-mistquill',upgradeLevel:2,modifiers:effectiveModifiers(artifactDefinition('rune-mistquill'),2)},
    {slot:'core',artifactId:fixedArtifactId,definitionId:'core-emberglass',upgradeLevel:1,modifiers:effectiveModifiers(artifactDefinition('core-emberglass'),1)},
  ];

  it('sorts slots, totals modifiers and hashes canonically',()=>{
    const payload=loadoutSnapshotPayload('fire-coalwhisk',60,entries);
    expect(payload.entries.map(entry=>entry.slot)).toEqual(['core','rune']);
    expect(payload.totals).toEqual({hp:4,attack:7,defense:0,speed:2});
    expect(payload.totals).toEqual(totalModifiers(payload.entries));
    const digest=loadoutDigest(payload);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(loadoutDigest(loadoutSnapshotPayload('fire-coalwhisk',60,[...entries].reverse()))).toBe(digest);
    expect(loadoutDigest(loadoutSnapshotPayload('fire-coalwhisk',59,entries))).not.toBe(digest);
    expect(loadoutDigest(loadoutSnapshotPayload('water-dewskip',60,entries))).not.toBe(digest);
    const upgraded=loadoutSnapshotPayload('fire-coalwhisk',60,entries.map(entry=>entry.slot==='core'
      ?{...entry,upgradeLevel:2,modifiers:effectiveModifiers(artifactDefinition('core-emberglass'),2)}
      :entry));
    expect(loadoutDigest(upgraded)).not.toBe(digest);
  });

  it('handles an empty loadout and rejects duplicate slots',()=>{
    const empty=loadoutSnapshotPayload('fire-coalwhisk',1,[]);
    expect(empty.entries).toEqual([]);
    expect(empty.totals).toEqual({hp:0,attack:0,defense:0,speed:0});
    expect(()=>loadoutSnapshotPayload('fire-coalwhisk',1,[entries[1],entries[1]])).toThrow(/one artifact per slot/);
    expect(()=>loadoutSnapshotPayload('Fire Coalwhisk',1,[])).toThrow(/Pet id is invalid/);
    expect(()=>loadoutSnapshotPayload('fire-coalwhisk',61,[])).toThrow(/outside 1-60/);
  });
});
