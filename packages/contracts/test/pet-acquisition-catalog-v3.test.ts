import {describe,it,expect} from 'vitest';
import {PetAcquisitionCatalogV3Schema,validatePetAcquisitionCatalogV3} from '../src/pet-acquisition-catalog-v3';
import {acquisitionCatalog,upstreamIdentities} from './fixtures/pet-acquisition-v3';

describe('offline v3 acquisition projection',()=>{
  it('preserves all 240 identities, sources and trusted upstream 114 fields',()=>{
    const c=validatePetAcquisitionCatalogV3(acquisitionCatalog(),upstreamIdentities());
    expect(c.pets).toHaveLength(240);
    expect(Object.fromEntries(['map_regular','map_legendary','limited_event_gacha','standard_gacha'].map(s=>[s,c.pets.filter(p=>p.acquisition.source===s).length]))).toEqual({map_regular:209,map_legendary:19,limited_event_gacha:6,standard_gacha:6});
  });
  it('rejects identity, source, morphology, reference and execution mutations',()=>{
    const original=acquisitionCatalog();
    const changes:Array<(c:typeof original)=>void>=[
      c=>{c.pets[0]=c.pets[1];},c=>{c.pets[0].name=c.pets[1].name.toUpperCase();},
      c=>{c.maps[0]=c.maps[1];},c=>{c.pets[0].acquisition.mapId='unknown-map';},
      c=>{c.pets[0].rig='rig_float';},c=>{c.pets.at(-1)!.id='replacement-standard';},
      c=>{c.pets.at(-1)!.acquisition.source='map_legendary';},c=>{Reflect.set(c,'enabled',true);},
      c=>{Reflect.set(c,'publishAllowed',true);},c=>{Reflect.set(c.pets[0],'effect',999999);},
      c=>{Reflect.set(c.pets[0].acquisition,'rank','SSR');},c=>{Reflect.set(c.pets[0],'race','arcane');},
      c=>{Reflect.set(c,'sourceSha256','x');},
    ];
    for(const change of changes){const c=structuredClone(original);change(c);expect(PetAcquisitionCatalogV3Schema.safeParse(c).success).toBe(false);}
  });
  it('rejects changes to trusted legacy identity even when the projection shape is valid',()=>{
    for(const key of ['id','name','sourceRarityLegacy'] as const){
      const c=acquisitionCatalog();Reflect.set(c.pets[0],key,key==='sourceRarityLegacy'?'rare':'changed');
      expect(()=>validatePetAcquisitionCatalogV3(c,upstreamIdentities())).toThrow('Upstream Pet identity changed');
    }
    const upstream=upstreamIdentities();upstream[0]=upstream[1];
    expect(()=>validatePetAcquisitionCatalogV3(acquisitionCatalog(),upstream)).toThrow('Duplicate upstream');
  });
  it('requires every field and rejects coercion at all structured levels',()=>{
    const original=acquisitionCatalog();
    for(const path of [[],['pets',0],['pets',0,'acquisition'],['maps',0]] as const){
      for(const key of Object.keys(path.reduce((v,k)=>Reflect.get(v as object,k),original) as object)){
        const c=structuredClone(original);const row=path.reduce((v,k)=>Reflect.get(v as object,k),c) as object;
        Reflect.deleteProperty(row,key);expect(PetAcquisitionCatalogV3Schema.safeParse(c).success).toBe(false);
      }
    }
  });
});
