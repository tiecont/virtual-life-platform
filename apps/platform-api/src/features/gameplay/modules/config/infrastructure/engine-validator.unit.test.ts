import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {chmod,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EngineGameplayBundleValidator,GameplayValidatorUnavailableError,InvalidGameplayBundleError} from './engine-validator';

const digest='a'.repeat(64),contentHash='b'.repeat(64),bundle={schemaVersion:1};
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
  const binary=await executable('ok.mjs',"console.log(JSON.stringify({engineCapability:'arena8-coop-v1',digest:'"+digest+"',contentHash:'"+contentHash+"'}))");
  await expect(new EngineGameplayBundleValidator(binary).validate('arena8-coop-pve',bundle)).resolves.toEqual({digest,engineCapability:'arena8-coop-v1',contentHash});
 });
 it('classifies a non-zero engine exit as an invalid bundle',async()=>{
  const binary=await executable('reject.mjs','process.exit(1)');
  await expect(new EngineGameplayBundleValidator(binary).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(InvalidGameplayBundleError);
 });
 it('classifies malformed or mismatched engine output as unavailable',async()=>{
  const malformed=await executable('malformed.mjs',"console.log('not json')");
  await expect(new EngineGameplayBundleValidator(malformed).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
  const mismatched=await executable('mismatch.mjs',"console.log(JSON.stringify({engineCapability:'other-engine',digest:'"+digest+"',contentHash:'"+contentHash+"'}))");
  await expect(new EngineGameplayBundleValidator(mismatched).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
 });
 it('binds a functional bundle to the v2 engine verdict',async()=>{
  const binary=await executable('functional.mjs',"console.log(JSON.stringify({engineCapability:'arena8-coop-v2',rulesetVersion:2,digest:'"+digest+"',contentHash:'"+contentHash+"'}))");
  const validator=new EngineGameplayBundleValidator(binary);
  await expect(validator.validate('arena8-coop-pve',{schemaVersion:3})).resolves.toEqual({digest,engineCapability:'arena8-coop-v2',contentHash});
  await expect(validator.validate('arena8-coop-pve',{schemaVersion:2})).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
  await expect(validator.validate('arena8-coop-pve',{schemaVersion:4})).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
 });
 it('rejects an older engine verdict or a missing version for a functional bundle',async()=>{
  for(const capability of ['arena8-coop-v1','arena8-coop-v2']){
   const binary=await executable(capability+'.mjs',"console.log(JSON.stringify({engineCapability:'"+capability+"',digest:'"+digest+"',contentHash:'"+contentHash+"'}))");
   await expect(new EngineGameplayBundleValidator(binary).validate('arena8-coop-pve',{schemaVersion:3})).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
  }
 });
 it.each([
  [1,'arena8-coop-v1',undefined,undefined,undefined,true],
  [2,'arena8-coop-v1',1,undefined,undefined,true],
  [2,'arena8-coop-v1',1,contentHash,1,false],
  [3,'arena8-coop-v2',2,contentHash,undefined,true],
  [3,'arena8-coop-v2',2,contentHash,1,true],
  [3,'arena8-coop-v2',2,contentHash,2,false],
  [3,'arena8-coop-v3',3,contentHash,2,false],
  [4,'arena8-coop-v2',2,contentHash,1,false],
  [4,'arena8-coop-v3',2,contentHash,2,false],
  [4,'arena8-coop-v3',3,contentHash,1,false],
  [4,'arena8-coop-v3',3,contentHash,undefined,false],
  [4,'arena8-coop-v3',3,undefined,2,false],
  [4,'arena8-coop-v3',3,undefined,undefined,true],
  [4,'arena8-coop-v3',3,contentHash,2,true],
 ] as const)('validates schema %s against %s coop %s solo hash %s version %s (%s)',async(schemaVersion,engineCapability,rulesetVersion,soloContentHash,soloRulesetVersion,accepted)=>{
  const verdict={digest,engineCapability,contentHash,rulesetVersion,soloContentHash,soloRulesetVersion};
  const binary=await executable('verdict.mjs','console.log('+JSON.stringify(JSON.stringify(verdict))+')');
  const result=new EngineGameplayBundleValidator(binary).validate('arena8-coop-pve',{schemaVersion});
  if(accepted)await expect(result).resolves.toMatchObject({digest,engineCapability,contentHash});
  else await expect(result).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
 });
 it('rejects an undeclared schema and a candidate claiming a different capability',async()=>{
  const validator=new EngineGameplayBundleValidator(join(directory,'missing'));
  for(const candidate of [{schemaVersion:5},{schemaVersion:3,engineCapability:'arena8-coop-v3'}])
   await expect(validator.validate('arena8-coop-pve',candidate)).rejects.toBeInstanceOf(InvalidGameplayBundleError);
 });
 it('fails closed when the binary is missing and rejects relative paths',async()=>{
  await expect(new EngineGameplayBundleValidator(join(directory,'missing')).validate('arena8-coop-pve',bundle)).rejects.toBeInstanceOf(GameplayValidatorUnavailableError);
  expect(()=>new EngineGameplayBundleValidator('relative/binary')).toThrow();
 });
});
