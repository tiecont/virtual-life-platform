import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Config} from '../config';
import type {IdentityService} from '../identity/service';
import {readSessionToken} from '../identity/http';
import {WindowLimiter} from '../identity/limits';
import {RuntimeTicketError,type RuntimeTicketIssuer,type RuntimeScope} from '../identity/runtime-tickets';
import {DomainError} from '../common/errors';
import {apiErrorHandler} from '../common/http-errors';

// Host-only opt-in composition. The target is fixed by the trusted host; clients
// cannot register worlds, choose authority, allocate membership or mutate games.
export function registerRuntimeGateway(http:FastifyInstance,config:Config,identity:IdentityService,issuer:RuntimeTicketIssuer,options:{enabled:boolean;origin:string;scope:RuntimeScope}){
 if(!options.enabled)return;
 const target=Object.freeze({...options.scope}),origin=new URL(options.origin);
 if(origin.protocol!=='https:'||origin.origin!==options.origin)throw new Error('Canonical HTTPS origin required');
 const limits=new WindowLimiter();
 http.register(async api=>{
  api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof RuntimeTicketError?new DomainError('WORLD_UNAVAILABLE',503,'Runtime unavailable'):error,req,reply));
  api.post('/v1/runtime-ticket',{bodyLimit:1024},async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   z.strictObject({}).parse(req.body??{});z.strictObject({}).parse(req.query);
   if(req.headers.origin!==origin.origin||req.headers.authorization!==undefined)throw new DomainError('FORBIDDEN',403,'Runtime admission denied');
   const credential=readSessionToken(req,config)!;
   identity.verifyCsrf(credential,req.headers['x-csrf-token']);
   if(!limits.take('runtime:'+identity.hash(credential),12))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');
   return issuer.issue(credential,target);
  });
 });
}
