import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {access,chmod,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GameplaySimulationPolicySchema} from '@aetheria/contracts';
import {EngineGameplaySimulator,GameplaySimulationError,GameplaySimulatorUnavailableError} from './engine-simulator';

const fire='cinder-terraces-warden',water='tideglass-lagoon-warden';
const report={
 bossId:fire,contentDigest:'d'.repeat(64),policy:'tactical',seeds:4,wins:3,losses:1,unresolved:0,
 phaseTwoReached:2,totalActions:40,averageRoundsMilli:10_000,averageActionsMilli:10_000,
 averageLogicalDurationMs:10_000,matchesWithMultiplier:1,
 contributions:['icarus','coralline','volt','terran'].map(petId=>({petId,damage:20,healing:0,shielding:10})),
};
const bundle={schemaVersion:1};
let directory:string;
async function executable(name:string,body:string){
 const file=join(directory,name);
 await writeFile(file,'#!/usr/bin/env node\n'+body+'\n');
 await chmod(file,0o755);
 return file;
}
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'engine-sim-test-'));});
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});

describe('engine gameplay simulator',()=>{
 it('returns a bounded report from the engine',async()=>{
  const binary=await executable('ok.mjs',"console.log(JSON.stringify("+JSON.stringify(report)+"))");
  await expect(new EngineGameplaySimulator(binary).simulate(bundle as never,'tactical',4)).resolves.toEqual(report);
 });
 it('rejects inconsistent or mismatched engine reports as unavailable',async()=>{
  const inconsistent=await executable('inconsistent.mjs',"console.log(JSON.stringify({...("+JSON.stringify(report)+"),unresolved:2}))");
  await expect(new EngineGameplaySimulator(inconsistent).simulate(bundle as never,'tactical',4)).rejects.toBeInstanceOf(GameplaySimulatorUnavailableError);
  const mismatched=await executable('mismatched.mjs',"console.log(JSON.stringify({...("+JSON.stringify(report)+"),policy:'basic'}))");
  await expect(new EngineGameplaySimulator(mismatched).simulate(bundle as never,'tactical',4)).rejects.toBeInstanceOf(GameplaySimulatorUnavailableError);
 });
 it('classifies a rejected bundle and a missing binary',async()=>{
  const rejected=await executable('reject.mjs','process.exit(1)');
  await expect(new EngineGameplaySimulator(rejected).simulate(bundle as never,'tactical',4)).rejects.toBeInstanceOf(GameplaySimulationError);
  await expect(new EngineGameplaySimulator(join(directory,'missing')).simulate(bundle as never,'tactical',4)).rejects.toBeInstanceOf(GameplaySimulatorUnavailableError);
  expect(()=>new EngineGameplaySimulator('relative')).toThrow();
 });
 it('forwards a selected boss and rejects a different boss in the output',async()=>{
  const binary=await executable('selected.mjs',`
   const [command,,policy,seeds,bossId]=process.argv.slice(2);
   if(command!=='--simulate-coop'||bossId!==${JSON.stringify(water)})process.exit(1);
   console.log(JSON.stringify({...${JSON.stringify(report)},policy,seeds:Number(seeds),bossId}));
  `);
  await expect(new EngineGameplaySimulator(binary).simulate(bundle,'tactical',4,water)).resolves.toMatchObject({bossId:water});
  const mismatch=await executable('wrong-boss.mjs',"console.log(JSON.stringify("+JSON.stringify(report)+"))");
  await expect(new EngineGameplaySimulator(mismatch).simulate(bundle,'tactical',4,water)).rejects.toBeInstanceOf(GameplaySimulatorUnavailableError);
 });
 it('checks every encounter-policy pair in a bounded engine comparison',async()=>{
  const reports=[fire,water].flatMap(bossId=>GameplaySimulationPolicySchema.options.map(policy=>({...report,bossId,policy})));
  const binary=await executable('compare.mjs',`
   const [command,,seeds,...bosses]=process.argv.slice(2);
   if(command!=='--compare-coop'||seeds!=='4'||bosses.join()!==${JSON.stringify([fire,water].join())})process.exit(1);
   console.log(${JSON.stringify(JSON.stringify(reports))});
  `);
  await expect(new EngineGameplaySimulator(binary).compare(bundle,[fire,water],4)).resolves.toEqual(reports);
  const incomplete=await executable('incomplete.mjs',"console.log("+JSON.stringify(JSON.stringify(reports.slice(1)))+")");
  await expect(new EngineGameplaySimulator(incomplete).compare(bundle,[fire,water],4)).rejects.toBeInstanceOf(GameplaySimulatorUnavailableError);
  await expect(new EngineGameplaySimulator(binary).compare(bundle,[fire,water],26)).rejects.toBeInstanceOf(GameplaySimulationError);
 });
 it('aborts a running engine process',async()=>{
  const started=join(directory,'process-started');
  const binary=await executable('pending.mjs',`
   import {writeFileSync} from 'node:fs';
   writeFileSync(${JSON.stringify(started)},'started');
   setInterval(()=>{},1000);
  `);
  const cancel=new AbortController();
  const pending=new EngineGameplaySimulator(binary).simulate(bundle,'tactical',4,fire,cancel.signal);
  const outcome=expect(pending).rejects.toBeInstanceOf(GameplaySimulatorUnavailableError);
  try{await vi.waitFor(()=>access(started));}
  finally{
   cancel.abort();
   await outcome;
  }
 });
 it('bounds the seed count before spawning',async()=>{
  const binary=await executable('ok2.mjs',"console.log(JSON.stringify("+JSON.stringify(report)+"))");
  await expect(new EngineGameplaySimulator(binary).simulate(bundle as never,'tactical',201)).rejects.toBeInstanceOf(GameplaySimulationError);
 });
});
