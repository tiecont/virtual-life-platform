import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ProgressionClaimFocusSchema } from '@virtual-city/contracts';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import type { Config } from '../../../../../shared/config/environment';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import type { ProgressionService } from '../application/service';
import type { AppearanceService } from '../application/appearance';
import type {AvatarPartsService} from '../application/avatar-parts';
export function registerProgression(http:FastifyInstance,config:Config,identity:IdentityService,service:ProgressionService,appearance:AppearanceService,now=Date.now,avatar?:AvatarPartsService) {
  const limiter=new WindowLimiter(now),token=(req:FastifyRequest)=>readSessionToken(req,config)!;
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async req=>{if(!limiter.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');});
    api.addHook('preHandler',async req=>{if(!limiter.take('session:'+identity.hash(token(req)),60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');z.strictObject({}).parse(req.query);});
    api.get('/me/progression',req=>service.own(token(req)));
    api.get('/me/cosmetics',req=>service.inventory(token(req)));
    if(avatar){api.get('/me/avatar',req=>avatar.own(token(req)));api.post('/me/avatar',req=>{const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);return avatar.save(value,req.headers['idempotency-key'],req.body);});}
    api.post('/me/appearance',req=>{const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);return appearance.equip(value,z.uuid().parse(req.headers['idempotency-key']),req.body);});
    api.post('/me/progression/claim-focus',req=>{const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);const input=ProgressionClaimFocusSchema.parse(req.body);return service.claimFocus(value,input.focusId);});
  },{prefix:'/v1'});
}
