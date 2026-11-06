import {App} from '@capacitor/app';import {Capacitor,type PluginListenerHandle} from '@capacitor/core';
import {internalPath,type ClientPlatform} from '@virtual-city/client-sdk';
// Back navigation belongs to the shell: a fallback route unmounts the room.
export function bindMobileBack(navigate:(path:string)=>void):()=>void{
 let disposed=false;let handle:PluginListenerHandle|undefined;
 if(Capacitor.isNativePlatform())void App.addListener('backButton',()=>{if(!disposed)navigate('/');}).then(value=>{if(disposed)void value.remove();else handle=value;}).catch(()=>{});
 return()=>{disposed=true;if(handle)void handle.remove();};
}
export function mobilePlatform(navigate:(path:string)=>void):ClientPlatform{
 return {request:async()=>new Response(JSON.stringify({error:{code:'UNAVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}}),navigate:path=>navigate(internalPath(path)),visitChanged(){},watchIdentity:()=>()=>{},lifecycle:{subscribe(listener){
  let disposed=false;const handles:PluginListenerHandle[]=[];const own=(handle:PluginListenerHandle)=>{if(disposed)void handle.remove();else handles.push(handle);};const visible=()=>listener(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',visible);
  if(Capacitor.isNativePlatform()){void App.addListener('appStateChange',state=>{if(!disposed)listener(state.isActive);}).then(own).catch(()=>{if(!disposed)listener(false);});void App.getState().then(state=>{if(!disposed)listener(state.isActive);}).catch(()=>{if(!disposed)listener(false);});}
  return()=>{disposed=true;document.removeEventListener('visibilitychange',visible);for(const handle of handles)void handle.remove();};
 }}};
}
