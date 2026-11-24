import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {ARTIFACT_SLOTS,PARSED_ARTIFACT_RULES} from '../domain/catalog';
import type {ArtifactService} from '../application/service';

const PetIdSchema=z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const ArtifactIdSchema=z.uuid().transform(value=>value.toLowerCase());
const EquipInputSchema=z.strictObject({requestId:z.uuid(),petId:PetIdSchema,artifactId:ArtifactIdSchema});
const UnequipInputSchema=z.strictObject({requestId:z.uuid(),petId:PetIdSchema,slot:z.enum(ARTIFACT_SLOTS)});
const UpgradeInputSchema=z.strictObject({requestId:z.uuid(),artifactId:ArtifactIdSchema});
const SnapshotInputSchema=z.strictObject({requestId:z.uuid(),petId:PetIdSchema});
const PveClaimInputSchema=z.strictObject({requestId:z.uuid()});
const SnapshotParamsSchema=z.strictObject({snapshotId:ArtifactIdSchema});

// Local/test Wave A artifact routes. They reuse the existing identity session,
// exact-origin and CSRF checks, private no-store responses and requestId
// receipts. The module is default-off; production composition is refused.
export function registerArtifacts(
  http:FastifyInstance,
  config:Config,
  identity:IdentityService,
  artifacts:ArtifactService,
  enabled:boolean,
  now=Date.now,
){
  if(!enabled)return;
  if(config.NODE_ENV==='production')throw new Error('Wave A Artifacts preview is local/test only');
  const limits=new WindowLimiter(now);
  const accounts=new WeakMap<FastifyRequest,string>();
  const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
  const account=(req:FastifyRequest)=>{
    const accountId=accounts.get(req);
    if(!accountId)throw new DomainError('UNAUTHENTICATED',401,'Session expired or unavailable');
    return accountId;
  };
  const write=(req:FastifyRequest)=>{
    const credential=token(req);
    identity.verifyCsrf(credential,req.headers['x-csrf-token']);
    return credential;
  };
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('vary','Cookie');
      if(!limits.take('artifacts-ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.addHook('preHandler',async req=>{
      z.strictObject({}).parse(req.query);
      const credential=token(req);
      const context=await identity.authenticate(credential);
      accounts.set(req,context.accountId);
      if(!limits.take('artifacts-session:'+identity.hash(credential),60))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.get('/pets/artifacts/catalog',()=>PARSED_ARTIFACT_RULES);
    api.get('/pets/artifacts/state',req=>artifacts.readState(account(req)));
    api.get('/pets/artifacts/snapshots/:snapshotId',req=>{
      const {snapshotId}=SnapshotParamsSchema.parse(req.params);
      return artifacts.readSnapshot(account(req),snapshotId);
    });
    api.post('/pets/artifacts/equip',req=>{
      write(req);
      const body=EquipInputSchema.parse(req.body);
      return artifacts.equip(account(req),body.requestId,{petId:body.petId,artifactId:body.artifactId});
    });
    api.post('/pets/artifacts/unequip',req=>{
      write(req);
      const body=UnequipInputSchema.parse(req.body);
      return artifacts.unequip(account(req),body.requestId,{petId:body.petId,slot:body.slot});
    });
    api.post('/pets/artifacts/upgrade',req=>{
      write(req);
      const body=UpgradeInputSchema.parse(req.body);
      return artifacts.upgrade(account(req),body.requestId,{artifactId:body.artifactId});
    });
    api.post('/pets/artifacts/pve/claim',req=>{
      write(req);
      const body=PveClaimInputSchema.parse(req.body);
      return artifacts.claimPveReward(account(req),body.requestId);
    });
    api.post('/pets/artifacts/loadout/snapshot',req=>{
      write(req);
      const body=SnapshotInputSchema.parse(req.body);
      return artifacts.snapshotLoadout(account(req),body.requestId,{petId:body.petId});
    });
  },{prefix:'/v1'});
}
