import {it,expect} from 'vitest';
import {PetBattleVisualDraftSchema,petAnimationSemantics} from '../src/pet-battle-assets';
const draft=()=>({schemaVersion:1,ruleset:'pet-arena-pve-v2',contentHash:'a'.repeat(64),state:'DRAFT_ONLY',runtimeEnabled:false,productionReady:false,compatibility:{unity:'6000.3.14f1',urp:'17.3.0'},assets:[],tileAtlas:null,pets:[{speciesId:'fire-emberloom',formId:'emberloom-base',portrait:null,icon:null,model:null,prefab:null,controller:null,localization:null,materials:[],animations:petAnimationSemantics.map(semantic=>({semantic,clip:null,vfx:null,audio:null}))}]});
it('keeps every missing asset and all eleven animation semantics explicit without production acceptance',()=>{
 const value=PetBattleVisualDraftSchema.parse(draft());expect(value.pets[0].animations).toHaveLength(11);expect(value.productionReady).toBe(false);
});
it('rejects missing/duplicate semantics, invented effects, unknown bindings and production activation',()=>{
 const input=draft();
 for(const bad of [
  {...input,productionReady:true},{...input,runtimeEnabled:true},{...input,state:'PUBLISHED'},
  {...input,damage:100},{...input,compatibility:{...input.compatibility,urp:'18.0.0'}},
  {...input,pets:[{...input.pets[0],portrait:'missing'}]},
  {...input,pets:[{...input.pets[0],animations:input.pets[0].animations.slice(1)}]},
  {...input,pets:[{...input.pets[0],animations:input.pets[0].animations.map(()=>input.pets[0].animations[0])}]},
  {...input,pets:[input.pets[0],input.pets[0]]},
 ])expect(PetBattleVisualDraftSchema.safeParse(bad).success).toBe(false);
});
it('requires bounded local paths and provenance/import hashes for actual asset references',()=>{
 const input=draft(),asset={id:'portrait',kind:'portrait',path:'assets/pets/emberloom.png',sha256:'b'.repeat(64),source:{path:'assets/pets/emberloom.kra',sha256:'c'.repeat(64),origin:'original',author:'Synthetic test author',provenanceRef:'test-only',rights:'PENDING_REVIEW'},importSettings:{path:'assets/pets/emberloom.png.meta',sha256:'d'.repeat(64)}};
 const value={...input,assets:[asset],pets:[{...input.pets[0],portrait:'portrait'}]};expect(PetBattleVisualDraftSchema.safeParse(value).success).toBe(true);
 for(const path of ['/etc/passwd','../outside.png','assets/../outside.png','assets//file.png','https://example.test/pet.png','assets\\file.png'])expect(PetBattleVisualDraftSchema.safeParse({...value,assets:[{...asset,path}]}).success).toBe(false);
 expect(PetBattleVisualDraftSchema.safeParse({...value,assets:[{...asset,source:{...asset.source,rights:'CLEARED'}}]}).success).toBe(false);
 expect(PetBattleVisualDraftSchema.safeParse({...value,assets:[{...asset,kind:'clip'}]}).success).toBe(false);
 expect(PetBattleVisualDraftSchema.safeParse({...value,assets:[asset,asset]}).success).toBe(false);
});
it('rejects sharing one attack clip between normal and rage',()=>{
 const input=draft(),asset={id:'attack-clip',kind:'clip',path:'assets/attack.anim',sha256:'b'.repeat(64),source:{path:'assets/attack.blend',sha256:'c'.repeat(64),origin:'original',author:'Synthetic fixture',provenanceRef:'test-only',rights:'PENDING_REVIEW'},importSettings:{path:'assets/attack.anim.meta',sha256:'d'.repeat(64)}};
 const value={...input,assets:[asset],pets:[{...input.pets[0],animations:input.pets[0].animations.map(a=>({...a,clip:['normal','rage'].includes(a.semantic)?asset.id:null}))}]};
 expect(PetBattleVisualDraftSchema.safeParse(value).success).toBe(false);
});
