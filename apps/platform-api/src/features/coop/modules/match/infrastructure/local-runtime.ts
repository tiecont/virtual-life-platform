import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startNativeTlsBridge} from '../../../../pets/modules/wave-a-arena8/infrastructure/native-tls-bridge';
import type {
 CoopRuntimeHandle,CoopRuntimePort,CoopRuntimeRequest,CoopSeat,
} from '../application/provisioner';

const LABEL=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LISTEN_TIMEOUT_MS=15000,READY_TIMEOUT_MS=10000,STOP_TIMEOUT_MS=3000;

export type LocalNativeCoopRuntimeOptions=Readonly<{
 binary:string;databaseUrl:string;role:string;caFile:string;
 publicKey:string;keyId:string;origin:string;
 storageKey:string;storageKeyId:string;certFile:string;keyFile:string;
}>;

function delay(ms:number){return new Promise<void>(resolve=>{setTimeout(resolve,ms);});}
async function waitForListen(child:ReturnType<typeof spawn>,timeoutMs:number){
 return await new Promise<number>((resolve,reject)=>{
  let output='',settled=false;
  const finish=(work:()=>void)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);work();
  };
  const timer=setTimeout(()=>finish(()=>reject(new Error('Cooperative native runtime startup timed out'))),timeoutMs);
  child.stdout?.on('data',chunk=>{
   if(settled)return;
   output=(output+String(chunk)).slice(-8192);
   const match=/LISTEN (\d+)/.exec(output);
   if(match)finish(()=>resolve(Number(match[1])));
  });
  child.once('error',()=>finish(()=>reject(new Error('Cooperative native runtime failed to start'))));
  child.once('exit',()=>finish(()=>reject(new Error('Cooperative native runtime exited before listening'))));
 });
}
async function waitForReady(port:number,timeoutMs:number){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  try{
   const response=await fetch('http://127.0.0.1:'+port+'/health/ready',{signal:AbortSignal.timeout(1000)});
   if(response.ok)return;
  }catch{/* The runtime may still be opening its bounded PostgreSQL pool. */}
  await delay(100);
 }
 throw new Error('Cooperative native runtime readiness timed out');
}
function nativeSeats(seats:readonly CoopSeat[]){
 return seats.map(seat=>({account:seat.account,petId:seat.petId,level:seat.petLevel,artifactPowerPm:seat.artifactPowerPm,ownedPetInstanceId:seat.ownedPetInstanceId}));
}

