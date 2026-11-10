import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DatingProfileWithdrawSchema } from '@virtual-city/contracts';
import type { Config } from '../../../../../shared/config/environment';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import type { DatingProfiles } from '../application/profiles';
export function registerDatingProfiles(http:FastifyInstance,config:Config,identity:IdentityService,profiles:DatingProfiles,now=Date.now){const limiter=new WindowLimiter(now);http.register(async api=>{api.setErrorHandler(apiErrorHandler);api.addHook('onRequest',async req=>{if(!limiter.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait');});api.addHook('preHandler',async req=>{z.strictObject({}).parse(req.query);const token=readSessionToken(req,config)!;if(!limiter.take('session:'+identity.hash(token),60))throw new DomainError('RATE_LIMITED',429,'Please wait');});
 api.get('/dating/profile',req=>profiles.read(readSessionToken(req,config)!));api.post('/dating/profile',req=>{const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);return profiles.save(token,z.uuid().parse(req.headers['idempotency-key']),req.body);});api.post('/dating/profile/withdraw',req=>{const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);DatingProfileWithdrawSchema.parse(req.body);return profiles.withdraw(token,z.uuid().parse(req.headers['idempotency-key']));});
 },{prefix:'/v1'});}
