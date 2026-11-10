import {Capacitor,registerPlugin} from '@capacitor/core';
export type LandscapeMode='sensor'|'primary'|'secondary';
interface OrientationBridge {acquire(options:{leaseId:string;mode:LandscapeMode}):Promise<{requestedPolicy:number}>;release(options:{leaseId:string}):Promise<{restored:boolean}>}
const bridge=registerPlugin<OrientationBridge>('GameplayOrientation');
let operations:Promise<void>=Promise.resolve();
// Serial bridge operations prevent a delayed acquire from superseding a newer route.
const enqueue=(operation:()=>Promise<void>)=>{operations=operations.catch(()=>{}).then(operation).catch(()=>{});};
export function bindLandscape(mode:LandscapeMode):()=>void{
 if(Capacitor.getPlatform()!=='android')return()=>{};
 const leaseId=crypto.randomUUID();let disposed=false;
 enqueue(async()=>{if(!disposed)await bridge.acquire({leaseId,mode});});
 return()=>{if(disposed)return;disposed=true;enqueue(async()=>{await bridge.release({leaseId});});};
}
