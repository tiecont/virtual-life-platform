import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {WindowLimiter} from '../../accounts/domain/limits';
import {operatorCookieName} from '../../operators/presentation/operator-http';
import type {PrelaunchRegistrationService} from '../application/service';

export function registerPrelaunch(http:FastifyInstance,service:PrelaunchRegistrationService,production:boolean,now=Date.now){
  const limiter=new WindowLimiter(now,1000),operatorCookie=operatorCookieName(production);
  const operatorToken=(req:FastifyRequest)=>{
    const token=req.cookies[operatorCookie];
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');
    return token;
  };
  const managementToken=(req:FastifyRequest)=>{
    const value=req.headers.authorization;
    if(typeof value!=='string'||!/^Bearer [a-f0-9]{64}$/.test(value))throw new DomainError('UNAUTHENTICATED',401,'Registration management token required');
    return value.slice(7);
  };
  const strictQuery=(req:FastifyRequest)=>z.strictObject({}).parse(req.query);
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('referrer-policy','no-referrer').header('x-robots-tag','noindex, nofollow');
      if(!limiter.take('prelaunch-http:'+req.ip,60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');
      if(req.method==='POST'&&!limiter.take('prelaunch-write:'+req.ip,10,60000))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again',60);
    });
    api.get('/campaigns/:campaignId',req=>{strictQuery(req);return service.campaignState((req.params as {campaignId:string}).campaignId);});
    api.post('/requests',async(req,reply)=>{strictQuery(req);return reply.code(202).send(await service.request(req.body,req.ip));});
    api.post('/resend',async(req,reply)=>{strictQuery(req);return reply.code(202).send(await service.resend(req.body,req.ip));});
    api.post('/confirm',async(req,reply)=>{strictQuery(req);return reply.send(await service.confirm(req.body));});
    api.get('/registration',req=>{strictQuery(req);return service.manage(managementToken(req));});
    api.post('/withdraw',async(req,reply)=>{strictQuery(req);return reply.send(await service.withdraw(managementToken(req),req.body));});
  },{prefix:'/v1/prelaunch'});
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('referrer-policy','no-referrer').header('x-robots-tag','noindex, nofollow');
      if(!limiter.take('prelaunch-operator:'+req.ip,30,60000))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again',60);
    });
    api.get('/prelaunch-summary',req=>service.operatorSummary(operatorToken(req),req.query));
  },{prefix:'/v1/operator'});
}
