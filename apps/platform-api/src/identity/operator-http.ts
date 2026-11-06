import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {OperatorLoginSchema,OperatorRecoverySchema} from '@virtual-city/contracts';
import type {Config} from '../config';
import {DomainError} from '../common/errors';
import {apiErrorHandler} from '../common/http-errors';
import {WindowLimiter} from './limits';
import type {OperatorService} from './operator-service';
import type {PrivacyRequestService} from './privacy-requests';
import type {AccountControlService} from './account-control';
export const operatorCookieName=(production:boolean)=>production?'__Host-city_operator':'city_operator';
export function registerOperator(http:FastifyInstance,config:Config,service:OperatorService|undefined,now=Date.now,accounts?:AccountControlService,privacy?:PrivacyRequestService){
 const limiter=new WindowLimiter(now,1000),name=operatorCookieName(config.NODE_ENV==='production');
 const options={path:'/',httpOnly:true,secure:config.NODE_ENV==='production',sameSite:'strict' as const};
 const token=(req:FastifyRequest)=>{const value=req.cookies[name];if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');return value;};
 const cookie=(reply:FastifyReply,result:{token:string;session:{expiresAt:string}})=>{reply.setCookie(name,result.token,{...options,maxAge:Math.max(0,Math.floor((Date.parse(result.session.expiresAt)-now())/1000))});};
 http.register(async api=>{
  api.setErrorHandler(apiErrorHandler);
  api.addHook('onRequest',async req=>{
   if(!service)throw new DomainError('NOT_FOUND',404,'Route not found');
   if(!limiter.take('http:'+req.ip,60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');
   if(!limiter.take('operator-total',120))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');
   if(req.method==='POST'&&['/v1/operator/login','/v1/operator/recover','/v1/operator/step-up'].includes(req.routeOptions.url??'')&&!limiter.take('auth:'+req.ip,5,5*60000))throw new DomainError('RATE_LIMITED',429,'Please wait before authenticating');
  });
  api.post('/login',async(req,reply)=>{const result=await service!.login(OperatorLoginSchema.parse(req.body));cookie(reply,result);return result.session;});
  api.post('/recover',req=>service!.recover(OperatorRecoverySchema.parse(req.body)));
  api.get('/session',req=>{z.strictObject({}).parse(req.query);return service!.session(token(req));});
  api.post('/step-up',async(req,reply)=>{const result=await service!.stepUp(token(req),req.headers['x-csrf-token'],OperatorLoginSchema.parse(req.body));cookie(reply,result);return result.session;});
  for(const path of ['/logout','/revoke-all'])api.post(path,async(req,reply)=>{z.strictObject({}).parse(req.body??{});const result=await service!.logout(token(req),req.headers['x-csrf-token'],path==='/revoke-all');reply.clearCookie(name,options);return result;});
  api.get('/audit',req=>{z.strictObject({}).parse(req.query);return service!.auditEvents(token(req));});
  api.get('/privacy-requests',req=>{if(!privacy)throw new DomainError('NOT_FOUND',404,'Route not found');return privacy.list(token(req),req.query);});
  api.post('/privacy-review',req=>{if(!privacy)throw new DomainError('NOT_FOUND',404,'Route not found');z.strictObject({}).parse(req.query);return privacy.review(token(req),req.headers['x-csrf-token'],req.body);});
  api.get('/account',req=>{if(!accounts)throw new DomainError('NOT_FOUND',404,'Route not found');return accounts.account(token(req),req.query);});
  api.get('/account-audit',req=>{if(!accounts)throw new DomainError('NOT_FOUND',404,'Route not found');return accounts.audit(token(req),req.query);});
  api.post('/account-command',req=>{if(!accounts)throw new DomainError('NOT_FOUND',404,'Route not found');z.strictObject({}).parse(req.query);return accounts.command(token(req),req.headers['x-csrf-token'],req.body);});
 },{prefix:'/v1/operator'});
}
