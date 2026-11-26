import {execFile} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {
 EngineGameplaySimulationReportSchema,GameplayComparisonSeedsSchema,GameplaySimulationPolicySchema,GameplaySimulationSeedsSchema,
 type EngineGameplaySimulationReport,type GameplayBundle,type GameplaySimulationPolicy,type GameplaySimulationParty,
} from '@aetheria/contracts';

const execute=promisify(execFile);
const LIMIT=1048576,TIMEOUT_MS=30000,OUTPUT_LIMIT=65536;
export interface GameplaySimulator{
 simulate(bundle:GameplayBundle,policy:GameplaySimulationPolicy,seeds:number,bossId?:string,signal?:AbortSignal,party?:GameplaySimulationParty):Promise<EngineGameplaySimulationReport>;
 compare(bundle:GameplayBundle,bossIds:readonly string[],seeds:number,signal?:AbortSignal,party?:GameplaySimulationParty):Promise<EngineGameplaySimulationReport[]>;
}
/** The engine rejected the bundle or the bounded simulation request. */
export class GameplaySimulationError extends Error{constructor(message='Gameplay simulation rejected'){super(message);this.name='GameplaySimulationError';}}
/** The simulator cannot answer: the caller must fail closed. */
export class GameplaySimulatorUnavailableError extends Error{constructor(message='Gameplay simulation unavailable'){super(message);this.name='GameplaySimulatorUnavailableError';}}

function readReport(input:unknown,policy:GameplaySimulationPolicy,seeds:number,bossId?:string):EngineGameplaySimulationReport{
 const parsed=EngineGameplaySimulationReportSchema.safeParse(input);
 if(!parsed.success)throw new GameplaySimulatorUnavailableError('Engine simulator returned an invalid report');
 const report=parsed.data;
 if(report.policy!==policy||report.seeds!==seeds||(bossId!==undefined&&report.bossId!==bossId))
  throw new GameplaySimulatorUnavailableError('Engine simulator returned a mismatched report');
 if(report.wins+report.losses+report.unresolved!==seeds||report.phaseTwoReached>seeds||report.matchesWithMultiplier>seeds)
  throw new GameplaySimulatorUnavailableError('Engine simulator returned an inconsistent report');
 return report;
}

// Bounded engine-side simulation. The Rust runtime owns the reducer, policies and
// metrics. The candidate file and engine process have no connection to live state.
export class EngineGameplaySimulator implements GameplaySimulator{
 constructor(private readonly binary:string){
  if(typeof binary!=='string'||!binary.startsWith('/')||binary.length>4096)throw new Error('Gameplay simulator binary must be an absolute path');
 }
 async simulate(bundle:GameplayBundle,policy:GameplaySimulationPolicy,seeds:number,bossId?:string,signal?:AbortSignal,party?:GameplaySimulationParty){
  if(!GameplaySimulationSeedsSchema.safeParse(seeds).success)throw new GameplaySimulationError('Gameplay simulation seed count is outside the bound');
  const args=[policy,String(seeds)];
  if(bossId!==undefined)args.push(bossId);
  return readReport(await this.run(bundle,'--simulate-coop',args,signal,party),policy,seeds,bossId);
 }
 async compare(bundle:GameplayBundle,bossIds:readonly string[],seeds:number,signal?:AbortSignal,party?:GameplaySimulationParty){
  if(!GameplayComparisonSeedsSchema.safeParse(seeds).success)throw new GameplaySimulationError('Gameplay comparison seed count is outside the bound');
  if(bossIds.length<1||bossIds.length>2||new Set(bossIds).size!==bossIds.length)throw new GameplaySimulationError('Gameplay comparison requires one or two distinct encounters');
  const output=await this.run(bundle,'--compare-coop',[String(seeds),...bossIds],signal,party);
  const policies=GameplaySimulationPolicySchema.options;
  if(!Array.isArray(output)||output.length!==bossIds.length*policies.length)
   throw new GameplaySimulatorUnavailableError('Engine simulator returned an incomplete comparison');
  const reports=bossIds.flatMap((bossId,bossIndex)=>policies.map((policy,policyIndex)=>
   readReport(output[bossIndex*policies.length+policyIndex],policy,seeds,bossId)));
  if(reports.some(report=>report.contentDigest!==reports[0]!.contentDigest))
   throw new GameplaySimulatorUnavailableError('Engine simulator returned inconsistent bundle digests');
  return reports;
 }
 private async run(bundle:GameplayBundle,command:string,args:string[],signal?:AbortSignal,party?:GameplaySimulationParty):Promise<unknown>{
  const bytes=JSON.stringify(bundle);
  if(Buffer.byteLength(bytes)<2||Buffer.byteLength(bytes)>LIMIT)throw new GameplaySimulationError('Gameplay bundle size is outside the supported bound');
  const directory=await mkdtemp(join(tmpdir(),'aetheria-gameplay-sim-'));
  try{
   const file=join(directory,'bundle.json');
   await writeFile(file,bytes,{mode:0o600});
   if(party){
    const partyFile=join(directory,'party.json');
    await writeFile(partyFile,JSON.stringify(party),{mode:0o600});
    args.push('--party',partyFile);
   }
   let stdout:string;
   try{
    signal?.throwIfAborted();
    const result=await execute(this.binary,[command,file,...args],{signal,timeout:TIMEOUT_MS,maxBuffer:OUTPUT_LIMIT,env:{PATH:process.env.PATH??''}});
    stdout=String(result.stdout);
   }catch(error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='number'&&code>0)throw new GameplaySimulationError();
    throw new GameplaySimulatorUnavailableError();
   }
   try{return JSON.parse(stdout);}catch{throw new GameplaySimulatorUnavailableError('Engine simulator returned an invalid report');}
  }finally{await rm(directory,{recursive:true,force:true}).catch(()=>{/* Private candidate cleanup is best effort. */});}
 }
}
