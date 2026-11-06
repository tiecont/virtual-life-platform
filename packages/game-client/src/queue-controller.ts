import {MeSchema,AdmissionQueueViewSchema,AdmissionQueueReceiptSchema,type Me,type AdmissionQueueView,type AdmissionQueueCommand} from '@virtual-city/contracts';
import type {ClientPlatform} from '@virtual-city/client-sdk';

export interface QueuePresentation {
 phase:'checking'|'connected'|'offline'|'signed-out'|'unavailable'|'stale';
 snapshot:AdmissionQueueView|null;busy:boolean;uncertain:boolean;remainingSeconds:number|null;message:string;
}
class QueueFailure extends Error {constructor(readonly status:number){super('Queue request unavailable');}}
/** Presentation only: no sockets, persistence, ETA inference, automatic claim or allocation. */
export class QueueController {
 state:QueuePresentation={phase:'checking',snapshot:null,busy:false,uncertain:false,remainingSeconds:null,message:'Checking your place…'};
 private me:Me|null=null;
 private alive=false;private foreground=true;private generation=0;
 private request:AbortController|null=null;
 private poll:ReturnType<typeof setTimeout>|undefined;private clock:ReturnType<typeof setTimeout>|undefined;
 private deadline:number|null=null;private lastRead=-Infinity;private retryAt=0;private failures=0;
 private pending:AdmissionQueueCommand|null=null;
 private unwatch:(()=>void)|undefined;private unlife:(()=>void)|undefined;
 constructor(private platform:ClientPlatform,private changed:(state:QueuePresentation)=>void,private now=()=>performance.now(),private random=Math.random){}
 private publish(change:Partial<QueuePresentation>){this.state={...this.state,...change};if(this.alive)this.changed(this.state);}
 private clearTimers(){clearTimeout(this.poll);clearTimeout(this.clock);}
 private invalidate(){this.generation++;this.request?.abort();this.request=null;this.clearTimers();}
 start(){if(this.alive)return;this.alive=true;this.unwatch=this.platform.watchIdentity(()=>this.identityChanged());this.unlife=this.platform.lifecycle?.subscribe(active=>this.setForeground(active));void this.refresh();}
 stop(){this.alive=false;this.invalidate();this.unwatch?.();this.unlife?.();this.me=null;this.pending=null;}
 private identityChanged(){this.invalidate();this.me=null;this.pending=null;this.deadline=null;this.lastRead=-Infinity;this.publish({phase:'checking',snapshot:null,busy:false,uncertain:false,remainingSeconds:null,message:'Checking your session…'});void this.refresh();}
 setForeground(active:boolean){if(active===this.foreground)return;this.foreground=active;this.invalidate();if(this.state.busy&&this.pending)this.publish({busy:false,uncertain:true,message:'Check your place, then retry the same action if needed.'});if(active&&this.alive){this.publish({phase:'stale',message:'Checking your place after returning…'});this.schedule(500+this.random()*1000);}else if(this.alive)this.publish({phase:'stale',message:'Updates paused while this screen is in the background.'});}
 private schedule(delay:number){clearTimeout(this.poll);if(this.alive&&this.foreground)this.poll=setTimeout(()=>{void this.refresh();},Math.max(delay,this.retryAt-this.now(),0));}
 private countdown(){clearTimeout(this.clock);if(this.deadline===null||!this.alive||!this.foreground)return;const remainingSeconds=Math.max(0,Math.ceil((this.deadline-this.now())/1000));this.publish({remainingSeconds});if(remainingSeconds>0)this.clock=setTimeout(()=>this.countdown(),1000);}
 private accept(snapshot:AdmissionQueueView){if(snapshot.viewerAccountId!==this.me?.profile.id)throw new QueueFailure(401);this.failures=0;this.deadline=snapshot.own?.expiresAt?this.now()+Math.max(0,Date.parse(snapshot.own.expiresAt)-Date.parse(snapshot.observedAt)):null;this.publish({phase:'connected',snapshot,busy:false,uncertain:!!this.pending,message:snapshot.own?'Your place is up to date.':'No active place. An earlier place may have expired or been cancelled on another screen.',remainingSeconds:null});this.countdown();}
 private async fetch(path:string,init:RequestInit={}){
  const abort=new AbortController();this.request=abort;let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([this.platform.request(path,{...init,signal:abort.signal,cache:'no-store'}),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{abort.abort();reject(new QueueFailure(0));},8000);})]);}
  finally{clearTimeout(timeout);if(this.request===abort)this.request=null;}
 }
 private async read(generation:number){if(!this.me){const response=await this.fetch('/v1/me');if(!response.ok)throw new QueueFailure(response.status);const me=MeSchema.parse(await response.json());if(generation!==this.generation)throw new QueueFailure(0);this.me=me;}const response=await this.fetch('/v1/admission');if(!response.ok)throw new QueueFailure(response.status);return AdmissionQueueViewSchema.parse(await response.json());}
 private failed(error:unknown,mutation=false){const status=error instanceof QueueFailure?error.status:0;
  if(status===401||status===403){this.me=null;this.pending=null;this.deadline=null;this.publish({phase:'signed-out',snapshot:null,busy:false,uncertain:false,remainingSeconds:null,message:'Your session changed. Open identity, then check your place again.'});return;}
  if(status===404){this.pending=null;this.publish({phase:'unavailable',snapshot:null,busy:false,uncertain:false,message:'This server is not offering a waiting list. Try again later.'});return;}
  if(mutation&&status>=400&&status<500)this.pending=null;
  this.failures++;const backoff=status===429?60000:Math.min(60000,4000*2**Math.min(this.failures,4)*(.8+this.random()*.4));this.retryAt=this.now()+backoff;
  this.publish({phase:'offline',busy:false,uncertain:!!this.pending,message:this.pending?'The result is not confirmed. Retry the same action after checking your connection.':status===409?'Your place changed on another screen. Checking the latest state…':'Connection unavailable. Your last place is unconfirmed; checking again shortly.'});this.schedule(backoff);
 }
 async refresh(){if(!this.alive||!this.foreground||this.state.busy)return;if(this.now()<Math.max(this.lastRead+2500,this.retryAt)){this.schedule(Math.max(this.lastRead+2500,this.retryAt)-this.now());return;}
  this.invalidate();const generation=this.generation;this.lastRead=this.now();
  try{const snapshot=await this.read(generation);if(generation!==this.generation||!this.alive||!this.foreground)return;this.accept(snapshot);this.schedule(4000*(.8+this.random()*.4));}
  catch(error){if(generation===this.generation&&this.alive&&this.foreground)this.failed(error);}
 }
 private async send(input:AdmissionQueueCommand){if(!this.alive||!this.foreground||!this.me||this.state.busy||this.now()<this.retryAt)return;this.invalidate();const generation=this.generation;this.pending=input;this.publish({busy:true,uncertain:false,message:'Confirming your action…'});
  try{const response=await this.fetch('/v1/admission',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':this.me.csrfToken},body:JSON.stringify(input)});if(!response.ok)throw new QueueFailure(response.status);const {requestId,...snapshot}=AdmissionQueueReceiptSchema.parse(await response.json());if(requestId!==input.requestId)throw new QueueFailure(0);if(generation!==this.generation||!this.alive||!this.foreground)return;if(snapshot.viewerAccountId!==this.me?.profile.id)throw new QueueFailure(401);this.pending=null;this.accept(snapshot);this.lastRead=this.now();this.schedule(4000*(.8+this.random()*.4));}
  catch(error){if(generation===this.generation&&this.alive&&this.foreground)this.failed(error,true);}
 }
 async act(action:'enqueue'|'claim'|'leave'|'reconnect'){
  if(this.pending||this.state.phase!=='connected'||!this.state.snapshot)return;const own=this.state.snapshot.own;
  if(action==='enqueue'){if(own||['CLOSED','PAUSED'].includes(this.state.snapshot.availability))return;await this.send({schemaVersion:1,requestId:crypto.randomUUID(),action});return;}
  if(!own)return;
  if(action==='claim'&&(own.state!=='RESERVED'||!this.state.remainingSeconds))return;
  if(action==='reconnect'&&(own.state!=='RECONNECT_GRACE'||!this.state.remainingSeconds))return;
  const common={schemaVersion:1 as const,requestId:crypto.randomUUID(),expectedVersion:own.version};
  await this.send(action==='claim'?{...common,action,offerId:own.id}:{...common,action,id:own.id});
 }
 async retry(){if(this.now()<this.retryAt){this.publish({message:'Please wait for the automatic connection check before retrying.'});return;}if(this.pending)await this.send(this.pending);else await this.refresh();}
}
