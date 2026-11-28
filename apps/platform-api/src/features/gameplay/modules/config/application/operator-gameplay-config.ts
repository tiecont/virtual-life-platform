import {
 GameplayConfigAuditSchema,GameplayConfigCreateSchema,GameplayConfigMutationSchema,GameplayConfigOverviewSchema,
 GameplayConfigPublishResultSchema,GameplayConfigPublishSchema,GameplayConfigRollbackResultSchema,
 GameplayConfigRollbackSchema,GameplayConfigUpdateSchema,GameplayConfigValidateSchema,GameplayConfigValidationSchema,
 GameplayConfigVersionSchema,GameplayConfigVersionViewSchema,GameplaySimulationComparisonSchema,GameplaySimulationReportSchema,GameplaySimulationRequestSchema,
 gameplayEngineBinding,type GameplayBundle,type GameplayRuleset,
} from '@aetheria/contracts';
import type {PoolClient} from 'pg';
import {canonicalCatalogReference,developmentCatalogReference} from '../../../../pets/modules/wave1/application/service';
import type {OperatorService} from '../../../../identity/modules/operators/application/operator-service';
import {DomainError} from '../../../../../shared/common/errors';
import {GameplayConfigStore,type GameplayVersion,type GameplayVersionSummary} from '../infrastructure/version-store';
import {GameplayValidatorUnavailableError,InvalidGameplayBundleError,type GameplayBundleValidator} from '../infrastructure/engine-validator';
import {GameplaySimulationError,type GameplaySimulator} from '../infrastructure/engine-simulator';

const missing=()=>new DomainError('NOT_FOUND',404,'Gameplay configuration version not found');
const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);
const invalid=()=>new DomainError('INVALID_REQUEST',422,'The engine rejected this gameplay configuration');
const unavailable=()=>new DomainError('NOT_AVAILABLE',503,'Gameplay configuration validation is unavailable');
const simulationUnavailable=()=>new DomainError('NOT_AVAILABLE',503,'Gameplay simulation is unavailable');
const iso=(value:Date|null)=>value?value.toISOString():null;
const summary=(row:GameplayVersionSummary)=>GameplayConfigVersionSchema.parse({
 ...row,createdAt:row.createdAt.toISOString(),validatedAt:iso(row.validatedAt),publishedAt:iso(row.publishedAt),
});
const view=(row:GameplayVersion)=>GameplayConfigVersionViewSchema.parse({
 ...row,createdAt:row.createdAt.toISOString(),validatedAt:iso(row.validatedAt),publishedAt:iso(row.publishedAt),
 ...(row.bundle.schemaVersion!==1&&gameplayEngineBinding(row.bundle.schemaVersion)?{catalogReference:row.bundle.schemaVersion===6?developmentCatalogReference:canonicalCatalogReference}:{}),
});

// Operator-facing gameplay configuration lifecycle. Drafts, engine validation,
// atomic publication, rollback and audit all commit in one operator transaction.
export class OperatorGameplayConfig{
 constructor(
  private readonly store:GameplayConfigStore,
  private readonly operator:OperatorService|undefined,
  private readonly validator:GameplayBundleValidator|undefined,
  private readonly simulator?:GameplaySimulator,
 ){}
 private assertSupported(){if(!this.operator)throw missing();}

