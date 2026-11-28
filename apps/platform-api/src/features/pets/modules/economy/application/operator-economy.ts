import {
  EconomyPolicyMutationResultSchema,
  EconomyPolicyPublishSchema,
  EconomyPolicyRollbackSchema,
} from '@aetheria/contracts';
import {DomainError} from '../../../../../shared/common/errors';
import type {OperatorService} from '../../../../identity/modules/operators/application/operator-service';
import {EconomyPolicyStore,policyValuesOf} from '../infrastructure/policy-store';

const missing=()=>new DomainError('NOT_FOUND',404,'Economy policy authority is unavailable');
const conflict=(message:string)=>new DomainError('REQUEST_CONFLICT',409,message);

export class OperatorEconomyPolicy{
  constructor(
    private readonly store:EconomyPolicyStore,
    private readonly operator:OperatorService,
  ){}

  async overview(token:string){
    return this.operator.controlRead(token,tx=>this.store.overview(tx));
  }

  async audit(token:string){
    return this.operator.controlRead(token,tx=>this.store.audit(tx,50));
  }

  async publish(token:string,csrf:unknown,input:unknown){
    const value=EconomyPolicyPublishSchema.parse(input);
    return this.operator.controlWrite(token,csrf,async(tx,actor,seal)=>{
      const fingerprint=seal('economy-policy-request',{actor,action:'publish',requestId:value.requestId});
      const payloadSha256=seal('economy-policy-payload',{
        action:'publish',
        expectedActiveRevision:value.expectedActiveRevision,
        reason:value.reason,
        policy:value.policy,
      });
      const replay=await this.store.replayByFingerprint(tx,fingerprint);
      if(replay){
        if(replay.payload_sha256!==payloadSha256)throw conflict('Request key was used with different input');
        return EconomyPolicyMutationResultSchema.parse(replay.result);
      }
      const active=await this.store.activeRow(tx,true);
      const currentRevision=active?.revision??0;
      if(currentRevision!==value.expectedActiveRevision){
        throw conflict('Active economy policy changed; refresh before publishing');
      }
      const version=await this.store.nextVersion(tx);
      const created=await this.store.insertVersion(tx,{
        version,
        policy:value.policy,
        reason:value.reason,
        actor,
      });
      const activeRevision=await this.store.setActive(tx,{
        version,
        expectedRevision:currentRevision,
        actor,
      });
      if(activeRevision===undefined)throw conflict('Active economy policy changed; refresh before publishing');
      const result=EconomyPolicyMutationResultSchema.parse({
        schemaVersion:1,
        version,
        activeRevision,
        active:created,
      });
      await this.store.appendAudit(tx,{
        version,
        action:'publish',
        actor,
        fingerprint,
        payloadSha256,
        reason:value.reason,
        beforeVersion:active?.version??null,
        afterVersion:version,
        snapshot:value.policy,
        result,
        seal,
      });
      return result;
    });
  }

  async rollback(token:string,csrf:unknown,input:unknown){
    const value=EconomyPolicyRollbackSchema.parse(input);
    return this.operator.controlWrite(token,csrf,async(tx,actor,seal)=>{
      const fingerprint=seal('economy-policy-request',{actor,action:'rollback',requestId:value.requestId});
      const payloadSha256=seal('economy-policy-payload',{
        action:'rollback',
        version:value.version,
        expectedActiveRevision:value.expectedActiveRevision,
        reason:value.reason,
      });
      const replay=await this.store.replayByFingerprint(tx,fingerprint);
      if(replay){
        if(replay.payload_sha256!==payloadSha256)throw conflict('Request key was used with different input');
        return EconomyPolicyMutationResultSchema.parse(replay.result);
      }
      const target=await this.store.readVersion(tx,value.version);
      if(!target)throw missing();
      const active=await this.store.activeRow(tx,true);
      if(!active)throw missing();
      if(active.revision!==value.expectedActiveRevision){
        throw conflict('Active economy policy changed; refresh before rolling back');
      }
      if(active.version===target.version){
        throw conflict('Requested economy policy version is already active');
      }
      const activeRevision=await this.store.setActive(tx,{
        version:target.version,
        expectedRevision:active.revision,
        actor,
      });
      if(activeRevision===undefined)throw conflict('Active economy policy changed; refresh before rolling back');
      const result=EconomyPolicyMutationResultSchema.parse({
        schemaVersion:1,
        version:target.version,
        activeRevision,
        active:target,
      });
      await this.store.appendAudit(tx,{
        version:target.version,
        action:'rollback',
        actor,
        fingerprint,
        payloadSha256,
        reason:value.reason,
        beforeVersion:active.version,
        afterVersion:target.version,
        snapshot:policyValuesOf(target),
        result,
        seal,
      });
      return result;
    });
  }
}
