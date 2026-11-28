import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {operatorCookieName} from '../../../../identity/modules/operators/presentation/operator-http';
import type {OperatorEconomyPolicy} from '../application/operator-economy';

export function registerEconomyPolicy(
  http:FastifyInstance,
  config:Config,
  controls:OperatorEconomyPolicy,
  now=Date.now,
){
  const limiter=new WindowLimiter(now,1000),cookieName=operatorCookieName(config.NODE_ENV==='production');
  const token=(req:FastifyRequest)=>{
    const pairs=(req.headers.cookie??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(cookieName+'='));
    if(pairs.length!==1||!/^[a-f0-9]{64}$/.test(pairs[0].slice(cookieName.length+1))){
      throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');
    }
    return pairs[0].slice(cookieName.length+1);
  };
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('vary','Cookie').header('x-content-type-options','nosniff');
      if(!limiter.take('economy-policy:'+req.ip,60)||!limiter.take('economy-policy-total',120)){
        throw new DomainError('RATE_LIMITED',429,'Please wait before another economy policy request');
      }
      z.strictObject({}).parse(req.query);
    });
    api.get('/economy-policy',req=>controls.overview(token(req)));
    api.get('/economy-policy-audit',req=>controls.audit(token(req)));
    api.post('/economy-policy-publish',{bodyLimit:32_768},req=>controls.publish(token(req),req.headers['x-csrf-token'],req.body));
    api.post('/economy-policy-rollback',{bodyLimit:8_192},req=>controls.rollback(token(req),req.headers['x-csrf-token'],req.body));
  },{prefix:'/v1/operator'});
}
