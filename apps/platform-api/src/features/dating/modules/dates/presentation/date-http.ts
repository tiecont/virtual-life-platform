import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DatingMatchStopSchema } from '@virtual-city/contracts';
import type { Config } from '../../../../../shared/config/environment';
import type { IdentityService } from '../../../../identity/modules/accounts/application/service';
import { readSessionToken } from '../../../../identity/modules/accounts/presentation/http';
import { WindowLimiter } from '../../../../identity/modules/accounts/domain/limits';
import { DomainError } from '../../../../../shared/common/errors';
import { apiErrorHandler } from '../../../../../shared/common/http-errors';
import type { DatingDates } from '../application/dates';
import type { DatingMatching } from '../../matching/application/matching';
export function registerDatingDates(http:FastifyInstance,config:Config,identity:IdentityService,dates:DatingDates,matching:DatingMatching,now=Date.now){const limiter=new WindowLimiter(now);const lane=(req:{method:string;routeOptions:{url?:string}})=>req.method==='POST'&&['/v1/dating/date/leave','/v1/dating/dates/:id/block'].includes(req.routeOptions.url??'')?'negative:':'positive:';http.register(async api=>{api.setErrorHandler(apiErrorHandler);api.addHook('onRequest',async req=>{if(!limiter.take(lane(req)+'ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait');});api.addHook('preHandler',async req=>{z.strictObject({}).parse(req.query);const token=readSessionToken(req,config)!;if(!limiter.take(lane(req)+'session:'+identity.hash(token),60))throw new DomainError('RATE_LIMITED',429,'Please wait');});
 const write=(req:Parameters<typeof readSessionToken>[0])=>{const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);return token;},key=(req:Parameters<typeof readSessionToken>[0])=>z.uuid().parse(req.headers['idempotency-key']).toLowerCase(),id=(params:unknown)=>z.strictObject({id:z.uuid().transform(value=>value.toLowerCase())}).parse(params).id;
 api.get('/dating/dates/:id',req=>dates.read(readSessionToken(req,config)!,id(req.params)));api.post('/dating/dates/:id/enter',req=>dates.enter(write(req),id(req.params),key(req),req.body));api.post('/dating/dates/:id/chat',req=>dates.send(write(req),id(req.params),key(req),req.body));api.post('/dating/dates/:id/block',req=>{DatingMatchStopSchema.parse(req.body);return dates.block(write(req),id(req.params),key(req));});api.post('/dating/date/leave',req=>{DatingMatchStopSchema.parse(req.body);return matching.negative(write(req),key(req));});
 },{prefix:'/v1'});}
