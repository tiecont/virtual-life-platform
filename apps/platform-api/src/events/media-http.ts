import type { FastifyInstance } from 'fastify';
import { WorldError } from '@virtual-city/world-sdk';
import { MediaReadSchema,MediaViewSchema } from '@virtual-city/contracts';
import { z } from 'zod';
import type { Config } from '../config';
import type { IdentityService } from '../identity/service';
import { readSessionToken } from '../identity/http';
import { WindowLimiter } from '../identity/limits';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import type { AudienceService } from './audience';
import type { MediaClearanceGate } from './media-clearance';
export function registerMedia(http:FastifyInstance,config:Config,identity:IdentityService,audience:AudienceService,gate:MediaClearanceGate,now=Date.now){const limits=new WindowLimiter(now);http.register(async api=>{
 api.setErrorHandler((error,req,reply)=>apiErrorHandler(error instanceof WorldError?new DomainError(error.code,error.code==='NOT_FOUND'?404:error.code==='FORBIDDEN'?403:503,error.message):error,req,reply));
 api.addHook('onRequest',async req=>{if(!limits.take('ip:'+req.ip,300))throw new DomainError('RATE_LIMITED',429,'Please wait');});
 api.post('/media/view',async req=>{z.strictObject({}).parse(req.query);const token=readSessionToken(req,config)!;identity.verifyCsrf(token,req.headers['x-csrf-token']);if(!limits.take('session:'+identity.hash(token),60))throw new DomainError('RATE_LIMITED',429,'Please wait');const input=MediaReadSchema.parse(req.body),authority=await audience.mediaAuthority(token,input);if(authority.worldSlug!=='lounge')throw new DomainError('NOT_AVAILABLE',404,'Media is unavailable');return MediaViewSchema.parse(gate.inspect(authority));});
 },{prefix:'/v1'});}
