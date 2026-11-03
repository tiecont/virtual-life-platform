import { DiscoveryViewSchema,type EventCatalogSchema } from '@virtual-city/contracts';
import type { z } from 'zod';
import type { RoomDiscoveryObservation } from '../rooms/service';
import { DomainError } from '../common/errors';
type Events=z.infer<typeof EventCatalogSchema>;
export function rankDiscovery(observation:RoomDiscoveryObservation,events:Events|null,now:number){
 const at=Date.parse(observation.observedAt);if(!Number.isSafeInteger(now)||now<at||now-at>=30000)throw new DomainError('WORLD_UNAVAILABLE',503,'Activity snapshot expired');
 const worlds=observation.worlds.filter(world=>world.availability==='available'&&world.accessHint==='session-required'&&world.discoverability==='listed'&&world.slug!=='dating');const known=events!==null&&!events.truncated;
 if(new Set(worlds.map(world=>world.slug)).size!==worlds.length||new Set(observation.rooms.map(room=>room.roomId)).size!==observation.rooms.length||observation.rooms.some(room=>room.occupancy<0||room.occupancy>room.capacity))throw new DomainError('WORLD_UNAVAILABLE',503,'Activity snapshot unavailable');
 const candidates=worlds.map(world=>{const rooms=observation.rooms.filter(room=>room.worldSlug===world.slug),usedPlaces=rooms.reduce((sum,room)=>sum+room.occupancy,0),room=rooms.filter(room=>room.occupancy<room.capacity).sort((a,b)=>b.occupancy-a.occupancy||a.roomId.localeCompare(b.roomId))[0];
  const event=world.capabilities.includes('events')?events?.items.filter(item=>item.worldSlug===world.slug&&['SCHEDULED','OPEN','LIVE'].includes(item.phase)&&Date.parse(item.schedule.endsAt)>now&&Date.parse(item.schedule.startsAt)<=now+86400000).sort((a,b)=>Date.parse(a.schedule.startsAt)-Date.parse(b.schedule.startsAt))[0]:undefined;
  return {worldSlug:world.slug,reason:usedPlaces?'occupied' as const:event?'scheduled' as const:'start-here' as const,roomCount:rooms.length,usedPlaces,...room?{roomId:room.roomId}:{},eventAt:event?.schedule.startsAt??null,eventState:event?(Date.parse(event.schedule.startsAt)<=now?'live' as const:'upcoming' as const):null};
 });
 const active=candidates.filter(item=>item.reason!=='start-here').sort((a,b)=>(a.reason==='occupied'?0:1)-(b.reason==='occupied'?0:1)||b.usedPlaces-a.usedPlaces||(a.eventAt&&b.eventAt?Date.parse(a.eventAt)-Date.parse(b.eventAt):0)||a.worldSlug.localeCompare(b.worldSlug));
 const preferred=['deadline','maid','library','park','sdk-sandbox'];const fallback=[...candidates].sort((a,b)=>{const x=preferred.indexOf(a.worldSlug),y=preferred.indexOf(b.worldSlug);return (x<0?preferred.length:x)-(y<0?preferred.length:y)||a.worldSlug.localeCompare(b.worldSlug);});
 return DiscoveryViewSchema.parse({schemaVersion:1,observedAt:observation.observedAt,expiresAt:new Date(at+30000).toISOString(),schedulesKnown:known,featured:active.length?active.slice(0,3):known?fallback.slice(0,1):[]});
}
