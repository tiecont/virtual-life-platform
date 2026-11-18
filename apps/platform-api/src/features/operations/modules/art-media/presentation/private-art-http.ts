import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import type {PrivateArtIntake} from '../application/private-art';

export function registerPrivateArt(http:FastifyInstance,config:Config,service:PrivateArtIntake|undefined,now=Date.now){
 const limiter=new WindowLimiter(now,1000),name=config.NODE_ENV==='production'?'__Host-city_operator':'city_operator';
 const token=(req:FastifyRequest)=>{const pairs=(req.headers.cookie??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));if(pairs.length!==1||!/^[a-f0-9]{64}$/.test(pairs[0].slice(name.length+1)))throw new DomainError('UNAUTHENTICATED',401,'Operator authentication required');return pairs[0].slice(name.length+1);};
 http.register(async api=>{
  api.setErrorHandler(apiErrorHandler);
  api.addHook('onRequest',async(req,reply)=>{reply.header('cache-control','private, no-store').header('vary','Cookie');if(!service)throw new DomainError('NOT_FOUND',404,'Route not found');if(!limiter.take('private-art:'+req.ip,60)||!limiter.take('private-art-total',120))throw new DomainError('RATE_LIMITED',429,'Please wait before another private art request');});
  api.get('/art-draft',req=>service!.read(token(req),req.query));
  api.post('/art-intake',req=>{z.strictObject({}).parse(req.query);return service!.intake(token(req),req.headers['x-csrf-token'],req.body);});
 },{prefix:'/v1/operator'});
}
