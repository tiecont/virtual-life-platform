// A refresh hint only: no room, world, account, proof or profile payload.
export function announceVisitChange(){
 if(typeof BroadcastChannel!=='undefined'){const bus=new BroadcastChannel('virtual-city-visit');bus.postMessage({schemaVersion:1});bus.close();}
 else window.dispatchEvent(new Event('virtual-city-visit-changed'));
}
