import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../../config';
import { DomainError } from '../../common/errors';
import { apiErrorHandler } from '../../common/http-errors';
import { readSessionToken } from '../http';
import type { IdentityService } from '../service';
import { WindowLimiter } from '../limits';
import type { DeadlineIdentityLinks } from './service';
export function registerDeadlineIdentity(http:FastifyInstance,config:Config,identity:IdentityService,links:DeadlineIdentityLinks,now=Date.now){
 const limits=new WindowLimiter(now),key=z.uuid();const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
 const write=(req:FastifyRequest)=>{z.strictObject({}).parse(req.query);const current=token(req);identity.verifyCsrf(current,req.headers['x-csrf-token']);return current;};
 http.register(async api=>{api.setErrorHandler(apiErrorHandler);api.addHook('onRequest',async req=>{if(!limits.take('http:'+req.ip,120))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');});
  api.get('/me/legacy/deadline',req=>{z.strictObject({}).parse(req.query);return links.view(token(req));});
  api.post('/me/legacy/deadline',req=>{const current=write(req),parts=(req.headers.cookie??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('deadline_session='));if(parts.length!==1||!/^[A-Za-z0-9_-]{43}$/.test(parts[0].slice(17)))throw new DomainError('UNAUTHENTICATED',401,'An existing Deadline guest session is required');return links.link(current,parts[0].slice(17),key.parse(req.headers['idempotency-key']),req.body);});
  api.delete('/me/legacy/deadline',req=>links.unlink(write(req),key.parse(req.headers['idempotency-key']),req.body));
 },{prefix:'/v1'});
}
