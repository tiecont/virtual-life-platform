import type {Pool} from 'pg';
import {CoopEngineCapability} from '@aetheria/contracts';
import {bindArtifactLoadout,readArtifactSeat} from '../../../../coop/modules/match/domain/loadout';
import type {CoopSkillService} from '../../../../coop/modules/skills/application/service';
import type {GameplayBundleValidator} from '../../../../gameplay/modules/config/infrastructure/engine-validator';
import {GameplayConfigStore,type GameplayVersion} from '../../../../gameplay/modules/config/infrastructure/version-store';
import {readOwnedArtifactLoadouts} from '../../wave-a-artifacts/infrastructure/store';
import type {NativeArena8MatchRecord} from '../application/native-provisioner';
import {forbidden,invalid,readOwnedArena8Allocation,unavailable,type AllocateInput} from '../application/allocation';

const RULESET='arena8-coop-pve';
const stableId=/^[a-z][a-z0-9-]{2,63}$/;

function soloEncounter(bundle:Record<string,unknown>,mapId:string,encounterId:string):string{
  const catalog=Array.isArray(bundle.bosses)?bundle.bosses:[];
  const selected=catalog.find(candidate=>candidate?.mapId===mapId);
  if(encounterId===mapId+'-regular'&&selected?.regular?.id===encounterId&&selected.regular.rewardPolicy)
    return encounterId;
  if(encounterId===mapId+'-boss'&&selected?.solo&&selected.rewardPolicy&&
    typeof selected.id==='string'&&stableId.test(selected.id))
    return selected.id;
  throw unavailable('This encounter has no published functional solo profile');
}

export class FunctionalSoloAllocation {
  constructor(
    private readonly db:Pick<Pool,'connect'|'query'>,
    private readonly skills:CoopSkillService,
    private readonly validator:GameplayBundleValidator,
    private readonly store=new GameplayConfigStore(),
  ){}

  private async verify(published:GameplayVersion|undefined){
    if(!published?.publishedAt||published.engineCapability!==CoopEngineCapability.functional||
      published.bundle.schemaVersion!==3||!published.contentDigest)
      throw unavailable('Published functional solo configuration is unavailable');
    const verdict=await this.validator.validate(RULESET,published.bundle).catch(()=>{
      throw unavailable('Published functional solo configuration is invalid');
    });
    if(verdict.engineCapability!==published.engineCapability||verdict.digest!==published.contentDigest||!verdict.soloContentHash)
      throw unavailable('Published functional solo config does not match its engine binding');
    return {bundle:published.bundle,configVersion:published.version,configDigest:verdict.digest,contentHash:verdict.soloContentHash};
  }

  async allocate(accountId:string,input:AllocateInput){
    if(input.encounterId!==input.mapId+'-boss'&&input.encounterId!==input.mapId+'-regular')
      throw invalid('Encounter does not belong to the functional solo map');
    const tx=await this.db.connect();
    let published:GameplayVersion|undefined,seat:Awaited<ReturnType<typeof readOwnedArtifactLoadouts>>[number],skillLevels;
    try{
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await readOwnedArena8Allocation(tx,accountId,input);
      const selection=await this.store.active(tx,RULESET);
      published=selection?await this.store.read(tx,RULESET,selection.version):undefined;
      if(!published||published.bundle.schemaVersion!==3)throw unavailable('Published functional solo configuration is unavailable');
      const owner=(await tx.query<{id:string}>(
        'SELECT owned_pet_instance_id AS id FROM pet_wave_one_owned WHERE account_id=$1 AND pet_id=$2',
        [accountId,input.petId],
      )).rows[0];
      if(!owner)throw forbidden('Pet is not owned');
      const [owned]=await readOwnedArtifactLoadouts(tx,[{account:accountId,petId:input.petId,ownedPetInstanceId:owner.id}]);
      if(!owned)throw forbidden('Pet is not owned');
      seat=owned;
      [skillLevels]=await this.skills.allocationLevels(published.bundle,[{instanceId:owner.id,petId:input.petId}],tx);
      await tx.query('COMMIT');
    }catch(error){
      await tx.query('ROLLBACK');throw error;
    }finally{tx.release();}
    const {bundle,contentHash,configVersion,configDigest}=await this.verify(published);
    const {entries,...identity}=seat;
    const bound=readArtifactSeat({
      ...identity,...(skillLevels?.length?{skillLevels}:{}),loadout:bindArtifactLoadout(configDigest,identity,entries),
    },configDigest);
    return {
      contentHash,bundle,pin:{configVersion,configDigest,bossId:soloEncounter(bundle,input.mapId,input.encounterId),seat:bound},
    };
  }

  async load(record:NativeArena8MatchRecord){
    const pin=record.functional;
    if(!pin)throw unavailable('Pinned functional solo configuration is unavailable');
    const verified=await this.verify(await this.store.read(this.db,RULESET,pin.configVersion));
    if(verified.configDigest!==pin.configDigest||verified.contentHash!==record.contentHash||soloEncounter(verified.bundle,record.mapId,record.encounterId)!==pin.bossId)
      throw unavailable('Pinned functional solo configuration does not match the allocation');
    return verified.bundle;
  }
}
