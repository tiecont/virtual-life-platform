import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DomainError} from '../../../../../shared/common/errors';
import {
  MAX_ARTIFACT_LEVEL,
  PVE_ARTIFACT_REWARDS,
  artifactDefinition,
  canEquipArtifact,
  effectiveModifiers,
  equipmentLevelRequirement,
  loadoutDigest,
  loadoutSnapshotPayload,
  nextUpgradeCost,
  parseStoredLoadout,
  upgradeCost,
  type ArtifactRank,
  type ArtifactSlot,
  type LoadoutEntry,
  type StatModifiers,
} from '../domain/catalog';
import {WAVE_A_PET_BY_ID,type WaveAPowerClass} from '../../wave1/domain/wave-a-catalog';
import {ArtifactStore,type ArtifactTransaction,type ArtifactSnapshotRow} from '../infrastructure/store';

export type EquipInput=Readonly<{petId:string;artifactId:string}>;
export type UnequipInput=Readonly<{petId:string;slot:ArtifactSlot}>;
export type UpgradeInput=Readonly<{artifactId:string}>;
export type SnapshotInput=Readonly<{petId:string}>;

export type ArtifactInstanceView=Readonly<{
  artifactId:string;definitionId:string;name:string;slot:ArtifactSlot;rank:ArtifactRank;
  upgradeLevel:number;maxUpgradeLevel:number;nextUpgradeCost:number|null;modifiers:StatModifiers;
  equipped:Readonly<{petId:string;slot:ArtifactSlot}>|null;
  acquiredFrom:'starter'|'pve';acquiredMapId:string|null;acquiredAt:string;
}>;
export type ArtifactSlotsView=Readonly<Record<ArtifactSlot,string|null>>;
export type ArtifactPetView=Readonly<{
  petId:string;level:number;powerClass:WaveAPowerClass|null;
  slots:ArtifactSlotsView;totals:StatModifiers;digest:string;snapshotId:string|null;
}>;
export type ArtifactSnapshotView=Readonly<{
  snapshotId:string;digest:string;createdAt:string;
  loadout:Readonly<{petId:string;petLevel:number;entries:readonly LoadoutEntry[];totals:StatModifiers}>;
}>;
export type ArtifactClaimView=Readonly<{mapId:string;artifactId:string;definitionId:string;materials:number;claimedAt:string}>;
export type ArtifactStateView=Readonly<{
  revision:number;materials:number;inventory:ArtifactInstanceView[];pets:ArtifactPetView[];
  pve:Readonly<{claims:ArtifactClaimView[];available:readonly Readonly<{mapId:string;definitionId:string;materials:number}>[]}>;
  snapshots:ArtifactSnapshotView[];
}>;

const invalid=(message:string)=>new DomainError('INVALID_REQUEST',400,message);
const notFound=(message:string)=>new DomainError('NOT_FOUND',404,message);
const unavailable=(message:string)=>new DomainError('NOT_AVAILABLE',409,message);
const insufficient=(message:string)=>new DomainError('INSUFFICIENT_FUNDS',409,message);
const fingerprint=(route:string,body:unknown)=>createHash('sha256').update(route+'\n'+JSON.stringify(body)).digest('hex');

// Wave A Artifact loop: inventory, equip/unequip/swap in three slots, deterministic
// upgrades from PvE materials, and content-addressed immutable battle loadout
// snapshots. Every mutation is receipt-idempotent and account-scoped.
export class ArtifactService {
  constructor(private store:ArtifactStore){}

  readState(accountId:string):Promise<ArtifactStateView>{
    return this.store.transact(accountId,async tx=>this.state(tx));
  }

  async readSnapshot(accountId:string,snapshotId:string):Promise<ArtifactSnapshotView>{
    return this.store.transact(accountId,async tx=>{
      const row=await tx.snapshot(snapshotId);
      if(!row)throw notFound('Artifact snapshot not found');
      return this.snapshotView(row);
    });
  }

