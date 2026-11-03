import { WorldSlugSchema,TravelDestinationSchema } from '@virtual-city/contracts';
export type DestinationLink={kind:'none'}|{kind:'invalid'}|{kind:'preferred';worldSlug:string;roomId?:string};
export function destinationLink(raw:unknown):DestinationLink{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {kind:'invalid'};const input=raw as Record<string,unknown>;
 if(Object.keys(input).some(key=>!['destination','room'].includes(key)))return {kind:'invalid'};
 if(input.destination===undefined&&input.room===undefined)return {kind:'none'};
 const world=WorldSlugSchema.safeParse(input.destination),room=TravelDestinationSchema.shape.roomId.safeParse(input.room);
 if(!world.success||!room.success)return {kind:'invalid'};return {kind:'preferred',worldSlug:world.data,...room.data?{roomId:room.data}:{}};
}
export function travelHref(worldSlug:string,roomId?:string){const parsed=destinationLink({destination:worldSlug,room:roomId});if(parsed.kind!=='preferred')throw Error('INVALID_DESTINATION_LINK');return '/travel?destination='+encodeURIComponent(parsed.worldSlug)+(parsed.roomId?'&room='+encodeURIComponent(parsed.roomId):'');}
