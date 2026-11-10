import type {Pool,PoolClient} from 'pg';
import {SystemObservationSchema,type SystemObservation} from '@virtual-city/contracts';
type Source<T>={status:'OBSERVED';sampledAt:number;value:T}|{status:'UNKNOWN';sampledAt:null;value:null};
type Lease={client:PoolClient;release:(destroy?:boolean)=>void};
// One in-flight checkout/read per source. Timeout never frees the checkout latch
// until the original checkout settles; its late client is destroyed, not reused.
export class BoundedObservationRead<T>{
 private pending?:Promise<Source<T>>;private checkoutPending=false;private closed=false;private held?:Lease;
 constructor(private pool:Pick<Pool,'connect'>,private work:(client:Pick<PoolClient,'query'>)=>Promise<T>,private now=Date.now){}
 private checkout():Promise<Lease>{
  if(this.closed||this.checkoutPending)return Promise.reject(Error('Observation unavailable'));this.checkoutPending=true;
  return new Promise((resolve,reject)=>{let expired=false;const timer=setTimeout(()=>{expired=true;reject(Error('Observation checkout deadline'));},1000);
   Promise.resolve().then(()=>this.pool.connect()).then(client=>{clearTimeout(timer);this.checkoutPending=false;if(expired||this.closed){client.release(true);reject(Error('Observation checkout expired'));return;}let released=false;const lease={client,release:(destroy=false)=>{if(!released){released=true;client.release(destroy);}}};resolve(lease);},error=>{clearTimeout(timer);this.checkoutPending=false;reject(error);});
  });
 }
 private async run():Promise<Source<T>>{
  let lease:Lease|undefined,reusable=false,timer:ReturnType<typeof setTimeout>|undefined;
  try{lease=await this.checkout();this.held=lease;const client=lease.client;
   const read=async()=>{await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='500ms'");await client.query("SET LOCAL lock_timeout='200ms'");const value=await this.work(client);await client.query('COMMIT');return value;};
   const value=await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Observation read deadline')),1000);})]);if(this.closed)throw Error('Observation closed');reusable=true;return {status:'OBSERVED',sampledAt:this.now(),value};
  }catch{return {status:'UNKNOWN',sampledAt:null,value:null};}finally{clearTimeout(timer);lease?.release(!reusable);if(this.held===lease)this.held=undefined;}
 }
 read(){if(this.closed)return Promise.resolve<Source<T>>({status:'UNKNOWN',sampledAt:null,value:null});return this.pending??=this.run().finally(()=>{this.pending=undefined;});}
 close(){this.closed=true;this.held?.release(true);}
}
type Metadata=Pick<SystemObservation,'authority'|'versions'>;
type Backlog=Extract<SystemObservation['backlog'],{status:'OBSERVED'}>['value'];
export class SystemObservations{
 private database:BoundedObservationRead<{responding:true}>;private backlog:BoundedObservationRead<Backlog|null>;
 constructor(private pool:Pick<Pool,'connect'>&Partial<Pick<Pool,'totalCount'|'idleCount'|'waitingCount'>>,backlog:(db:Pick<PoolClient,'query'>)=>Promise<Backlog|null>,private metadata:()=>Metadata,private now=Date.now){
  this.database=new BoundedObservationRead(pool,async db=>{await db.query('SELECT 1');return {responding:true};},now);this.backlog=new BoundedObservationRead(pool,backlog,now);
 }
 async read(){const [database,source]=await Promise.all([this.database.read(),this.backlog.read()]),sampledAt=this.now();const backlog=source.status==='OBSERVED'&&source.value===null?{status:'NOT_CONFIGURED',sampledAt:null,value:null}:source;
  const {totalCount:total,idleCount:idle,waitingCount:waiting}=this.pool;const pool=[total,idle,waiting].every(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)?{status:'OBSERVED',sampledAt,total,idle,waiting}:{status:'UNKNOWN',sampledAt:null,total:null,idle:null,waiting:null};
  return SystemObservationSchema.parse({schemaVersion:1,source:'platform-api',scope:'LOCAL_API_PROCESS',sampledAt,database,pool,backlog,workerLiveness:'UNKNOWN',...this.metadata(),platformQueue:'NOT_IMPLEMENTED'});
 }
 close(){this.database.close();this.backlog.close();}
}
