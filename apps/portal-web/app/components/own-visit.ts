import type { RoomSnapshot,WorldCard } from '@virtual-city/contracts';
export function ownVisitLabel(snapshot:Pick<RoomSnapshot,'worldSlug'>|null,worlds:readonly WorldCard[]){if(!snapshot)return 'No confirmed visit';const world=worlds.find(world=>world.slug===snapshot.worldSlug);return world?.accessHint==='session-required'?world.title:'Private visit';}
