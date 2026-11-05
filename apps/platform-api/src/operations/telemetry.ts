import { createHmac,randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ROOT_CONTEXT,SpanKind,SpanStatusCode,type Span } from '@opentelemetry/api';
import { TracerProvider,SimpleSpanProcessor,type ReadableSpan,type SpanExporter } from '@opentelemetry/sdk-trace';
import { ROOM_COMMANDS,type RoomMetrics,type RoomCommandName } from '../rooms/metrics';
const BOUNDS=[1,5,10,25,50,100,250,500,1000,2500,5000,Infinity];
const GROUPS=['identity','social','world','travel','hospitality','focus','events','progression','safety','health','unknown'] as const;
type Group=typeof GROUPS[number];
type Series={group:Group;method:string;count:number;errors:number;buckets:number[];totalMs:number};
type Trace={traceId:string;spanId:string;kind:'http'|'room-command';operation:string;requestId?:string;method?:string;statusCode?:number;outcome?:string;roomKey?:string;startedAt:number;durationMs:number};
type Online={rooms:number;memberships:number;connections:number;occupiedSeats:number;graceMemberships:number};
type Orders={observedAt:number;phases:Record<string,number>};
const OUTCOMES=new Set(['OK','INVALID_REQUEST','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','RATE_LIMITED','INTERNAL_ERROR','WORLD_UNAVAILABLE','WORLD_VERSION_MISMATCH','ROOM_FULL','ALREADY_IN_ROOM','NOT_IN_ROOM','IDEMPOTENCY_CONFLICT','SEAT_TAKEN','ALREADY_SEATED']);
function group(pattern:string):Group{
 if(pattern.startsWith('/health/'))return 'health';
 if(/^\/v1\/(session|me)(?:\/|$)/.test(pattern))return 'identity';
 if(/^\/v1\/(friends|blocks|social)(?:\/|$)/.test(pattern))return 'social';
 if(/^\/v1\/(worlds|discovery)(?:\/|$)/.test(pattern))return 'world';
 if(/^\/v1\/(travel-intents|invitations|invitation-groups)(?:\/|$)/.test(pattern))return 'travel';
 if(/^\/v1\/(orders|staff)(?:\/|$)/.test(pattern))return 'hospitality';
 if(/^\/v1\/(focus|study)(?:\/|$)/.test(pattern))return 'focus';
 if(/^\/v1\/(events|reservations|event-invitations|stage|audience|media)(?:\/|$)/.test(pattern))return 'events';
 if(/^\/v1\/(progression|cosmetics)(?:\/|$)/.test(pattern))return 'progression';
 if(/^\/v1\/(reports|moderation)(?:\/|$)/.test(pattern))return 'safety';return 'unknown';
}
function percentile(buckets:readonly{upperMs:number|null;count:number}[]){const total=buckets.reduce((n,b)=>n+b.count,0);if(!total)return null;let seen=0;for(const bucket of buckets){seen+=bucket.count;if(seen>=Math.ceil(total*.95))return bucket.upperMs;}return null;}
export class OperationalTelemetry{
 private provider?:TracerProvider;private closed=false;private active=0;private dropped=0;
 private records:{until:number;trace:Trace}[]=[];private series=new Map<string,Series>();private roomSecret=randomBytes(32);private lastElapsed:number;readonly startedAt:number;
 constructor(readonly enabled:boolean,private now=Date.now,private log:(trace:Readonly<Trace>)=>void=()=>{},private elapsed=()=>performance.now()){
  this.startedAt=now();this.lastElapsed=elapsed();if(!enabled)return;
  const exporter:SpanExporter={export:(spans,done)=>{for(const span of spans)this.record(span);done({code:0});},shutdown:async()=>{this.records=[];}};
  this.provider=new TracerProvider({spanLimits:{attributeCountLimit:12,attributeValueLengthLimit:64,eventCountLimit:0,linkCountLimit:0},spanProcessors:[new SimpleSpanProcessor({exporter})]});
 }
 private record(span:ReadableSpan){
  if(this.closed||!span.ended)return;const a=span.attributes,kind=a.kind==='room-command'?'room-command':'http',operation=String(a.operation??'unknown');
  if(kind==='http'?!GROUPS.includes(operation as Group):!ROOM_COMMANDS.includes(operation as RoomCommandName))return;
  const context=span.spanContext(),trace:Trace={traceId:context.traceId,spanId:context.spanId,kind,operation,startedAt:Number(a.startedAt),durationMs:span.duration[0]*1000+span.duration[1]/1000000};
  if(typeof a.requestId==='string'&&/^[a-f0-9-]{36}$/.test(a.requestId))trace.requestId=a.requestId;
  if(typeof a.method==='string'&&['GET','POST','PUT','PATCH','DELETE','HEAD','OTHER'].includes(a.method))trace.method=a.method;
  if(typeof a.statusCode==='number')trace.statusCode=a.statusCode;
  if(typeof a.outcome==='string'&&OUTCOMES.has(a.outcome))trace.outcome=a.outcome;
  if(typeof a.roomKey==='string'&&/^[a-f0-9]{32}$/.test(a.roomKey))trace.roomKey=a.roomKey;
  this.prune();this.records.push({until:this.elapsed()+300000,trace});if(this.records.length>100)this.records.shift();
  try{this.log({...trace});}catch{ /* Telemetry cannot change product effects. */ }
 }
 private prune(){const at=this.elapsed();this.records=at<this.lastElapsed?[]:this.records.filter(record=>record.until>at);this.lastElapsed=at;}
 private span(kind:'http'|'room-command',operation:string,attributes:Record<string,string|number>={}){
  if(this.closed||!this.provider)return; if(this.active>=128){this.dropped++;return;}
  this.active++;try{return this.provider.getTracer('virtual-life-platform.operations','1.0.0').startSpan(kind,{kind:SpanKind.SERVER,attributes:{kind,operation,startedAt:this.now(),...attributes}},ROOT_CONTEXT);}catch{this.active--;this.dropped++;return;}
 }
 private end(span:Span|undefined,error:boolean){if(!span)return;try{span.setStatus({code:error?SpanStatusCode.ERROR:SpanStatusCode.UNSET});span.end();}catch{this.dropped++;}finally{this.active--;}}
 beginHttp(requestId:string,pattern:string,url:string,rawMethod:string){
  if(!this.enabled||this.closed||/^\/v1\/dating(?:\/|\?|$)/.test(url)||pattern.startsWith('/v1/dating')||pattern.startsWith('/internal/')||url.startsWith('/internal/'))return ()=>{};
  const method=['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(rawMethod)?rawMethod:'OTHER',name=group(pattern),started=performance.now(),span=this.span('http',name,{requestId,method});let done=false;
  return (statusCode:number)=>{if(done)return;done=true;const ms=Math.max(0,performance.now()-started),key=method+':'+name;let item=this.series.get(key);if(!item){item={group:name,method,count:0,errors:0,buckets:BOUNDS.map(()=>0),totalMs:0};this.series.set(key,item);}item.count++;item.errors+=statusCode>=400?1:0;item.totalMs+=ms;item.buckets[BOUNDS.findIndex(bound=>ms<=bound)]++;span?.setAttribute('statusCode',statusCode);this.end(span,statusCode>=400);};
 }
 beginRoom(command:RoomCommandName){
  const span=this.span('room-command',command);let done=false;
  return (code:string,roomId?:string)=>{if(done)return;done=true;span?.setAttribute('outcome',OUTCOMES.has(code)?code:'INTERNAL_ERROR');if(roomId&&/^[a-f0-9-]{36}$/.test(roomId))span?.setAttribute('roomKey',createHmac('sha256',this.roomSecret).update('room.v1:'+roomId).digest('hex').slice(0,32));this.end(span,code!=='OK');};
 }
 async snapshot(online:Online,roomMetrics:ReturnType<RoomMetrics['snapshot']>,orders:Orders){
  await this.provider?.forceFlush({timeoutMillis:500});this.prune();
  const series=[...this.series.values()].map(item=>{const buckets=item.buckets.map((count,i)=>({upperMs:Number.isFinite(BOUNDS[i])?BOUNDS[i]:null,count}));return {...item,buckets,p95UpperBoundMs:percentile(buckets)};}),requests=series.reduce((n,item)=>n+item.count,0),errors=series.reduce((n,item)=>n+item.errors,0);
  return {schemaVersion:1,serverTime:this.now(),startedAt:this.startedAt,scope:'process-local;dating excluded;gauges are separate observations',http:{requests,errors,errorRate:requests?errors/requests:0,activeTraces:this.active,droppedTraces:this.dropped,series},rooms:{...roomMetrics,commands:Object.fromEntries(Object.entries(roomMetrics.commands).map(([name,value])=>[name,{...value,p95UpperBoundMs:percentile(value.buckets),errorRate:value.count?(value.count-(value.errors.OK??0))/value.count:0}]))},gauges:{online:{rooms:online.rooms,memberships:Math.max(0,online.memberships-online.graceMemberships),retainedMemberships:online.memberships,connections:online.connections,occupiedSeats:online.occupiedSeats,graceMemberships:online.graceMemberships},orders},traces:this.records.map(record=>({...record.trace}))};
 }
 async close(){this.closed=true;await this.provider?.shutdown();this.records=[];}
}
export function prometheus(snapshot:Awaited<ReturnType<OperationalTelemetry['snapshot']>>){
 const lines=['# TYPE virtual_life_http_requests_total counter','# TYPE virtual_life_http_errors_total counter','# TYPE virtual_life_http_duration_ms histogram','# TYPE virtual_life_trace_dropped_total counter','virtual_life_trace_dropped_total '+snapshot.http.droppedTraces,'# TYPE virtual_life_online_memberships gauge','virtual_life_online_memberships '+snapshot.gauges.online.memberships,'# TYPE virtual_life_orders gauge'];
 for(const item of snapshot.http.series){const labels='route_group="'+item.group+'",method="'+item.method+'"';lines.push('virtual_life_http_requests_total{'+labels+'} '+item.count,'virtual_life_http_errors_total{'+labels+'} '+item.errors);let cumulative=0;for(const bucket of item.buckets){cumulative+=bucket.count;lines.push('virtual_life_http_duration_ms_bucket{'+labels+',le="'+(bucket.upperMs===null?'+Inf':bucket.upperMs)+'"} '+cumulative);}lines.push('virtual_life_http_duration_ms_sum{'+labels+'} '+item.totalMs,'virtual_life_http_duration_ms_count{'+labels+'} '+item.count);}
 for(const [phase,count]of Object.entries(snapshot.gauges.orders.phases))lines.push('virtual_life_orders{phase="'+phase+'"} '+count);
 for(const [command,item]of Object.entries(snapshot.rooms.commands)){lines.push('virtual_life_room_commands_total{command="'+command+'"} '+item.count);if(item.p95UpperBoundMs!==null)lines.push('virtual_life_room_command_p95_upper_bound_ms{command="'+command+'"} '+item.p95UpperBoundMs);}
 lines.push('# TYPE virtual_life_room_phase_duration_ms histogram');
 for(const series of snapshot.rooms.phases)for(const [phase,item]of Object.entries(series.timings)){
  const labels='command="'+series.command+'",outcome="'+series.outcome+'",phase="'+phase+'"';let cumulative=0;
  for(const bucket of item.buckets){cumulative+=bucket.count;lines.push('virtual_life_room_phase_duration_ms_bucket{'+labels+',le="'+(bucket.upperMs===null?'+Inf':bucket.upperMs)+'"} '+cumulative);}
  lines.push('virtual_life_room_phase_duration_ms_sum{'+labels+'} '+item.totalMs,'virtual_life_room_phase_duration_ms_count{'+labels+'} '+item.count);
 }
 if(snapshot.rooms.eventLoop.p95Ms!==null)lines.push('virtual_life_event_loop_delay_p95_ms '+snapshot.rooms.eventLoop.p95Ms);
 return lines.join('\n')+'\n';
}
