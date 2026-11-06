import {z} from 'zod';
import {createObservationReader} from './observations';
import {OperatorLoginSchema,OperatorRecoverySchema,OperatorSessionSchema,OperatorAccountQuerySchema,OperatorAccountCommandSchema,OperatorAccountViewSchema,OperatorAccountResultSchema,OperatorAccountAuditSchema,OperatorPrivacyRequestsSchema,OperatorPrivacyReviewSchema,PrivacyRequestViewSchema} from '@virtual-city/contracts';
import {OperatorEventRangeSchema,OperatorEventQuerySchema,OperatorEventCalendarSchema,OperatorEventCommandSchema,OperatorEventReceiptSchema,OperatorEventAuditSchema} from '@virtual-city/contracts';
import {RuntimeControlViewSchema,RuntimeControlCommandSchema,RuntimeControlResultSchema,RuntimeControlAuditSchema} from '@virtual-city/contracts';
import {adminConfig,type AdminConfig as Config} from './runtime-config.mjs';
export {adminConfig};
type Fetch=(input:string,init?:RequestInit)=>Promise<Response>;
export type MetricView={status:'FRESH'|'STALE'|'UNKNOWN';source:'platform-api';sampledAt:number|null;values:{requests:number|null;errors:number|null;connections:number|null;memberships:number|null;eventLoopP95Ms:number|null}};