 async overview(token:string,ruleset:GameplayRuleset){
  this.assertSupported();
  return this.operator!.controlRead(token,async tx=>{
   const [versions,active]=await Promise.all([this.store.list(tx,ruleset,200),this.store.active(tx,ruleset)]);
   let activeView=null;
   if(active){
    const released=await this.store.read(tx,ruleset,active.version);
    if(!released||!released.publishedAt||!released.contentDigest||!released.engineCapability)throw new Error('Active gameplay configuration is inconsistent');
    activeView={version:released.version,revision:active.revision,state:released.state,contentDigest:released.contentDigest,engineCapability:released.engineCapability,publishedAt:released.publishedAt.toISOString(),updatedBy:active.updatedBy,updatedAt:active.updatedAt.toISOString()};
   }
   return GameplayConfigOverviewSchema.parse({ruleset,active:activeView,versions:versions.map(summary)});
  });
 }
 async version(token:string,ruleset:GameplayRuleset,version:number){
  this.assertSupported();
  return this.operator!.controlRead(token,async tx=>{
   const row=await this.store.read(tx,ruleset,version);
   if(!row)throw missing();
   return view(row);
  });
 }
 async audit(token:string,ruleset:GameplayRuleset){
  this.assertSupported();
  return this.operator!.controlRead(token,async tx=>GameplayConfigAuditSchema.parse({events:(await this.store.audit(tx,ruleset,50)).map(row=>({...row,occurredAt:row.occurredAt.toISOString()}))}));
 }
 async createDraft(token:string,csrf:unknown,input:unknown){
  this.assertSupported();
  const value=GameplayConfigCreateSchema.parse(input);
  return this.operator!.controlWrite(token,csrf,async(tx,actor,seal)=>{
   const fingerprint=seal('gameplay-config-request',{actor,action:'create',requestId:value.requestId});
   const replay=await this.replay(tx,fingerprint,'create');
   if(replay)return GameplayConfigMutationSchema.parse(replay);
   if(value.parentVersion!==null){
    const parent=await this.store.read(tx,value.ruleset,value.parentVersion);
    if(!parent)throw missing();
   }
   const version=await this.store.nextVersion(tx,value.ruleset);
   const created=await this.store.insertDraft(tx,{ruleset:value.ruleset,version,parentVersion:value.parentVersion,bundle:value.bundle,actor});
   const result=GameplayConfigMutationSchema.parse({ruleset:created.ruleset,version:created.version,revision:created.revision});
   await this.store.appendEvent(tx,{ruleset:value.ruleset,version,action:'create',actor,fingerprint,fromState:null,toState:'DRAFT',detail:{result},seal});
   return result;
  });
 }
 async updateDraft(token:string,csrf:unknown,input:unknown){
  this.assertSupported();
  const value=GameplayConfigUpdateSchema.parse(input);
  return this.operator!.controlWrite(token,csrf,async(tx,actor,seal)=>{
   const fingerprint=seal('gameplay-config-request',{actor,action:'update',requestId:value.requestId});
   const replay=await this.replay(tx,fingerprint,'update');
   if(replay)return GameplayConfigMutationSchema.parse(replay);
   const current=await this.store.readForUpdate(tx,value.ruleset,value.version);
   if(!current)throw missing();
   if(current.revision!==value.expectedRevision)throw conflict('Gameplay configuration changed; refresh before editing');
   if(!['DRAFT','VALIDATED'].includes(current.state))throw conflict('Published gameplay configuration is immutable; create a new draft');
   const updated=await this.store.updateDraft(tx,{ruleset:value.ruleset,version:value.version,expectedRevision:value.expectedRevision,bundle:value.bundle,actor});
   if(!updated)throw conflict('Gameplay configuration changed; refresh before editing');
   const result=GameplayConfigMutationSchema.parse({ruleset:updated.ruleset,version:updated.version,revision:updated.revision});
   await this.store.appendEvent(tx,{ruleset:value.ruleset,version:value.version,action:'update',actor,fingerprint,fromState:current.state,toState:'DRAFT',detail:{result},seal});
   return result;
  });
 }
 async validate(token:string,csrf:unknown,input:unknown){
  this.assertSupported();
  const value=GameplayConfigValidateSchema.parse(input);
  const candidate=await this.operator!.controlRead(token,async tx=>this.store.read(tx,value.ruleset,value.version));
  if(!candidate)throw missing();
  if(candidate.state!=='DRAFT')throw conflict('Only a draft can be validated');
  if(candidate.revision!==value.expectedRevision)throw conflict('Gameplay configuration changed; refresh before validating');
  const verdict=await this.verify(value.ruleset,candidate.bundle);
  return this.operator!.controlWrite(token,csrf,async(tx,actor,seal)=>{
   const fingerprint=seal('gameplay-config-request',{actor,action:'validate',requestId:value.requestId});
   const replay=await this.replay(tx,fingerprint,'validate');
   if(replay)return GameplayConfigValidationSchema.parse(replay);
   const current=await this.store.readForUpdate(tx,value.ruleset,value.version);
   if(!current)throw missing();
   if(current.state!=='DRAFT'||current.revision!==value.expectedRevision)throw conflict('Gameplay configuration changed; refresh before validating');
   const updated=await this.store.markValidated(tx,{ruleset:value.ruleset,version:value.version,expectedRevision:value.expectedRevision,digest:verdict.digest,engineCapability:verdict.engineCapability,actor});
   if(!updated||!updated.validatedAt)throw conflict('Gameplay configuration changed; refresh before validating');
   const result=GameplayConfigValidationSchema.parse({ruleset:value.ruleset,version:value.version,revision:updated.revision,contentDigest:verdict.digest,engineCapability:verdict.engineCapability,validatedAt:updated.validatedAt.toISOString()});
   await this.store.appendEvent(tx,{ruleset:value.ruleset,version:value.version,action:'validate',actor,fingerprint,fromState:'DRAFT',toState:'VALIDATED',detail:{result},seal});
   return result;
  });
 }
 async publish(token:string,csrf:unknown,input:unknown){
  this.assertSupported();
  const value=GameplayConfigPublishSchema.parse(input);
  const candidate=await this.operator!.controlRead(token,async tx=>{
   const row=await this.store.read(tx,value.ruleset,value.version),active=await this.store.active(tx,value.ruleset);
   return {row,activeRevision:active?.revision??null};
  });
  if(!candidate.row)throw missing();
  if(candidate.row.state!=='VALIDATED')throw conflict('Only an engine-validated configuration can be published');
  if(candidate.row.revision!==value.expectedRevision)throw conflict('Gameplay configuration changed; refresh before publishing');
  if(candidate.activeRevision!==value.expectedActiveRevision)throw conflict('Active gameplay configuration changed; refresh before publishing');
  const verdict=await this.verify(value.ruleset,candidate.row.bundle);
  if(verdict.digest!==candidate.row.contentDigest||verdict.engineCapability!==candidate.row.engineCapability)throw conflict('Gameplay configuration no longer validates under the current engine');
  return this.operator!.controlWrite(token,csrf,async(tx,actor,seal)=>{
   const fingerprint=seal('gameplay-config-request',{actor,action:'publish',requestId:value.requestId});
   const replay=await this.replay(tx,fingerprint,'publish');
   if(replay)return GameplayConfigPublishResultSchema.parse(replay);
   const current=await this.store.readForUpdate(tx,value.ruleset,value.version);
   if(!current)throw missing();
   if(current.state!=='VALIDATED'||current.revision!==value.expectedRevision)throw conflict('Gameplay configuration changed; refresh before publishing');
   const active=await this.store.active(tx,value.ruleset,true);
   if((active?.revision??null)!==value.expectedActiveRevision)throw conflict('Active gameplay configuration changed; refresh before publishing');
   if(active&&active.version!==current.version)await this.store.supersede(tx,{ruleset:value.ruleset,version:active.version,actor});
   const released=await this.store.markPublished(tx,{ruleset:value.ruleset,version:value.version,expectedRevision:current.revision,actor});
   if(!released||!released.publishedAt)throw conflict('Gameplay configuration changed; refresh before publishing');
   const activeRevision=await this.store.setActive(tx,{ruleset:value.ruleset,version:value.version,expectedRevision:active?.revision??null,actor});
   if(activeRevision===undefined)throw conflict('Active gameplay configuration changed; refresh before publishing');
   const result=GameplayConfigPublishResultSchema.parse({ruleset:value.ruleset,version:value.version,contentDigest:released.contentDigest,engineCapability:released.engineCapability,publishedAt:released.publishedAt.toISOString(),activeRevision});
   await this.store.appendEvent(tx,{ruleset:value.ruleset,version:value.version,action:'publish',actor,fingerprint,fromState:'VALIDATED',toState:'PUBLISHED',detail:{result,previousVersion:active?.version??null},seal});
   return result;
  });
 }
 async rollback(token:string,csrf:unknown,input:unknown){
  this.assertSupported();
  const value=GameplayConfigRollbackSchema.parse(input);
  return this.operator!.controlWrite(token,csrf,async(tx,actor,seal)=>{
   const fingerprint=seal('gameplay-config-request',{actor,action:'rollback',requestId:value.requestId});
   const replay=await this.replay(tx,fingerprint,'rollback');
   if(replay)return GameplayConfigRollbackResultSchema.parse(replay);
   const target=await this.store.read(tx,value.ruleset,value.version);
   if(!target)throw missing();
   if(!target.publishedAt||!['PUBLISHED','SUPERSEDED'].includes(target.state))throw conflict('Only a previously published configuration can be restored');
   const verdict=await this.verify(value.ruleset,target.bundle);
   if(verdict.digest!==target.contentDigest||verdict.engineCapability!==target.engineCapability)
    throw conflict('Gameplay configuration no longer validates under the current engine');
   const active=await this.store.active(tx,value.ruleset,true);
   if(!active)throw conflict('No active gameplay configuration to roll back');
   if(active.revision!==value.expectedActiveRevision)throw conflict('Active gameplay configuration changed; refresh before rolling back');
   if(active.version===target.version)throw conflict('Requested configuration is already active');
   const activeRevision=await this.store.setActive(tx,{ruleset:value.ruleset,version:target.version,expectedRevision:active.revision,actor});
   if(activeRevision===undefined)throw conflict('Active gameplay configuration changed; refresh before rolling back');
   const result=GameplayConfigRollbackResultSchema.parse({ruleset:value.ruleset,version:target.version,contentDigest:target.contentDigest,publishedAt:target.publishedAt.toISOString(),activeRevision});
   await this.store.appendEvent(tx,{ruleset:value.ruleset,version:target.version,action:'rollback',actor,fingerprint,fromState:null,toState:target.state,detail:{result,replacedVersion:active.version},seal});
   return result;
  });
 }
 async simulate(token:string,csrf:unknown,input:unknown,signal?:AbortSignal){
  this.assertSupported();
  const value=GameplaySimulationRequestSchema.parse(input);
  if(!this.simulator)throw simulationUnavailable();
  const row=await this.operator!.controlWrite(token,csrf,async tx=>this.store.read(tx,value.ruleset,value.version));
  if(!row)throw missing();
  if(!['DRAFT','VALIDATED','PUBLISHED','SUPERSEDED'].includes(row.state))throw conflict('Retired gameplay configuration cannot be simulated');
  const metadata={ruleset:value.ruleset,version:value.version};
  try{
   if('bossIds' in value){
    const reports=await this.simulator.compare(row.bundle,value.bossIds,value.seeds,signal,...(value.party?[value.party]:[]));
    return GameplaySimulationComparisonSchema.parse({...metadata,seeds:value.seeds,reports});
   }
   const report=await this.simulator.simulate(row.bundle,value.policy,value.seeds,value.bossId,signal,...(value.party?[value.party]:[]));
   return GameplaySimulationReportSchema.parse({...metadata,...report});
  }catch(error){
   if(error instanceof GameplaySimulationError)throw new DomainError('INVALID_REQUEST',422,'The engine rejected the gameplay configuration or encounter');
   throw simulationUnavailable();
  }
 }
 private async replay(tx:PoolClient,fingerprint:string,_action:string):Promise<Record<string,unknown>|undefined>{
  const prior=await this.store.eventByFingerprint(tx,fingerprint);
  if(!prior)return undefined;
  if(typeof prior.detail.result!=='object'||prior.detail.result===null)throw conflict('Gameplay configuration request cannot be replayed');
  return prior.detail.result as Record<string,unknown>;
 }
 private async verify(ruleset:GameplayRuleset,bundle:GameplayBundle){
  if(!this.validator)throw unavailable();
  try{return await this.validator.validate(ruleset,bundle);}
  catch(error){
   if(error instanceof InvalidGameplayBundleError)throw invalid();
   if(error instanceof GameplayValidatorUnavailableError)throw unavailable();
   throw unavailable();
  }
 }
}
