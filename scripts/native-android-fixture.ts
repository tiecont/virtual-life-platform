import {createServer} from 'node:https';
import {readFile,writeFile,stat,rm} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createApp} from '../apps/platform-api/src/app';
import {readConfig} from '../apps/platform-api/src/config';
import {migrate} from '../apps/platform-api/src/db/migrations';

async function main(){
 const root='artifacts/vnext/n10-03/tls',url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable local DB required');
 const admin=new Pool({connectionString:url.toString()}),schema='native_android_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);
 const pool=new Pool({connectionString:url.toString()}),counts:Record<string,number>={};let api:Awaited<ReturnType<typeof createApp>>|undefined,https:ReturnType<typeof createServer>|undefined;
 let result='FAIL';
 try{
  await migrate(pool);api=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),SESSION_SECRET:randomBytes(48).toString('base64url'),NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:randomBytes(32).toString('hex')}),pool,true,{logStream:{write(){/* No raw request/credential logs in this fixture. */}}});
  const runtime=api;
  https=createServer({key:await readFile(root+'/server.key'),cert:await readFile(root+'/server.pem')},(request,response)=>{
   const route=request.url??'';const label=route.startsWith('/v1/native/')?route:'other';counts[label]=(counts[label]??0)+1;
   if(route.startsWith('/v1/fixture/')){
    response.setHeader('Content-Type','application/json');
    if(route==='/v1/fixture/redirect'){response.statusCode=302;response.setHeader('Location','https://localhost:18443/v1/fixture/redirect-target');response.end('{}');}
    else if(route==='/v1/fixture/cookie'){response.setHeader('Set-Cookie','synthetic=fixture; Secure; HttpOnly');response.end('{}');}
    else if(route==='/v1/fixture/oversized')response.end(JSON.stringify({padding:'x'.repeat(140000)}));
    else response.end(JSON.stringify({cookiePresent:request.headers.cookie!==undefined,originPresent:request.headers.origin!==undefined,ok:true}));
    return;
   }
   runtime.http.server.emit('request',request,response);
  });
  https.on('upgrade',(request,socket,head)=>runtime.http.server.emit('upgrade',request,socket,head));
  await rm(root+'/stop',{force:true});
  await new Promise<void>((ok,no)=>{https!.once('error',no);https!.listen(18443,'127.0.0.1',ok);});
  await writeFile(root+'/ready.json',JSON.stringify({ready:true,port:18443,fixture:'Isolated native auth; same API and single authority',startedAt:new Date().toISOString()})+'\n',{mode:0o600});
  console.log('Isolated native HTTPS fixture ready on loopback18443.');
  let stop=false;process.once('SIGTERM',()=>{stop=true;});process.once('SIGINT',()=>{stop=true;});const deadline=Date.now()+30*60*1000;
  while(!stop&&Date.now()<deadline){try{await stat(root+'/stop');break;}catch{/* Await explicit own-fixture completion. */}await new Promise(ok=>setTimeout(ok,500));}
  result='PASS';
 }finally{
  https?.closeAllConnections();if(https?.listening)await new Promise<void>(ok=>https!.close(()=>ok()));
  await api?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  await rm(root+'/ready.json',{force:true});await writeFile(root+'/fixture-facts.json',JSON.stringify({result,requestCounts:counts,cleanupComplete:true,publicRelease:false},null,2)+'\n',{mode:0o600});
 }
}
void main().catch(()=>{console.error('Native TLS fixture failed; no raw configuration emitted');process.exitCode=1;});
