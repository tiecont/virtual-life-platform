import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PetAcquisitionCatalogV3Schema} from '../../src/pet-acquisition-catalog-v3';
const load=(name:string)=>JSON.parse(readFileSync(new URL('../../../../specs/pet-arena/'+name,import.meta.url),'utf8'));
export function acquisitionCatalog(){
  const bytes=readFileSync(new URL('../../../../specs/pet-arena/v3.1/data/pets_initial_240.json',import.meta.url));
  return PetAcquisitionCatalogV3Schema.parse({
    schemaVersion:3,ruleset:'pet-arena-pve-v3',contentVersion:'3.1',state:'DRAFT_ONLY',enabled:false,publishAllowed:false,
    sourceSha256:createHash('sha256').update(bytes).digest('hex'),
    maps:load('v3.1/data/maps_19.json').maps.map((m:{id:string;primaryElement:string})=>({id:m.id,element:m.primaryElement})),
    pets:JSON.parse(bytes.toString()).pets.map((p:Record<string,unknown>)=>{
      const acquisition=p as {rank:string;source:string;mapId:string|null;capture:{requiredUniqueWins:number};combat:{signatureCard:string|null};awakening:{applies:boolean}};
      return {id:p.id,name:p.name,element:p.element,race:p.race,bodyPlan:p.bodyPlan,rig:p.rigArchetype,sourceRarityLegacy:p.sourceRarityLegacy,
        acquisition:{rank:acquisition.rank,source:acquisition.source,mapId:acquisition.mapId,requiredUniqueWins:acquisition.capture.requiredUniqueWins,signatureCard:acquisition.combat.signatureCard,awakeningEnabled:acquisition.awakening.applies}};
    }),
  });
}
export function upstreamIdentities(){
  return load('catalog-v2.json').species.map((p:{id:string;displayName:string;element:string;rarity:string;mapId:string})=>({id:p.id,name:p.displayName,element:p.element,sourceRarityLegacy:p.rarity,mapId:p.mapId}));
}
