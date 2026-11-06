import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../config';
import {DomainError} from '../common/errors';
import {apiErrorHandler} from '../common/http-errors';
import {WindowLimiter} from '../identity/limits';
import type {OperatorEventCalendar} from './operator-calendar';
export function registerOperatorEvents(http:FastifyInstance,config:Config,service:OperatorEventCalendar|undefined,now=Date.now){
 const limiter=new WindowLimiter(now,1000),name=config.NODE_ENV==='production'?'__Host-city_operator':'city_operator';
 const token=(req:FastifyRequest)=>{const pairs=(req.headers.cookie??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));if(pairs.length!==1||!/^[a-f0-9]{64}$/.test(pairs[0].slice(name.length+1)))throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');return pairs[0].slice(name.length+1);};
 http.register(async api=>{api.setErrorHandler(apiErrorHandler);api.addHook('onRequest',async(req,reply)=>{reply.header('cache-control','private, no-store').header('vary','Cookie');if(!service)throw new DomainError('NOT_FOUND',404,'Route not found');if(!limiter.take('operator-events:'+req.ip,60)||!limiter.take('operator-events-total',120))throw new DomainError('RATE_LIMITED',429,'Please wait before another event request');});
  api.get('/event-calendar',req=>service!.calendar(token(req),req.query));api.get('/event-audit',req=>service!.audit(token(req),req.query));api.post('/event-command',req=>{z.strictObject({}).parse(req.query);return service!.command(token(req),req.headers['x-csrf-token'],req.body);});
 },{prefix:'/v1/operator'});
}
