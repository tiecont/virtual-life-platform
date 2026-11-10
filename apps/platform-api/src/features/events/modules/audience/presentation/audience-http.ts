import type { FastifyInstance,FastifyRequest } from 'fastify';
import { WorldError } from '@virtual-city/world-sdk';
import { z } from 'zod';
import type { Config } from '../../../../../shared/config/environment';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import type { AudienceService } from '../application/audience';
export function registerAudience(http:FastifyInstance,config:Config,identity:IdentityService,audience:AudienceService,now=Date.now){const limits=new WindowLimiter(now),uuid=z.uuid().transform(value=>value.toLowerCase());const token=(req:FastifyRequest)=>readSessionToken(req,config)!;const write=(req:FastifyRequest)=>{z.strictObject({}).parse(req.query);const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);return value;};const key=(req:FastifyRequest)=>uuid.parse(req.headers['idempotency-key']);
 http.register(async api=>{api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof WorldError?new DomainError(error.code,error.code==='NOT_FOUND'?404:error.code==='FORBIDDEN'?403:503,error.message):error,req,reply));api.addHook('onRequest',async req=>{if(!limits.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait');});api.addHook('preHandler',async req=>{if(!limits.take('session:'+identity.hash(token(req)),60))throw new DomainError('RATE_LIMITED',429,'Please wait');});api.post('/audience/view',req=>audience.read(write(req),req.body));api.post('/audience/send',req=>audience.send(write(req),key(req),req.body));api.post('/audience/control',req=>audience.control(write(req),key(req),req.body));},{prefix:'/v1'});
}
