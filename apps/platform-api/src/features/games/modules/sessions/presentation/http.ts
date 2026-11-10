import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {WorldError} from '@virtual-city/world-sdk';
import type {Config} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import {DomainError} from '../../../../../shared/common/errors';
import type {GameLobbyService} from '../application/lobby';
export function registerGameLobby(http:FastifyInstance,config:Config,identity:IdentityService,lobby:GameLobbyService,now=Date.now){
 const limits=new WindowLimiter(now);
 http.register(async api=>{api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof WorldError?new DomainError('NOT_AVAILABLE',404,'Lodge unavailable'):error,req,reply));
  api.addHook('onRequest',async req=>{if(!limits.take(req.ip,120))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');});
  const write=(req:FastifyRequest)=>{z.strictObject({}).parse(req.query);const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);if(!limits.take('session:'+identity.hash(token),60))throw new DomainError('RATE_LIMITED',429,'Please wait before trying again');return token;};
  // No private visit context in URLs/access logs; every operation checks CSRF.
  api.post('/games/lobby',req=>lobby.change(write(req),req.body));
  api.post('/games/lobby/leave',req=>lobby.leave(write(req),req.body));
 },{prefix:'/v1'});
}
