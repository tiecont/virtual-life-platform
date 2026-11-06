import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../config';
import {DomainError} from '../common/errors';import {apiErrorHandler} from '../common/http-errors';import {WindowLimiter} from '../identity/limits';
import type {OperatorRuntimeControls} from './operator-runtime';
export function registerRuntimeControls(http:FastifyInstance,config:Config,controls:OperatorRuntimeControls,now=Date.now){
 const limiter=new WindowLimiter(now,1000),name=config.NODE_ENV==='production'?'__Host-city_operator':'city_operator';
 const token=(req:FastifyRequest)=>{const pairs=(req.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));if(pairs.length!==1||!/^[a-f0-9]{64}$/.test(pairs[0].slice(name.length+1)))throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');return pairs[0].slice(name.length+1);};
 http.register(async api=>{api.setErrorHandler(apiErrorHandler);api.addHook('onRequest',async(req,reply)=>{reply.header('cache-control','private, no-store').header('vary','Cookie');if(!limiter.take('runtime:'+req.ip,60)||!limiter.take('runtime-total',120))throw new DomainError('RATE_LIMITED',429,'Please wait before another runtime request');z.strictObject({}).parse(req.query);});
  api.get('/runtime-state',req=>controls.state(token(req)));api.get('/runtime-audit',req=>controls.audit(token(req)));api.post('/runtime-command',req=>controls.command(token(req),req.headers['x-csrf-token'],req.body));
 },{prefix:'/v1/operator'});
}
