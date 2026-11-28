import {spawn,execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import type {
  NativeArena8RuntimeHandle,NativeArena8RuntimePort,NativeArena8RuntimeRequest,
} from '../application/native-provisioner';
import {startNativeTlsBridge} from './native-tls-bridge';

const execute=promisify(execFile);
const LABEL=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const HEX=/^[a-f0-9]{64}$/;
// Mirrors aetheria_pet_arena::arena8::binding::BINDING_VERSION. The native
// runtime rejects any other value before allocating a match.
const ARENA8_BINDING_VERSION=2;
const LISTEN_TIMEOUT_MS=15000,READY_TIMEOUT_MS=10000,STOP_TIMEOUT_MS=3000;

export type NativeArena8SettingsOptions=Readonly<{
  publicKey:string;keyId:string;origin:string;role:string;caFile:string;
  storageKey:string;storageKeyId:string;engineHash:string;
}>;

function hexBytes(value:string,label:string){
  if(!HEX.test(value))throw new Error(label+' must be a 64-character lowercase hex value');
  return Array.from(Buffer.from(value,'hex'));
}

// Server-owned runtime configuration. The client never supplies any field; the
// result is written to a private temporary file and never returned over HTTP.
export function nativeArena8Settings(
  request:NativeArena8RuntimeRequest,options:NativeArena8SettingsOptions,
){
  if(!LABEL.test(options.keyId)||!LABEL.test(options.storageKeyId))
    throw new Error('Native Arena8 key labels are invalid');
  if(!/^[A-Za-z0-9_-]{43}$/.test(options.publicKey))
    throw new Error('Native Arena8 ticket public key is invalid');
  if(!Number.isInteger(request.level)||request.level<1||request.level>60)
    throw new Error('Native Arena8 level is invalid');
  if(request.artifacts.length>3)
    throw new Error('Native Arena8 Artifact loadout is invalid');
  for(const artifact of request.artifacts){
    if(!LABEL.test(artifact.definitionId)||!Number.isInteger(artifact.upgradeLevel)||
      artifact.upgradeLevel<1||artifact.upgradeLevel>5)
      throw new Error('Native Arena8 Artifact loadout is invalid');
  }
  const storageKey=hexBytes(options.storageKey,'Native Arena8 storage key');
  const engineHash=hexBytes(options.engineHash,'Native Arena8 engine hash');
  return {
    schemaVersion:1,
    ruleset:'arena8-pve',
    movement:false,
    world:request.worldId,
    boot:request.bootId,
    matchId:request.matchId,
    player:request.accountId,
    publicKeys:{[options.keyId]:options.publicKey},
    caFile:options.caFile,
    role:options.role,
    origin:options.origin,
    activeStorageKey:options.storageKeyId,
    storageKeys:{[options.storageKeyId]:storageKey},
    engineHash,
    arena8:{
      petId:request.petId,
      ownedPetId:request.ownedPetId,
      level:request.level,
      encounterId:request.encounterId,
      bindingVersion:ARENA8_BINDING_VERSION,
      artifacts:request.artifacts.map(artifact=>({
        definitionId:artifact.definitionId,upgradeLevel:artifact.upgradeLevel,
      })),
    },
  };
}

export type LocalNativeArena8RuntimeOptions=Readonly<{
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
    const timer=setTimeout(()=>finish(()=>reject(new Error('Native runtime startup timed out'))),timeoutMs);
    child.stdout?.on('data',chunk=>{
      if(settled)return;
      output=(output+String(chunk)).slice(-8192);
      const match=/LISTEN (\d+)/.exec(output);
      if(match)finish(()=>resolve(Number(match[1])));
    });
    child.once('error',()=>finish(()=>reject(new Error('Native runtime failed to start'))));
    child.once('exit',()=>finish(()=>reject(new Error('Native runtime exited before listening'))));
  });
}

async function waitForReady(port:number,timeoutMs:number){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/health/ready',{
        signal:AbortSignal.timeout(1000),
      });
      if(response.ok)return;
    }catch{/* The runtime may still be opening its bounded PostgreSQL pool. */}
    await delay(100);
  }
  throw new Error('Native runtime readiness timed out');
}

// Local-only process adapter. It reuses the existing runtime binary and
// restricted PostgreSQL/TLS configuration; it does not create a second ticket
// or transport implementation.
export class LocalNativeArena8Runtime implements NativeArena8RuntimePort {
  private readonly options:LocalNativeArena8RuntimeOptions;
  private content?:Promise<string>;
  private engine?:Promise<string>;

