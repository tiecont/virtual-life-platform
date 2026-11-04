import { createHash,timingSafeEqual } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../common/errors';
import { apiErrorHandler } from '../common/http-errors';
import { WindowLimiter } from '../identity/limits';
import { prometheus,type OperationalTelemetry } from './telemetry';
type Snapshot=Parameters<OperationalTelemetry['snapshot']>;
export function registerOperations(http:FastifyInstance,token:string|undefined,telemetry:OperationalTelemetry,ports:{online:()=>Snapshot[0];rooms:()=>Snapshot[1];orders:()=>Promise<Snapshot[2]>},now=Date.now){
 const expected=token?createHash('sha256').update('Bearer '+token).digest():undefined,limiter=new WindowLimiter(now,1000);let pending=false;
 http.register(async api=>{api.setErrorHandler(apiErrorHandler);const snapshot=async(req:FastifyRequest)=>{
  const auth=req.headers.authorization;if(!expected||typeof auth!=='string'||auth.length>256||!timingSafeEqual(expected,createHash('sha256').update(auth).digest()))throw new DomainError('NOT_FOUND',404,'Route not found');
  z.strictObject({}).parse(req.query);if(!limiter.take('operator',30)||pending)throw new DomainError('RATE_LIMITED',429,'Please wait before refreshing telemetry');
  pending=true;try{return await telemetry.snapshot(ports.online(),ports.rooms(),await ports.orders());}finally{pending=false;}
 };
 api.get('/internal/telemetry',req=>snapshot(req));api.get('/internal/metrics',async(req,reply)=>{const result=await snapshot(req);return reply.type('text/plain; version=0.0.4').send(prometheus(result));});
 });
}
