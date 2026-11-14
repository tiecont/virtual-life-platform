import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {afterEach,expect,it,vi} from 'vitest';
import {registerRuntimeGateway} from './http';
import {readConfig} from '../../../../../shared/config/environment';
import type {IdentityService} from '../../../../identity/modules/accounts/application/service';
import type {RuntimeTicketIssuer} from '../../../../identity/modules/runtime-access/application/runtime-tickets';
import {DomainError} from '../../../../../shared/common/errors';

afterEach(()=>vi.restoreAllMocks());
async function fixture(){
 let now=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>now);
 const http=Fastify(),config=readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://fixture@127.0.0.1/virtual_city_test',SESSION_SECRET:'ticket-route-test-only-secret-00000000001'});
 const issue=vi.fn(async()=>({ticket:'opaque-fixture-ticket',expiresAt:new Date(now+5000).toISOString()}));
 const identity={hash:(key:string)=>key,verifyCsrf:(credential:string,csrf:unknown)=>{
  if(credential!=='ab'.repeat(32)||csrf!=='fixture-csrf')throw new DomainError('FORBIDDEN',403,'Denied');
 }} as unknown as IdentityService;
 await http.register(cookie,{secret:config.SESSION_SECRET});
 registerRuntimeGateway(http,config,identity,{issue} as unknown as RuntimeTicketIssuer,{enabled:true,origin:'https://localhost',scope:{worldId:'native:test',runtimeBootId:'11111111-1111-4111-8111-111111111111',contentHash:'ab'.repeat(32),protocolVersion:1}});
 await http.ready();
 const headers={origin:'https://localhost',cookie:'city_session='+encodeURIComponent(http.signCookie('ab'.repeat(32))),'x-csrf-token':'fixture-csrf'};
 return {http,issue,advance:(ms:number)=>{now+=ms;},post:(overrides={})=>http.inject({method:'POST',url:'/v1/runtime-ticket',headers:{...headers,...overrides},payload:{}})};
}
it('supports sustained short-lease renewals and recovery while enforcing the minute budget',async()=>{
 const f=await fixture();
 try{
  for(let i=0;i<24;i++){expect((await f.post()).statusCode).toBe(200);f.advance(2000);}
  for(let i=0;i<6;i++){expect((await f.post()).statusCode).toBe(200);f.advance(1000);}
  const denied=await f.post();expect(denied.statusCode).toBe(429);expect(denied.headers['cache-control']).toBe('no-store');
  expect(f.issue).toHaveBeenCalledTimes(30);
  f.advance(6001);expect((await f.post()).statusCode).toBe(200);
 }finally{await f.http.close();}
});
it('bounds bursts and rejects wrong Origin or CSRF before issuing a ticket',async()=>{
 const f=await fixture();
 try{
  expect((await f.post({origin:'https://other.example'})).statusCode).toBe(403);
  expect((await f.post({'x-csrf-token':'wrong'})).statusCode).toBe(403);
  for(let i=0;i<6;i++)expect((await f.post()).statusCode).toBe(200);
  expect((await f.post()).statusCode).toBe(429);expect(f.issue).toHaveBeenCalledTimes(6);
  f.advance(10001);expect((await f.post()).statusCode).toBe(200);
 }finally{await f.http.close();}
});
