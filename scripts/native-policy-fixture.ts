import {createServer} from 'node:https';
import {readFile,writeFile,stat,rm} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createApp} from '../apps/platform-api/src/app';
import {readConfig} from '../apps/platform-api/src/config';
import {migrate} from '../apps/platform-api/src/db/migrations';
async function main(){
 const root='artifacts/vnext/n11-03/tls',url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable DB required');
 const admin=new Pool({connectionString:url.toString()}),schema='native_policy_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);const pool=new Pool({connectionString:url.toString()});
 const facts={deletionStarts:0,confirmedReturns:0,droppedCommitAcknowledgements:0,result:'RUNNING',cleanupComplete:false};let writes=Promise.resolve();const flush=()=>{const body=JSON.stringify(facts,null,2)+'\n';writes=writes.then(()=>writeFile(root+'/stats.json',body,{mode:0o600}));};
 let api:Awaited<ReturnType<typeof createApp>>|undefined,https:ReturnType<typeof createServer>|undefined;
 try{
  await rm(root+'/ready.json',{force:true});
  await migrate(pool);api=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),WEB_ORIGIN:'http://127.0.0.1:18330',SESSION_SECRET:randomBytes(48).toString('base64url'),NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:randomBytes(32).toString('hex')}),pool,true,{logStream:{write(){/* Deliberately no raw credential/request logging. */}}});const runtime=api;
  // Two owned loopback ingress ports share this single API/RoomAuthority.
  await runtime.app.listen(18430,'127.0.0.1');
  https=createServer({key:await readFile(root+'/server.key'),cert:await readFile(root+'/server.pem')},async(request,response)=>{
   if(request.method==='DELETE'&&request.url==='/v1/native/account'){
    facts.deletionStarts++;flush();let drop=false;try{await stat(root+'/drop-next-delete');await rm(root+'/drop-next-delete');drop=true;}catch{/* No fault requested. */}
    if(drop){const end=response.end;response.end=((...args:Parameters<typeof end>)=>{if(response.statusCode===200){facts.droppedCommitAcknowledgements++;flush();request.socket.destroy();return response;}return Reflect.apply(end,response,args);}) as typeof response.end;}
    else response.once('finish',()=>{if(response.statusCode===200){facts.confirmedReturns++;flush();}});
   }
   runtime.http.server.emit('request',request,response);
  });
  https.on('upgrade',(request,socket,head)=>runtime.http.server.emit('upgrade',request,socket,head));await rm(root+'/stop',{force:true});await rm(root+'/drop-next-delete',{force:true});flush();
  await new Promise<void>((ok,no)=>{https!.once('error',no);https!.listen(18443,'127.0.0.1',ok);});const startTicks=(await readFile('/proc/'+process.pid+'/stat','utf8')).split(') ').at(-1)!.split(' ')[19];await writeFile(root+'/ready.json',JSON.stringify({ready:true,port:18443,pid:process.pid,startTicks,scope:'Owned isolated deletion fixture with actual same API/authority'})+'\n',{mode:0o600});console.log('Owned N11-03 HTTPS fixture ready.');
  let stop=false;process.once('SIGTERM',()=>{stop=true;});process.once('SIGINT',()=>{stop=true;});const deadline=Date.now()+30*60*1000;
  while(!stop&&Date.now()<deadline){try{await stat(root+'/stop');break;}catch{/* Wait for own completion. */}await new Promise(ok=>setTimeout(ok,500));}facts.result='PASS';
 }finally{https?.closeAllConnections();if(https?.listening)await new Promise<void>(ok=>https!.close(()=>ok()));await api?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();await rm(root+'/ready.json',{force:true});facts.cleanupComplete=true;flush();await writes;}
}
void main().catch(()=>{console.error('Native policy fixture failed; no private configuration emitted');process.exitCode=1;});
