import { it,expect } from 'vitest';
import { createServer,type RequestListener } from 'node:http';
import { DeadlineHttpIdentityPort,deadlineOrigin } from './deadline-port';
import { readConfig } from '../../config';
async function server(handler:RequestListener,work:(url:string)=>Promise<void>){const http=createServer(handler);await new Promise<void>(ok=>http.listen(0,'127.0.0.1',ok));try{await work('http://127.0.0.1:'+(http.address() as {port:number}).port);}finally{http.closeAllConnections();await new Promise<void>(ok=>http.close(()=>ok()));}}
it('local identity is disabled by default; explicit exact loopback origin is mandatory and production cannot activate it',()=>{
 const base={DATABASE_URL:'postgresql://synthetic@127.0.0.1/synthetic',SESSION_SECRET:'synthetic-only-session-secret-000000'};
 expect(readConfig(base).LOCAL_DEADLINE_IDENTITY).toBe('0');expect(()=>readConfig({...base,LOCAL_DEADLINE_IDENTITY:'1'})).toThrow();
 expect(readConfig({...base,LOCAL_DEADLINE_IDENTITY:'1',DEADLINE_LEGACY_API_URL:'http://127.0.0.1:4400'}).LOCAL_DEADLINE_IDENTITY).toBe('1');
 expect(()=>readConfig({...base,NODE_ENV:'production',WEB_ORIGIN:'https://example.invalid',LOCAL_DEADLINE_IDENTITY:'1',DEADLINE_LEGACY_API_URL:'http://127.0.0.1:4400'})).toThrow();
 for(const url of ['https://127.0.0.1:4400','http://localhost:4400','http://127.0.0.1','http://127.0.0.1:4400/me','http://127.0.0.1:4400?target=elsewhere','http://127.0.0.1:4400#fragment','http://user:private@127.0.0.1:4400','http://example.invalid:4400']){expect(()=>deadlineOrigin(url)).toThrow();expect(()=>readConfig({...base,DEADLINE_LEGACY_API_URL:url})).toThrow();}
});
it('proof forwards only the source cookie and returns only bounded identity and expiry',async()=>{
 const token='X'.repeat(43),subject='f5860a8e-f404-4700-9a01-f128e583e80e',expiresAt=new Date(Date.now()+60000).toISOString();let called=0;
 await server((req,res)=>{called++;expect(req.url).toBe('/api/v1/me');expect(req.headers.cookie).toBe('deadline_session='+token);expect(req.headers.authorization).toBeUndefined();res.setHeader('content-type','application/json');res.end(JSON.stringify({id:subject,displayName:'Source guest',avatarKey:'mint',csrfToken:'12'.repeat(32),expiresAt}));},async url=>{expect(await new DeadlineHttpIdentityPort(url).authenticate(token,new AbortController().signal)).toEqual({subject,expiresAt});});expect(called).toBe(1);
});
it('forged cookie syntax fails before any source request',async()=>{
 let called=0;await server((_req,res)=>{called++;res.end();},async url=>{for(const token of ['bad','X'.repeat(43)+'; city_session=forged','X'.repeat(42)+'\n'])await expect(new DeadlineHttpIdentityPort(url).authenticate(token,new AbortController().signal)).rejects.toMatchObject({status:401});});expect(called).toBe(0);
});
it('a redirect never forwards a source cookie to the redirect destination',async()=>{
 let redirected=0;await server((_req,res)=>{redirected++;res.end('{}');},async target=>{await server((_req,res)=>{res.statusCode=302;res.setHeader('location',target);res.end();},async url=>{await expect(new DeadlineHttpIdentityPort(url).authenticate('X'.repeat(43),new AbortController().signal)).rejects.toMatchObject({status:503});});});expect(redirected).toBe(0);
});
it('oversized or malformed source responses are rejected; authentication denial is preserved',async()=>{
 for(const value of [{status:200,body:'X'.repeat(4097)},{status:200,body:'{}'},{status:200,body:'not-json'},{status:401,body:'{}'},{status:503,body:'{}'}])await server((_req,res)=>{res.statusCode=value.status;res.end(value.body);},async url=>{await expect(new DeadlineHttpIdentityPort(url).authenticate('X'.repeat(43),new AbortController().signal)).rejects.toThrow();});
});
