import {execFile} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import type {GameplayBundle} from '@aetheria/contracts';

const execute=promisify(execFile);
const LIMIT=1048576,TIMEOUT_MS=30000,OUTPUT_LIMIT=65536;
export type GameplaySimulationPolicy='random'|'basic'|'tactical'|'coordinated';
export type GameplaySimulationMetrics=Readonly<{
 wins:number;losses:number;unresolved:number;phaseTwoReached:number;
 totalActions:number;averageRoundsMilli:number;averageActionsMilli:number;
}>;
export interface GameplaySimulator{
 simulate(bundle:GameplayBundle,policy:GameplaySimulationPolicy,seeds:number):Promise<GameplaySimulationMetrics>;
}
/** The engine rejected the bundle or the bounded simulation request. */
export class GameplaySimulationError extends Error{constructor(message='Gameplay simulation rejected'){super(message);this.name='GameplaySimulationError';}}
/** The simulator cannot answer: the caller must fail closed. */
export class GameplaySimulatorUnavailableError extends Error{constructor(message='Gameplay simulation unavailable'){super(message);this.name='GameplaySimulatorUnavailableError';}}

function metric(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000;}

// Bounded engine-side simulation. The Rust runtime owns the reducer and the
// metrics; Nest never re-implements damage, policies or rewards.
export class EngineGameplaySimulator implements GameplaySimulator{
 constructor(private readonly binary:string){
  if(typeof binary!=='string'||!binary.startsWith('/')||binary.length>4096)throw new Error('Gameplay simulator binary must be an absolute path');
 }
 async simulate(bundle:GameplayBundle,policy:GameplaySimulationPolicy,seeds:number):Promise<GameplaySimulationMetrics>{
  if(!Number.isInteger(seeds)||seeds<1||seeds>200)throw new GameplaySimulationError('Gameplay simulation seed count is outside the bound');
  const bytes=JSON.stringify(bundle);
  if(Buffer.byteLength(bytes)<2||Buffer.byteLength(bytes)>LIMIT)throw new GameplaySimulationError('Gameplay bundle size is outside the supported bound');
  const directory=await mkdtemp(join(tmpdir(),'aetheria-gameplay-sim-'));
  try{
   const file=join(directory,'bundle.json');
   await writeFile(file,bytes,{mode:0o600});
   let stdout:string;
   try{
    const result=await execute(this.binary,['--simulate-coop',file,policy,String(seeds)],{timeout:TIMEOUT_MS,maxBuffer:OUTPUT_LIMIT,env:{PATH:process.env.PATH??''}});
    stdout=String(result.stdout);
   }catch(error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='number'&&code>0)throw new GameplaySimulationError();
    throw new GameplaySimulatorUnavailableError();
   }
   let parsed:unknown;
   try{parsed=JSON.parse(stdout);}catch{throw new GameplaySimulatorUnavailableError('Engine simulator returned an invalid report');}
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new GameplaySimulatorUnavailableError('Engine simulator returned an invalid report');
   const report=parsed as Record<string,unknown>;
   if(report.policy!==policy||report.seeds!==seeds)throw new GameplaySimulatorUnavailableError('Engine simulator returned a mismatched report');
   if(!['wins','losses','unresolved','phaseTwoReached','totalActions','averageRoundsMilli','averageActionsMilli'].every(key=>metric(report[key])))
    throw new GameplaySimulatorUnavailableError('Engine simulator returned an invalid report');
   const metrics=report as Record<string,number>;
   if((metrics.wins??0)+(metrics.losses??0)+(metrics.unresolved??0)!==seeds)throw new GameplaySimulatorUnavailableError('Engine simulator returned an inconsistent report');
   return Object.freeze({
    wins:metrics.wins!,losses:metrics.losses!,unresolved:metrics.unresolved!,
    phaseTwoReached:metrics.phaseTwoReached!,totalActions:metrics.totalActions!,
    averageRoundsMilli:metrics.averageRoundsMilli!,averageActionsMilli:metrics.averageActionsMilli!,
   });
  }finally{await rm(directory,{recursive:true,force:true}).catch(()=>{/* Private candidate cleanup is best effort. */});}
 }
}