  async equip(accountId:string,requestId:string,input:EquipInput){
    const requestFingerprint=fingerprint('equip',{petId:input.petId,artifactId:input.artifactId});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;petId:string;slot:ArtifactSlot;artifactId:string;state:ArtifactStateView}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      const level=await tx.petLevel(input.petId);
      if(level===undefined)throw invalid('Pet is not owned');
      const artifact=await tx.artifact(input.artifactId);
      if(!artifact)throw notFound('Artifact not found');
      const definition=artifactDefinition(artifact.definitionId);
      if(!canEquipArtifact(definition.rank,level))throw unavailable('Pet level '+equipmentLevelRequirement(definition.rank)+' is required for '+definition.rank+'-rank artifacts');
      const occupied=await tx.loadoutForArtifact(artifact.artifactId);
      if(occupied&&occupied.petId!==input.petId)throw unavailable('Artifact is equipped on another Pet');
      const current=(await tx.loadouts()).find(row=>row.petId===input.petId&&row.slot===definition.slot);
      const unchanged=current?.artifactId===artifact.artifactId;
      let revision=(await tx.player()).revision;
      if(!unchanged){
        await tx.setLoadout(input.petId,definition.slot,artifact.artifactId);
        revision=await tx.bumpRevision();
      }
      const response={revision,petId:input.petId,slot:definition.slot,artifactId:artifact.artifactId,state:await this.state(tx)};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  async unequip(accountId:string,requestId:string,input:UnequipInput){
    const requestFingerprint=fingerprint('unequip',{petId:input.petId,slot:input.slot});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;petId:string;slot:ArtifactSlot;removedArtifactId:string|null;state:ArtifactStateView}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      if((await tx.petLevel(input.petId))===undefined)throw invalid('Pet is not owned');
      const current=(await tx.loadouts()).find(row=>row.petId===input.petId&&row.slot===input.slot);
      let revision=(await tx.player()).revision;
      if(current){
        await tx.deleteLoadout(input.petId,input.slot);
        revision=await tx.bumpRevision();
      }
      const response={revision,petId:input.petId,slot:input.slot,removedArtifactId:current?.artifactId??null,state:await this.state(tx)};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  async upgrade(accountId:string,requestId:string,input:UpgradeInput){
    const requestFingerprint=fingerprint('upgrade',{artifactId:input.artifactId});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;artifactId:string;upgradeLevel:number;spent:number;state:ArtifactStateView}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      const artifact=await tx.artifact(input.artifactId);
      if(!artifact)throw notFound('Artifact not found');
      const definition=artifactDefinition(artifact.definitionId);
      if(artifact.upgradeLevel>=MAX_ARTIFACT_LEVEL)throw unavailable('Artifact is at its maximum upgrade level');
      const cost=upgradeCost(definition.rank,artifact.upgradeLevel);
      const player=await tx.player();
      if(player.materials<cost)throw insufficient('Not enough artifact materials');
      await tx.debitMaterials(cost);
      const upgradeLevel=artifact.upgradeLevel+1;
      await tx.setUpgradeLevel(artifact.artifactId,upgradeLevel);
      const revision=await tx.bumpRevision();
      const response={revision,artifactId:artifact.artifactId,upgradeLevel,spent:cost,state:await this.state(tx)};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  async claimPveReward(accountId:string,requestId:string){
    const requestFingerprint=fingerprint('pve/claim',{});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;grant:{mapId:string;artifactId:string;definitionId:string;materials:number};state:ArtifactStateView}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      const cleared=new Set(await tx.clears());
      const claimed=new Set((await tx.claims()).map(row=>row.mapId));
      const reward=PVE_ARTIFACT_REWARDS.find(candidate=>cleared.has(candidate.mapId)&&!claimed.has(candidate.mapId));
      if(!reward)throw unavailable('No PvE artifact reward is available');
      const artifactId=randomUUID();
      await tx.insertOwned({artifactId,definitionId:reward.definitionId,acquiredFrom:'pve',acquiredMapId:reward.mapId});
      await tx.insertClaim({mapId:reward.mapId,artifactId,materials:reward.materials});
      await tx.creditMaterials(reward.materials);
      const revision=await tx.bumpRevision();
      const response={revision,grant:{mapId:reward.mapId,artifactId,definitionId:reward.definitionId,materials:reward.materials},state:await this.state(tx)};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  async snapshotLoadout(accountId:string,requestId:string,input:SnapshotInput){
    const requestFingerprint=fingerprint('loadout/snapshot',{petId:input.petId});
    return this.store.transact(accountId,async tx=>{
      const replayed=await this.replayed<{revision:number;snapshot:ArtifactSnapshotView;state:ArtifactStateView}>(tx,requestId,requestFingerprint);
      if(replayed)return replayed;
      const level=await tx.petLevel(input.petId);
      if(level===undefined)throw invalid('Pet is not owned');
      const payload=loadoutSnapshotPayload(input.petId,level,await this.entries(tx,input.petId));
      const row=await tx.insertSnapshot({snapshotId:randomUUID(),petId:input.petId,petLevel:level,digest:loadoutDigest(payload),loadout:payload});
      const response={revision:(await tx.player()).revision,snapshot:this.snapshotView(row),state:await this.state(tx)};
      await tx.saveReceipt(requestId,requestFingerprint,response);
      return response;
    });
  }

  exportAccount(db:Pick<PoolClient,'query'>,accountId:string){
    return this.store.exportAccount(db,accountId);
  }

