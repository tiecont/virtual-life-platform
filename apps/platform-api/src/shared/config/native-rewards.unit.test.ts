import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {loadNativeRewardPolicy} from './native-rewards';

const directories:string[]=[];
async function policyFile(body:unknown){
  const directory=await mkdtemp(join(tmpdir(),'native-reward-policy-'));
  directories.push(directory);
  const file=join(directory,'policy.json');
  await writeFile(file,JSON.stringify(body));
  return file;
}
afterEach(async()=>{for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});

const base={schemaVersion:1,world:'native:pet',rulesetVersion:1,contentHash:'ab'.repeat(32),rewardKey:'pet-training-win'};
describe('native reward policy ruleset binding',()=>{
  it('accepts both the frozen pet-arena-pve and the new arena8-pve terminal outcome',async()=>{
    for(const ruleset of ['pet-arena-pve','arena8-pve']){
      const loaded=await loadNativeRewardPolicy(await policyFile({...base,ruleset,completionKind:'pet-arena.completed.v1'}));
      expect(loaded?.ruleset).toBe(ruleset);
    }
  });
  it('rejects a Pet ruleset without its explicit terminal kind and a non-Pet ruleset with it',async()=>{
    await expect(loadNativeRewardPolicy(await policyFile({...base,ruleset:'arena8-pve'}))).rejects.toThrow('unavailable');
    await expect(loadNativeRewardPolicy(await policyFile({...base,ruleset:'headless-counter',completionKind:'pet-arena.completed.v1'}))).rejects.toThrow('unavailable');
    await expect(loadNativeRewardPolicy(await policyFile({...base,ruleset:'headless-counter'}))).resolves.toMatchObject({ruleset:'headless-counter'});
  });
});
