import {createHash} from 'node:crypto';
import {z} from 'zod';
import {WAVE_A_PET_BY_ID} from '../../wave1/domain/wave-a-catalog';
import {MAPS} from '../../wave1/domain/manifest';

const id=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const element=z.enum(['fire','water','electric','ghost','ground','light']);
const route=z.strictObject({
  opponentPetId:id,
  encounterId:id,
  tier:z.enum(['entry','advanced','boss']),
  prerequisiteEncounterId:id.nullable(),
  recruitment:z.literal('first-qualified-clear'),
});
const routeDraft=z.strictObject({
  version:z.literal(1),
  state:z.literal('draft-only'),
  acquisitionEnabled:z.literal(false),
  maps:z.array(z.strictObject({id,element,routes:z.array(route).length(8)})).length(6),
});

export type CampaignRouteDraft=z.infer<typeof routeDraft>;
export type CampaignRoute=CampaignRouteDraft['maps'][number]['routes'][number];

export function readCampaignRouteDraft(input:unknown):CampaignRouteDraft{
  const draft=routeDraft.parse(input);
  const seenMaps=new Set<string>();
  const seenPets=new Set<string>();
  const canonicalMaps=new Map<string,string>(MAPS.map(map=>[map.id,map.element]));
  for(const map of draft.maps){
    if(seenMaps.has(map.id)||canonicalMaps.get(map.id)!==map.element)
      throw new Error('Route draft has a duplicate or incorrectly mapped region');
    seenMaps.add(map.id);
    for(const [index,entry] of map.routes.entries()){
      const pet=WAVE_A_PET_BY_ID.get(entry.opponentPetId);
      if(!pet||pet.rosterState!=='ACTIVE'||pet.element!==map.element||
        (pet.family==='core'&&pet.mapId!==map.id)||seenPets.has(entry.opponentPetId))
        throw new Error('Route draft must bind a unique, active map Pet');
      seenPets.add(pet.id);
      const expectedTier=pet.family==='dragon'||pet.sourceCategory==='map_legendary'?'boss'
        :pet.family==='bird'||pet.catalogRank==='A'?'advanced':'entry';
      if(entry.tier!==expectedTier||entry.tier!==(index<3?'entry':index<6?'advanced':'boss')||
        entry.encounterId!=='recruit-'+pet.id||
        entry.prerequisiteEncounterId!==(map.routes[index-1]?.encounterId??null))
        throw new Error('Route draft does not preserve rank, encounter identity and prerequisite order');
    }
  }
  return draft;
}

export function campaignRouteDraftDigest(draft:CampaignRouteDraft){
  const {maps}=draft;
  const canonical=maps.map(map=>[map.id,map.element,map.routes.map(route=>[
    route.encounterId,route.opponentPetId,route.tier,route.prerequisiteEncounterId,route.recruitment,
  ])]);
  return createHash('sha256').update(JSON.stringify([draft.version,draft.state,draft.acquisitionEnabled,canonical])).digest('hex');
}
