import {PetContentManifestV3Schema,type PetContentDraft} from '@virtual-city/contracts';

export function petManifestFixture(draft:PetContentDraft){
 return PetContentManifestV3Schema.parse({...draft,schemaVersion:3,ruleset:'pet-arena-pve-v3',release:'OFFLINE_ONLY',rulesHash:'a'.repeat(64),
  cards:[{id:'alternate-strike',skill:'strike',element:'light'}],combinations:[],
  loadouts:[{id:'starter',species:'fire-emberloom',cards:['alternate-strike'],combinations:[]}],
  maps:[{id:'practice',displayName:'Offline practice'}],encounters:[{id:'practice-fire',map:'practice',species:'fire-emberloom',level:1,revision:1}],assets:[],
 });
}
