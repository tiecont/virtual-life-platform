import {OperationalObservationSchema,OperatorObservationViewSchema,type OperationalObservation} from '@virtual-city/contracts';
import type {AdminConfig} from './runtime-config.mjs';
type Fetch=(input:string,init?:RequestInit)=>Promise<Response>;
export function createObservationReader(config:AdminConfig,fetcher:Fetch,now=Date.now){
 let cached:OperationalObservation|undefined,pending:Promise<ReturnType<typeof OperatorObservationViewSchema.parse>>|undefined,next=0,failed=false;
 function view(){const at=now(),age=cached?at-cached.sampledAt:Infinity;return OperatorObservationViewSchema.parse(cached&&age>=-5000&&age<=30000?{schemaVersion:1,source:'platform-api',status:failed||age>10000?'STALE':'FRESH',sampledAt:cached.sampledAt,observation:cached}:{schemaVersion:1,source:'platform-api',status:'UNKNOWN',sampledAt:null,observation:null});}
 return async()=>{
  if(!config.metricsToken)return view();if(pending)return pending;if(now()<next)return view();next=now()+5000;
  pending=(async()=>{try{
   const response=await fetcher(config.api+'/internal/observations',{headers:{accept:'application/json',authorization:'Bearer '+config.metricsToken},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(2500)});
   if(!response.ok){await response.body?.cancel();throw Error();}if(Number(response.headers.get('content-length'))>131072){await response.body?.cancel();throw Error();}
   const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const chunks:Uint8Array[]=[];
   try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>131072){await reader.cancel();throw Error();}chunks.push(item.value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const value=OperationalObservationSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));if(value.sampledAt>now()+5000||now()-value.sampledAt>30000||value.processStartedAt>value.sampledAt||value.orders.sampledAt>value.sampledAt+5000||value.sampledAt-value.orders.sampledAt>30000)throw Error();
   cached=value;failed=false;return view();
  }catch{failed=true;return view();}finally{pending=undefined;}})();return pending;
 };
}
