import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ProgressionClaimFocusSchema } from '@virtual-city/contracts';
import type { IdentityService } from '../identity/service';
import type { Config } from '../config';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import type { ProgressionService } from './service';
import type { AppearanceService } from './appearance';
export function registerProgression(http:FastifyInstance,config:Config,identity:IdentityService,service:ProgressionService,appearance:AppearanceService,now=Date.now) {
  const limiter=new WindowLimiter(now),token=(req:FastifyRequest)=>readSessionToken(req,config)!;
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async req=>{if(!limiter.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');});
    api.addHook('preHandler',async req=>{if(!limiter.take('session:'+identity.hash(token(req)),60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');z.strictObject({}).parse(req.query);});
    api.get('/me/progression',req=>service.own(token(req)));
    api.get('/me/cosmetics',req=>service.inventory(token(req)));
    api.post('/me/appearance',req=>{const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);return appearance.equip(value,z.uuid().parse(req.headers['idempotency-key']),req.body);});
    api.post('/me/progression/claim-focus',req=>{const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);const input=ProgressionClaimFocusSchema.parse(req.body);return service.claimFocus(value,input.focusId);});
  },{prefix:'/v1'});
}
