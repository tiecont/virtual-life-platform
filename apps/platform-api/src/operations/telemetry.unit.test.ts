import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OperationalTelemetry } from './telemetry';
import { RoomMetrics } from '../rooms/metrics';
import { operationalErrorLog,operationalRequestLog } from './log';
import { DomainError } from '../common/errors';
const online={rooms:0,memberships:0,connections:0,occupiedSeats:0,graceMemberships:0};
it('real SDK exports are bounded in flight/completed retention and use finite labels without retaining raw paths or caller fields',async()=>{
 let now=Date.now(),elapsed=0;const logs:unknown[]=[],ops=new OperationalTelemetry(true,()=>now,record=>logs.push(record),()=>elapsed);
 try{
  const finish=Array.from({length:200},(_,i)=>ops.beginHttp(randomUUID(),'/unknown','/private-marker-'+i+'?cookie=private-secret','UNTRUSTED_METHOD'));
  for(const done of finish){done(404);done(200);}
  const snapshot=await ops.snapshot(online,new RoomMetrics().snapshot(),{observedAt:now,phases:{PENDING:0}});
  expect(snapshot.http).toMatchObject({requests:200,errors:200,activeTraces:0,droppedTraces:72});expect(snapshot.http.series).toHaveLength(1);expect(snapshot.traces).toHaveLength(100);expect(logs).toHaveLength(128);
  expect(JSON.stringify(snapshot)).not.toMatch(/private-marker|private-secret|UNTRUSTED_METHOD/);
  expect(snapshot.traces.every(span=>/^[a-f0-9]{32}$/.test(span.traceId)&&span.durationMs>=0)).toBe(true);
  now-=86400000;elapsed+=300001;expect((await ops.snapshot(online,new RoomMetrics().snapshot(),{observedAt:now,phases:{}})).traces).toEqual([]);
 }finally{await ops.close();}
});
it('dating/internal calls produce no trace or metric while room pseudonyms rotate per app and grace holds are not online members',async()=>{
 const a=new OperationalTelemetry(true),b=new OperationalTelemetry(true),id=randomUUID();
 try{
  a.beginHttp(randomUUID(),'/v1/dating/profile','/v1/dating/profile','GET')(200);a.beginHttp(randomUUID(),'/internal/telemetry','/internal/telemetry','GET')(200);
  a.beginRoom('room.join')('OK',id);b.beginRoom('room.join')('OK',id);
  const x=await a.snapshot({...online,memberships:1,graceMemberships:1},new RoomMetrics().snapshot(),{observedAt:Date.now(),phases:{}}),y=await b.snapshot(online,new RoomMetrics().snapshot(),{observedAt:Date.now(),phases:{}});
  expect(x.http.requests).toBe(0);expect(x.traces).toHaveLength(1);expect(x.traces[0].roomKey).not.toBe(y.traces[0].roomKey);expect(JSON.stringify(x)).not.toContain(id);expect(x.gauges.online).toMatchObject({memberships:0,retainedMemberships:1,graceMemberships:1});
 }finally{await a.close();await b.close();}
});
it('structured request/error projections use server route patterns and never preserve raw unknown paths,queries,methods or error text',()=>{
 expect(operationalRequestLog({method:'GET',url:'/private-secret?note=private-note'})).toEqual({method:'GET',path:'/[unknown]'});
 expect(operationalRequestLog({method:'GET',url:'/v1/reports/private-case',routeOptions:{url:'/v1/reports/:id'}})).toEqual({method:'GET',path:'/v1/reports/[redacted]'});
 expect(operationalRequestLog({method:'GET',url:'/v1/dating/private-source',routeOptions:{url:'/v1/dating/dates/:id'}})).toEqual({method:'GET',path:'/v1/[private]'});
 for(const error of [Error('private-secret'),new DomainError('NOT_AVAILABLE',404,'private-note')])expect(JSON.stringify(operationalErrorLog(error))).not.toMatch(/private-secret|private-note/);
});
