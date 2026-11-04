import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DatingContinuationRevokeSchema } from '@virtual-city/contracts';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import type { DatingMatching } from './matching';
import type { DatingContinuations } from './continuations';
export function registerDatingContinuations(http:FastifyInstance,config:Config,identity:IdentityService,connections:DatingContinuations,matching:DatingMatching,now=Date.now){const limiter=new WindowLimiter(now),lane=(req:{method:string;routeOptions:{url?:string}})=>req.method==='POST'&&req.routeOptions.url?.endsWith('/revoke')?'negative:':'positive:';http.register(async api=>{api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof DomainError&&error.status===404?new DomainError('NOT_AVAILABLE',404,'This private connection is unavailable'):error,req,reply));api.addHook('onRequest',async req=>{if(!limiter.take(lane(req)+'ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait');});api.addHook('preHandler',async req=>{z.strictObject({}).parse(req.query);const token=readSessionToken(req,config)!;if(!limiter.take(lane(req)+'session:'+identity.hash(token),60))throw new DomainError('RATE_LIMITED',429,'Please wait');});
 const write=(req:Parameters<typeof readSessionToken>[0])=>{const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);return token;},key=(req:Parameters<typeof readSessionToken>[0])=>z.uuid().parse(req.headers['idempotency-key']).toLowerCase(),id=(params:unknown)=>z.strictObject({id:z.uuid().transform(value=>value.toLowerCase())}).parse(params).id;
 api.get('/dating/continuations',req=>connections.list(readSessionToken(req,config)!));api.get('/dating/continuations/:id',req=>connections.read(readSessionToken(req,config)!,id(req.params)));api.post('/dating/continuations/:id/like',req=>connections.like(write(req),id(req.params),key(req),req.body));api.post('/dating/continuations/:id/queue',req=>matching.joinContinuation(write(req),id(req.params),key(req),req.body));api.post('/dating/continuation/revoke',req=>{DatingContinuationRevokeSchema.parse(req.body);return connections.revoke(write(req),key(req));});api.post('/dating/continuations/:id/revoke',req=>{DatingContinuationRevokeSchema.parse(req.body);return connections.revoke(write(req),key(req),id(req.params));});
 },{prefix:'/v1'});}
