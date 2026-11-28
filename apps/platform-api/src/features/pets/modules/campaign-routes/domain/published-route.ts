import {z} from 'zod';
import {DomainError} from '../../../../../shared/common/errors';

const stableId=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const routeMetadata=z.object({
  id:stableId,mapId:stableId,opponentPetId:stableId,tier:z.enum(['entry','advanced','boss']),
  prerequisiteEncounterId:stableId.nullable(),enabled:z.boolean(),mode:z.enum(['solo','either']),
  profile:z.object({id:stableId,requiredRoomPoints:z.number().int().min(0).max(1_000_000),
    name:z.string().min(1),rewardPolicy:z.unknown()}).optional(),
});

export type PublishedCampaignRoute=z.infer<typeof routeMetadata>&{
  enabled:true;profile:NonNullable<z.infer<typeof routeMetadata>['profile']>;
};
export type RouteSeatMode='solo'|'coop';

export function isCampaignRoute(id:string){return id.startsWith('recruit-');}

// Parse only the projection of fields needed for Nest admission. Rust validates
// the full schema and binds the selected combat profile and immutable digest.
export function publishedCampaignRoutes(bundle:Record<string,unknown>):PublishedCampaignRoute[]{
  if(bundle.schemaVersion!==7||bundle.engineCapability!=='arena8-coop-v6')return [];
  const rows=z.array(routeMetadata).max(48).safeParse(bundle.campaignRoutes);
  if(!rows.success)throw new DomainError('NOT_AVAILABLE',503,'Published campaign routes are unavailable');
  return rows.data.flatMap<PublishedCampaignRoute>(route=>{
    if(!route.enabled)return [];
    if(!route.profile||route.profile.id!==route.id||route.id!=='recruit-'+route.opponentPetId||
      route.profile.rewardPolicy==null)
      throw new DomainError('NOT_AVAILABLE',503,'Published campaign route profile is unavailable');
    return [{...route,enabled:true,profile:route.profile}];
  });
}

export function campaignRoute(
  bundle:Record<string,unknown>,routeId:string,mode:RouteSeatMode,mapId?:string,
):PublishedCampaignRoute{
  const route=publishedCampaignRoutes(bundle).find(candidate=>candidate.id===routeId);
  if(!route||(mapId!==undefined&&route.mapId!==mapId)||(mode==='coop'&&route.mode!=='either'))
    throw new DomainError('NOT_AVAILABLE',404,'Campaign route is unavailable');
  return route;
}
