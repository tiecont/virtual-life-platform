import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DatingMatchStopSchema } from '@virtual-city/contracts';
import type { Config } from '../../../../../shared/config/environment';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import type { DatingMatching } from '../application/matching';
export function registerDatingMatching(http:FastifyInstance,config:Config,identity:IdentityService,matching:DatingMatching,now=Date.now){const limiter=new WindowLimiter(now);http.register(async api=>{api.setErrorHandler(apiErrorHandler);api.addHook('onRequest',async req=>{if(!limiter.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait');});api.addHook('preHandler',async req=>{z.strictObject({}).parse(req.query);const token=readSessionToken(req,config)!;if(!limiter.take('session:'+identity.hash(token),60))throw new DomainError('RATE_LIMITED',429,'Please wait');});
 const write=(req:Parameters<typeof readSessionToken>[0])=>{const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);return token;};const key=(req:Parameters<typeof readSessionToken>[0])=>z.uuid().parse(req.headers['idempotency-key']).toLowerCase();
 api.get('/dating/matching',req=>matching.read(readSessionToken(req,config)!));api.post('/dating/queue',req=>matching.join(write(req),key(req),req.body));api.post('/dating/stop',req=>{DatingMatchStopSchema.parse(req.body);return matching.negative(write(req),key(req));});
 const id=(params:unknown)=>z.strictObject({id:z.uuid().transform(value=>value.toLowerCase())}).parse(params).id;
 api.post('/dating/proposals/:id/accept',req=>matching.accept(write(req),id(req.params),key(req),req.body));api.post('/dating/proposals/:id/decline',req=>{DatingMatchStopSchema.parse(req.body);return matching.negative(write(req),key(req),id(req.params));});
 },{prefix:'/v1'});}
