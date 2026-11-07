import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {z,ZodError} from 'zod';
import {createHash} from 'node:crypto';
import {NativeSessionResultSchema,NativeLogoutInputSchema,NativeRevokeInputSchema,NativeAuthErrorSchema} from '@virtual-city/contracts';
import {DomainError} from '../common/errors';
import {IdentityError,unauthorized} from './errors';
import {WindowLimiter} from './limits';
import {NativeIdentityService,NativeProtocolError} from './native-service';
import {installNativeRequestCredential} from './native-request';

export function assertNativeTransport(req:FastifyRequest){if(req.headers.origin!==undefined||req.headers.cookie!==undefined)throw new IdentityError('FORBIDDEN',403,'Native transport does not accept browser credentials');}
function access(req:FastifyRequest){const value=typeof req.headers.authorization==='string'?/^Bearer (na1\.[a-f0-9]{64})$/.exec(req.headers.authorization)?.[1]:undefined;if(!value)throw unauthorized();return value;}
export async function prepareNativeApiRequest(req:FastifyRequest,native:NativeIdentityService|undefined){
 if(!native||typeof req.headers.authorization!=='string'||!req.headers.authorization.startsWith('Bearer na1.'))return false;
 assertNativeTransport(req);const route=req.routeOptions.url??'';
 if(!route.startsWith('/v1/')||/^\/v1\/(?:session|native|operator)\//.test(route)||route.startsWith('/v1/me/legacy/'))throw new IdentityError('FORBIDDEN',403,'Native credential is not valid on this endpoint');
 const auth=await native.authenticateAccess(access(req));installNativeRequestCredential(req,auth.credential);return true;
}
function errors(error:unknown,req:FastifyRequest,reply:FastifyReply){
 const status=error instanceof NativeProtocolError?409:error instanceof DomainError?error.status:error instanceof ZodError?422:503;
 const code=error instanceof NativeProtocolError?'UPGRADE_REQUIRED':error instanceof DomainError?error.code:error instanceof ZodError?'INVALID_REQUEST':'INTERNAL_ERROR';
 if(status===429)reply.header('retry-after','60');
 return reply.code(status).send(NativeAuthErrorSchema.parse({error:{code,message:error instanceof NativeProtocolError?error.message:error instanceof DomainError?error.message:status===422?'Invalid request':'Service unavailable',requestId:req.id}}));
}
export function registerNativeIdentity(http:FastifyInstance,native:NativeIdentityService|undefined,now=Date.now){
 if(!native)return;
 const limits=new WindowLimiter(now),empty=z.strictObject({});
 http.register(async api=>{
  api.setErrorHandler(errors);
  api.addHook('onRequest',async req=>{assertNativeTransport(req);empty.parse(req.query);if(!limits.take('native-http:'+req.ip,120))throw new IdentityError('RATE_LIMITED',429,'Please wait before trying again');});
  api.post('/session/guest',async(req,reply)=>{if(!limits.take('native-guest:'+req.ip,10))throw new IdentityError('RATE_LIMITED',429,'Please wait before creating another guest');const result=await native.guest(req.body);return reply.code(result.created?201:200).send(NativeSessionResultSchema.parse({schemaVersion:1,platform:'android',me:result.me,tokens:result.tokens}));});
  api.post('/session/login',async req=>{if(!limits.take('native-login:'+req.ip,5))throw new IdentityError('RATE_LIMITED',429,'Please wait before signing in again');const result=await native.login(req.body);return NativeSessionResultSchema.parse({schemaVersion:1,platform:'android',...result});});
  api.post('/session/upgrade',async req=>{if(!limits.take('native-upgrade:'+req.ip,5))throw new IdentityError('RATE_LIMITED',429,'Please wait before trying again');const result=await native.upgrade(access(req),req.body);return NativeSessionResultSchema.parse({schemaVersion:1,platform:'android',...result});});
  api.post('/session/refresh',async req=>{if(!limits.take('native-refresh:'+req.ip,20))throw new IdentityError('RATE_LIMITED',429,'Please wait before trying again');const result=await native.refresh(req.body);return NativeSessionResultSchema.parse({schemaVersion:1,platform:'android',...result});});
  api.post('/session/logout',async req=>native.logout(NativeLogoutInputSchema.parse(req.body).refreshToken));
  api.post('/session/socket-ticket',async req=>{const token=access(req);if(!limits.take('native-ticket:'+createHash('sha256').update(token).digest('hex'),20))throw new IdentityError('RATE_LIMITED',429,'Please wait before connecting again');return native.ticket(token,req.body);});
  api.get('/devices',async req=>native.devices(access(req)));
  api.post('/devices/revoke',async req=>native.revokeDevice(access(req),NativeRevokeInputSchema.parse(req.body).deviceId));
 },{prefix:'/v1/native'});
}
