import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import type {Config} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import type {NativeArena8Provisioner} from '../application/native-provisioner';
import type {Arena8Service} from '../application/service';

const AllocateInput=z.strictObject({
  requestId:z.uuid(),
  petId:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  mapId:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  encounterId:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
});

// Local-only native allocation route. It returns only the ticket, transport
// endpoints, content/boot identity and the server-owned allocation view.
export function registerNativeArena8(
  http:FastifyInstance,
  config:Config,
  identity:IdentityService,
  provisioner:NativeArena8Provisioner,
  arena8:Arena8Service,
  enabled:boolean,
  now=Date.now,
){
  if(!enabled)return;
  if(config.NODE_ENV==='production')
    throw new Error('Native Arena8 allocation is local/test only');
  const limits=new WindowLimiter(now);
  const accounts=new WeakMap<FastifyRequest,string>();
  const credentials=new WeakMap<FastifyRequest,string>();
  const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
  http.register(async api=>{
    api.setErrorHandler(apiErrorHandler);
    api.addHook('onRequest',async(req,reply)=>{
      reply.header('cache-control','private, no-store').header('vary','Cookie');
      if(!limits.take('arena8-native-ip:'+req.ip,60))
        throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.addHook('preHandler',async req=>{
      z.strictObject({}).parse(req.query);
      const credential=token(req);
      const context=await identity.authenticate(credential);
      accounts.set(req,context.accountId);
      credentials.set(req,credential);
      if(!limits.take('arena8-native-session:'+identity.hash(credential),60))
        throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
    });
    api.post('/pets/wave-a/arena8/native/allocate',{bodyLimit:1024},req=>{
      const credential=credentials.get(req);
      const accountId=accounts.get(req);
      if(!credential||!accountId)
        throw new DomainError('UNAUTHENTICATED',401,'Session expired or unavailable');
      identity.verifyCsrf(credential,req.headers['x-csrf-token']);
      const body=AllocateInput.parse(req.body);
      return provisioner.allocate(accountId,credential,body.requestId,{
        petId:body.petId,mapId:body.mapId,encounterId:body.encounterId,
      });
    });
    api.post('/pets/wave-a/arena8/native/matches/:matchId/settle',{bodyLimit:1024},async req=>{
      const credential=credentials.get(req);
      const accountId=accounts.get(req);
      if(!credential||!accountId)
        throw new DomainError('UNAUTHENTICATED',401,'Session expired or unavailable');
      identity.verifyCsrf(credential,req.headers['x-csrf-token']);
      const {matchId}=z.strictObject({matchId:z.uuid()}).parse(req.params);
      const {requestId}=z.strictObject({requestId:z.uuid()}).parse(req.body);
      const settlement=await arena8.settleNative(accountId,requestId,matchId);
      await provisioner.complete(accountId,matchId);
      return settlement;
    });
  },{prefix:'/v1'});
}
