import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {chmod,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EngineGameplayBundleValidator,GameplayValidatorUnavailableError,InvalidGameplayBundleError} from './engine-validator';

const digest='a'.repeat(64),bundle={schemaVersion:1};
let directory:string;
async function executable(name:string,body:string){
 const file=join(directory,name);
 await writeFile(file,'#!/usr/bin/env node\n'+body+'\n');
 await chmod(file,0o755);
 return file;
}
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'engine-validator-test-'));});
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});

describe('engine gameplay bundle validator',()=>{
 it('returns the engine capability and canonical digest',async()=>{
  const binary=await executable('ok.mjs',"console.log(JSON.stringify({engineCapability:'arena8-coop-v1',digest:'"+digest+"'}))");
  await expect(new EngineGameplayBundleValidator(binary).validate('arena8-coop-pve',bundle)).resolves.toEqual({digest,engineCapability:'arena8-coop-v1'});
 });
 it('classifies a non-zero engine exit as an invalid bundle',async()=>{
  const binary=await executable('reject.mjs','process.exit(1)');
  await expect(new EngineGameplayBundleValidator(binary).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(InvalidGameplayBundleError);
 });
 it('classifies malformed or mismatched engine output as unavailable',async()=>{
  const malformed=await executable('malformed.mjs',"console.log('not json')");
  await expect(new EngineGameplayBundleValidator(malformed).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
  const mismatched=await executable('mismatch.mjs',"console.log(JSON.stringify({engineCapability:'other-engine',digest:'"+digest+"'}))");
  await expect(new EngineGameplayBundleValidator(mismatched).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
 });
 it('fails closed when the binary is missing and rejects relative paths',async()=>{
  await expect(new EngineGameplayBundleValidator(join(directory,'missing')).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
  expect(()=>new EngineGameplayBundleValidator('relative/binary')).toThrow();
 });
});