// Local-only process adapter for the configuration-bound cooperative ruleset.
// It writes the published bundle and the four-seat allocation to private files,
// starts the existing runtime binary and terminates the exact HTTPS origin. It
// creates no second ticket authority, transport or balance source.
export class LocalNativeCoopRuntime implements CoopRuntimePort{
 constructor(private readonly options:LocalNativeCoopRuntimeOptions){
  if(!LABEL.test(options.role))throw new Error('Cooperative native database role is invalid');
  if(!LABEL.test(options.keyId)||!LABEL.test(options.storageKeyId))throw new Error('Cooperative native key labels are invalid');
  if(!/^[A-Za-z0-9_-]{43}$/.test(options.publicKey))throw new Error('Cooperative native ticket key is invalid');
  if(!/^https:\/\/[^/]+$/.test(options.origin))throw new Error('Cooperative native origin is invalid');
  if(!/^[a-f0-9]{64}$/.test(options.storageKey))throw new Error('Cooperative native storage key is invalid');
  let database:URL;
  try{database=new URL(options.databaseUrl);}catch{throw new Error('Cooperative native database URL is invalid');}
  if(!['postgres:','postgresql:'].includes(database.protocol)||!database.username||!database.password||
    !['127.0.0.1','localhost','[::1]'].includes(database.hostname)||database.search||database.hash)
   throw new Error('Cooperative native database URL is invalid');
 }
 async start(request:CoopRuntimeRequest):Promise<CoopRuntimeHandle>{
  if(request.seats.length!==4)throw new Error('Cooperative native allocation requires four seats');
  if(!request.seats.every(seat=>UUID.test(seat.account)&&seat.petLevel>=1&&seat.petLevel<=60))
   throw new Error('Cooperative native allocation is invalid');
  await access(this.options.binary,constants.X_OK).catch(()=>{throw new Error('Cooperative native runtime binary unavailable');});
  await access(this.options.caFile,constants.R_OK).catch(()=>{throw new Error('Cooperative native runtime CA unavailable');});
  const engineHash=createHash('sha256').update(await readFile(this.options.binary)).digest('hex');
  const hexBytes=(value:string)=>Array.from(Buffer.from(value,'hex'));
  const settings={
   schemaVersion:1,ruleset:'arena8-coop-pve',movement:false,
   world:request.worldId,boot:request.bootId,matchId:request.matchId,player:request.seats[0]!.account,
   publicKeys:{[this.options.keyId]:this.options.publicKey},
   caFile:this.options.caFile,role:this.options.role,origin:this.options.origin,
   activeStorageKey:this.options.storageKeyId,
   storageKeys:{[this.options.storageKeyId]:hexBytes(this.options.storageKey)},
   engineHash:hexBytes(engineHash),
   coop:{bossId:request.bossId,seats:nativeSeats(request.seats)},
  };
  const directory=await mkdtemp(join(tmpdir(),'aetheria-coop-native-'));
  const settingsFile=join(directory,'runtime.json'),bundleFile=join(directory,'bundle.json');
  await writeFile(settingsFile,JSON.stringify(settings),{mode:0o600});
  await writeFile(bundleFile,JSON.stringify(request.bundle),{mode:0o600});
  const child=spawn(this.options.binary,[],{
   env:{
    PATH:process.env.PATH??'',
    AETHERIA_RUNTIME_BIND:'127.0.0.1:0',
    AETHERIA_GAMEPLAY_ENABLED:'1',
    AETHERIA_GAMEPLAY_CONFIG:settingsFile,
    AETHERIA_GAMEPLAY_BUNDLE:bundleFile,
    AETHERIA_GAME_DATABASE_URL:this.options.databaseUrl,
   },
   stdio:['ignore','pipe','pipe'],
  });
  child.stderr?.on('data',()=>{});
  let port:number;
  try{
   port=await waitForListen(child,LISTEN_TIMEOUT_MS);
   await waitForReady(port,READY_TIMEOUT_MS);
  }catch{
   child.kill('SIGKILL');
   await Promise.race([new Promise<void>(resolve=>child.once('exit',()=>resolve())),delay(1000)]);
   await rm(directory,{recursive:true,force:true});
   throw new Error('Cooperative native runtime unavailable');
  }
  // The committed runtime keeps the validated configuration in memory; the
  // private candidate files are only needed for this startup.
  await rm(settingsFile,{force:true});await rm(bundleFile,{force:true});
  let bridge;
  try{
   bridge=await startNativeTlsBridge({origin:this.options.origin,targetPort:port,certFile:this.options.certFile,keyFile:this.options.keyFile});
  }catch(error){
   child.kill('SIGKILL');
   await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());});
   await rm(directory,{recursive:true,force:true});
   throw error;
  }
  let exited=false,stop:Promise<void>|undefined;
  const listeners=new Set<()=>void>();
  child.once('exit',()=>{
   exited=true;
   for(const listener of listeners)try{listener();}catch{/* Exit observers are best effort. */}
   listeners.clear();
  });
  return Object.freeze({
   port,
   onExit:(listener:()=>void)=>{
    if(exited)void Promise.resolve().then(listener);
    else listeners.add(listener);
   },
   stop:()=>{
    stop??=(async()=>{
     if(!exited){
      const closed=new Promise<void>(resolve=>{if(exited)resolve();else child.once('exit',()=>resolve());});
      child.kill('SIGTERM');
      const graceful=await Promise.race([closed.then(()=>true),delay(STOP_TIMEOUT_MS).then(()=>false)]);
      if(!graceful&&!exited){child.kill('SIGKILL');await closed;}
     }
     await bridge.close().catch(()=>{});
     await rm(directory,{recursive:true,force:true});
    })();
    return stop;
   },
  });
 }
}
