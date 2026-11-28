import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import type {WalletService} from '../application/service';

export function registerWallet(
  http:FastifyInstance,
  config:Config,
  identity:IdentityService,
  wallet:WalletService,
  now=Date.now,
){
  const limits=new WindowLimiter(now);
  // The required form of readSessionToken throws if the request has no session.
  const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('vary','Cookie, Authorization');
      if(!limits.take('wallet-ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.addHook('preHandler',async req=>{
      z.strictObject({}).parse(req.query);
      const credential=token(req);
      if(!limits.take('wallet-session:'+identity.hash(credential),60))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.get('/pets/wallet',req=>wallet.readWallet(token(req)));
    api.post('/pets/wallet/convert',{bodyLimit:1024},req=>{
      const credential=token(req);
      identity.verifyCsrf(credential,req.headers['x-csrf-token']);
      return wallet.convertDiamondsToStones(credential,req.body);
    });
  },{prefix:'/v1'});
}
