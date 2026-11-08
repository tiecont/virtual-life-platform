import {createServer} from 'node:https';
import {readFile,writeFile,stat,rm,rename} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {io,type Socket} from 'socket.io-client';
import {NativeSessionResultSchema,NativeTicketResultSchema,RoomAckSchema} from '@virtual-city/contracts';
import {deadlineWorldVersion,deadlineScene} from '@virtual-city/deadline-world';
import {maidWorldVersion,maidScene} from '@virtual-city/maid-world';
import {createApp} from '../apps/platform-api/src/app';
import {readConfig} from '../apps/platform-api/src/config';
import {migrate} from '../apps/platform-api/src/db/migrations';
async function main(){
 const root='artifacts/vnext/n06-07/world-v1/tls',url=new URL(process.env.TEST_DATABASE_URL??'');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^virtual_city_test(?:_|$)/.test(url.pathname.slice(1)))throw Error('Disposable DB required');
 const admin=new Pool({connectionString:url.toString()}),schema='native_world_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options','-c search_path='+schema);const pool=new Pool({connectionString:url.toString()});
 const facts={saveStarts:0,saveConfirmed:0,ticketStarts:0,assertedTickets:0,travelRequests:0,droppedCommittedTravelAcks:0,transportFaults:0,peerRefreshes:0,reportStarts:0,reportConfirmed:0,blockStarts:0,blockConfirmed:0,peerWorld:'',result:'RUNNING',failedStage:null as string|null,errorType:null as string|null,errorFrames:[] as string[],cleanupComplete:false};
 let writes=Promise.resolve();const flush=()=>{const body=JSON.stringify(facts,null,2)+'\n';writes=writes.then(async()=>{await writeFile(root+'/stats-next.json',body,{mode:0o600});await rename(root+'/stats-next.json',root+'/stats.json');});};
 const take=async(name:string)=>{try{await stat(root+'/'+name);await rm(root+'/'+name);return true;}catch{return false;}};
 let stage='create-app';let api:Awaited<ReturnType<typeof createApp>>|undefined,https:ReturnType<typeof createServer>|undefined,peer:Socket|undefined;
 try{
  await rm(root+'/ready.json',{force:true});await migrate(pool);
  api=await createApp(readConfig({NODE_ENV:'test',DATABASE_URL:url.toString(),WEB_ORIGIN:'http://127.0.0.1:18330',SESSION_SECRET:randomBytes(48).toString('base64url'),NATIVE_AUTH_ENABLED:'1',NATIVE_AUTH_KEY:randomBytes(32).toString('hex'),SAFETY_EVIDENCE_KEY:randomBytes(32).toString('hex'),LOCAL_DEADLINE_WORLD:'1',LOCAL_MAID_WORLD:'1'}),pool,false,{safety:{enabled:true},logStream:{write(){/* Never log requests,credentials or ticket bodies. */}}});const runtime=api;
  stage='enable-worlds';await runtime.worlds.registry.setEnabled('deadline',true);await runtime.worlds.registry.setEnabled('maid',true);await runtime.app.listen(18430,'127.0.0.1');
  runtime.gateway.io.on('connection',socket=>socket.use((packet,next)=>{void(async()=>{
   if(packet[0]==='travel.request'){facts.travelRequests++;const drop=await take('drop-next-travel-ack');if(drop){const acknowledge=packet.at(-1);if(typeof acknowledge!=='function')throw Error('ACK required');packet[packet.length-1]=(result:unknown)=>{if(result&&typeof result==='object'&&'ok'in result&&result.ok===true){facts.droppedCommittedTravelAcks++;flush();socket.disconnect(true);}else acknowledge(result);};}flush();}next();
  })().catch(()=>next(Error('Owned fixture fault unavailable')));}));
  stage='listen-tls';https=createServer({key:await readFile(root+'/server.key'),cert:await readFile(root+'/server.pem')},(request,response)=>{
   // Public transport regression probes use this isolated origin only.
   if(request.url?.startsWith('/v1/fixture/')){response.setHeader('Content-Type','application/json');if(request.url==='/v1/fixture/redirect'){response.statusCode=302;response.setHeader('Location','https://localhost:18443/v1/fixture/redirect-target');response.end('{}');}else if(request.url==='/v1/fixture/cookie'){response.setHeader('Set-Cookie','synthetic=fixture;Secure;HttpOnly');response.end('{}');}else if(request.url==='/v1/fixture/oversized')response.end(JSON.stringify({padding:'x'.repeat(140000)}));else response.end(JSON.stringify({cookiePresent:request.headers.cookie!==undefined,originPresent:request.headers.origin!==undefined,ok:true}));return;}
   if(request.method==='POST'){
    const path=request.url;if(path==='/v1/me/avatar')facts.saveStarts++;
    if(path==='/v1/native/session/socket-ticket'){facts.ticketStarts++;if(request.headers['x-native-account-id'])facts.assertedTickets++;}
    if(path==='/v1/reports')facts.reportStarts++;if(path==='/v1/blocks')facts.blockStarts++;flush();
    response.once('finish',()=>{if(response.statusCode>=200&&response.statusCode<300){if(path==='/v1/me/avatar')facts.saveConfirmed++;if(path==='/v1/reports')facts.reportConfirmed++;if(path==='/v1/blocks')facts.blockConfirmed++;flush();}});
   }
   runtime.http.server.emit('request',request,response);
  });https.on('upgrade',(request,socket,head)=>runtime.http.server.emit('upgrade',request,socket,head));
  await new Promise<void>((ok,no)=>{https!.once('error',no);https!.listen(18443,'127.0.0.1',ok);});
  const client=()=>({schemaVersion:1,platform:'android',clientBuild:'native-world-fixture-peer',protocol:{nonce:randomUUID(),versions:[1],sceneSchemaVersions:[1],requiredCapabilities:[]}});
  stage='peer-bootstrap';let guest=NativeSessionResultSchema.parse((await runtime.http.inject({method:'POST',url:'/v1/native/session/guest',remoteAddress:'127.91.0.1',payload:{...client(),deviceLabel:'Synthetic host peer',guest:{requestId:randomUUID(),displayName:'Workshop Neighbor',avatarKey:'amber'}}})).json());
  async function connectPeer(){const protocol=client();
  stage='peer-ticket';const ticket=NativeTicketResultSchema.parse((await runtime.http.inject({method:'POST',url:'/v1/native/session/socket-ticket',headers:{authorization:'Bearer '+guest.tokens.accessToken,'x-native-account-id':guest.me.profile.id},payload:protocol})).json());
  stage='peer-connect';peer=io('http://127.0.0.1:18430',{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],extraHeaders:{Origin:'https://localhost'},auth:{schemaVersion:1,nativeTicket:ticket.ticket,protocol:protocol.protocol}});
  await new Promise<void>((ok,no)=>{const timer=setTimeout(()=>no(Error('Peer connection deadline')),5000);peer!.once('connect',()=>{clearTimeout(timer);ok();});peer!.once('connect_error',()=>{clearTimeout(timer);no(Error('Peer unavailable'));});peer!.connect();});}
  await connectPeer();
  async function peerJoin(world:'deadline'|'maid'){
   const ack=RoomAckSchema.parse(await peer!.timeout(5000).emitWithAck('room.join',{schemaVersion:1,requestId:randomUUID(),worldSlug:world,worldVersion:world==='deadline'?deadlineWorldVersion:maidWorldVersion,sceneVersion:world==='deadline'?deadlineScene.version:maidScene.version,motionVersion:1,appearanceVersion:2}));if(!ack.ok||ack.result.type!=='snapshot')throw Error('Peer join unconfirmed');facts.peerWorld=world;flush();
  }
  stage='peer-join';await peerJoin('deadline');
  for(const marker of ['stop','drop-next-travel-ack','peer-in-maid'])await rm(root+'/'+marker,{force:true});
  const startTicks=(await readFile('/proc/'+process.pid+'/stat','utf8')).split(') ').at(-1)!.split(' ')[19];flush();await writes;
  await writeFile(root+'/ready.json',JSON.stringify({ready:true,port:18443,pid:process.pid,startTicks,scope:'Owned real Deadline/Maid/one-authority/native travel and safety fixture'})+'\n',{mode:0o600});console.log('Owned native world HTTPS fixture ready.');
  stage='ready-loop';let stop=false;process.once('SIGTERM',()=>{stop=true;});process.once('SIGINT',()=>{stop=true;});const deadline=Date.now()+30*60*1000;
  while(!stop&&Date.now()<deadline){if(await take('stop'))break;if(await take('disconnect-avd')){for(const socket of runtime.gateway.io.of('/').sockets.values())if(socket.id!==peer!.id)socket.conn.close();facts.transportFaults++;flush();}if(await take('peer-in-maid')){stage='peer-refresh';peer!.close();const refreshed=await runtime.http.inject({method:'POST',url:'/v1/native/session/refresh',payload:{...client(),refreshToken:guest.tokens.refreshToken}});if(refreshed.statusCode!==200)throw Error('Peer refresh unavailable');guest=NativeSessionResultSchema.parse(refreshed.json());facts.peerRefreshes++;await connectPeer();await peerJoin('deadline');const own=await runtime.rooms.snapshotForConnection(peer!.id!);if(own){const ack=RoomAckSchema.parse(await peer!.timeout(5000).emitWithAck('room.leave',{schemaVersion:1,requestId:randomUUID(),epoch:own.epoch,roomId:own.roomId,membershipId:own.membershipId}));if(!ack.ok)throw Error('Peer departure unconfirmed');}await peerJoin('maid');stage='ready-loop';}await new Promise(ok=>setTimeout(ok,200));}facts.result='PASS';
 }catch(error){facts.result='FAIL';facts.failedStage=stage;facts.errorType=error instanceof Error?error.name:'Unknown';facts.errorFrames=error instanceof Error?(error.stack??'').split('\n').filter(line=>/^\s*at /.test(line)).slice(0,6).map(line=>line.replace(/.*?(?:\/home\/tiecont\/Projects\/virtual-city\/)/,'').trim()):[];console.log(JSON.stringify({result:'FAIL',stage,type:facts.errorType,frames:facts.errorFrames}));throw error;}finally{peer?.close();https?.closeAllConnections();if(https?.listening)await new Promise<void>(ok=>https!.close(()=>ok()));await api?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();await rm(root+'/ready.json',{force:true});facts.cleanupComplete=true;flush();await writes;}
}
void main().catch(()=>{console.error('Native world fixture failed;private details withheld');process.exitCode=1;});
