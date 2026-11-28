import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {
 CoopBossIdSchema,CoopAdmissionCommandSchema,CoopCreateRoomSchema,CoopJoinRoomSchema,CoopReadySchema,CoopRoomCommandSchema,CoopRoomParamsSchema,CoopSelectPetSchema,CoopSkillPetParamsSchema,CoopSkillUpgradeSchema,
} from '@aetheria/contracts';
import type {Config} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import {readSessionToken} from '../../../../identity/modules/accounts/presentation/http';
import {WindowLimiter} from '../../../../identity/modules/accounts/domain/limits';
import {DomainError} from '../../../../../shared/common/errors';
import {apiErrorHandler} from '../../../../../shared/common/http-errors';
import type {CoopRoomService} from '../application/service';
import type {CoopSkillService} from '../../skills/application/service';

// Authenticated cooperative room routes. Default-off; the composition enables
// them only for a local/test runtime, alongside the existing native previews.
export function registerCoopRooms(http:FastifyInstance,config:Config,identity:IdentityService,rooms:CoopRoomService,skills:CoopSkillService,now=Date.now){
 if(config.NODE_ENV==='production')throw new Error('Cooperative rooms are local/test only');
 const limits=new WindowLimiter(now),accounts=new WeakMap<FastifyRequest,string>();
 const token=(req:FastifyRequest)=>readSessionToken(req,config)!;
 const account=(req:FastifyRequest)=>{
  const accountId=accounts.get(req);
  if(!accountId)throw new DomainError('UNAUTHENTICATED',401,'Session expired or unavailable');
  return accountId;
 };
 const write=(req:FastifyRequest)=>identity.verifyCsrf(token(req),req.headers['x-csrf-token']);
 http.register(async api=>{
  api.setErrorHandler(apiErrorHandler);
  api.addHook('onRequest',async(req,reply)=>{
   reply.header('cache-control','private, no-store').header('vary','Cookie').header('x-content-type-options','nosniff');
   if(!limits.take('coop-ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
  });
  api.addHook('preHandler',async req=>{
   if(req.routeOptions.url!=='/v1/coop/eligibility')z.strictObject({}).parse(req.query);
   const credential=token(req);
   const context=await identity.authenticate(credential);
   accounts.set(req,context.accountId);
   if(!limits.take('coop-session:'+identity.hash(credential),180))throw new DomainError('RATE_LIMITED',429,'Please wait before retrying');
  });
  api.get('/coop/pets/:ownedPetInstanceId/skills',req=>{
   const {ownedPetInstanceId}=CoopSkillPetParamsSchema.parse(req.params);
   return skills.progression(account(req),ownedPetInstanceId);
  });
  api.post('/coop/pets/:ownedPetInstanceId/skill-upgrades',req=>{
   write(req);
   const {ownedPetInstanceId}=CoopSkillPetParamsSchema.parse(req.params);
   return skills.upgrade(account(req),ownedPetInstanceId,CoopSkillUpgradeSchema.parse(req.body));
  });
  api.get('/coop/eligibility',req=>{
   const {bossId,mapId}=z.strictObject({bossId:CoopBossIdSchema.optional(),mapId:CoopBossIdSchema.optional()}).parse(req.query);
   return rooms.eligibility(account(req),bossId,mapId);
  });
  api.get('/coop/encounters',req=>rooms.encounters(account(req)));
  api.get('/coop/campaign-routes',req=>rooms.campaignRoutes(account(req)));
  api.post('/coop/rooms',req=>{
   write(req);
   const body=CoopCreateRoomSchema.parse(req.body);
   return rooms.create(account(req),body.requestId,body);
  });
  api.get('/coop/rooms/:roomId/reward',req=>{
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   return rooms.reward(account(req),roomId);
  });
  api.get('/coop/rooms/:roomId',req=>{
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   return rooms.room(account(req),roomId);
  });
  api.post('/coop/rooms/:roomId/join',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   const body=CoopJoinRoomSchema.parse(req.body);
   return rooms.join(account(req),body.requestId,roomId,body.mapId);
  });
  api.post('/coop/rooms/:roomId/leave',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   const body=CoopRoomCommandSchema.parse(req.body);
   return rooms.leave(account(req),body.requestId,roomId);
  });
  api.post('/coop/rooms/:roomId/pet',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   const body=CoopSelectPetSchema.parse(req.body);
   return rooms.selectPet(account(req),body.requestId,roomId,body);
  });
  api.post('/coop/rooms/:roomId/ready',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   const body=CoopReadySchema.parse(req.body);
   return rooms.ready(account(req),body.requestId,roomId,body);
  });
  api.post('/coop/rooms/:roomId/admission',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   CoopAdmissionCommandSchema.parse(req.body??{});
   return rooms.admission(account(req),token(req),roomId);
  });
  api.post('/coop/rooms/:roomId/start',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   const body=CoopRoomCommandSchema.parse(req.body);
   return rooms.start(account(req),body.requestId,roomId);
  });
  api.post('/coop/rooms/:roomId/close',req=>{
   write(req);
   const {roomId}=CoopRoomParamsSchema.parse(req.params);
   const body=CoopRoomCommandSchema.parse(req.body);
   return rooms.close(account(req),body.requestId,roomId);
  });
 },{prefix:'/v1'});
}
