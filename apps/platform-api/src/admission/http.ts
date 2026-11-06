import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {AdmissionQueueCommandSchema} from '@virtual-city/contracts';
import type {Config} from '../config';
import type {IdentityService} from '../identity/service';
import {readSessionToken} from '../identity/http';
import {WindowLimiter} from '../identity/limits';
import {apiErrorHandler} from '../common/http-errors';
import {DomainError} from '../common/errors';
import type {AdmissionStore} from './store';

/** Explicit preview composition only until room lifecycle/capacity activation gates. */
export function registerAdmissionQueue(http:FastifyInstance,config:Config,identity:IdentityService,store:AdmissionStore,now=Date.now){
 const limits=new WindowLimiter(now),limited=()=>new DomainError('RATE_LIMITED',429,'Please wait before checking your place again');
 function token(req:FastifyRequest){const credential=readSessionToken(req,config)!;if(!limits.take('own:'+identity.hash(credential),30))throw limited();return credential;}
 http.register(async api=>{
  api.setErrorHandler(apiErrorHandler);
  api.addHook('onRequest',async(req,reply)=>{reply.header('cache-control','no-store');if(!limits.take('ip:'+req.ip,300))throw limited();z.strictObject({}).parse(req.query);});
  api.get('/admission',req=>store.queueView(token(req)));
  api.post('/admission',async req=>{
   if(req.headers.origin!==config.WEB_ORIGIN)throw new DomainError('FORBIDDEN',403,'Origin is not allowed');
   const credential=token(req);identity.verifyCsrf(credential,req.headers['x-csrf-token']);
   const input=AdmissionQueueCommandSchema.parse(req.body);
   if(input.action==='reconnect')await store.reconnect(credential,input.id,input.expectedVersion,input.requestId);
   else await store.command(credential,input);
   return {...await store.queueView(credential),requestId:input.requestId};
  });
 },{prefix:'/v1'});
}
