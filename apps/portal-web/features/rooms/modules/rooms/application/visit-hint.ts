// A refresh hint only: no room, world, account, proof or profile payload.
export function announceVisitChange(){
 if(typeof BroadcastChannel!=='undefined'){const bus=new BroadcastChannel('aetheria-soulbound-visit');bus.postMessage({schemaVersion:1});bus.close();}
 else window.dispatchEvent(new Event('aetheria-soulbound-visit-changed'));
}
