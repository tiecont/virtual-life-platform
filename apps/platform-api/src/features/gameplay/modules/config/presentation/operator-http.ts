import type {FastifyInstance,FastifyRequest} from 'fastify';
import {GameplayConfigOverviewQuerySchema,GameplayConfigVersionQuerySchema} from '@aetheria/contracts';
import type {Config} from '../../../../../shared/config/environment';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import type {OperatorGameplayConfig} from '../application/operator-gameplay-config';

// Operator-only gameplay configuration control plane. Authorization, CSRF and
// the transaction come from the existing operator service; this layer only
// parses bounded request schemas and returns typed views.
export function registerGameplayConfig(http:FastifyInstance,config:Config,controls:OperatorGameplayConfig,now=Date.now){
 const limiter=new WindowLimiter(now,1000),name=config.NODE_ENV==='production'?'__Host-city_operator':'city_operator';
 const token=(req:FastifyRequest)=>{
  const pairs=(req.headers.cookie??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));
  if(pairs.length!==1||!/^[a-f0-9]{64}$/.test(pairs[0].slice(name.length+1)))throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');
  return pairs[0].slice(name.length+1);
 };
 http.register(async api=>{
  api.setErrorHandler(apiErrorHandler);
  api.addHook('onRequest',async(req,reply)=>{
   reply.header('cache-control','private, no-store').header('vary','Cookie').header('x-content-type-options','nosniff');
   if(!limiter.take('gameplay-config:'+req.ip,60)||!limiter.take('gameplay-config-total',120))throw new DomainError('RATE_LIMITED',429,'Please wait before another gameplay configuration request');
  });
  api.get('/gameplay-config',req=>controls.overview(token(req),GameplayConfigOverviewQuerySchema.parse(req.query).ruleset));
  api.get('/gameplay-config-version',req=>{
   const query=GameplayConfigVersionQuerySchema.parse(req.query);
   return controls.version(token(req),query.ruleset,query.version);
  });
  api.get('/gameplay-config-audit',req=>controls.audit(token(req),GameplayConfigOverviewQuerySchema.parse(req.query).ruleset));
  api.post('/gameplay-config-draft',{bodyLimit:1_258_291},req=>controls.createDraft(token(req),req.headers['x-csrf-token'],req.body));
  api.post('/gameplay-config-update',{bodyLimit:1_258_291},req=>controls.updateDraft(token(req),req.headers['x-csrf-token'],req.body));
  api.post('/gameplay-config-validate',req=>controls.validate(token(req),req.headers['x-csrf-token'],req.body));
  api.post('/gameplay-config-publish',req=>controls.publish(token(req),req.headers['x-csrf-token'],req.body));
  api.post('/gameplay-config-rollback',req=>controls.rollback(token(req),req.headers['x-csrf-token'],req.body));
  api.post('/gameplay-config-simulate',req=>controls.simulate(token(req),req.headers['x-csrf-token'],req.body));
 },{prefix:'/v1/operator'});
}