const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const telemetry=z.object({schemaVersion:z.literal(1),serverTime:z.number().finite(),http:z.object({requests:count,errors:count}),gauges:z.object({online:z.object({connections:count,memberships:count})}),rooms:z.object({eventLoop:z.object({p95Ms:z.number().min(0).nullable()})})});
const recovery=z.strictObject({subject:z.uuid(),recoveryCodes:z.array(z.string().regex(/^[a-f0-9]{64}$/)).length(10)});
const audit=z.object({events:z.array(z.strictObject({sequence:z.string().regex(/^[0-9]+$/),action:z.enum(['bootstrap','login','step-up','logout','revoke-all','recover']),outcome:z.enum(['accepted','denied','rate-limited']),occurred_at:z.iso.datetime(),before_version:count,after_version:count,previous_hash:z.string().regex(/^[a-f0-9]{64}$/),event_hash:z.string().regex(/^[a-f0-9]{64}$/)})).max(100)});
const empty=z.strictObject({}),revoked=z.strictObject({revoked:z.literal(true)});
const headers={'cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff'};
const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{...headers,...extra}});
function error(status:number){const code=status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':status===429?'RATE_LIMITED':status===400?'INVALID_REQUEST':'UNAVAILABLE';return json({error:{code,message:status===401?'Sign in to continue':status===403?'Verification required or request denied':status===429?'Please wait before trying again':status===400?'Invalid request':'Operator service unavailable'}},status,status===429?{'retry-after':'60'}:{});}
async function authError(response:Response){try{await response.body?.cancel();}catch{ /* An aborted denial still exposes no upstream body. */ }return error([401,403,429].includes(response.status)?response.status:503);}
async function boundedBody(message:Request|Response,maximum:number){
 if(Number(message.headers.get('content-length'))>maximum)throw Error('Body too large');const reader=message.body?.getReader();if(!reader)return '{}';const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>maximum){await reader.cancel();throw Error('Body too large');}chunks.push(part.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function createAdminHandler(config:Config|undefined,fetcher:Fetch=fetch,now=Date.now){
 const observation=config?createObservationReader(config,fetcher,now):undefined;
 let cached:MetricView|undefined,nextFetch=0,pending:Promise<MetricView>|undefined,failed=false;
 const unknown=():MetricView=>({status:'UNKNOWN',source:'platform-api',sampledAt:null,values:{requests:null,errors:null,connections:null,memberships:null,eventLoopP95Ms:null}});
 async function metric():Promise<MetricView>{
  const at=now();const snapshot=()=>{const clock=now();return cached&&cached.sampledAt!==null&&clock-cached.sampledAt>=-5000&&clock-cached.sampledAt<=30000?{...cached,status:!failed&&clock-cached.sampledAt<=10000?'FRESH' as const:'STALE' as const}:unknown();};
  if(!config?.metricsToken)return unknown();if(pending)return pending;if(at<nextFetch)return snapshot();nextFetch=at+5000;
  pending=(async()=>{try{const response=await fetcher(config.api+'/internal/telemetry',{headers:{accept:'application/json',authorization:'Bearer '+config.metricsToken},cache:'no-store',redirect:'error',signal:globalThis.AbortSignal.timeout(2500)});if(!response.ok){await response.body?.cancel();throw Error();}const data=telemetry.parse(JSON.parse(await boundedBody(response,131072)));if(data.serverTime>now()+5000||now()-data.serverTime>30000)throw Error();failed=false;cached={status:'FRESH',source:'platform-api',sampledAt:data.serverTime,values:{requests:data.http.requests,errors:data.http.errors,connections:data.gauges.online.connections,memberships:data.gauges.online.memberships,eventLoopP95Ms:data.rooms.eventLoop.p95Ms}};return snapshot();}catch{failed=true;return snapshot();}finally{pending=undefined;}})();return pending;
 }
 return async(request:Request):Promise<Response>=>{
  if(!config)return error(503);const url=new URL(request.url),action=url.pathname.slice('/api/admin/'.length),accountRead=['account','account-audit','privacy-requests'].includes(action),get=['observations','session','audit','metrics','account','account-audit','privacy-requests','event-calendar','event-audit','runtime-state','runtime-audit'].includes(action),post=['login','step-up','logout','revoke-all','recover','account-command','privacy-review','event-command','runtime-command'].includes(action);
  if(!url.pathname.startsWith('/api/admin/')||!get&&!post)return error(400);
  if(request.method!==(get?'GET':'POST'))return json({error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed'}},405);
  let accountQuery='';
  if(action==='metrics'||action==='observations'){if(url.searchParams.size!==2||url.searchParams.get('view')!==(action==='metrics'?'summary':'system')||url.searchParams.get('range')!=='current')return error(400);}
  else if(['event-calendar','event-audit'].includes(action)){try{if(url.searchParams.size!==new Set(url.searchParams.keys()).size||!(action==='event-calendar'?[2,3]:[1]).includes(url.searchParams.size))throw Error();const query=(action==='event-calendar'?OperatorEventRangeSchema:OperatorEventQuerySchema).parse(Object.fromEntries(url.searchParams));accountQuery='?'+new URLSearchParams(Object.entries(query).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)])).toString();}catch{return error(400);}}
  else if(accountRead){try{if(url.searchParams.size!==1)throw Error();const parsed=OperatorAccountQuerySchema.parse(Object.fromEntries(url.searchParams));accountQuery='?accountId='+encodeURIComponent(parsed.accountId);}catch{return error(400);}}
  else if(url.search)return error(400);
  if(post&&request.headers.get('origin')!==config.origin)return error(403);
  const name=config.production?'__Host-city_operator':'city_operator',pairs=(request.headers.get('cookie')??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));
  const value=pairs.length===1?pairs[0].slice(name.length+1):undefined,cookie=value&&/^[a-f0-9]{64}$/.test(value)?name+'='+value:undefined;
  if(!['login','recover'].includes(action)&&!cookie)return error(401);
  const csrf=request.headers.get('x-csrf-token');if(['step-up','logout','revoke-all','account-command','privacy-review','event-command','runtime-command'].includes(action)&&!(/^[a-f0-9]{64}$/.test(csrf??'')))return error(403);
  let body:unknown;
  if(post){try{const input=JSON.parse(await boundedBody(request,8192));body=(action==='login'||action==='step-up'?OperatorLoginSchema:action==='recover'?OperatorRecoverySchema:action==='account-command'?OperatorAccountCommandSchema:action==='privacy-review'?OperatorPrivacyReviewSchema:action==='event-command'?OperatorEventCommandSchema:action==='runtime-command'?RuntimeControlCommandSchema:empty).parse(input);}catch{return error(400);}}
  async function auth(path:string,method='GET'){
   return fetcher(config!.api+'/v1/operator/'+path,{method,headers:{accept:'application/json',...cookie?{cookie}:{},...method==='POST'?{origin:config!.origin,'content-type':'application/json',...csrf?{'x-csrf-token':csrf}:{}}:{}},...method==='POST'?{body:JSON.stringify(body)}:{},cache:'no-store',redirect:'error',signal:globalThis.AbortSignal.timeout(2500)});
  }
  try{
   if(action==='metrics'||action==='observations'){
    const response=await auth('session');if(!response.ok)return authError(response);OperatorSessionSchema.parse(JSON.parse(await boundedBody(response,8192)));const view=action==='observations'?await observation!():await metric();
    const current=await auth('session');if(!current.ok)return authError(current);OperatorSessionSchema.parse(JSON.parse(await boundedBody(current,8192)));return json(view);
   }
   const response=await auth(action+accountQuery,request.method);if(!response.ok){if(['account','account-command','privacy-review','event-command','runtime-command'].includes(action)&&[404,409].includes(response.status)){await response.body?.cancel();return json({error:{code:response.status===409?'IDEMPOTENCY_CONFLICT':'NOT_FOUND',message:response.status===409?'Account changed. Refresh before another command.':'Account unavailable'}},response.status);}return authError(response);}
   const parsed=JSON.parse(await boundedBody(response,['event-calendar','event-audit','runtime-audit'].includes(action)?131072:['audit','account-audit','privacy-requests'].includes(action)?65536:8192)),schema=['login','step-up','session'].includes(action)?OperatorSessionSchema:action==='recover'?recovery:action==='audit'?audit:action==='account'?OperatorAccountViewSchema:action==='account-audit'?OperatorAccountAuditSchema:action==='account-command'?OperatorAccountResultSchema:action==='privacy-requests'?OperatorPrivacyRequestsSchema:action==='privacy-review'?PrivacyRequestViewSchema:action==='event-calendar'?OperatorEventCalendarSchema:action==='event-audit'?OperatorEventAuditSchema:action==='event-command'?OperatorEventReceiptSchema:action==='runtime-state'?RuntimeControlViewSchema:action==='runtime-audit'?RuntimeControlAuditSchema:action==='runtime-command'?RuntimeControlResultSchema:revoked,output=schema.parse(parsed);
   const cookies=response.headers.getSetCookie(),set=cookies[0];let outgoing:Record<string,string>={};
   if(['login','step-up','logout','revoke-all'].includes(action)){
    const attributes=set?.split(';').slice(1).map(value=>value.trim().split('=')[0].toLowerCase())??[];if(new Set(attributes).size!==attributes.length)throw Error('Duplicate cookie attributes');
    if(cookies.length!==1||!set||!set.startsWith(name+'=')||/\bdomain=/i.test(set)||!/(?:^|;)\s*Path=\/(?:;|$)/i.test(set)||!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(set)||!/(?:^|;)\s*SameSite=Strict(?:;|$)/i.test(set)||config.production&&!/(?:^|;)\s*Secure(?:;|$)/i.test(set))throw Error('Invalid upstream cookie');
    const cookieValue=set.split(';')[0].slice(name.length+1);if(!(['logout','revoke-all'].includes(action)?cookieValue==='':/^[a-f0-9]{64}$/.test(cookieValue)))throw Error('Invalid upstream cookie');outgoing={'set-cookie':set};
   }
   return json(output,200,outgoing);
  }catch{return error(503);}
 };
}