  constructor(options:LocalNativeArena8RuntimeOptions){
    if(!LABEL.test(options.role))throw new Error('Native Arena8 database role is invalid');
    if(!/^https:\/\/[^/]+$/.test(options.origin))
      throw new Error('Native Arena8 origin is invalid');
    if(!HEX.test(options.storageKey))throw new Error('Native Arena8 storage key is invalid');
    let database:URL;
    try{database=new URL(options.databaseUrl);}catch{throw new Error('Native Arena8 database URL is invalid');}
    if(!['postgres:','postgresql:'].includes(database.protocol)||!database.username||
      !database.password||!['127.0.0.1','localhost','[::1]'].includes(database.hostname)||
      database.search||database.hash)
      throw new Error('Native Arena8 database URL is invalid');
    this.options=options;
  }

  contentHash(){
    this.content??=(async()=>{
      try{
        const {stdout}=await execute(
          this.options.binary,['--ruleset-content-hash','arena8-pve'],
          {timeout:LISTEN_TIMEOUT_MS,maxBuffer:4096,env:{PATH:process.env.PATH??''}},
        );
        const value=String(stdout).trim();
        if(!HEX.test(value))throw new Error('invalid content hash');
        return value;
      }catch{throw new Error('Arena8 runtime content hash unavailable');}
    })();
    return this.content;
  }

  private engineHash(){
    this.engine??=(async()=>{
      try{
        return createHash('sha256').update(await readFile(this.options.binary)).digest('hex');
      }catch{throw new Error('Arena8 runtime binary unavailable');}
    })();
    return this.engine;
  }

  async start(request:NativeArena8RuntimeRequest):Promise<NativeArena8RuntimeHandle>{
    if(request.origin!==this.options.origin)
      throw new Error('Arena8 runtime origin mismatch');
    const [contentHash,engineHash]=await Promise.all([
      this.contentHash(),this.engineHash(),
    ]);
    if(request.contentHash!==contentHash)
      throw new Error('Arena8 runtime content mismatch');
    await access(this.options.binary,constants.X_OK).catch(()=>{
      throw new Error('Arena8 runtime binary unavailable');
    });
    await access(this.options.caFile,constants.R_OK).catch(()=>{
      throw new Error('Arena8 runtime CA unavailable');
    });
    const settings=nativeArena8Settings(request,{
      publicKey:this.options.publicKey,keyId:this.options.keyId,
      origin:this.options.origin,role:this.options.role,caFile:this.options.caFile,
      storageKey:this.options.storageKey,storageKeyId:this.options.storageKeyId,
      engineHash,
    });
    const directory=await mkdtemp(join(tmpdir(),'aetheria-arena8-native-'));
    const file=join(directory,'runtime.json');
    await writeFile(file,JSON.stringify(settings),{mode:0o600});
    const child=spawn(this.options.binary,[],{
      env:{
        PATH:process.env.PATH??'',
        AETHERIA_RUNTIME_BIND:'127.0.0.1:0',
        AETHERIA_GAMEPLAY_ENABLED:'1',
        AETHERIA_GAMEPLAY_CONFIG:file,
        AETHERIA_GAME_DATABASE_URL:this.options.databaseUrl,
      },
      stdio:['ignore','pipe','pipe'],
    });
    // Drain bounded diagnostics; configuration and credentials are never logged.
    child.stderr?.on('data',()=>{});
    let port:number;
    try{
      port=await waitForListen(child,LISTEN_TIMEOUT_MS);
      await waitForReady(port,READY_TIMEOUT_MS);
    }catch{
      child.kill('SIGKILL');
      await Promise.race([
        new Promise<void>(resolve=>child.once('exit',()=>resolve())),
        delay(1000),
      ]);
      await rm(directory,{recursive:true,force:true});
      throw new Error('Arena8 native runtime unavailable');
    }
    await rm(file,{force:true});
    let bridge;
    try{
      bridge=await startNativeTlsBridge({
        origin:this.options.origin,targetPort:port,
        certFile:this.options.certFile,keyFile:this.options.keyFile,
      });
    }catch(error){
      child.kill('SIGKILL');
      await new Promise<void>(resolve=>{
        if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());
      });
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
            const closed=new Promise<void>(resolve=>{
              if(exited)resolve();
              else child.once('exit',()=>resolve());
            });
            child.kill('SIGTERM');
            const graceful=await Promise.race([
              closed.then(()=>true),delay(STOP_TIMEOUT_MS).then(()=>false),
            ]);
            if(!graceful&&!exited){
              child.kill('SIGKILL');
              await closed;
            }
          }
          await bridge.close().catch(()=>{});
          await rm(directory,{recursive:true,force:true});
        })();
        return stop;
      },
    });
  }
}
