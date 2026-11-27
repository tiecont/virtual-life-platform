import {execFile} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {CoopEngineCapability,type GameplayBundle,type GameplayRuleset} from '@aetheria/contracts';

const execute=promisify(execFile);
const HEX=/^[a-f0-9]{64}$/,LIMIT=1048576,TIMEOUT_MS=10000,OUTPUT_LIMIT=16384;

export type GameplayBundleValidation=Readonly<{digest:string;engineCapability:string;contentHash:string}>;
export interface GameplayBundleValidator{validate(ruleset:GameplayRuleset,bundle:GameplayBundle):Promise<GameplayBundleValidation>;}
/** The engine rejected the authored bundle: a content defect, not an outage. */
export class InvalidGameplayBundleError extends Error{constructor(message='Gameplay configuration rejected by the engine'){super(message);this.name='InvalidGameplayBundleError';}}
/** The validator cannot answer authoritatively: publication must fail closed. */
export class GameplayValidatorUnavailableError extends Error{constructor(message='Gameplay configuration validation unavailable'){super(message);this.name='GameplayValidatorUnavailableError';}}

// The Rust runtime remains the only authority for the bundle schema and digest.
// TypeScript writes the private candidate file, records the engine verdict and
// never re-implements the schema or computes a competing hash.
export class EngineGameplayBundleValidator implements GameplayBundleValidator{
 constructor(private readonly binary:string){
  if(typeof binary!=='string'||!binary.startsWith('/')||binary.length>4096)throw new Error('Gameplay validator binary must be an absolute path');
 }
 async validate(ruleset:GameplayRuleset,bundle:GameplayBundle):Promise<GameplayBundleValidation>{
  if(ruleset!=='arena8-coop-pve')throw new InvalidGameplayBundleError();
  const schema=bundle.schemaVersion;
  if(schema!==1&&schema!==2&&schema!==3)throw new InvalidGameplayBundleError();
  const expectedCapability=schema===3?CoopEngineCapability.functional:CoopEngineCapability.elemental;
  const bytes=JSON.stringify(bundle);
  if(typeof bytes!=='string'||Buffer.byteLength(bytes)<2||Buffer.byteLength(bytes)>LIMIT)throw new InvalidGameplayBundleError('Gameplay bundle size is outside the supported bound');
  const directory=await mkdtemp(join(tmpdir(),'aetheria-gameplay-config-'));
  try{
   const file=join(directory,'bundle.json');
   await writeFile(file,bytes,{mode:0o600});
   let stdout:string;
   try{
    const result=await execute(this.binary,['--check-gameplay-config',file],{timeout:TIMEOUT_MS,maxBuffer:OUTPUT_LIMIT,env:{PATH:process.env.PATH??''}});
    stdout=String(result.stdout);
   }catch(error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='number'&&code>0)throw new InvalidGameplayBundleError();
    throw new GameplayValidatorUnavailableError();
   }
   let parsed:unknown;
   try{parsed=JSON.parse(stdout);}catch{throw new GameplayValidatorUnavailableError('Engine validator returned an invalid verdict');}
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new GameplayValidatorUnavailableError('Engine validator returned an invalid verdict');
   const verdict=parsed as Record<string,unknown>,digest=verdict.digest,capability=verdict.engineCapability,contentHash=verdict.contentHash;
   if(typeof capability!=='string'||capability!==expectedCapability)throw new GameplayValidatorUnavailableError('Engine validator capability does not match the ruleset');
   const expectedRulesetVersion=schema===3?2:1;
   const version=verdict.rulesetVersion;
   // Older validators emit no version for their v1 capability.
   if(version!==expectedRulesetVersion&&!(expectedRulesetVersion===1&&version===undefined))
    throw new GameplayValidatorUnavailableError('Engine validator version does not match the bundle schema');
   if(typeof digest!=='string'||!HEX.test(digest))throw new GameplayValidatorUnavailableError('Engine validator returned an invalid digest');
   if(typeof contentHash!=='string'||!HEX.test(contentHash))throw new GameplayValidatorUnavailableError('Engine validator returned an invalid content hash');
   return Object.freeze({digest,engineCapability:capability,contentHash});
  }finally{await rm(directory,{recursive:true,force:true}).catch(()=>{/* Private candidate cleanup is best effort after an error. */});}
 }
}