  private async entries(tx:ArtifactTransaction,petId:string):Promise<LoadoutEntry[]>{
    const owned=new Map((await tx.owned()).map(row=>[row.artifactId,row]));
    const entries:LoadoutEntry[]=[];
    for(const loadout of (await tx.loadouts()).filter(row=>row.petId===petId)){
      const artifact=owned.get(loadout.artifactId);
      if(!artifact)throw new Error('Equipped artifact is absent from the inventory');
      const definition=artifactDefinition(artifact.definitionId);
      entries.push({
        slot:loadout.slot,artifactId:artifact.artifactId,definitionId:definition.id,
        upgradeLevel:artifact.upgradeLevel,modifiers:effectiveModifiers(definition,artifact.upgradeLevel),
      });
    }
    return entries;
  }

  private async replayed<T>(tx:ArtifactTransaction,requestId:string,requestFingerprint:string):Promise<T|undefined>{
    const receipt=await tx.receipt(requestId);
    if(!receipt)return undefined;
    if(receipt.fingerprint!==requestFingerprint)throw new DomainError('REQUEST_CONFLICT',409,'Request id was used with different input');
    return receipt.response as T;
  }

  private snapshotView(row:ArtifactSnapshotRow):ArtifactSnapshotView{
    return {
      snapshotId:row.snapshotId,digest:row.digest,createdAt:row.createdAt.toISOString(),
      loadout:parseStoredLoadout(row.loadout),
    };
  }

  private async state(tx:ArtifactTransaction):Promise<ArtifactStateView>{
    const player=await tx.player();
    const owned=await tx.owned();
    const loadouts=await tx.loadouts();
    const pets=await tx.pets();
    const claims=await tx.claims();
    const snapshots=await tx.snapshots();
    const clears=new Set(await tx.clears());
    const ownedById=new Map(owned.map(row=>[row.artifactId,row]));
    const slotByArtifact=new Map(loadouts.map(row=>[row.artifactId,{petId:row.petId,slot:row.slot}]));
    const snapshotByDigest=new Map<string,string>();
    for(const snapshot of snapshots){
      if(!snapshotByDigest.has(snapshot.digest))snapshotByDigest.set(snapshot.digest,snapshot.snapshotId);
    }
    const inventory=owned.map(row=>{
      const definition=artifactDefinition(row.definitionId);
      return {
        artifactId:row.artifactId,definitionId:definition.id,name:definition.name,slot:definition.slot,rank:definition.rank,
        upgradeLevel:row.upgradeLevel,maxUpgradeLevel:MAX_ARTIFACT_LEVEL,
        nextUpgradeCost:nextUpgradeCost(definition,row.upgradeLevel),
        modifiers:effectiveModifiers(definition,row.upgradeLevel),
        equipped:slotByArtifact.get(row.artifactId)??null,
        acquiredFrom:row.acquiredFrom,acquiredMapId:row.acquiredMapId,acquiredAt:row.acquiredAt.toISOString(),
      };
    });
    const petViews=pets.map(pet=>{
      const slots:{[slot in ArtifactSlot]:string|null}={core:null,aegis:null,rune:null};
      const entries:LoadoutEntry[]=[];
      for(const loadout of loadouts.filter(row=>row.petId===pet.petId)){
        const artifact=ownedById.get(loadout.artifactId);
        if(!artifact)throw new Error('Equipped artifact is absent from the inventory');
        const definition=artifactDefinition(artifact.definitionId);
        slots[loadout.slot]=artifact.artifactId;
        entries.push({
          slot:loadout.slot,artifactId:artifact.artifactId,definitionId:definition.id,
          upgradeLevel:artifact.upgradeLevel,modifiers:effectiveModifiers(definition,artifact.upgradeLevel),
        });
      }
      const payload=loadoutSnapshotPayload(pet.petId,pet.level,entries);
      const digest=loadoutDigest(payload);
      return {
        petId:pet.petId,level:pet.level,powerClass:WAVE_A_PET_BY_ID.get(pet.petId)?.presentationPowerClass??null,
        slots,totals:payload.totals,digest,snapshotId:snapshotByDigest.get(digest)??null,
      };
    });
    const claimedMapIds=new Set(claims.map(row=>row.mapId));
    return {
      revision:player.revision,
      materials:player.materials,
      inventory,
      pets:petViews,
      pve:{
        claims:claims.map(row=>{
          const artifact=ownedById.get(row.artifactId);
          if(!artifact)throw new Error('Claimed artifact is absent from the inventory');
          return {
            mapId:row.mapId,artifactId:row.artifactId,definitionId:artifact.definitionId,
            materials:row.materials,claimedAt:row.claimedAt.toISOString(),
          };
        }),
        available:PVE_ARTIFACT_REWARDS.filter(reward=>clears.has(reward.mapId)&&!claimedMapIds.has(reward.mapId))
          .map(reward=>({mapId:reward.mapId,definitionId:reward.definitionId,materials:reward.materials})),
      },
      snapshots:snapshots.map(row=>this.snapshotView(row)),
    };
  }
}
