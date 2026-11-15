import {describe,it,expect} from 'vitest';
import {PetContentDraftSchema,PetSpeciesDraftSchema} from '../src/pet-content';
const species={id:'fire-emberloom',displayName:'Emberloom',element:'fire',rarity:'rare',statProfile:'support',growthProfile:'shared-linear-35',skills:['mend','guard'],levelCap:100,assetState:'MISSING',productionReady:false};
describe('Pet content draft contract',()=>{
 it('accepts only metadata drafts and bounded shared rule references',()=>{
  expect(PetSpeciesDraftSchema.parse(species)).toEqual(species);
  for(const change of [{script:'evil'},{element:'unknown'},{levelCap:101},{levelCap:'100'},{productionReady:true},{assetState:'APPROVED'},{skills:['a','b','c']},{id:'../pet'},{displayName:'x'.repeat(65)}])expect(PetSpeciesDraftSchema.safeParse({...species,...change}).success).toBe(false);
 });
 it('rejects executable or unbounded catalogs before resolving references',()=>{
  expect(PetContentDraftSchema.safeParse({schemaVersion:2,ruleset:'pet-arena-pve',script:'evil'}).success).toBe(false);
  expect(PetContentDraftSchema.safeParse({schemaVersion:2,ruleset:'pet-arena-pve-v2',elements:[],effectiveness:[],profiles:[],growth:[],skills:[],species:[]}).success).toBe(false);
 });
});
