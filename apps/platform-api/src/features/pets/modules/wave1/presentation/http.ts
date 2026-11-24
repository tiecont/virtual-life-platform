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

export function registerWave1Mvp(
  http:FastifyInstance,
  config:Config,
  identity:IdentityService,
  enabled:boolean,
  now=Date.now,
){
  if(!enabled)return;
  if(config.NODE_ENV==='production')throw new Error('Wave 1 Pet Arena preview is local/test only');
  const limits=new WindowLimiter(now);
  const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
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
      await identity.authenticate(credential);
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
  },{prefix:'/v1'});
}
