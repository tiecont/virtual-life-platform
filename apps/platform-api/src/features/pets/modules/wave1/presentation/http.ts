import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {
  campaignNext,
  EvolutionPreviewInputSchema,
  evolutionPreview,
  PARSED_WAVE1_MANIFEST,
} from '../domain/manifest';
import {WAVE1_PETS} from '../domain/catalog';
import type {Wave1Service} from '../application/service';

const PartyInputSchema=z.strictObject({
  requestId:z.uuid(),
  petIds:z.array(z.string().min(1).max(64)).max(8),
});
const CampaignPreviewInputSchema=z.strictObject({
  mapId:z.string().min(1).max(64),
  petId:z.string().min(1).max(64),
  actions:z.array(z.string().min(1).max(16)).max(12),
  bossActions:z.array(z.string().min(1).max(16)).max(12).optional(),
});
const CampaignPlayInputSchema=CampaignPreviewInputSchema.extend({requestId:z.uuid()});
const GachaPullInputSchema=z.strictObject({
  requestId:z.uuid(),
  count:z.union([z.literal(1),z.literal(10)]),
});

export function registerWave1Mvp(
  http:FastifyInstance,
  config:Config,
  identity:IdentityService,
  wave1:Wave1Service,
  enabled:boolean,
  now=Date.now,
){
  if(!enabled)return;
  if(config.NODE_ENV==='production')throw new Error('Wave 1 Pet Arena preview is local/test only');
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
      if(!limits.take('wave1-ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.addHook('preHandler',async req=>{
      z.strictObject({}).parse(req.query);
      const credential=token(req);
      const context=await identity.authenticate(credential);
      accounts.set(req,context.accountId);
      if(!limits.take('wave1-session:'+identity.hash(credential),60))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.get('/pets/wave1/manifest',()=>PARSED_WAVE1_MANIFEST);
    api.post('/pets/wave1/evolution/preview',req=>{
      write(req);
      return evolutionPreview(EvolutionPreviewInputSchema.parse(req.body));
    });
    api.post('/pets/wave1/campaign/next',req=>{
      write(req);
      return campaignNext(req.body);
    });
    api.get('/pets/wave1/gacha',()=>PARSED_WAVE1_MANIFEST.gacha);
    api.get('/pets/wave1/state',req=>wave1.readState(account(req)));
    api.get('/pets/wave1/roster',()=>WAVE1_PETS);
    api.post('/pets/wave1/party',req=>{
      write(req);
      const body=PartyInputSchema.parse(req.body);
      return wave1.setParty(account(req),body.requestId,{petIds:body.petIds});
    });
    api.post('/pets/wave1/campaign/preview',req=>{
      write(req);
      const {mapId,petId,actions,bossActions}=CampaignPreviewInputSchema.parse(req.body);
      return wave1.previewCampaign(account(req),{mapId,petId,actions,...(bossActions?{bossActions}:{})});
    });
    api.post('/pets/wave1/campaign/play',req=>{
      write(req);
      const body=CampaignPlayInputSchema.parse(req.body);
      return wave1.playCampaign(account(req),body.requestId,{
        mapId:body.mapId,petId:body.petId,actions:body.actions,
        ...(body.bossActions?{bossActions:body.bossActions}:{}),
      });
    });
    api.post('/pets/wave1/gacha/pull',req=>{
      write(req);
      const body=GachaPullInputSchema.parse(req.body);
      return wave1.pullGacha(account(req),body.requestId,{count:body.count});
    });
  },{prefix:'/v1'});
}
