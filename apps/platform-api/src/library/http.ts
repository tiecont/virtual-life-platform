import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorldError } from '@virtual-city/world-sdk';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { apiErrorHandler } from '../common/http-errors';
import { DomainError } from '../common/errors';
import type { LibraryStudyService } from './study';
export function registerStudy(http:FastifyInstance,config:Config,identity:IdentityService,study:LibraryStudyService,now=Date.now){
 const limits=new WindowLimiter(now),token=(req:FastifyRequest)=>readSessionToken(req,config)!,empty=(req:FastifyRequest)=>z.strictObject({}).parse(req.query);
 const write=(req:FastifyRequest)=>{const credential=token(req);identity.verifyCsrf(credential,req.headers['x-csrf-token']);return credential;};
 http.register(async api=>{api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof WorldError?new DomainError(error.code,error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:503,'Study progress unavailable'):error,req,reply));
  api.addHook('onRequest',async req=>{if(!limits.take('ip:'+req.ip,120))throw new DomainError('RATE_LIMITED',429,'Please wait before refreshing study progress');});
  api.addHook('preHandler',async req=>{if(!limits.take('session:'+identity.hash(token(req)),60))throw new DomainError('RATE_LIMITED',429,'Please wait before refreshing study progress');});
  api.get('/library/study-sharing',req=>{empty(req);return study.state(token(req));});
  // Read-only POST keeps private membership context out of URLs and logs.
  api.post('/library/study-view',req=>{empty(req);return study.view(write(req),req.body);});
  api.post('/library/study-sharing',req=>{empty(req);return study.change(write(req),z.uuid().parse(req.headers['idempotency-key']),req.body);});
 },{prefix:'/v1'});
}
