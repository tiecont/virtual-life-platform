import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {PrivacyRequestCreateSchema,PrivacyCompleteSchema,PrivacyCloseSchema} from '@virtual-city/contracts';
import type {Config} from '../config';
import {DomainError} from '../common/errors';
import {apiErrorHandler} from '../common/http-errors';
import {WindowLimiter} from './limits';
import type {PrivacyRequestService} from './privacy-requests';
export function registerPrivacyRequests(http:FastifyInstance,config:Config,service:PrivacyRequestService,now=Date.now){
 const name=config.NODE_ENV==='production'?'__Host-city_privacy':'city_privacy',limiter=new WindowLimiter(now,1000);
 const options={path:'/',httpOnly:true,secure:config.NODE_ENV==='production',sameSite:'strict' as const};
 const token=(req:FastifyRequest)=>{const header=req.headers.cookie??'',pairs=header.split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));if(header.length>4096||pairs.length!==1||!/^[a-f0-9]{64}$/.test(pairs[0].slice(name.length+1)))throw new DomainError('UNAUTHENTICATED',401,'Privacy request authentication required');return pairs[0].slice(name.length+1);};
 const empty=(req:FastifyRequest)=>{z.strictObject({}).parse(req.query);};
 const cookie=(reply:FastifyReply,value:string,state:{expiresAt:string;receiptExpiresAt:string|null})=>{reply.setCookie(name,value,{...options,maxAge:Math.max(0,Math.floor((Date.parse(state.receiptExpiresAt??state.expiresAt)-now())/1000))});};
 http.register(async api=>{
  api.setErrorHandler(apiErrorHandler);
  api.addHook('onRequest',async(req,reply)=>{
   reply.header('cache-control','private, no-store').header('vary','Cookie').header('referrer-policy','no-referrer').header('x-robots-tag','noindex, nofollow');
   if(!limiter.take('privacy-http:'+req.ip,60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');
   if(req.method==='POST'&&req.routeOptions.url!=='/v1/privacy/close'&&(!limiter.take('privacy-auth:'+req.ip,5,300000)||!limiter.take('privacy-auth-total',60,300000)))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again',300);
  });
  api.post('/requests',async(req,reply)=>{empty(req);const result=await service.create(PrivacyRequestCreateSchema.parse(req.body));cookie(reply,result.token,result.state);return reply.code(result.created?201:200).send(result.state);});
  api.get('/request',req=>{empty(req);return service.status(token(req));});
  api.post('/complete',async(req,reply)=>{empty(req);const value=token(req),result=await service.complete(value,req.headers['x-csrf-token'],PrivacyCompleteSchema.parse(req.body));cookie(reply,value,result.state);return result;});
  api.post('/close',async(req,reply)=>{empty(req);const result=await service.close(token(req),req.headers['x-csrf-token'],PrivacyCloseSchema.parse(req.body));reply.clearCookie(name,options);return result;});
 },{prefix:'/v1/privacy'});
}
