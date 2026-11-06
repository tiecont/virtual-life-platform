export interface ClientPlatform {
  request(path:string,init?:RequestInit):Promise<Response>;
  navigate(path:string):void;
  visitChanged():void;
  watchIdentity(listener:()=>void):()=>void;
  lifecycle?:{subscribe(listener:(active:boolean)=>void):()=>void};
}
export function internalPath(path:string){
  if(!/^\/(?!\/)[^\s\\]*$/.test(path)||Array.from(path).some(char=>char.charCodeAt(0)<32))throw Error('Navigation unavailable');
  return path;
}
// No window/document/Node evaluation at import time. Browser cookies and CSRF
// stay in their existing adapters; this port never stores or logs credentials.
export function browserPlatform(visitChanged:()=>void):ClientPlatform{
 return {request:(path,init)=>fetch(internalPath(path),init),navigate:path=>window.location.assign(internalPath(path)),visitChanged,
  watchIdentity(listener){const bus=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('virtual-city-identity');if(bus)bus.onmessage=listener;return()=>bus?.close();}};
}
