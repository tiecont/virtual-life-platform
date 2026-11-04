import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorldError } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { apiErrorHandler } from '../common/http-errors';
import { DomainError } from '../common/errors';
import type { StageService } from './stage';
export function registerStage(http:FastifyInstance,config:Config,identity:IdentityService,stage:StageService,now=Date.now){
 const limits=new WindowLimiter(now),uuid=z.uuid().transform(value=>value.toLowerCase());
 const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
 const key=(req:FastifyRequest)=>uuid.parse(req.headers['idempotency-key']);
 const id=(req:FastifyRequest)=>z.strictObject({id:uuid}).parse(req.params).id;
 const empty=(req:FastifyRequest)=>z.strictObject({}).parse(req.query);
 const write=(req:FastifyRequest)=>{empty(req);const value=token(req);identity.verifyCsrf(value,req.headers['x-csrf-token']);return value;};
 http.register(async api=>{
  api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof WorldError?new DomainError(error.code,error.code==='NOT_FOUND'?404:error.code==='FORBIDDEN'?403:503,error.message):error,req,reply));
  api.addHook('onRequest',async req=>{if(!limits.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');});
  api.addHook('preHandler',async req=>{if(!limits.take('session:'+identity.hash(token(req)),60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');});
  api.get('/stage/me',req=>{empty(req);return stage.own(token(req));});
  api.post('/stage/view',req=>stage.viewStage(write(req),req.body));
  api.post('/stage/queue',async(req,reply)=>reply.code(201).send(await stage.join(write(req),key(req),req.body)));
  api.post('/stage/offer',req=>stage.offer(write(req),key(req),req.body));
  api.post('/stage/slots/:id/accept',req=>stage.accept(write(req),id(req),key(req),req.body));
  for(const operation of ['withdraw','revoke'] as const)api.post('/stage/slots/:id/'+operation,req=>stage.end(write(req),id(req),key(req),operation,req.body));
  api.post('/stage/stop',req=>{z.strictObject({schemaVersion:z.literal(1)}).parse(req.body);return stage.stop(write(req),key(req));});
 },{prefix:'/v1'});
}
