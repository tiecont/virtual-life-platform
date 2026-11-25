import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {chmod,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EngineGameplaySimulator,GameplaySimulationError,GameplaySimulatorUnavailableError} from './engine-simulator';

const report={policy:'tactical',seeds:4,wins:3,losses:1,unresolved:0,phaseTwoReached:2,totalActions:40,averageRoundsMilli:10_000,averageActionsMilli:10_000};
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
  await expect(new EngineGameplaySimulator(binary).simulate(bundle as never,'tactical',4)).resolves.toEqual({
   wins:3,losses:1,unresolved:0,phaseTwoReached:2,totalActions:40,averageRoundsMilli:10_000,averageActionsMilli:10_000,
  });
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
 it('bounds the seed count before spawning',async()=>{
  const binary=await executable('ok2.mjs',"console.log(JSON.stringify("+JSON.stringify(report)+"))");
  await expect(new EngineGameplaySimulator(binary).simulate(bundle as never,'tactical',201)).rejects.toBeInstanceOf(GameplaySimulationError);
 });
});
