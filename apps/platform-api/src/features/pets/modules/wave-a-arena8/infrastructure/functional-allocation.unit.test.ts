import {expect,it,vi} from 'vitest';
import type {GameplayBundleValidation} from '../../../../gameplay/modules/config/infrastructure/engine-validator';
import type {NativeArena8MatchRecord} from '../application/native-provisioner';
import {FunctionalSoloAllocation} from './functional-allocation';

const digest='a'.repeat(64),soloContentHash='b'.repeat(64),contentHash='c'.repeat(64);
const mapId='cinder-terraces',encounterId=mapId+'-regular';

it.each([
 [3,'arena8-coop-v2',true],
 [4,'arena8-coop-v3',true],
 [5,'arena8-coop-v4',true],
 [6,'arena8-coop-v5',true],
 [6,'arena8-coop-v4',false],
 [3,'arena8-coop-v3',false],
 [4,'arena8-coop-v2',false],
 [4,'arena8-coop-v4',false],
 [5,'arena8-coop-v3',false],
] as const)('recovers the pinned schema %s and publication capability %s',async(schemaVersion,engineCapability,accepted)=>{
 const bundle={schemaVersion,bosses:[{mapId,regular:{id:encounterId,rewardPolicy:{}}}]};
 const published={publishedAt:new Date(),version:7,contentDigest:digest,engineCapability,bundle};
 const store={read:vi.fn(async()=>published),active:vi.fn()};
 const validator={validate:vi.fn(async():Promise<GameplayBundleValidation>=>({digest,engineCapability,soloContentHash,contentHash}))};
 const db={connect:vi.fn(),query:vi.fn()};
 const allocation=new FunctionalSoloAllocation(db,{} as never,validator,store as never);
 const record={functional:{configVersion:7,configDigest:digest,bossId:encounterId},mapId,encounterId,contentHash:soloContentHash} as NativeArena8MatchRecord;
 if(accepted){
  await expect(allocation.load(record)).resolves.toEqual(bundle);
  expect(validator.validate).toHaveBeenCalledWith('arena8-coop-pve',bundle);
  await expect(allocation.load({...record,contentHash})).rejects.toThrow('does not match');
  validator.validate.mockResolvedValueOnce({digest,engineCapability,contentHash});
  await expect(allocation.load(record)).rejects.toThrow('does not match');
 }else{
  await expect(allocation.load(record)).rejects.toThrow('unavailable');
  expect(validator.validate).not.toHaveBeenCalled();
 }
 expect(store.read).toHaveBeenCalledWith(db,'arena8-coop-pve',7);
 expect(store.active).not.toHaveBeenCalled();
});
