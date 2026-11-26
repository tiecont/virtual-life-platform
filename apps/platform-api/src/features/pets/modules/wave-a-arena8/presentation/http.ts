import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import type {Arena8Service} from '../application/service';

const AllocateInput=z.strictObject({
  requestId:z.uuid(),
  petId:z.string().min(1).max(64),
  mapId:z.string().min(1).max(64),
  encounterId:z.string().min(1).max(64),
});
const ActionInput=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('start')}),
  z.strictObject({kind:z.literal('swap'),first:z.number().int().min(0).max(63),second:z.number().int().min(0).max(63)}),
  z.strictObject({kind:z.literal('guard')}),
  z.strictObject({kind:z.literal('skill')}),
  z.strictObject({kind:z.literal('signature')}),
  z.strictObject({kind:z.literal('fireZone')}),
  z.strictObject({kind:z.literal('ultimate')}),
]);
const CommandInput=z.strictObject({
  requestId:z.uuid(),
  matchId:z.uuid(),
  expectedVersion:z.number().int().min(0).max(1_000_000),
  action:ActionInput,
});
const SettleInput=z.strictObject({requestId:z.uuid()});
const MatchParams=z.strictObject({matchId:z.uuid()});

export function registerArena8(
  http:FastifyInstance,
  config:Config,
  identity:IdentityService,
  arena8:Arena8Service,
  enabled:boolean,
  now=Date.now,
){
  if(!enabled)return;
  if(config.NODE_ENV==='production')throw new Error('Arena8 local integration is local/test only');
  const limits=new WindowLimiter(now);
  const accounts=new WeakMap<FastifyRequest,string>();
  const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
  const account=(req:FastifyRequest)=>{
    const accountId=accounts.get(req);
    if(!accountId)throw new DomainError('UNAUTHENTICATED',401,'Session expired or unavailable');
    return accountId;
  };
  const write=(req:FastifyRequest)=>{
    identity.verifyCsrf(token(req),req.headers['x-csrf-token']);
  };
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('vary','Cookie');
      if(!limits.take('arena8-ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.addHook('preHandler',async req=>{
      z.strictObject({}).parse(req.query);
      const credential=token(req);
      const context=await identity.authenticate(credential);
      accounts.set(req,context.accountId);
      if(!limits.take('arena8-session:'+identity.hash(credential),120))
        throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.post('/pets/wave-a/arena8/allocate',req=>{
      write(req);
      const body=AllocateInput.parse(req.body);
      return arena8.allocate(account(req),body.requestId,{
        petId:body.petId,mapId:body.mapId,encounterId:body.encounterId,
      });
    });
    api.post('/pets/wave-a/arena8/command',req=>{
      write(req);
      const body=CommandInput.parse(req.body);
      return arena8.command(account(req),body.requestId,{
        matchId:body.matchId,expectedVersion:body.expectedVersion,action:body.action,
      });
    });
    api.get('/pets/wave-a/arena8/matches/:matchId',req=>{
      const {matchId}=MatchParams.parse(req.params);
      return arena8.view(account(req),matchId);
    });
    api.post('/pets/wave-a/arena8/matches/:matchId/settle',req=>{
      write(req);
      const {matchId}=MatchParams.parse(req.params);
      const body=SettleInput.parse(req.body);
      return arena8.settle(account(req),body.requestId,matchId);
    });
  },{prefix:'/v1'});
}
